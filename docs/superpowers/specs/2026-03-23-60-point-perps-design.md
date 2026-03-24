# 60-Point Directional Perps - Design Spec

## Overview

Migrate the 60-point directional comparison perpetuals feature from the current backend to the backend-reference. Instead of traditional perps (single entry/exit price), positions are settled by comparing 60 user-predicted price points against 60 actual market prices sampled evenly across a user-defined duration (60 seconds to 24 hours).

All transfers are USDC. The system uses Yellow Network app sessions for both price data storage and position management.

**Key change from current backend:** Fee reduced from 2% to 1% on profits.

## Architecture

### New Modules

```
backend-reference/src/
  price/
    priceIngester.ts         # Bybit WS, streams tick prices for multiple tickers (rewrite, not port)
    priceSessionManager.ts   # Creates/manages per-ticker-per-minute Yellow app sessions
  perps/
    pnlCalculator.ts         # 60-point directional comparison + PnL formula
    positionScheduler.ts     # Schedules close jobs at user's endTime, handles restart recovery
```

### Existing Modules (modified)

- `src/lib/websockets.ts` - Gains integration hooks for new modules (detect position transfers, expose app session helpers)
- `src/index.ts` - Wires new modules together, adds API endpoints

### Dependencies

- Bybit public WebSocket API (`wss://stream.bybit.com/v5/public/spot`) - already used in current backend
- Yellow Network (`@erc7824/nitrolite`) - already in backend-reference
- No new external dependencies required

## Price Data Pipeline

### PriceIngester

Connects to Bybit WS and streams real-time tick prices for multiple tickers simultaneously. This is a rewrite of the current backend's single-ticker `PriceIngester` to support concurrent multi-ticker subscriptions.

**Configuration:**
- `PRICE_TICKERS` env var: comma-separated list (e.g., `BTCUSDT,ETHUSDT,SOLUSDT`)
- Subscribes to `tickers.{SYMBOL}` topics on Bybit (multiple topics on one WS connection)

**Behavior:**
- Emits `price` events: `{ ticker: string, price: number, timestamp: number }`
- Reconnect with exponential backoff (1s to 30s, max 10 attempts)
- Heartbeat: reconnects if no message in 30 seconds
- Supports adding new tickers at runtime via `addTicker(symbol)`

### PriceSessionManager

Manages Yellow Network app sessions that store 1-price-per-second data, one session per ticker per minute.

**Session naming (used as `applicationName`):** `{TICKER}-{YYYY-MM-DD}-{HH:mm}` (UTC)
Example: `BTCUSDT-2026-03-23-14:05`

**Per-ticker state:**
- `secondTracker: Map<number, number>` - maps unix second to price
- `currentSessionId: string` - current minute's app session ID
- `currentMinuteStart: number` - current minute boundary (unix seconds)

**Minute boundary processing (every 60s):**
1. Build array of 60 prices (1/sec) from `secondTracker`
2. Fill gaps with backward fill, then forward fill (same as current `PriceAggregator`)
3. Submit final state to current minute's app session:
   ```json
   {
     "ticker": "BTCUSDT",
     "windowStart": 1711195500,
     "windowEnd": 1711195559,
     "prices": [97500.1, 97500.3, ...]
   }
   ```
4. Close the current minute's app session
5. Create a new app session for the next minute
6. Clear `secondTracker` for entries older than 2 minutes

**Session participants:** `[backendWallet, backendWallet]` - backend is sole owner of price data sessions. Note: if Yellow Network does not support duplicate participants, use a dedicated second wallet address (configurable via `PRICE_SESSION_WALLET`).

**In-memory index:**
```typescript
Map<string, { appSessionId: string, prices: number[], windowStart: number }>
```
Key: session name (e.g., `BTCUSDT-2026-03-23-14:05`)

**Retention:** 24 hours. Sessions older than 24h are evicted from the in-memory map on each minute rotation. The Yellow Network app sessions themselves persist server-side.

**Recovery:** On restart, fetch all app sessions via `getAppSessions()`, filter by those whose `applicationName` matches the `{TICKER}-{DATE}-{TIME}` pattern, parse `sessionData` to rebuild the in-memory index. This requires iterating all sessions client-side since Yellow Network does not support name-based filtering.

**API:** `POST /tickers` to add new tickers at runtime (requires `ADMIN_API_KEY` header). `GET /tickers` to list active tickers.

## User Position Flow

### Step 1: User Creates Position Session

User creates a Yellow app session with participants `[userWallet, backendWallet]`.

User submits state with predictions:
```json
{
  "action": "open",
  "positionType": "directional-60",
  "ticker": "BTCUSDT",
  "predictions": [97500.1, 97501.3, ...],
  "leverage": 10,
  "amount": "1000000",
  "startTime": 1711195500,
  "endTime": 1711195695,
  "userWallet": "0xabc..."
}
```

The `positionType: "directional-60"` field distinguishes these positions from existing perps (which use `tradePair`) and spot trades (which use `market`). The `handleAppStateUpdate` switch logic in `websockets.ts` should check for this field first.

**Validation rules:**
- `predictions` must be exactly 60 numbers, all positive and finite
- `positionType` must be `"directional-60"`
- `endTime - startTime` must be between 60 seconds and 86400 seconds (24 hours). Minimum 60 seconds ensures each of the 60 sample points maps to a distinct second of price data.
- `leverage` must be between 1 and 2500
- `amount` must be positive (USDC atomic units, 6 decimals)
- `ticker` must be one of the actively tracked tickers

### Step 2: User Transfers USDC Collateral

User calls Yellow `transfer()` to send USDC to the backend wallet.

### Step 3: Backend Detects Transfer, Activates Position

The `handleTransfer` method in `websockets.ts` detects incoming USDC and matches it to a position session.

**Matching criteria (all must match):**
1. Sender address is a participant in the app session
2. `sessionData.positionType === "directional-60"`
3. `sessionData.action === "open"`
4. `sessionData.status` is absent (not yet "filled" or "closed")
5. Transfer amount matches `sessionData.amount` (atomic units)

If multiple sessions match (same user, same amount), use the most recently created session (highest `appSessionId` or `nonce`).

**After matching:**
1. Validates all fields (predictions length, ticker, duration, leverage)
2. Submits "filled" state:
   ```json
   {
     ...originalSessionData,
     "status": "filled",
     "filledAt": 1711195500
   }
   ```
3. Schedules a close job via `PositionScheduler` at `endTime`

### Step 4: Position Close (at endTime)

Triggered by scheduled `setTimeout`.

1. **Collect actual prices across the duration:**
   - Calculate which price sessions are needed based on `startTime` and `endTime`
   - Example: 3m15s position starting at 14:05:20 needs sessions:
     - `BTCUSDT-2026-03-23-14:05` (seconds 20-59)
     - `BTCUSDT-2026-03-23-14:06` (seconds 0-59)
     - `BTCUSDT-2026-03-23-14:07` (seconds 0-59)
     - `BTCUSDT-2026-03-23-14:08` (seconds 0-34)
   - Build continuous second-by-second price array from stitched sessions
   - If a price session is not yet available, retry with 1s delay, up to 10 attempts

2. **Sample 60 evenly spaced points:**
   ```
   duration = endTime - startTime
   interval = duration / 59
   sampleTimestamps[i] = startTime + i * interval    (i = 0..59)
   ```
   For each sample timestamp, round to the nearest integer second and look up the price from the stitched array. Note: for durations close to 60 seconds, `interval ~= 1.017s`, so some seconds may be skipped and the mapping is not 1:1 with the current backend's fixed 60-second windows. This is acceptable.

3. **Run PnL Calculator** (see formula below)

4. **Submit "closed" state** to the position session:
   ```json
   {
     "status": "closed",
     "accuracy": 0.7288,
     "correctDirections": 43,
     "totalDirections": 59,
     "pnl": "5200000",
     "pnlPercent": "45.76",
     "fee": "52000",
     "returnAmount": "6148000",
     "closedAt": 1711195695
   }
   ```

5. **Transfer payout** via Yellow `transfer()`:
   ```typescript
   // Convert from atomic units to human-readable
   const returnAmountHuman = (returnAmount / 1_000_000).toString();
   this.transfer(userWallet, [{ asset: 'usdc', amount: returnAmountHuman }])
   ```

**Failure handling:** If the "closed" state update succeeds but the transfer fails, the position is marked closed with `transferFailed: true` in the session data. The recovery routine detects these and retries the transfer on restart.

## PnL Formula

Implements the directional comparison formula from the current backend's `PNLCalculator`. Fee reduced from 2% (current backend) to 1%.

### Inputs
- `predictions: number[60]` - user's 60 predicted prices
- `actualPrices: number[60]` - 60 sampled actual prices
- `amount: number` - deposited amount in USDC atomic units
- `leverage: number` - leverage multiplier (1-2500)
- `feePercentage: number` - 100 basis points (1%)

### Steps

1. **Directional comparison (59 comparisons):**
   ```
   for i in 0..58:
     predictedDir = sign(predictions[i+1] - predictions[i])
     actualDir = sign(actualPrices[i+1] - actualPrices[i])
     if predictedDir === actualDir: correct++
   ```
   Direction: +1 (up), -1 (down), 0 (unchanged).
   If both predicted and actual are 0 (unchanged), this counts as correct.

2. **Accuracy:** `accuracy = correct / 59`

3. **Price movement:** `priceMovement = |actualPrices[59] - actualPrices[0]|`

4. **Position size:** `positionSize = amount / actualPrices[0]`

5. **Max profit:** `maxProfit = priceMovement * positionSize * leverage`

6. **PnL:** `PnL = (2 * accuracy - 1) * maxProfit`
   - accuracy > 0.5 = profit, < 0.5 = loss, = 0.5 = break even

7. **Fee:** `fee = PnL > 0 ? PnL * 0.01 : 0` (1% on profits only)

8. **Return amount:** `returnAmount = max(0, amount + PnL - fee)`

**Edge case - zero price movement:** If `actualPrices[59] === actualPrices[0]`, then `priceMovement = 0`, `maxProfit = 0`, and `PnL = 0` regardless of accuracy. The user receives their original deposit back. This is expected behavior by design.

## Server Restart Recovery

On startup, the `PositionScheduler` runs a recovery routine:

1. Call `getAppSessions()` to fetch all app sessions from Yellow Network
2. Filter for position sessions: sessions where `sessionData.positionType === "directional-60"` and `sessionData.status === "filled"` and the backend wallet is a participant
3. For each open position:
   - If `endTime > now`: re-schedule close job at `endTime`
   - If `endTime <= now`: queue for immediate close (process sequentially with 2s delay between each to avoid flooding)
4. Check for failed payouts: sessions with `status === "closed"` and `transferFailed === true` — retry the transfer
5. Rebuild price session index: fetch all app sessions, filter by `applicationName` matching `{TICKER}-{DATE}-{TIME}` pattern, parse `sessionData` to populate in-memory map (last 24h only)

**Sequential processing:** The recovery routine processes expired positions one at a time with a 2s delay between each (same pattern as the current backend's `PositionCloser`). An `isProcessing` guard prevents concurrent close operations.

## API Endpoints (new)

All new endpoints follow the existing convention: `{ success: true, ... }` on success, `{ success: false, error: "..." }` with HTTP 400/500 on failure.

### `POST /tickers`
Add a new ticker to track. Requires `ADMIN_API_KEY` header.
```json
{ "ticker": "SOLUSDT" }
```

### `GET /tickers`
List actively tracked tickers.

### `GET /price-sessions/:ticker`
Get recent price sessions for a ticker (last N minutes, default 10).

### `GET /positions/:appSessionId`
Get position details including PnL breakdown.

## Environment Variables (new)

| Variable | Default | Description |
|----------|---------|-------------|
| `PRICE_TICKERS` | `BTCUSDT` | Comma-separated list of Bybit ticker symbols |
| `BYBIT_WSS_URL` | `wss://stream.bybit.com/v5/public/spot` | Bybit WebSocket URL |
| `MAX_LEVERAGE` | `2500` | Maximum allowed leverage |
| `FEE_BPS` | `100` | Fee in basis points (100 = 1%). Reduced from 200 (2%) in current backend. |
| `MAX_POSITION_DURATION` | `86400` | Maximum position duration in seconds (24h) |
| `MIN_POSITION_DURATION` | `60` | Minimum position duration in seconds |
| `ADMIN_API_KEY` | (required) | API key for admin endpoints (POST /tickers) |

## Integration Points with Existing Code

### websockets.ts changes

**`handleAppStateUpdate` (primary trigger for new positions):**
- Add check for `sessionData.positionType === "directional-60"` before existing perps/spot checks
- On detection, delegate to `PositionScheduler` for validation and tracking
- This is checked first in the switch logic to avoid collision with existing `tradePair`-based perps and `market`-based spot trades

**`handleTransfer` (triggers position activation):**
- After existing outbound transfer resolution, add matching logic for `directional-60` positions:
  1. Sender is participant
  2. `positionType === "directional-60"`
  3. `action === "open"` and no `status` yet
  4. Transfer amount matches `sessionData.amount`
- On match, delegate to `PositionScheduler.activatePosition()`

**Public methods** (most already exist):
- `createAppSession`, `submitAppState`, `closeAppSession`, `getAppSessions`, `transfer` — already public, used by new modules

### index.ts changes
- Instantiate `PriceIngester`, `PriceSessionManager`, `PositionScheduler`, `PnlCalculator`
- Wire event listeners (ingester -> session manager)
- Start price ingestion after Yellow WS authentication
- Run recovery on startup (after auth completes)
- Register new API endpoints

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Price session data missing (gap in Bybit WS) | Forward/backward fill in PriceSessionManager; if >50% of a minute is missing, log warning |
| Server restarts mid-position | Recovery routine re-schedules from Yellow app sessions |
| 24h position = 1440 price sessions in memory | ~1.7MB per ticker (1440 x 60 prices x 8 bytes); evict after 24h |
| Many concurrent positions | setTimeout is lightweight; thousands of positions are fine. Sequential close processing prevents flooding. |
| Price session not yet available at close time | Retry with 1s delay, up to 10 attempts (session may still be writing) |
| Zero price movement over position duration | PnL is zero, user receives deposit back. Expected by design. |
| Close state succeeds but transfer fails | Mark `transferFailed: true`, retry on recovery |
| Yellow Network doesn't support duplicate participants | Use configurable second wallet for price sessions |
| Recovery loads thousands of sessions | Client-side filtering; acceptable startup cost (~seconds) |
| Unauthorized ticker additions | `POST /tickers` requires `ADMIN_API_KEY` |
