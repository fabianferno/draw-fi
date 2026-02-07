# Draw-Fi

**Draw your futures.** A gamified futures trading platform where users predict token price movements by drawing curves on a chart instead of placing traditional orders. Turn your market intuition into entertainment finance.

## What It Does

- **Draw predictions** – Sketch a path on a live market chart representing your expected price trajectory over 1–5 minutes
- **Open positions** – Your drawing is converted to 60 price points, stored in EigenDA, and committed on-chain
- **Calculate PnL** – Profit/loss is based on **directional accuracy**: how many of your 59 step-by-step direction predictions (up/down/flat) match actual market movements
- **Leaderboard** – Compete with other traders ranked by total PnL, win rate, and accuracy
- **Yellow Network** – Fund positions off-chain (ytest.usd), settle on-chain. No gas for deposits; instant payouts via Yellow.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Bybit WebSocket │────▶│  Price Aggregator │────▶│    EigenDA      │
│  (Live Prices)   │     │  (60 prices/min)  │     │  (Blob Storage) │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                                          ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  User Draws     │────▶│ Prediction       │────▶│ PriceOracle     │
│  Prediction     │     │ Service          │     │ (On-chain)      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │
        ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  LineFutures    │◀────│ Position Closer  │◀────│ PNL Calculator  │
│  (Positions)    │     │ (Cron every 10s) │     │ (Directional)   │
└─────────────────┘     └──────────────────┘     └─────────────────┘

Yellow Network:
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Yellow Ledger  │────▶│ Deposit Poller   │────▶│ Yellow Balances │
│  (Incoming xfer)│     │ (every 15s)      │     │ (DB)            │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
User opens position ──▶ deduct balance ──▶ Relayer ──▶ LineFutures
Position closes ──▶ Payout via Yellow transfer to user
```

## Project Structure

| Directory | Description |
|-----------|-------------|
| `frontend/` | Next.js 16 app – landing, predict, leaderboard, chart & drawing UI |
| `backend/` | Node.js/Express – price oracle, EigenDA, prediction upload, position closing |
| `contracts/` | Solidity (Hardhat) – LineFutures, PriceOracle |

## Key Components

### Smart Contracts

- **LineFutures** – Position lifecycle: `openPosition`, `batchOpenPositions`, `closePosition`. 60s per position, 1–2500x leverage, 2% fee on profits. Requires EigenDA commitment IDs for predictions and actual prices.
- **PriceOracle** – Stores EigenDA commitment strings for 60-second price windows (minute-aligned).

### Backend

- **Price pipeline**: Bybit WebSocket → PriceAggregator (60 prices/min) → EigenDA → PriceOracle
- **Prediction pipeline**: User uploads 60 predictions → EigenDA → LineFutures commitment
- **Position closer**: Cron every 10s finds expired positions, fetches predictions + actual prices from EigenDA, computes PnL, closes on-chain
- **Yellow integration**: Deposit poller (credits user balances from Yellow transfers), payout via Yellow on position close

### Frontend

- **TradingChart** – Live price chart (Bybit) with drawing overlay
- **PatternDrawingBox** – Canvas to draw prediction curves, time horizon (1–5 min), amount, leverage
- **Token pair selector** – BTC/USDT, ETH/USDT, AAVE/USDT, DOGE/USDT
- **Yellow by default** – Deposit ytest.usd via Yellow Network, open positions, settle on-chain, receive payouts in Yellow

## PnL Formula

1. Compare 59 directional changes: predicted vs actual (up/down/flat)
2. `accuracy = correctDirections / 59`
3. `maxProfit = priceMovement × positionSize × leverage`
4. `pnl = (2 × accuracy - 1) × maxProfit` — 50% = break-even, 100% = max profit, 0% = max loss
5. 2% fee on profits only

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- EigenDA proxy (or local node) for blob storage
- Sepolia ETH for deployments and transactions

### Environment

**Backend** (`backend/.env.local`):

```
ETHEREUM_SEPOLIA_PRIVATE_KEY=
CONTRACT_ADDRESS=           # PriceOracle address
FUTURES_CONTRACT_ADDRESS=   # LineFutures address
EIGENDA_PROXY_URL=http://127.0.0.1:3100
ADMIN_API_KEY=

# Yellow Network (required for opening positions)
YELLOW_CLEARNODE_WS_URL=wss://clearnet-sandbox.yellow.com/ws
YELLOW_RELAYER_PRIVATE_KEY= # or uses ETHEREUM_SEPOLIA_PRIVATE_KEY
YELLOW_RELAYER_ENABLED=true # required for Yellow/Relayer positions
YELLOW_ETH_TO_ytest_RATE=100 # 1 ETH = 100 ytest.usd
YELLOW_FAUCET_ALSO_CREDIT=true # Faucet also credits Draw-Fi balance (sandbox - no transfer needed)
```

**Frontend** (`.env.local`):

```
NEXT_PUBLIC_FUTURES_CONTRACT_ADDRESS=
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_PRIVY_APP_ID=   # for embedded wallet
```

### Run

1. Start EigenDA proxy (e.g. port 3100)
2. Backend: `cd backend && pnpm dev` (port 3001)
3. Frontend: `cd frontend && pnpm dev`

### Deploy Contracts

```bash
cd contracts
pnpm install
npx hardhat ignition deploy ignition/modules/LineFutures.ts --network sepolia
```

See `contracts/DEPLOY.md` and `contracts/DEPLOYMENT.md` for details.

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check |
| `GET /api/latest` | Latest price window |
| `GET /api/history` | Price history (start, end params) |
| `POST /api/predictions/upload` | Upload user predictions → EigenDA |
| `GET /api/positions/open` | Open positions |
| `GET /api/leaderboard` | Leaderboard (limit, offset, sort) |
| `POST /api/admin/close-expired` | Close expired positions (requires `x-api-key`) |

### Yellow Network

| Endpoint | Description |
|----------|-------------|
| `GET /api/yellow/deposit-address` | Draw-Fi deposit address for Yellow transfers |
| `GET /api/yellow/deposit-balance/:address` | User's credited Yellow balance |
| `POST /api/yellow/open-with-balance` | Open position using Yellow balance (EIP-712 signed) |
| `POST /api/yellow/faucet` | Request test tokens from Yellow Sandbox |
| `GET /api/yellow/balance/:address` | Yellow ledger balance |

## License

MIT
