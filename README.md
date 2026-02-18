# Draw-Fi

**Draw-Fi** is a gamified futures trading platform where users predict token price movements by **drawing curves on a chart** instead of placing traditional orders. It's a 1–5 minute prediction game with directional accuracy-based PnL calculation.

**Core Innovation**: Users draw their price predictions as freehand curves, which are sampled into 60 price points and stored in MongoDB. When the position expires (after 60 seconds per position), PnL is calculated based on how many of the 59 directional changes (up/down/flat) the user predicted correctly — not on magnitude, just direction.

**Key Integrations**:

- **MongoDB Atlas** — cloud database for storing user predictions and actual price windows
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
│  │  → Price Aggregator  │     │  → Upload to MongoDB     │                │
│  │    (60 prices/min)   │     │  → Get commitment ID     │                │
│  │  → MongoDB submit    │     │  → Store on-chain ref    │                │
│  │  → PriceOracle store │     └──────────────────────────┘                │
│  └──────────────────────┘                                                  │
│                                                                            │
│  ┌──────────────────────────────────────────────────────┐                  │
│  │   FUTURES LIFECYCLE                                   │                  │
│  │  1. User opens position via LineFutures contract      │                  │
│  │  2. PositionCloser cron (every 10s) finds expired     │                  │
│  │  3. Retrieves predictions + actual prices from MongoDB│                  │
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
│  │  ├─ MongoDB (predictions/prices) │                                      │
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
| Database         | MongoDB Atlas (cloud), SQLite (local)                            |
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
    string predictionCommitmentId;     // MongoDB ObjectId for user's 60-point prediction
    bool isOpen;
    int256 pnl;
    string actualPriceCommitmentId;    // MongoDB ObjectId for actual 60-price window
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

**Purpose**: Stores commitment strings (MongoDB ObjectIds) for 60-second price windows, indexed by minute-boundary timestamps.

**Key Functions**:

| Function              | Description                                                           |
| --------------------- | --------------------------------------------------------------------- |
| `storeCommitment()`  | Stores storage commitment for a given minute boundary. Submitter only. |
| `getCommitment()`    | Retrieve commitment string for a specific window start timestamp.      |
| `getLatestWindow()`  | Returns the most recent window timestamp.                              |
| `getWindowsInRange()`| Query all windows within a time range.                                 |

**Access Control**: Only the designated `submitter` address can write commitments. Anyone can read.

---

## Backend Architecture

The backend is organized into distinct pipelines, each responsible for a part of the system.

### 5.1 Price Pipeline

```
Bybit WebSocket → PriceIngester → PriceAggregator → MongoDB → PriceOracle
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

3. **MongoDBStorage** (`src/storage/mongoStorage.ts`)
   - MongoDB client connected to Atlas cloud database
   - Retry logic: 3 attempts with exponential backoff (5s → 10s → 20s)
   - Stores data in collections: `price_windows` and `user_predictions`
   - Returns MongoDB ObjectId as hex string with `0x` prefix

4. **ContractStorage** (`src/contract/contractStorage.ts`)
   - ethers.js wrapper for PriceOracle contract
   - Submits price window commitments on-chain at each minute boundary

5. **Orchestrator** (`src/orchestrator/orchestrator.ts`)
   - Coordinates the entire price pipeline end-to-end
   - Event-driven: listens to `windowReady` → MongoDB submit → PriceOracle store
   - Window check interval every 5 seconds

### 5.2 Futures/Position Pipeline

1. **PredictionService** (`src/futures/predictionService.ts`)
   - Accepts user-drawn prediction curves (exactly 60 numbers)
   - Rate limiting: 10 requests per 60s per IP/address
   - Validates: exactly 60 positive finite numbers
   - Uploads to MongoDB, returns commitment ID (ObjectId)

2. **PositionService** (`src/futures/positionService.ts`)
   - Retrieves position details with predictions + analytics
   - Closes expired positions:
     - Retrieve predictions from MongoDB
     - Retrieve actual prices from PriceOracle → MongoDB
     - Calculate PnL via PNLCalculator
     - Call `LineFutures.closePosition()` on-chain
     - Record in PositionDatabase (for leaderboard)
     - Process Yellow payout if applicable

3. **PositionCloser** (`src/futures/positionCloser.ts`)
   - Cron job running every 10 seconds
   - Calls `LineFutures.getClosablePositions()` to find expired positions
   - 2-second delay between closing each position
   - Retry queue: failed positions retry up to 5 times
   - Skip list: positions permanently skipped (e.g., data loss)

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
| `/api/predictions/upload`          | POST   | Upload prediction → MongoDB      |
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

## MongoDB Storage

### Why MongoDB?

Storing 60 price points directly on-chain per position would be prohibitively expensive. MongoDB Atlas provides reliable cloud storage with on-chain commitment references (ObjectIds) for verification.

### Two-Way Usage

**1. Price Windows (Backend → MongoDB → PriceOracle)**

```
Every 60 seconds:
  PriceAggregator produces 60-price window
  → Insert document into MongoDB `price_windows` collection
  → Receive ObjectId as hex string commitment
  → Store commitment in PriceOracle contract (indexed by minute timestamp)
```

**2. User Predictions (Frontend → Backend → MongoDB)**

```
User draws curve:
  Frontend samples 60 points from drawing
  → POST /api/predictions/upload (array of 60 numbers)
  → Backend validates & uploads to MongoDB `user_predictions` collection
  → Returns ObjectId commitment to frontend
  → Frontend passes commitment to LineFutures.openPosition()
```

### Verification Flow

At position close time:
1. Retrieve prediction commitment from LineFutures position data
2. Retrieve actual price commitment from PriceOracle (by minute-aligned timestamp)
3. Fetch both documents from MongoDB using ObjectId commitments
4. Extract 60-number arrays from documents
5. Run PNL calculation on the two arrays

### MongoDB Setup

**MongoDB Atlas Cloud Setup:**
1. Create free MongoDB Atlas account at https://www.mongodb.com/cloud/atlas
2. Create M0 cluster (free tier)
3. Create database named `drawfi`
4. Get connection string: `mongodb+srv://username:password@cluster.mongodb.net/`
5. Whitelist your server IP or use `0.0.0.0/0` for testing
6. Set `MONGODB_URI` environment variable

**Collections:**
- `price_windows` — 60-second price windows with indexes on `windowStart` and `createdAt`
- `user_predictions` — User prediction data with indexes on `userAddress` and `createdAt`

**Benefits:**
- Cloud-hosted with automatic backups
- No data loss on restarts (persistent cloud storage)
- Query capabilities by user, timestamp, etc.
- Built-in monitoring and alerting

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
   - Uploads to MongoDB → receives commitment ID (ObjectId)
4. Frontend calls LineFutures.openPosition(leverage, commitmentId) {value: amount}
5. Contract creates Position struct, emits PositionOpened event
6. Position is now live — 60-second countdown begins
```

### Flow 2: Opening a Position (Yellow Balance, Gas-Free)

```
1. User has ytest.usd balance (from Yellow deposits or faucet)
2. User draws prediction → uploads to MongoDB → gets commitment ID (ObjectId)
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
   b. Fetch prediction document from MongoDB using ObjectId → decode 60 numbers
   c. Compute minute-aligned window: openTimestamp rounded to minute boundary
   d. Fetch actual price commitment from PriceOracle
   e. Fetch actual price document from MongoDB using ObjectId → decode 60 numbers
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
   → Inserts 60-price document into MongoDB → ObjectId commitment
   → Calls PriceOracle.storeCommitment(windowTimestamp, commitment)
4. Commitment now available for position closing reference
```




## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- MongoDB Atlas account (free tier available)
- Sepolia ETH for deployments and transactions

### Environment

Copy `backend/env.example` to `backend/.env.local` and fill in values.

**Backend** (`backend/.env.local`):

```
ETHEREUM_SEPOLIA_PRIVATE_KEY=
CONTRACT_ADDRESS=           # PriceOracle address
FUTURES_CONTRACT_ADDRESS=   # LineFutures address
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/
MONGODB_DATABASE=drawfi
ADMIN_API_KEY=

# Yellow Network (required for opening positions)
YELLOW_CLEARNODE_WS_URL=wss://clearnet-sandbox.yellow.com/ws
YELLOW_RELAYER_PRIVATE_KEY= # or uses ETHEREUM_SEPOLIA_PRIVATE_KEY
YELLOW_RELAYER_ENABLED=true # required for Yellow/Relayer positions
YELLOW_ETH_TO_ytest_RATE=100 # 1 ETH = 100 ytest.usd
YELLOW_FAUCET_ALSO_CREDIT=true # Faucet also credits Draw-Fi balance (sandbox - no transfer needed)
```

**Frontend** (`frontend/.env.local`):

```
NEXT_PUBLIC_FUTURES_CONTRACT_ADDRESS=
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_PRIVY_APP_ID=   # for embedded wallet
NEXT_PUBLIC_ETHEREUM_RPC_URL=   # optional, Sepolia RPC
```

### Run

1. Set up MongoDB Atlas cluster and get connection string
2. Backend: `cd backend && pnpm dev` (port 3001)
3. Frontend: `cd frontend && pnpm dev`

### Deploy Contracts

```bash
cd contracts
pnpm install
npx hardhat ignition deploy ignition/modules/LineFutures.ts --network sepolia
```

See `contracts/DEPLOY.md` and `contracts/DEPLOYMENT.md` for details.

## License

MIT
