# Portfolio Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/portfolio` page that lets users deposit/withdraw USDC to/from Yellow ClearNode off-chain balance via `yellow-ts`.

**Architecture:** Context provider (`YellowClientProvider`) manages the yellow-ts WebSocket client lifecycle at the app level. Four focused hooks consume the context for balances, deposit, and withdraw. A new `/portfolio` page renders balance cards and deposit/withdraw forms. Privy's EIP-1193 provider is adapted to viem clients for Nitrolite compatibility.

**Tech Stack:** Next.js 16, React 19, yellow-ts (wraps @erc7824/nitrolite), viem, Privy embedded wallets, Tailwind CSS v4, Framer Motion.

**Spec:** `docs/superpowers/specs/2026-03-20-portfolio-page-design.md`

**Note:** No test framework exists in this project (no vitest/jest/testing-library in package.json). Steps focus on manual verification via `pnpm dev` and build checks via `pnpm build`. All file paths are relative to `frontend/`.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `lib/yellow/constants.ts` | USDC addresses per chain, chain ID helper, block explorer URLs |
| `lib/yellow/signers.ts` | Adapts Privy EIP-1193 provider → viem WalletClient → Nitrolite StateSigner + TransactionSigner |
| `contexts/YellowClientContext.tsx` | React context + provider managing yellow-ts Client lifecycle |
| `hooks/useYellowClient.ts` | Context consumer — exposes client, connection state |
| `hooks/useYellowPortfolioBalances.ts` | Polls wallet USDC + off-chain balance on interval |
| `hooks/useYellowPortfolioDeposit.ts` | Deposit action hook |
| `hooks/useYellowPortfolioWithdraw.ts` | Withdraw action hook |
| `app/portfolio/page.tsx` | Portfolio page UI |
| `components/providers.tsx` | Modified — add YellowClientProvider + Base Sepolia chain |
| `components/layout/Header.tsx` | Modified — add Portfolio nav link |
| `package.json` | Modified — add yellow-ts dependency |
| `.env.example` | Modified — add new env vars |

---

### Task 1: Install yellow-ts and inspect nitrolite API

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install yellow-ts**

```bash
cd frontend && pnpm add yellow-ts
```

- [ ] **Step 2: Inspect the installed @erc7824/nitrolite types**

We need to check the actual API surface of the bundled nitrolite to resolve compatibility questions from the spec review. Run:

```bash
cd frontend && cat node_modules/@erc7824/nitrolite/dist/index.d.ts 2>/dev/null | head -200
```

Look for:
- `NitroliteClient` class or `Client` class — which one exists?
- `deposit()` signature — does it take `(amount)` or `(tokenAddress, amount)` or `(blockchainId, asset, amount)`?
- `StateSigner` and `TransactionSigner` interfaces — exact method signatures
- `NitroliteClientConfig` type — required fields
- `getAccountInfo()` vs `getAccountBalance()` — which exists?
- `createSigners()` helper — does it exist?

Document the findings. The subsequent tasks will use these actual types. If the API differs significantly from the spec, adapt accordingly.

- [ ] **Step 3: Also check what yellow-ts re-exports**

```bash
cd frontend && cat node_modules/yellow-ts/dist/index.d.ts 2>/dev/null | head -100
```

- [ ] **Step 4: Verify the build still works**

```bash
cd frontend && pnpm build
```

Expected: Build succeeds (yellow-ts is installed but not imported yet).

- [ ] **Step 5: Commit**

```bash
cd frontend && git add package.json pnpm-lock.yaml && git commit -m "chore: add yellow-ts dependency"
```

---

### Task 2: USDC constants and chain config

**Files:**
- Create: `frontend/lib/yellow/constants.ts`

- [ ] **Step 1: Create the constants file**

```typescript
// frontend/lib/yellow/constants.ts

export const USDC_DECIMALS = 6;

export const USDC_ADDRESS: Record<number, `0x${string}`> = {
  84532: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia USDC
  8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',  // Base mainnet USDC
};

export const BLOCK_EXPLORER: Record<number, string> = {
  84532: 'https://sepolia.basescan.org',
  8453: 'https://basescan.org',
};

export const RPC_URL: Record<number, string> = {
  84532: 'https://sepolia.base.org',
  8453: 'https://mainnet.base.org',
};

export function getYellowChainId(): number {
  return parseInt(process.env.NEXT_PUBLIC_YELLOW_CHAIN_ID || '84532', 10);
}

export function getYellowWsUrl(): string {
  return process.env.NEXT_PUBLIC_YELLOW_WS_URL || 'wss://clearnet.yellow.com/ws';
}

export function getUsdcAddress(): `0x${string}` {
  const chainId = getYellowChainId();
  const addr = USDC_ADDRESS[chainId];
  if (!addr) throw new Error(`No USDC address for chain ${chainId}`);
  return addr;
}

export function getBlockExplorerUrl(): string {
  const chainId = getYellowChainId();
  return BLOCK_EXPLORER[chainId] || 'https://sepolia.basescan.org';
}

export function getRpcUrl(): string {
  const chainId = getYellowChainId();
  return process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL || RPC_URL[chainId] || 'https://sepolia.base.org';
}

/** Format bigint USDC amount (6 decimals) to human-readable string */
export function formatUsdc(amount: bigint): string {
  const whole = amount / BigInt(10 ** USDC_DECIMALS);
  const frac = amount % BigInt(10 ** USDC_DECIMALS);
  const fracStr = frac.toString().padStart(USDC_DECIMALS, '0').replace(/0+$/, '') || '0';
  return `${whole}.${fracStr.slice(0, 2).padEnd(2, '0')}`;
}

/** Parse human-readable USDC string to bigint (6 decimals) */
export function parseUsdc(input: string): bigint {
  const trimmed = input.trim();
  if (!trimmed || trimmed === '.') return 0n;
  const parts = trimmed.split('.');
  const whole = parts[0] || '0';
  const frac = (parts[1] || '').slice(0, USDC_DECIMALS).padEnd(USDC_DECIMALS, '0');
  const n = BigInt(whole) * BigInt(10 ** USDC_DECIMALS) + BigInt(frac);
  return n < 0n ? 0n : n;
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add lib/yellow/constants.ts && git commit -m "feat: add USDC constants and chain config for Yellow"
```

---

### Task 3: Signer adapters

**Files:**
- Create: `frontend/lib/yellow/signers.ts`

This task depends on findings from Task 1 Step 2. The code below uses the yellow-ts shims types (which type everything as `any`). Adapt the exact interface if the installed nitrolite has stricter types.

- [ ] **Step 1: Create the signers file**

```typescript
// frontend/lib/yellow/signers.ts

import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type PublicClient,
  type WalletClient,
  type Chain,
} from 'viem';
import { baseSepolia, base } from 'viem/chains';
import { getYellowChainId, getRpcUrl } from './constants';

const CHAIN_MAP: Record<number, Chain> = {
  84532: baseSepolia,
  8453: base,
};

export function getYellowChain(): Chain {
  const chainId = getYellowChainId();
  return CHAIN_MAP[chainId] || baseSepolia;
}

export function createYellowPublicClient(): PublicClient {
  const chain = getYellowChain();
  const rpcUrl = getRpcUrl();
  return createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
}

export function createYellowWalletClient(
  eip1193Provider: any,
): WalletClient {
  const chain = getYellowChain();
  return createWalletClient({
    chain,
    transport: custom(eip1193Provider),
  });
}

/**
 * Creates a StateSigner adapter from a viem WalletClient.
 * The exact interface depends on the installed @erc7824/nitrolite version.
 * With yellow-ts shims (types are `any`), this implements the expected shape.
 */
export function createStateSigner(walletClient: WalletClient, address: `0x${string}`) {
  return {
    getAddress(): `0x${string}` {
      return address;
    },
    async signMessage(message: any): Promise<`0x${string}`> {
      const raw = typeof message === 'string' ? message : message?.raw || message;
      return walletClient.signMessage({
        account: address,
        message: { raw: raw as `0x${string}` },
      });
    },
    async signState(channelId: any, state: any): Promise<`0x${string}`> {
      // EIP-712 typed data signing for Nitrolite state
      // If the nitrolite SDK provides a helper for computing the state hash, use it.
      // Otherwise, sign the raw hash.
      const hash = typeof state === 'string' ? state : JSON.stringify(state);
      return walletClient.signMessage({
        account: address,
        message: { raw: channelId as `0x${string}` },
      });
    },
    async signRawMessage(message: any): Promise<`0x${string}`> {
      return walletClient.signMessage({
        account: address,
        message: { raw: message as `0x${string}` },
      });
    },
  };
}

/**
 * Creates a TransactionSigner adapter from a viem WalletClient.
 */
export function createTransactionSigner(walletClient: WalletClient, address: `0x${string}`) {
  return {
    getAddress(): `0x${string}` {
      return address;
    },
    async sendTransaction(tx: any): Promise<`0x${string}`> {
      return walletClient.sendTransaction({
        account: address,
        ...tx,
      });
    },
    async signMessage(message: any): Promise<`0x${string}`> {
      const raw = message?.raw || message;
      return walletClient.signMessage({
        account: address,
        message: { raw: raw as `0x${string}` },
      });
    },
  };
}
```

**Important:** After Task 1 Step 2, if the actual `@erc7824/nitrolite` exports `createSigners()` or has different interfaces, update this file to match. The yellow-ts shims type everything as `any`, so these adapters will compile regardless, but runtime behavior depends on matching the actual expected interface.

- [ ] **Step 2: Verify build**

```bash
cd frontend && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add lib/yellow/signers.ts && git commit -m "feat: add Privy-to-Nitrolite signer adapters via viem"
```

---

### Task 4: YellowClientContext provider

**Files:**
- Create: `frontend/contexts/YellowClientContext.tsx`

- [ ] **Step 1: Create the context provider**

```typescript
// frontend/contexts/YellowClientContext.tsx
'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { Client, type ClientOptions } from 'yellow-ts';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import {
  createYellowPublicClient,
  createYellowWalletClient,
  createStateSigner,
  createTransactionSigner,
} from '@/lib/yellow/signers';
import { getYellowWsUrl, getYellowChainId } from '@/lib/yellow/constants';

interface YellowClientState {
  client: Client | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  custodyAddress: string | null;
}

const YellowClientContext = createContext<YellowClientState | undefined>(undefined);

export function YellowClientProvider({ children }: { children: ReactNode }) {
  const { ready, authenticated } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const embeddedWallet = useMemo(
    () => wallets.find((w) => w.walletClientType === 'privy') ?? null,
    [wallets],
  );
  const address = embeddedWallet?.address ?? null;

  const [client, setClient] = useState<Client | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [custodyAddress, setCustodyAddress] = useState<string | null>(null);
  const clientRef = useRef<Client | null>(null);

  const initClient = useCallback(async () => {
    if (!ready || !walletsReady || !authenticated || !embeddedWallet || !address) return;
    if (clientRef.current) return; // already initialized

    setIsConnecting(true);
    setError(null);

    try {
      // Get Privy's raw EIP-1193 provider directly (not the ethers wrapper)
      const eip1193 = await embeddedWallet.getEthereumProvider();
      if (!eip1193) throw new Error('No wallet provider available');

      // Create viem clients
      const publicClient = createYellowPublicClient();
      const walletClient = createYellowWalletClient(eip1193);

      // Create signers
      const addr = address as `0x${string}`;
      const stateSigner = createStateSigner(walletClient, addr);
      const txSigner = createTransactionSigner(walletClient, addr);

      // Build yellow-ts client options
      const opts: ClientOptions = {
        url: getYellowWsUrl(),
        nitrolite: {
          publicClient,
          walletClient,
          stateSigner,
          txSigner,
          chainId: getYellowChainId(),
          // custody/adjudicator addresses will be fetched from ClearNode config
        } as any,
      };

      const yellowClient = new Client(opts);
      await yellowClient.connect();

      // Fetch ClearNode config to get custody address
      try {
        // Use sendMessage or request to get config from ClearNode
        // The exact RPC method depends on the ClearNode API
        // For now, store the client and let hooks handle config fetching
      } catch (configErr) {
        console.warn('Failed to fetch ClearNode config:', configErr);
      }

      clientRef.current = yellowClient;
      setClient(yellowClient);
      setIsConnected(true);

      // Listen for disconnection
      yellowClient.listen(undefined, (msg: any) => {
        // Handle connection state updates if needed
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect to Yellow ClearNode';
      console.error('Yellow client init error:', err);
      setError(message);
    } finally {
      setIsConnecting(false);
    }
  }, [ready, walletsReady, authenticated, embeddedWallet, address]);

  // Initialize on auth
  useEffect(() => {
    if (ready && walletsReady && authenticated && embeddedWallet && address && !clientRef.current) {
      initClient();
    }
  }, [ready, walletsReady, authenticated, embeddedWallet, address, initClient]);

  // Cleanup on logout
  useEffect(() => {
    if (!authenticated && clientRef.current) {
      clientRef.current.disconnect().catch(console.error);
      clientRef.current = null;
      setClient(null);
      setIsConnected(false);
      setCustodyAddress(null);
      setError(null);
    }
  }, [authenticated]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clientRef.current) {
        clientRef.current.disconnect().catch(console.error);
        clientRef.current = null;
      }
    };
  }, []);

  return (
    <YellowClientContext.Provider
      value={{ client, isConnected, isConnecting, error, custodyAddress }}
    >
      {children}
    </YellowClientContext.Provider>
  );
}

export function useYellowClientContext(): YellowClientState {
  const ctx = useContext(YellowClientContext);
  if (!ctx) {
    throw new Error('useYellowClientContext must be used within YellowClientProvider');
  }
  return ctx;
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && pnpm build
```

Expected: Build succeeds (provider is created but not yet wired into the app).

- [ ] **Step 3: Commit**

```bash
cd frontend && git add contexts/YellowClientContext.tsx && git commit -m "feat: add YellowClientProvider context for yellow-ts lifecycle"
```

---

### Task 5: Consumer hooks

**Files:**
- Create: `frontend/hooks/useYellowClient.ts`
- Create: `frontend/hooks/useYellowPortfolioBalances.ts`
- Create: `frontend/hooks/useYellowPortfolioDeposit.ts`
- Create: `frontend/hooks/useYellowPortfolioWithdraw.ts`

- [ ] **Step 1: Create useYellowClient hook**

```typescript
// frontend/hooks/useYellowClient.ts
'use client';

import { useYellowClientContext } from '@/contexts/YellowClientContext';

export function useYellowClient() {
  return useYellowClientContext();
}
```

- [ ] **Step 2: Create useYellowPortfolioBalances hook**

```typescript
// frontend/hooks/useYellowPortfolioBalances.ts
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useYellowClient } from './useYellowClient';

const POLL_INTERVAL_MS = 10_000;

export function useYellowPortfolioBalances() {
  const { client, isConnected } = useYellowClient();
  const [walletBalance, setWalletBalance] = useState<bigint>(0n);
  const [offchainBalance, setOffchainBalance] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchBalances = useCallback(async () => {
    if (!client || !isConnected) return;

    setLoading(true);
    try {
      // Fetch on-chain wallet USDC balance
      try {
        const walletBal = await client.getTokenBalance();
        setWalletBalance(walletBal);
      } catch (err) {
        console.warn('Failed to fetch wallet balance:', err);
      }

      // Fetch off-chain balance from ClearNode
      try {
        const info = await client.getAccountInfo();
        // info shape depends on nitrolite version — extract available balance
        const available = typeof info === 'object' && info !== null
          ? (info as any).available ?? (info as any).balance ?? 0n
          : 0n;
        setOffchainBalance(BigInt(available));
      } catch (err) {
        console.warn('Failed to fetch off-chain balance:', err);
      }
    } finally {
      setLoading(false);
    }
  }, [client, isConnected]);

  // Initial fetch + polling
  useEffect(() => {
    if (isConnected && client) {
      fetchBalances();
      intervalRef.current = setInterval(fetchBalances, POLL_INTERVAL_MS);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isConnected, client, fetchBalances]);

  return {
    walletBalance,
    offchainBalance,
    loading,
    refresh: fetchBalances,
  };
}
```

- [ ] **Step 3: Create useYellowPortfolioDeposit hook**

```typescript
// frontend/hooks/useYellowPortfolioDeposit.ts
'use client';

import { useState, useCallback } from 'react';
import { useYellowClient } from './useYellowClient';

export function useYellowPortfolioDeposit() {
  const { client, isConnected } = useYellowClient();
  const [isDepositing, setIsDepositing] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const deposit = useCallback(
    async (amount: bigint): Promise<string> => {
      if (!client || !isConnected) {
        throw new Error('Not connected to Yellow ClearNode');
      }
      if (amount <= 0n) {
        throw new Error('Amount must be greater than 0');
      }

      setIsDepositing(true);
      setError(null);
      setTxHash(null);

      try {
        const hash = await client.deposit(amount);
        const hashStr = typeof hash === 'string' ? hash : String(hash);
        setTxHash(hashStr);
        return hashStr;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Deposit failed';
        setError(message);
        throw err;
      } finally {
        setIsDepositing(false);
      }
    },
    [client, isConnected],
  );

  const reset = useCallback(() => {
    setTxHash(null);
    setError(null);
  }, []);

  return { deposit, isDepositing, txHash, error, reset };
}
```

- [ ] **Step 4: Create useYellowPortfolioWithdraw hook**

```typescript
// frontend/hooks/useYellowPortfolioWithdraw.ts
'use client';

import { useState, useCallback } from 'react';
import { useYellowClient } from './useYellowClient';

export function useYellowPortfolioWithdraw() {
  const { client, isConnected } = useYellowClient();
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const withdraw = useCallback(
    async (amount: bigint): Promise<string> => {
      if (!client || !isConnected) {
        throw new Error('Not connected to Yellow ClearNode');
      }
      if (amount <= 0n) {
        throw new Error('Amount must be greater than 0');
      }

      setIsWithdrawing(true);
      setError(null);
      setTxHash(null);

      try {
        const hash = await client.withdrawal(amount);
        const hashStr = typeof hash === 'string' ? hash : String(hash);
        setTxHash(hashStr);
        return hashStr;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Withdrawal failed';
        setError(message);
        throw err;
      } finally {
        setIsWithdrawing(false);
      }
    },
    [client, isConnected],
  );

  const reset = useCallback(() => {
    setTxHash(null);
    setError(null);
  }, []);

  return { withdraw, isWithdrawing, txHash, error, reset };
}
```

- [ ] **Step 5: Verify build**

```bash
cd frontend && pnpm build
```

Expected: Build succeeds (hooks exist but are not yet used by any page).

- [ ] **Step 6: Commit**

```bash
cd frontend && git add hooks/useYellowClient.ts hooks/useYellowPortfolioBalances.ts hooks/useYellowPortfolioDeposit.ts hooks/useYellowPortfolioWithdraw.ts && git commit -m "feat: add Yellow portfolio hooks for balances, deposit, withdraw"
```

---

### Task 6: Wire YellowClientProvider into providers and update Header

**Files:**
- Modify: `frontend/components/providers.tsx`
- Modify: `frontend/components/layout/Header.tsx`
- Modify: `frontend/.env.example`

- [ ] **Step 1: Add Base Sepolia chain and YellowClientProvider to providers.tsx**

In `frontend/components/providers.tsx`:

1. Add import at top (note: `defineChain` from `viem` is already imported):
```typescript
import { YellowClientProvider } from '@/contexts/YellowClientContext';
```

2. Add Base Sepolia chain definition after the existing `sepoliaChain` (around line 39):
```typescript
const baseSepoliaChain = defineChain({
  id: 84_532,
  name: 'Base Sepolia',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL || 'https://sepolia.base.org',
      ],
    },
  },
  blockExplorers: {
    default: {
      name: 'BaseScan',
      url: 'https://sepolia.basescan.org',
    },
  },
  testnet: true,
});
```

3. Add `baseSepoliaChain` to `supportedChains` array (line 66):
```typescript
supportedChains: [sepoliaChain, baseSepoliaChain],
```

4. Wrap with `YellowClientProvider` inside `TokenPairProvider` but outside `NextStepProvider`. The full nesting should become:
```tsx
<TokenPairProvider>
  <YellowClientProvider>
    <NextStepProvider>
      <NextStepReact
        steps={onboardingSteps}
        cardComponent={OnboardingCard}
        onComplete={markOnboardingSeen}
        onSkip={markOnboardingSeen}
      >
        {children}
      </NextStepReact>
    </NextStepProvider>
  </YellowClientProvider>
</TokenPairProvider>
```

- [ ] **Step 2: Add Portfolio nav link to Header.tsx**

In `frontend/components/layout/Header.tsx`, add a new `<Link>` inside the `<nav>` element (after the Pitch link, around line 68):

```tsx
<Link href="/portfolio" className="border-b-2 border-black text-sm font-bold text-black/80 hover:text-red-700 transition-colors">
  Portfolio
</Link>
```

- [ ] **Step 3: Update .env.example**

Append to `frontend/.env.example`:

```
# Yellow ClearNode — portfolio deposit/withdraw
# NEXT_PUBLIC_YELLOW_WS_URL=wss://clearnet.yellow.com/ws
# NEXT_PUBLIC_YELLOW_CHAIN_ID=84532
```

- [ ] **Step 4: Verify build and run dev server**

```bash
cd frontend && pnpm build
```

Expected: Build succeeds. Then:

```bash
cd frontend && pnpm dev
```

Open in browser. Verify:
- "Portfolio" link appears in the header nav
- Clicking it navigates to `/portfolio` (will show 404 until Task 7)
- Existing pages still work (predict, history, leaderboard)

- [ ] **Step 5: Commit**

```bash
cd frontend && git add components/providers.tsx components/layout/Header.tsx .env.example && git commit -m "feat: wire YellowClientProvider into app, add Portfolio nav link"
```

---

### Task 7: Portfolio page

**Files:**
- Create: `frontend/app/portfolio/page.tsx`

- [ ] **Step 1: Create the portfolio page**

```tsx
// frontend/app/portfolio/page.tsx
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  WalletIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  SignalIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import { Header, Footer } from '@/components/layout';
import { NoiseEffect } from '@/components/ui/NoiseEffect';
import { ConnectWalletButton } from '@/components/layout';
import { usePrivyWallet } from '@/hooks/usePrivyWallet';
import { useYellowClient } from '@/hooks/useYellowClient';
import { useYellowPortfolioBalances } from '@/hooks/useYellowPortfolioBalances';
import { useYellowPortfolioDeposit } from '@/hooks/useYellowPortfolioDeposit';
import { useYellowPortfolioWithdraw } from '@/hooks/useYellowPortfolioWithdraw';
import { formatUsdc, parseUsdc, getBlockExplorerUrl } from '@/lib/yellow/constants';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.2 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

function BalanceCard({
  label,
  amount,
  icon: Icon,
}: {
  label: string;
  amount: bigint;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <motion.div
      variants={itemVariants}
      className="bg-[#0a0a0a] border-2 border-[#00E5FF]/30 rounded-lg p-6 hover:border-[#00E5FF]/60 transition-colors"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg bg-[#00E5FF]/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-[#00E5FF]" />
        </div>
        <span className="text-sm font-bold text-white/60 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="text-3xl font-bold text-[#00E5FF] font-mono">
        {formatUsdc(amount)}
      </p>
      <p className="text-xs text-white/40 mt-1">USDC</p>
    </motion.div>
  );
}

function ActionCard({
  title,
  icon: Icon,
  maxAmount,
  onSubmit,
  isSubmitting,
  txHash,
  error,
  onReset,
  buttonLabel,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  maxAmount: bigint;
  onSubmit: (amount: bigint) => Promise<void>;
  isSubmitting: boolean;
  txHash: string | null;
  error: string | null;
  onReset: () => void;
  buttonLabel: string;
}) {
  const [inputValue, setInputValue] = useState('');

  const handleMax = () => {
    setInputValue(formatUsdc(maxAmount));
  };

  const handleSubmit = async () => {
    const amount = parseUsdc(inputValue);
    if (amount <= 0n) return;
    try {
      await onSubmit(amount);
      setInputValue('');
    } catch {
      // error is already set in the hook
    }
  };

  const explorerUrl = getBlockExplorerUrl();

  return (
    <motion.div
      variants={itemVariants}
      className="bg-[#0a0a0a] border-2 border-[#00E5FF]/30 rounded-lg p-6"
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-lg bg-[#00E5FF]/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-[#00E5FF]" />
        </div>
        <h3 className="text-lg font-bold text-white uppercase tracking-wider">
          {title}
        </h3>
      </div>

      <div className="space-y-4">
        {/* Amount input */}
        <div className="relative">
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={inputValue}
            onChange={(e) => {
              onReset();
              setInputValue(e.target.value.replace(/[^0-9.]/g, ''));
            }}
            disabled={isSubmitting}
            className="w-full bg-black border-2 border-[#00E5FF]/30 rounded-lg px-4 py-3 text-white font-mono text-lg focus:border-[#00E5FF] focus:outline-none disabled:opacity-50 transition-colors"
          />
          <button
            type="button"
            onClick={handleMax}
            disabled={isSubmitting}
            className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-bold text-[#00E5FF] border border-[#00E5FF]/50 rounded hover:bg-[#00E5FF]/10 disabled:opacity-50 transition-colors"
          >
            MAX
          </button>
        </div>

        {/* Submit button */}
        <motion.button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || !inputValue || parseUsdc(inputValue) <= 0n}
          className="w-full py-3 bg-[#00E5FF] text-black font-bold uppercase tracking-wider rounded-lg border-2 border-black shadow-[4px_4px_0_0_#000] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          whileHover={!isSubmitting ? { x: -2, y: -2, boxShadow: '6px 6px 0 0 #000' } : {}}
          whileTap={!isSubmitting ? { x: 2, y: 2, boxShadow: '2px 2px 0 0 #000' } : {}}
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <motion.span
                className="inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
              />
              Processing...
            </span>
          ) : (
            buttonLabel
          )}
        </motion.button>

        {/* Tx hash */}
        <AnimatePresence>
          {txHash && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="text-sm"
            >
              <span className="text-white/60">Tx: </span>
              <a
                href={`${explorerUrl}/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#00E5FF] hover:underline font-mono text-xs break-all"
              >
                {txHash.slice(0, 10)}...{txHash.slice(-8)}
              </a>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 text-sm text-red-400"
            >
              <ExclamationCircleIcon className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default function PortfolioPage() {
  const { ready, authenticated, isWalletLoading } = usePrivyWallet();
  const isAuthed = ready && authenticated && !isWalletLoading;

  const { isConnected, isConnecting, error: connectionError } = useYellowClient();
  const { walletBalance, offchainBalance, loading: balancesLoading, refresh } = useYellowPortfolioBalances();
  const {
    deposit,
    isDepositing,
    txHash: depositTxHash,
    error: depositError,
    reset: resetDeposit,
  } = useYellowPortfolioDeposit();
  const {
    withdraw,
    isWithdrawing,
    txHash: withdrawTxHash,
    error: withdrawError,
    reset: resetWithdraw,
  } = useYellowPortfolioWithdraw();

  const handleDeposit = async (amount: bigint) => {
    await deposit(amount);
    refresh();
  };

  const handleWithdraw = async (amount: bigint) => {
    await withdraw(amount);
    refresh();
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      <NoiseEffect />
      <Header />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Title */}
          <motion.h2
            variants={itemVariants}
            className="text-3xl font-venite font-bold text-[#00E5FF] mb-8 uppercase tracking-wider"
          >
            Portfolio
          </motion.h2>

          {/* Not authenticated */}
          {!isAuthed && (
            <motion.div
              variants={itemVariants}
              className="flex flex-col items-center justify-center gap-6 py-20"
            >
              <WalletIcon className="w-16 h-16 text-[#00E5FF]/40" />
              <p className="text-white/60 text-lg">
                Connect your wallet to manage your portfolio
              </p>
              <ConnectWalletButton />
            </motion.div>
          )}

          {/* Authenticated but connecting */}
          {isAuthed && isConnecting && (
            <motion.div
              variants={itemVariants}
              className="flex flex-col items-center justify-center gap-4 py-20"
            >
              <motion.div
                className="w-12 h-12 border-4 border-[#00E5FF]/30 border-t-[#00E5FF] rounded-full"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              />
              <p className="text-white/60">Connecting to ClearNode...</p>
            </motion.div>
          )}

          {/* Connection error */}
          {isAuthed && !isConnecting && connectionError && (
            <motion.div
              variants={itemVariants}
              className="flex flex-col items-center justify-center gap-4 py-20"
            >
              <ExclamationCircleIcon className="w-16 h-16 text-red-400/60" />
              <p className="text-red-400">{connectionError}</p>
            </motion.div>
          )}

          {/* Connected — show portfolio */}
          {isAuthed && isConnected && (
            <>
              {/* Balance cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                <BalanceCard
                  label="Wallet USDC"
                  amount={walletBalance}
                  icon={WalletIcon}
                />
                <BalanceCard
                  label="Off-chain Balance"
                  amount={offchainBalance}
                  icon={SignalIcon}
                />
              </div>

              {/* Deposit / Withdraw */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                <ActionCard
                  title="Deposit"
                  icon={ArrowDownTrayIcon}
                  maxAmount={walletBalance}
                  onSubmit={handleDeposit}
                  isSubmitting={isDepositing}
                  txHash={depositTxHash}
                  error={depositError}
                  onReset={resetDeposit}
                  buttonLabel="Deposit USDC"
                />
                <ActionCard
                  title="Withdraw"
                  icon={ArrowUpTrayIcon}
                  maxAmount={offchainBalance}
                  onSubmit={handleWithdraw}
                  isSubmitting={isWithdrawing}
                  txHash={withdrawTxHash}
                  error={withdrawError}
                  onReset={resetWithdraw}
                  buttonLabel="Withdraw USDC"
                />
              </div>

              {/* Connection status */}
              <motion.div
                variants={itemVariants}
                className="flex items-center gap-2 text-xs text-white/40"
              >
                <motion.div
                  className="w-2 h-2 rounded-full bg-green-400"
                  animate={{ opacity: [1, 0.5, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                />
                <span>Connected to ClearNode</span>
              </motion.div>
            </>
          )}
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 3: Run dev server and verify**

```bash
cd frontend && pnpm dev
```

Open `http://localhost:3000/portfolio` in browser. Verify:
- Page loads with Draw-Fi styling (black bg, cyan accents)
- Without auth: shows "Connect your wallet" prompt
- Header shows "Portfolio" link in navigation
- After connecting wallet: shows "Connecting to ClearNode..." spinner (may error if no ClearNode is available — that's expected for now)

- [ ] **Step 4: Commit**

```bash
cd frontend && git add app/portfolio/page.tsx && git commit -m "feat: add portfolio page with deposit/withdraw UI"
```

---

### Task 8: Integration verification and cleanup

**Files:**
- No new files — verification only

- [ ] **Step 1: Full build check**

```bash
cd frontend && pnpm build
```

Expected: Build succeeds with zero errors.

- [ ] **Step 2: Lint check**

```bash
cd frontend && pnpm lint
```

Fix any lint errors that come up.

- [ ] **Step 3: Manual smoke test**

Run `pnpm dev` and verify:
1. `/` — landing page works
2. `/predict` — predict page works (existing Yellow hooks still function)
3. `/history` — history page works
4. `/leaderboard` — leaderboard works
5. `/portfolio` — new page loads, shows connect wallet state
6. Header nav shows all 5 links (Play, Leaderboard, History, Pitch, Portfolio)

- [ ] **Step 4: Verify existing Yellow hooks are untouched**

Confirm these files still exist and are not modified:
- `frontend/hooks/useYellow.ts`
- `frontend/lib/api/yellow.ts`
- `frontend/lib/yellow/relayer.ts`
- `frontend/lib/yellow/usdcConversion.ts`

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
cd frontend && git add -A && git commit -m "fix: resolve lint/build issues from portfolio page integration"
```

Only run this if Step 2 or 3 required fixes.
