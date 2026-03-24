# Portfolio Page — Yellow ClearNode Deposit/Withdraw

## Overview

Add a `/portfolio` page to the Draw-Fi frontend that lets users deposit USDC into and withdraw USDC from the Yellow ClearNode's off-chain balance using the `yellow-ts` SDK. The new portfolio hooks use yellow-ts directly; existing Yellow backend API hooks (`useYellow.ts`, `lib/api/yellow.ts`) remain in place for the predict page's relayer-based position opening flow.

## Architecture

### Approach: Context Provider + Hooks

A `YellowClientProvider` context at the app level manages a persistent `yellow-ts` WebSocket connection. Smaller, focused hooks consume the context for specific operations.

```
Providers (app level)
└── YellowClientProvider
    ├── manages yellow-ts Client lifecycle (connect/disconnect)
    ├── fetches ClearNode config (custody + adjudicator addresses) on connect
    ├── creates viem PublicClient + WalletClient from Privy EIP-1193 provider
    ├── builds Nitrolite signers (StateSigner + TransactionSigner)
    └── exposes client instance + connection state via context

Hooks (consume context)
├── useYellowClient()             — raw client + connection state
├── useYellowPortfolioBalances()  — wallet USDC + off-chain balance polling
├── useYellowPortfolioDeposit()   — deposit action
└── useYellowPortfolioWithdraw()  — withdrawal action

Page
└── /portfolio                    — consumes all hooks
    ├── Balance cards (wallet USDC, off-chain balance)
    ├── Deposit form
    └── Withdraw form
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_YELLOW_WS_URL` | `wss://clearnet.yellow.com/ws` | Yellow ClearNode WebSocket endpoint |
| `NEXT_PUBLIC_YELLOW_CHAIN_ID` | `84532` | Chain ID (Base Sepolia default, set to `8453` for Base mainnet) |

Switching from Base Sepolia to Base mainnet requires only changing `NEXT_PUBLIC_YELLOW_CHAIN_ID` to `8453`.

### Contract Addresses

Custody and adjudicator contract addresses are fetched dynamically from the ClearNode config after connecting (not hardcoded). The `challengeDuration` is also obtained from the ClearNode config response.

### USDC Token Address

A per-chain constant map provides the USDC token contract address:

```typescript
// lib/yellow/constants.ts
const USDC_ADDRESS: Record<number, `0x${string}`> = {
  84532: '0x...', // Base Sepolia USDC
  8453:  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base mainnet USDC
};
```

### Asset

- USDC only, referenced as `"usdc"` asset name in yellow-ts calls
- USDC has 6 decimals — all amounts displayed as human-readable (divide by 1e6)
- USDC token address resolved from `NEXT_PUBLIC_YELLOW_CHAIN_ID` via the constants map

## Detailed Design

### 1. Signer + Client Adapters (`lib/yellow/signers.ts`)

The `@erc7824/nitrolite` SDK requires viem-based clients and specific signer interfaces. Privy's embedded wallet exposes an EIP-1193 provider which can be adapted to both.

**viem clients (created in YellowClientProvider):**
- `PublicClient` — via `createPublicClient({ chain, transport: http(rpcUrl) })`
- `WalletClient` — via `createWalletClient({ chain, transport: custom(privyEip1193Provider) })`

**StateSigner adapter:**
- `getAddress(): Address` → returns Privy wallet address as viem `Address` (`` `0x${string}` ``)
- `signState(channelId: Hex, state: UnsignedState): Promise<Hex>` → EIP-712 typed data signing via the viem WalletClient
- `signRawMessage(message: Hex): Promise<Hex>` → raw message signing via the viem WalletClient

**TransactionSigner adapter:**
- `getAddress(): Address` → returns Privy wallet address
- `sendTransaction(tx): Promise<Hash>` → delegates to viem WalletClient `sendTransaction`
- `signMessage(message: { raw: Hex }): Promise<Hex>` → extracts `message.raw`, signs via WalletClient

Both adapters are initialized from Privy's EIP-1193 provider obtained via `embeddedWallet.getEthereumProvider()`.

### 2. USDC Constants (`lib/yellow/constants.ts`)

```typescript
export const USDC_ADDRESS: Record<number, `0x${string}`> = {
  84532: '0x...', // Base Sepolia USDC
  8453:  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base mainnet USDC
};

export const USDC_DECIMALS = 6;

export function getChainId(): number {
  return parseInt(process.env.NEXT_PUBLIC_YELLOW_CHAIN_ID || '84532', 10);
}

export function getUsdcAddress(): `0x${string}` {
  const chainId = getChainId();
  const addr = USDC_ADDRESS[chainId];
  if (!addr) throw new Error(`No USDC address configured for chain ${chainId}`);
  return addr;
}
```

### 3. YellowClientProvider (`contexts/YellowClientContext.tsx`)

**State:**
```typescript
interface YellowClientState {
  client: Client | null;           // yellow-ts Client instance
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  custodyAddress: string | null;   // fetched from ClearNode config
}
```

**Behavior:**
- Watches Privy auth state via `usePrivyWallet()`
- On authenticate:
  1. Gets EIP-1193 provider from Privy embedded wallet
  2. Creates viem `PublicClient` and `WalletClient`
  3. Builds `StateSigner` and `TransactionSigner` adapters
  4. Connects yellow-ts `Client` to ClearNode WebSocket
  5. Fetches ClearNode config to obtain custody address, adjudicator address, and challengeDuration
  6. Constructs `NitroliteClientConfig` with all required fields and initializes the Nitrolite client
- On logout/disconnect: calls `client.disconnect()`, resets state
- Handles WebSocket reconnection state via `client.listen()` for connection events
- Lives inside the existing `Providers` component wrapping `{children}`

**NitroliteClientConfig construction:**
```typescript
{
  publicClient,                    // viem PublicClient for Base Sepolia/Base
  walletClient,                    // viem WalletClient from Privy provider
  stateSigner,                     // adapted StateSigner
  addresses: {
    custody: custodyAddress,       // from ClearNode config
    adjudicator: adjudicatorAddress, // from ClearNode config
  },
  chainId: getChainId(),
  challengeDuration,               // from ClearNode config
}
```

### 4. useYellowClient Hook (`hooks/useYellowClient.ts`)

Simple context consumer:
```typescript
Returns: { client, isConnected, isConnecting, error, custodyAddress }
```

### 5. useYellowPortfolioBalances Hook (`hooks/useYellowPortfolioBalances.ts`)

Polls balances on a 10-second interval:
```typescript
Returns: {
  walletBalance: bigint,    // on-chain USDC via client.getTokenBalance(usdcAddress)
  offchainBalance: bigint,  // off-chain via client.getAccountInfo() or getAccountBalance(usdcAddress)
  loading: boolean,
  refresh: () => void,
}
```

Note: If `getAccountInfo()` is unavailable on the installed nitrolite version, falls back to `getAccountBalance(usdcAddress)` for the off-chain balance.

### 6. useYellowPortfolioDeposit Hook (`hooks/useYellowPortfolioDeposit.ts`)

```typescript
Returns: {
  deposit: (amount: bigint) => Promise<Hash>,  // calls client.deposit(amount) — yellow-ts wrapper
  isDepositing: boolean,
  txHash: string | null,
  error: string | null,
}
```

The yellow-ts `client.deposit(amount)` wraps the underlying nitrolite deposit which handles ERC-20 approval automatically. If the yellow-ts wrapper doesn't pass the token address correctly, the hook will call the nitrolite client directly: `nitroliteClient.deposit(usdcAddress, amount)`.

### 7. useYellowPortfolioWithdraw Hook (`hooks/useYellowPortfolioWithdraw.ts`)

```typescript
Returns: {
  withdraw: (amount: bigint) => Promise<Hash>,  // calls client.withdrawal(amount)
  isWithdrawing: boolean,
  txHash: string | null,
  error: string | null,
}
```

Same fallback strategy as deposit if the yellow-ts wrapper doesn't pass token address correctly.

### 8. Portfolio Page (`app/portfolio/page.tsx`)

**Layout** (matches existing app style — black bg, cyan accents, Framer Motion animations):

```
┌──────────────────────────────────────────────────┐
│ Header (with "Portfolio" nav link)                │
├──────────────────────────────────────────────────┤
│                                                   │
│  ┌──────────────┐  ┌──────────────┐              │
│  │ Wallet USDC  │  │ Off-chain    │              │
│  │ 150.00       │  │ Balance      │              │
│  │              │  │ 80.00 USDC   │              │
│  └──────────────┘  └──────────────┘              │
│                                                   │
│  ┌──────────────────┐ ┌──────────────────┐       │
│  │ DEPOSIT          │ │ WITHDRAW         │       │
│  │                  │ │                  │       │
│  │ Amount: [___]    │ │ Amount: [___]    │       │
│  │ [MAX]            │ │ [MAX]            │       │
│  │                  │ │                  │       │
│  │ [Deposit USDC]   │ │ [Withdraw USDC]  │       │
│  │                  │ │                  │       │
│  │ Status/TxHash    │ │ Status/TxHash    │       │
│  └──────────────────┘ └──────────────────┘       │
│                                                   │
│  Connection status (ClearNode)                    │
├──────────────────────────────────────────────────┤
│ Footer                                            │
└──────────────────────────────────────────────────┘
```

**States:**
- Not authenticated → "Connect Wallet" prompt (reuses `ConnectWalletButton`)
- Connecting to ClearNode → loading skeleton
- Connected → balance cards + deposit/withdraw forms
- During tx → spinner on button, then tx hash with block explorer link
- MAX button: deposit fills with wallet balance, withdraw fills with off-chain balance
- WebSocket reconnecting → subtle indicator on connection status

## File Changes

### New Files
| File | Purpose |
|------|---------|
| `contexts/YellowClientContext.tsx` | Provider + context for yellow-ts client |
| `lib/yellow/signers.ts` | Privy → viem → Nitrolite signer adapters |
| `lib/yellow/constants.ts` | USDC address per chain, chain ID helper |
| `hooks/useYellowClient.ts` | Context consumer hook |
| `hooks/useYellowPortfolioBalances.ts` | Balance polling hook |
| `hooks/useYellowPortfolioDeposit.ts` | Deposit action hook |
| `hooks/useYellowPortfolioWithdraw.ts` | Withdraw action hook |
| `app/portfolio/page.tsx` | Portfolio page |

### Modified Files
| File | Change |
|------|--------|
| `components/providers.tsx` | Add `YellowClientProvider` wrapping children, add Base Sepolia to supported chains |
| `components/layout/Header.tsx` | Add "Portfolio" nav link |
| `package.json` | Add `yellow-ts` dependency |
| `.env.example` | Add `NEXT_PUBLIC_YELLOW_WS_URL`, `NEXT_PUBLIC_YELLOW_CHAIN_ID` |

### NOT Removed
| File | Reason |
|------|--------|
| `hooks/useYellow.ts` | Still used by predict page for backend-relayer deposit flow |
| `lib/api/yellow.ts` | Still used by predict page for `openPositionWithYellowBalance()` |

These existing files serve the predict page's relayer-based position opening and are unrelated to the portfolio page's direct custody deposit/withdraw. They will coexist with the new hooks (name collision avoided by using `useYellowPortfolio*` prefix).

## Dependencies

- `yellow-ts` (latest, currently `0.0.10`) — installs `@erc7824/nitrolite` and `websocket-ts` as transitive deps
- `viem` — already a project dependency (used in `providers.tsx`)

## Network Configuration

- **Default**: Base Sepolia (chainId `84532`)
- **Production**: Base mainnet (chainId `8453`) — single env var change
- `providers.tsx` adds Base Sepolia chain definition to Privy's `supportedChains` alongside existing Sepolia
- RPC URL for the target chain should be set via `NEXT_PUBLIC_ETHEREUM_RPC_URL` (existing env var)

## Compatibility Notes

- The yellow-ts wrapper's `deposit(amount)` and `withdrawal(amount)` take only a `bigint` amount without a token address parameter. If this causes issues with the underlying `@erc7824/nitrolite` (which may require token address), the hooks will access the nitrolite client directly via the re-exported `nitrolite` module from yellow-ts. This will be verified during implementation.
- The `@erc7824/nitrolite` SDK version (`^0.5.1` bundled with yellow-ts) will be tested for API compatibility. If `getAccountInfo()` is unavailable, `getAccountBalance(usdcAddress)` will be used as fallback for off-chain balance queries.
