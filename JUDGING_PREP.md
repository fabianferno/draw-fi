# Draw-Fi: Round 2 Judging Prep

## Table of Contents

1. [Project Overview](#project-overview)
2. [System Architecture](#system-architecture)
3. [Technology Stack](#technology-stack)
4. [Smart Contracts Deep Dive](#smart-contracts-deep-dive)
5. [Backend Architecture](#backend-architecture)
6. [Frontend Architecture](#frontend-architecture)
7. [Core Innovation: Directional Accuracy PnL](#core-innovation-directional-accuracy-pnl)
8. [EigenDA Integration](#eigenda-integration)
9. [Yellow Network Integration](#yellow-network-integration)
10. [Data Flow Walkthroughs](#data-flow-walkthroughs)
11. [Security Considerations](#security-considerations)
12. [Round 2 Q&A Prep](#round-2-qa-prep)

---

## Project Overview

**Draw-Fi** is a gamified futures trading platform where users predict token price movements by **drawing curves on a chart** instead of placing traditional orders. It's a 1–5 minute prediction game with directional accuracy-based PnL calculation.

**Core Innovation**: Users draw their price predictions as freehand curves, which are sampled into 60 price points and stored in EigenDA. When the position expires (after 60 seconds per position), PnL is calculated based on how many of the 59 directional changes (up/down/flat) the user predicted correctly — not on magnitude, just direction.

**Key Integrations**:

- **EigenDA** — blob storage for both user predictions and actual price windows
- **Yellow Network** — off-chain funding, gas-free position opening via EIP-712 relayer, and settlement payouts

---

## System Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         DRAW-FI SYSTEM ARCHITECTURE                        │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  FRONTEND (Next.js 16 + React 19)                                         │
│  ├─ Landing Page (hero, features, animations)                             │
│  ├─ Predict Page (TradingChart + PatternDrawingBox canvas)                │
│  ├─ History Page (open/closed positions)                                  │
│  ├─ Leaderboard Page (user rankings)                                     │
│  └─ Privy embedded wallet integration                                    │
│                                                                            │
│  ┌──────────────────────┐     ┌──────────────────────────┐                │
│  │   PRICE PIPELINE     │     │  PREDICTION PIPELINE     │                │
│  │  Bybit WebSocket     │     │  User draws curve        │                │
│  │  → Price Ingester    │     │  → Sample to 60 points   │                │
│  │  → Price Aggregator  │     │  → Upload to EigenDA     │                │
│  │    (60 prices/min)   │     │  → Get commitment ID     │                │
│  │  → EigenDA submit    │     │  → Store on-chain ref    │                │
│  │  → PriceOracle store │     └──────────────────────────┘                │
│  └──────────────────────┘                                                  │
│                                                                            │
│  ┌──────────────────────────────────────────────────────┐                  │
│  │   FUTURES LIFECYCLE                                   │                  │
│  │  1. User opens position via LineFutures contract      │                  │
│  │  2. PositionCloser cron (every 10s) finds expired     │                  │
│  │  3. Retrieves predictions + actual prices from EigenDA│                  │
│  │  4. PNL Calculator computes directional accuracy      │                  │
│  │  5. Settlement on-chain via LineFutures.closePosition │                  │
│  │  6. Yellow Network payout (if Yellow-funded)          │                  │
│  └──────────────────────────────────────────────────────┘                  │
│                                                                            │
│  ┌──────────────────────────────────────────────────────┐                  │
│  │   YELLOW NETWORK INTEGRATION                          │                  │
│  │  ├─ Yellow Deposit Poller (every 15s)                 │                  │
│  │  ├─ Yellow Balance Database (off-chain ledger)        │                  │
│  │  ├─ Yellow Relayer Service (EIP-712 meta-txns)        │                  │
│  │  └─ Payout processor on position close                │                  │
│  └──────────────────────────────────────────────────────┘                  │
│                                                                            │
│  ┌──────────────────────────────────┐                                      │
│  │   DATA STORES                    │                                      │
│  │  ├─ EigenDA (blob storage)       │                                      │
│  │  ├─ PriceOracle (on-chain refs)  │                                      │
│  │  ├─ LineFutures (on-chain state) │                                      │
│  │  └─ SQLite (leaderboard/history) │                                      │
│  └──────────────────────────────────┘                                      │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer            | Technology                                                       |
| ---------------- | ---------------------------------------------------------------- |
| Smart Contracts  | Solidity ^0.8.28, Hardhat, Hardhat Ignition                     |
| Backend          | Node.js, Express.js, TypeScript                                  |
| Frontend         | Next.js 16 (App Router), React 19, TailwindCSS 4                |
| Blockchain       | Ethereum Sepolia testnet                                         |
| DA Layer         | EigenDA via HTTP proxy                                           |
| Wallet           | Privy (embedded wallets, social login)                           |
| Charting         | TradingView lightweight-charts                                   |
| Animations       | Framer Motion, Three.js (3D backgrounds)                         |
| Database         | SQLite with WAL mode (via better-sqlite3)                        |
| Price Feed       | Bybit WebSocket (real-time tickers)                              |
| Off-chain Settle | Yellow Network (ClearNode sandbox)                               |
| Signatures       | EIP-712 typed data signing                                       |
| State Management | TanStack Query (React Query)                                     |
| Blockchain Libs  | ethers.js v6, viem v2                                            |

---

## Smart Contracts Deep Dive

### LineFutures.sol — Position Lifecycle Management

**Purpose**: Manages the full lifecycle of prediction positions — open, close, fee collection, and payouts.

**Key State**:

```solidity
struct Position {
    address user;
    uint256 amount;                    // wei deposited
    uint16 leverage;                   // 1x–2500x
    uint256 openTimestamp;
    string predictionCommitmentId;     // EigenDA commitment for user's 60-point prediction
    bool isOpen;
    int256 pnl;
    string actualPriceCommitmentId;    // EigenDA commitment for actual 60-price window
    uint256 closeTimestamp;
}
```

**Core Functions**:

| Function                 | Description                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| `openPosition()`        | Accepts ETH + leverage + prediction commitment ID. Min 0.001 ETH, max 2500x leverage.       |
| `batchOpenPositions()`  | Opens 1–5 positions in a single tx with equal ETH split. Staggered timestamps (i × 60s).    |
| `closePosition()`       | Called by PnL server only. Requires position expired. Deducts 2% fee on profits. Pays user.  |
| `getClosablePositions()`| Returns array of position IDs where `block.timestamp >= openTimestamp + 60s` and still open.  |

**Constants**:

- `MIN_AMOUNT` = 0.001 ETH (10^15 wei)
- `MAX_LEVERAGE` = 2500x
- `POSITION_DURATION` = 60 seconds
- `feePercentage` = 200 basis points (2% on profits only)

### PriceOracle.sol — Price Window Commitment Storage

**Purpose**: Stores EigenDA commitment strings for 60-second price windows, indexed by minute-boundary timestamps.

**Key Functions**:

| Function              | Description                                                           |
| --------------------- | --------------------------------------------------------------------- |
| `storeCommitment()`  | Stores EigenDA commitment for a given minute boundary. Submitter only. |
| `getCommitment()`    | Retrieve commitment string for a specific window start timestamp.      |
| `getLatestWindow()`  | Returns the most recent window timestamp.                              |
| `getWindowsInRange()`| Query all windows within a time range.                                 |

**Access Control**: Only the designated `submitter` address can write commitments. Anyone can read.

---

## Backend Architecture

The backend is organized into distinct pipelines, each responsible for a part of the system.

### 5.1 Price Pipeline

```
Bybit WebSocket → PriceIngester → PriceAggregator → EigenDA → PriceOracle
```

1. **PriceIngester** (`src/ingester/priceIngester.ts`)
   - WebSocket connection to Bybit's public ticker stream (`tickers.BTCUSDT`)
   - Emits `'price'` events with `{price, timestamp, source}`
   - Auto-reconnect with exponential backoff (max 10 attempts)
   - Heartbeat check every 10s (reconnects if no data for 30s)
   - Supports dynamic ticker switching (BTC, ETH, AAVE, DOGE)

2. **PriceAggregator** (`src/aggregator/priceAggregator.ts`)
   - Accumulates prices into minute-aligned 60-second windows
   - Produces exactly 60 data points per window (one per second)
   - Gap-filling: backward fill from end, then forward fill from start
   - Calculates TWAP and volatility (standard deviation) per window
   - Emits `'windowReady'` event

3. **EigenDASubmitter** (`src/eigenda/eigendaSubmitter.ts`)
   - HTTP client to local EigenDA proxy (`http://127.0.0.1:3100`)
   - Retry logic: 3 attempts with exponential backoff (5s → 10s → 20s)
   - Converts data to JSON → bytes → binary submission
   - Returns commitment as hex string with `0x` prefix

4. **ContractStorage** (`src/contract/contractStorage.ts`)
   - ethers.js wrapper for PriceOracle contract
   - Submits price window commitments on-chain at each minute boundary

5. **Orchestrator** (`src/orchestrator/orchestrator.ts`)
   - Coordinates the entire price pipeline end-to-end
   - Event-driven: listens to `windowReady` → EigenDA submit → PriceOracle store
   - Window check interval every 5 seconds

### 5.2 Futures/Position Pipeline

1. **PredictionService** (`src/futures/predictionService.ts`)
   - Accepts user-drawn prediction curves (exactly 60 numbers)
   - Rate limiting: 10 requests per 60s per IP/address
   - Validates: exactly 60 positive finite numbers
   - Uploads to EigenDA, returns commitment ID

2. **PositionService** (`src/futures/positionService.ts`)
   - Retrieves position details with predictions + analytics
   - Closes expired positions:
     - Retrieve predictions from EigenDA
     - Retrieve actual prices from PriceOracle → EigenDA
     - Calculate PnL via PNLCalculator
     - Call `LineFutures.closePosition()` on-chain
     - Record in PositionDatabase (for leaderboard)
     - Process Yellow payout if applicable

3. **PositionCloser** (`src/futures/positionCloser.ts`)
   - Cron job running every 10 seconds
   - Calls `LineFutures.getClosablePositions()` to find expired positions
   - 2-second delay between closing each position
   - Retry queue: failed positions retry up to 5 times
   - Skip list: positions permanently skipped (e.g., EigenDA data loss)

### 5.3 Position Database (SQLite)

```sql
CREATE TABLE closed_positions (
    id INTEGER PRIMARY KEY,
    position_id INTEGER UNIQUE NOT NULL,
    user_address TEXT NOT NULL,
    amount TEXT,
    leverage INTEGER,
    open_timestamp INTEGER NOT NULL,
    close_timestamp INTEGER NOT NULL,
    pnl TEXT,
    prediction_commitment_id TEXT,
    actual_price_commitment_id TEXT,
    tx_hash TEXT,
    accuracy REAL,
    correct_directions INTEGER,
    total_directions INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Indexed on `user_address`, `open_timestamp`, `close_timestamp` for fast leaderboard queries.

### 5.4 API Endpoints

**Health & Data**:

| Endpoint                  | Method | Description                   |
| ------------------------- | ------ | ----------------------------- |
| `/api/health`            | GET    | System status                 |
| `/api/latest`            | GET    | Latest price window           |
| `/api/history`           | GET    | Price history (start/end)     |
| `/api/stats`             | GET    | Statistics                    |
| `/api/metrics`           | GET    | Detailed system metrics       |

**Futures**:

| Endpoint                            | Method | Description                      |
| ----------------------------------- | ------ | -------------------------------- |
| `/api/predictions/upload`          | POST   | Upload prediction → EigenDA      |
| `/api/predictions/:commitmentId`   | GET    | Retrieve prediction data         |
| `/api/position/:positionId`        | GET    | Full position details            |
| `/api/positions/user/:address`     | GET    | User's positions                 |
| `/api/positions/open`              | GET    | All open positions               |
| `/api/positions/closed`            | GET    | Closed positions                 |
| `/api/leaderboard`                 | GET    | Rankings (PnL/accuracy/winrate)  |
| `/api/leaderboard/user/:address`   | GET    | User stats                       |
| `/api/admin/close-expired`         | POST   | Manually close expired (admin)   |

**Yellow Network**:

| Endpoint                             | Method | Description                         |
| ------------------------------------ | ------ | ----------------------------------- |
| `/api/yellow/deposit-address`       | GET    | Where users send Yellow funds       |
| `/api/yellow/deposit-balance/:addr` | GET    | User's credited balance             |
| `/api/yellow/balance/:addr`         | GET    | Yellow Ledger balance               |
| `/api/yellow/faucet`                | POST   | Request test tokens                 |
| `/api/yellow/open-with-balance`     | POST   | Open position via EIP-712 signature |
| `/api/yellow/config`                | GET    | Yellow network config               |

---

## Frontend Architecture

### Pages

1. **Landing Page** (`app/page.tsx`) — Hero section with "Draw your futures" tagline, feature showcase with Framer Motion animations, Nyan Cat easter egg, CTA to Predict page.

2. **Predict Page** (`app/predict/page.tsx`) — Main trading interface:
   - **TokenPairSelector**: Choose BTC/USDT, ETH/USDT, AAVE/USDT, DOGE/USDT
   - **TradingChart**: Real-time price chart via lightweight-charts
   - **PatternDrawingBox**: Canvas for drawing predictions (left-to-right only, neon cyan glow)
   - **BottomControls**: Amount slider (ytest.usd), leverage slider (1–2500x), submit/cancel
   - Time horizon: 1–5 minutes (offset)
   - Yellow faucet integration for sandbox testing
   - Onboarding tour (NextStep library)

3. **History Page** (`app/history/`) — View all user positions (open/closed) with details: position ID, token pair, amount, leverage, PnL, accuracy, timestamps.

4. **Leaderboard Page** (`app/leaderboard/`) — Global rankings by PnL, win rate, accuracy. User profiles with aggregated stats.

### Key Components

- **TradingChart.tsx** — lightweight-charts integration, real-time price rendering
- **PatternDrawingBox.tsx** — HTML5 Canvas drawing with mouse/touch, samples curve to 60 points
- **PredictionOverlay.tsx** — Shows drawn prediction overlaid on the price chart
- **NyanCat.tsx** — 3D Nyan Cat animation (Three.js)
- **ColorBlends.tsx** — Shader gradient background (Three.js)
- **SlotMachineLever.tsx** — Fun submit button animation

### Custom Hooks

- `usePredictionDrawing` — Drawing state (points, canvas operations)
- `usePriceData` — Fetch price data from backend
- `usePrivyWallet` — Wallet connection and signer via Privy
- `useYellowFaucet` — Request faucet tokens
- `useYellowDeposit` — Track Yellow balance
- `useTokenPair` — Global token pair context

---

## Core Innovation: Directional Accuracy PnL

This is the heart of Draw-Fi's game mechanics. Instead of traditional P&L based on entry/exit price difference, we use **directional accuracy** across the entire curve.

### The Formula

```
Step 1: Extract directions
  For i = 0 to 58:
    predictedDirection[i] = sign(predictions[i+1] - predictions[i])   // +1, -1, or 0
    actualDirection[i]    = sign(actualPrices[i+1] - actualPrices[i]) // +1, -1, or 0

Step 2: Count correct predictions
  correctDirections = count where predictedDirection[i] == actualDirection[i]
  totalDirections = 59

Step 3: Calculate accuracy
  accuracy = correctDirections / 59

Step 4: Calculate max profit potential
  priceMovement = |actualPrices[59] - actualPrices[0]|
  positionSize  = amount / actualPrices[0]
  maxProfit     = priceMovement × positionSize × leverage

Step 5: Calculate PnL
  pnl = (2 × accuracy - 1) × maxProfit

Step 6: Apply fee (only on profits)
  if pnl > 0: fee = pnl × 0.02 (2%)
  finalAmount = amount + pnl - fee
```

### Key Properties

| Accuracy | Outcome          | Interpretation                          |
| -------- | ---------------- | --------------------------------------- |
| 100%     | Max profit       | Every second's direction correctly predicted |
| 75%      | Half max profit  | Strong prediction skill                 |
| 50%      | Break-even       | Random chance baseline                  |
| 25%      | Half max loss    | Mostly wrong                            |
| 0%       | Max loss         | Every direction predicted incorrectly   |

This creates elegant game dynamics:
- **50% accuracy = break-even** (equivalent to random guessing)
- The formula `(2 × accuracy - 1)` linearly maps [0, 1] accuracy to [-1, +1] PnL multiplier
- Leverage amplifies both gains and losses proportionally
- Only directional accuracy matters, not magnitude — preventing trivial strategies

---

## EigenDA Integration

### Why EigenDA?

Storing 60 price points directly on-chain per position would be prohibitively expensive. EigenDA provides cheap blob storage with on-chain commitment references for verification.

### Two-Way Usage

**1. Price Windows (Backend → EigenDA → PriceOracle)**

```
Every 60 seconds:
  PriceAggregator produces 60-price window
  → JSON encode → bytes → POST to EigenDA proxy (/put)
  → Receive commitment hex string
  → Store commitment in PriceOracle contract (indexed by minute timestamp)
```

**2. User Predictions (Frontend → Backend → EigenDA)**

```
User draws curve:
  Frontend samples 60 points from drawing
  → POST /api/predictions/upload (array of 60 numbers)
  → Backend validates & uploads to EigenDA
  → Returns commitment ID to frontend
  → Frontend passes commitment to LineFutures.openPosition()
```

### Verification Flow

At position close time:
1. Retrieve prediction commitment from LineFutures position data
2. Retrieve actual price commitment from PriceOracle (by minute-aligned timestamp)
3. Fetch both blobs from EigenDA using commitments
4. Decode JSON → 60-number arrays
5. Run PNL calculation on the two arrays

### EigenDA Proxy

```bash
docker run --rm -p 3100:3100 \
  ghcr.io/layr-labs/eigenda-proxy:latest \
  --memstore.enabled --port 3100
```

- `PUT /put` — Submit blob, returns commitment
- `GET /get/{commitment}` — Retrieve blob by commitment
- Retry logic with exponential backoff handles transient failures
- Fallback handling for memstore data loss (HTTP 500 "payload not found")

---

## Yellow Network Integration

### Architecture

Yellow Network enables **gas-free position opening** for users through an off-chain balance + relayer pattern.

```
┌─────────────┐    deposit    ┌──────────────────┐
│  User Wallet │────────────→│  Yellow ClearNode  │
│  (Yellow)    │              │  (sandbox)         │
└─────────────┘              └──────────┬─────────┘
                                        │ poll (15s)
                              ┌─────────▼──────────┐
                              │ YellowDepositPoller │
                              │ → credit balance    │
                              └─────────┬──────────┘
                                        │
                              ┌─────────▼──────────┐
                              │ YellowBalanceDB     │
                              │ (off-chain ledger)  │
                              └─────────┬──────────┘
                                        │
User signs EIP-712 ──────────→ RelayerService
                              │ verifies signature  │
                              │ debits balance      │
                              │ opens on-chain pos  │
                              └─────────┬──────────┘
                                        │
                              ┌─────────▼──────────┐
                              │ LineFutures contract │
                              │ (relayer pays gas)   │
                              └─────────┬──────────┘
                                        │
                              On close: YellowService
                              processes payout back
                              to user's Yellow balance
```

### Key Components

1. **YellowDepositPoller** — Polls Yellow ClearNode WebSocket every 15s for incoming transfers, credits user's off-chain balance.

2. **YellowBalanceDatabase** — In-memory ledger tracking user balances in `ytest.usd` (6 decimals). Conversion: 1 ETH = 100 ytest.usd (configurable).

3. **RelayerService** — Accepts EIP-712 signed messages from users. Verifies signature, opens position on-chain using relayer's ETH. Maps `positionId → userAddress` for payout routing.

4. **YellowService** — Orchestrates faucet requests, balance-based position opening, and payout processing on position close.

### EIP-712 Signature Schema

```
{
  userAddress: address,
  amount: uint256,
  leverage: uint16,
  commitmentId: string,
  nonce: uint256,
  deadline: uint256
}
```

Users sign this typed data to authorize a position opening without paying gas themselves.

---

## Data Flow Walkthroughs

### Flow 1: Opening a Position (Direct ETH)

```
1. User draws prediction curve on PatternDrawingBox canvas
2. Frontend calls samplePredictionPoints(curve) → 60 price values
3. Frontend POST /api/predictions/upload → Backend PredictionService
   - Validates exactly 60 positive finite numbers
   - Uploads to EigenDA → receives commitment ID
4. Frontend calls LineFutures.openPosition(leverage, commitmentId) {value: amount}
5. Contract creates Position struct, emits PositionOpened event
6. Position is now live — 60-second countdown begins
```

### Flow 2: Opening a Position (Yellow Balance, Gas-Free)

```
1. User has ytest.usd balance (from Yellow deposits or faucet)
2. User draws prediction → uploads to EigenDA → gets commitment ID
3. User signs EIP-712 message: {address, amount, leverage, commitmentId, nonce, deadline}
4. Frontend POST /api/yellow/open-with-balance with signature
5. Backend RelayerService:
   - Verifies EIP-712 signature against user address
   - Debits ytest.usd from user's off-chain balance
   - Relayer wallet calls LineFutures.openPosition() with relayer's ETH
6. Backend maps positionId → userAddress for payout routing
7. Position is now live — user paid zero gas
```

### Flow 3: Position Settlement (Auto-Close)

```
1. PositionCloser cron runs every 10 seconds
2. Calls LineFutures.getClosablePositions()
   → Returns position IDs where block.timestamp ≥ openTimestamp + 60s
3. For each expired position:
   a. Read position data from contract (predictionCommitmentId, openTimestamp)
   b. Fetch prediction blob from EigenDA → decode 60 numbers
   c. Compute minute-aligned window: openTimestamp rounded to minute boundary
   d. Fetch actual price commitment from PriceOracle
   e. Fetch actual price blob from EigenDA → decode 60 numbers
   f. PNLCalculator.calculatePNL(predictions, actualPrices, amount, leverage, 200bps)
   g. Call LineFutures.closePosition(positionId, pnl, actualPriceCommitmentId)
   h. Contract transfers (amount + pnl - fee) to user
   i. Record in SQLite closed_positions table
   j. If Yellow-funded: YellowService.processYellowPayout()
      → Credit (amount + pnl - fee) in ytest.usd to user's balance
4. Failed closures enter retry queue (max 5 retries)
```

### Flow 4: Real-Time Price Pipeline

```
1. PriceIngester connects to Bybit WebSocket (wss://stream.bybit.com)
   → Subscribes to tickers.BTCUSDT
   → Receives ~10 price updates per second
2. PriceAggregator accumulates prices per second
   → At minute boundary: produces 60-price window
   → Gap-fills missing seconds (backward fill, then forward fill)
   → Emits 'windowReady' event
3. Orchestrator receives event:
   → Uploads 60-price array to EigenDA → commitment
   → Calls PriceOracle.storeCommitment(windowTimestamp, commitment)
4. Commitment now available for position closing reference
```

---

## Security Considerations

| Concern                    | Mitigation                                                              |
| -------------------------- | ----------------------------------------------------------------------- |
| Unauthorized position close | Only `pnlServer` address can call `closePosition()`                    |
| Unauthorized price storage | Only `submitter` address can call `storeCommitment()`                   |
| Prediction tampering       | Predictions immutably stored in EigenDA before position opens           |
| Price manipulation         | Prices sourced from Bybit, aggregated server-side, stored in EigenDA   |
| Replay attacks (Yellow)    | EIP-712 signatures include nonce + deadline                             |
| Rate limiting              | 10 prediction uploads per 60s per IP/address                            |
| Flash loan risk            | N/A — prices locked in minute-aligned windows, not spot                 |
| Emergency stop             | Owner can pause position opening in LineFutures                         |
| Fee extraction             | 2% fee only on profits, never on losses — fair to users                 |

---

## Round 2 Q&A Prep

### Category 1: Technical Architecture

**Q: Can you walk us through the system architecture at a high level?**

> Draw-Fi has four main components: (1) A **real-time price pipeline** that ingests Bybit WebSocket prices, aggregates them into 60-second windows, and stores them in EigenDA with on-chain references in our PriceOracle contract. (2) A **prediction pipeline** where user-drawn curves are sampled to 60 points, uploaded to EigenDA, and referenced in our LineFutures contract. (3) An **automated settlement engine** that runs every 10 seconds, finds expired positions, retrieves both prediction and actual price data from EigenDA, computes directional accuracy PnL, and settles on-chain. (4) A **Yellow Network integration layer** that enables gas-free position opening through EIP-712 signed meta-transactions and an off-chain balance ledger.

**Q: Why did you choose EigenDA over other data availability solutions?**

> EigenDA gives us cheap, verifiable blob storage with on-chain commitment references. We needed to store 60 data points per position (both predictions and actual prices) — doing this directly on-chain would be prohibitively expensive. With EigenDA, we store the data off-chain but keep cryptographic commitments on-chain in our PriceOracle and LineFutures contracts, enabling verification without the storage cost. The HTTP proxy interface made integration straightforward, and the commitment model aligns perfectly with our "store data, reference on-chain" pattern.

**Q: How does the PnL calculation work? Why directional accuracy instead of traditional P&L?**

> We compare 59 consecutive directional changes between predicted and actual prices. For each second-to-second transition, we check if the user predicted the correct direction (up, down, or flat). The accuracy ratio feeds into the formula: `pnl = (2 × accuracy - 1) × maxProfit`, where maxProfit is based on actual price movement, position size, and leverage. This means 50% accuracy = break-even (random chance), 100% = max profit, 0% = max loss. We chose this over traditional P&L because it creates a more engaging prediction game — users are rewarded for reading market microstructure, not just getting lucky on direction. It also makes the game fair: random guessing averages to break-even.

**Q: How does the Yellow Network integration enable gas-free trading?**

> Users deposit funds into Yellow Network, and our backend polls for deposits every 15 seconds, crediting an off-chain balance in ytest.usd. When they want to open a position, they sign an EIP-712 typed data message with their parameters (amount, leverage, prediction commitment). Our RelayerService verifies the signature, debits their off-chain balance, and opens the position on-chain using the relayer's ETH — the user pays zero gas. On settlement, profits are credited back to their Yellow balance. The EIP-712 signatures include nonces and deadlines to prevent replay attacks.

**Q: What happens if EigenDA data becomes unavailable?**

> We handle this with a multi-layered approach. The EigenDA submitter has retry logic with exponential backoff (3 attempts at 5s, 10s, 20s intervals). The PositionCloser has a retry queue — if it can't fetch prediction or price data, the position goes into a retry queue with up to 5 attempts. For permanently lost data (e.g., memstore data loss, detected via HTTP 500 "payload not found"), positions are added to a skip list and flagged. In production with EigenDA mainnet dispersal (not memstore), data availability is guaranteed by the EigenDA protocol's security model.

**Q: How do you ensure price feed integrity?**

> Prices flow through a controlled pipeline: Bybit WebSocket → PriceIngester → PriceAggregator → EigenDA → PriceOracle. The aggregator produces minute-aligned windows with gap-filling for missed data points. Once a window is submitted to EigenDA and its commitment stored in PriceOracle, it's immutable. The PriceOracle contract restricts writes to a single designated submitter address. We could extend this with multiple price sources and a median filter for production hardening.

### Category 2: Product & UX

**Q: What problem does Draw-Fi solve?**

> Traditional futures trading has a steep learning curve — limit orders, stop losses, margin management. Draw-Fi makes futures trading intuitive and gamified. Instead of complex order types, you literally draw what you think the price will do. It lowers the barrier to entry for price prediction markets while maintaining the leverage and PnL mechanics that make futures exciting. Think of it as "Pictionary meets futures trading."

**Q: Who is your target user?**

> Two primary audiences: (1) Crypto-native traders who want a quick, gamified trading experience — 60-second positions are perfect for idle moments. (2) Newcomers to DeFi who are intimidated by traditional trading interfaces but understand the concept of "draw where you think the price goes." The Yellow Network integration specifically targets the second group by removing the gas friction entirely.

**Q: Why 60-second positions?**

> 60 seconds hits the sweet spot between engagement and market dynamics. It's short enough to be exciting and gamified (like a micro-game), but long enough that real price movement occurs and predictions have meaning. It also maps cleanly to our minute-aligned price windows, simplifying the architecture. Users can also open batch positions for 1–5 minutes if they want longer exposure, with staggered timestamps.

**Q: How does the drawing UX translate to predictions?**

> The user draws a freehand curve on a canvas overlaid on the price chart. The drawing is constrained to left-to-right only (you can't go backwards in time). When submitted, we uniformly sample the curve at 60 evenly-spaced points along the x-axis. These 60 values represent the user's second-by-second price prediction for the next minute. The sampling converts any smooth or jagged curve into a consistent 60-point format for PnL calculation.

### Category 3: Smart Contracts & Security

**Q: What are your access control mechanisms?**

> We have role-based access on both contracts. LineFutures has an `owner` (can pause, set fees, withdraw) and a `pnlServer` (the only address that can close positions and set PnL). PriceOracle has a `submitter` (only address that can store price commitments). These separation of concerns prevent any single key from compromising the system. Position opening is permissionless — anyone can open with ETH.

**Q: How do you prevent manipulation?**

> Predictions are immutably committed to EigenDA *before* the position opens on-chain. This means the prediction commitment ID is locked in the `openPosition` transaction — you can't change your prediction after seeing the actual prices. Price data comes from Bybit's live feed and is committed to EigenDA at minute boundaries before any positions for that window can close. The 60-second duration and minute-aligned windows make it impossible to manipulate specific price points.

**Q: What's the maximum risk for a user?**

> The maximum loss is their deposited amount. Even with 2500x leverage and 0% accuracy, the `finalAmount` floors at zero — the contract ensures the user can't lose more than their deposit. The fee (2%) is only charged on profits, never on losses, making it fair.

**Q: Have the contracts been audited?**

> Not yet — this is a hackathon prototype on Sepolia testnet. For production, we'd need formal audits, particularly around the PnL calculation logic, the relayer trust model, and the fee extraction mechanism. The current architecture has a centralized PnL server that we'd want to decentralize with an oracle network.

### Category 4: Scalability & Future

**Q: What are the main centralization points?**

> Three key centralization points: (1) The PnL server that closes positions — currently a single backend server. We'd decentralize this with an oracle network or committee. (2) The price feed from Bybit — we'd add multiple sources with median aggregation. (3) The Yellow relayer — currently a single key. We'd add multi-sig or distributed relayer set. The EigenDA commitments and on-chain settlement provide a trust anchor that limits the damage any centralized component can do.

**Q: How would you scale this for production?**

> Several paths: (1) Move from Sepolia to an L2 (Arbitrum, Base) for cheaper transactions. (2) Replace SQLite with PostgreSQL for concurrent access. (3) Add multiple price sources for redundancy. (4) Decentralize the PnL server into an oracle committee. (5) Move from EigenDA memstore to full dispersal for production-grade data availability. (6) Add WebSocket support for real-time position updates instead of polling.

**Q: What other features could you build on this primitive?**

> The "draw to predict" primitive opens up many possibilities: (1) **Longer timeframes** — hourly, daily prediction games. (2) **Multi-token prediction** — predict relative performance between tokens. (3) **Tournaments** — compete against others on the same time window. (4) **Social features** — share and compare prediction drawings. (5) **Advanced curves** — support for drawing patterns like head-and-shoulders, cup-and-handle. (6) **On-chain leaderboard** — fully decentralized rankings with NFT rewards.

### Category 5: Business & Market

**Q: What's the revenue model?**

> 2% fee on profitable positions. This aligns incentives — we only make money when users make money. At scale with high volume, this creates sustainable revenue while keeping the platform attractive to traders.

**Q: How do you compare to existing prediction markets like Polymarket?**

> Polymarket focuses on binary outcomes (yes/no on events). Draw-Fi is fundamentally different — it's continuous curve prediction with second-by-second granularity. It's more like a skill-based micro-game than a traditional prediction market. The 60-second time horizon and drawing UX make it feel like a game, while the underlying mechanics (leverage, PnL, EigenDA verification) give it real DeFi depth.

**Q: What's your moat?**

> Three key differentiators: (1) The **drawing UX** — no one else lets you draw price predictions as freehand curves. (2) The **directional accuracy PnL model** — a novel formula that rewards prediction skill, not just directional bets. (3) The **EigenDA + Yellow Network stack** — combining data availability for cheap prediction storage with gas-free trading via off-chain settlement. Together these create a unique product that's both technically novel and highly accessible.

### Category 6: Demo-Day Quick Hits

**Q: Can you give a 30-second elevator pitch?**

> Draw-Fi lets you trade futures by drawing. Instead of placing complex orders, you sketch where you think the price will go over the next minute. Your prediction is stored in EigenDA, and when the minute's up, we compare your drawing against reality — direction by direction, second by second. Get over 50% of the directions right and you profit, amplified by leverage up to 2500x. Yellow Network integration means zero gas fees. It's Pictionary meets futures trading.

**Q: What were the hardest technical challenges?**

> Three main challenges: (1) **Minute-aligned price windows** — ensuring deterministic, gap-free 60-second price arrays from a noisy WebSocket feed. We built a custom aggregator with backward/forward fill. (2) **EigenDA integration** — handling blob submission, retrieval, and commitment lifecycle with proper retry logic for a system that needs 100% data availability for settlement. (3) **The relayer pattern** — building the EIP-712 signature flow so users can open positions without gas, while maintaining security guarantees against replay attacks and ensuring correct payout routing.

**Q: What did you build during the hackathon vs. what existed before?**

> Everything was built during the hackathon from scratch: both Solidity contracts, the full backend pipeline (price ingestion, aggregation, EigenDA integration, PnL engine, position closer, Yellow Network integration), and the complete frontend with the drawing canvas, real-time charts, wallet integration, and leaderboard. No pre-existing code was used.

---

## Quick Reference: Key File Locations

| Component               | Path                                          |
| ------------------------ | --------------------------------------------- |
| LineFutures contract     | `contracts/contracts/LineFutures.sol`         |
| PriceOracle contract     | `contracts/contracts/PriceOracle.sol`         |
| Backend entry point      | `backend/src/index.ts`                        |
| Price Ingester           | `backend/src/ingester/priceIngester.ts`       |
| Price Aggregator         | `backend/src/aggregator/priceAggregator.ts`   |
| EigenDA Submitter        | `backend/src/eigenda/eigendaSubmitter.ts`     |
| PNL Calculator           | `backend/src/pnl/pnlCalculator.ts`           |
| Position Service         | `backend/src/futures/positionService.ts`      |
| Position Closer          | `backend/src/futures/positionCloser.ts`       |
| Yellow Service           | `backend/src/yellow/yellowService.ts`         |
| Relayer Service          | `backend/src/yellow/relayerService.ts`        |
| API Server               | `backend/src/api/server.ts`                   |
| Predict Page             | `frontend/app/predict/page.tsx`               |
| Drawing Component        | `frontend/components/PatternDrawingBox.tsx`    |
| Trading Chart            | `frontend/components/TradingChart.tsx`         |
| Landing Page             | `frontend/app/page.tsx`                       |
| Deploy Script            | `backend/scripts/redeploy-and-reconfigure.js` |
