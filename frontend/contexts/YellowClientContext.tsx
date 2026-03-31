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
} from '@/lib/yellow/signers';
import { getYellowWsUrl, getYellowChainId, getCustodyAddress, getAdjudicatorAddress } from '@/lib/yellow/constants';

interface YellowClientState {
  client: Client | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
}

const YellowClientContext = createContext<YellowClientState | undefined>(
  undefined,
);

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
  const clientRef = useRef<Client | null>(null);

  const initClient = useCallback(async () => {
    if (!ready || !walletsReady || !authenticated || !embeddedWallet || !address)
      return;
    if (clientRef.current) return;

    setIsConnecting(true);
    setError(null);

    try {
      // Get Privy's raw EIP-1193 provider
      const eip1193 = await embeddedWallet.getEthereumProvider();
      if (!eip1193) throw new Error('No wallet provider available');

      // Create viem clients
      const addr = address as `0x${string}`;
      const publicClient = createYellowPublicClient();
      const walletClient = createYellowWalletClient(eip1193, addr);

      // WalletStateSigner requires walletClient.account to be set.
      // createWalletClient with a custom transport doesn't auto-populate account,
      // so we request accounts from the provider and create a custom StateSigner
      // adapter that uses the wallet client for signing but tracks the address
      // separately.
      const { WalletStateSigner } = await import('@erc7824/nitrolite');

      // Attempt to use WalletStateSigner directly. If walletClient.account is
      // not populated (common with EIP-1193 custom transports), fall back to a
      // manual StateSigner implementation.
      let stateSigner;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        stateSigner = new WalletStateSigner(walletClient as any);
        // Verify it can return the address — this throws if account is undefined
        stateSigner.getAddress();
      } catch {
        // Build a minimal StateSigner that works without walletClient.account
        const walletAddress = address as `0x${string}`;
        stateSigner = {
          getAddress: () => walletAddress,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          signState: async (channelId: `0x${string}`, state: any) => {
            // Import getPackedState to replicate WalletStateSigner's behaviour
            const { getPackedState } = await import('@erc7824/nitrolite');
            const packedState = getPackedState(channelId, state);
            return walletClient.signMessage({
              account: walletAddress,
              message: { raw: packedState },
            });
          },
          signRawMessage: async (message: `0x${string}`) => {
            return walletClient.signMessage({
              account: walletAddress,
              message: { raw: message },
            });
          },
        };
      }

      // Build yellow-ts client options.
      // Custody/adjudicator addresses are placeholders — they are only required
      // for on-chain operations (deposit, withdraw, createChannel). The ClearNode
      // WebSocket connection works without them.
      const opts: ClientOptions = {
        url: getYellowWsUrl(),
        nitrolite: {
          publicClient,
          walletClient,
          stateSigner,
          addresses: {
            custody: getCustodyAddress(),
            adjudicator: getAdjudicatorAddress(),
          },
          chainId: getYellowChainId(),
          challengeDuration: 86400n, // 1 day default
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      };

      const yellowClient = new Client(opts);
      await yellowClient.connect();

      clientRef.current = yellowClient;
      setClient(yellowClient);
      setIsConnected(true);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to connect to Yellow ClearNode';
      console.error('Yellow client init error:', err);
      setError(message);
    } finally {
      setIsConnecting(false);
    }
  }, [ready, walletsReady, authenticated, embeddedWallet, address]);

  // Initialize when auth and wallet are ready
  useEffect(() => {
    if (
      ready &&
      walletsReady &&
      authenticated &&
      embeddedWallet &&
      address &&
      !clientRef.current
    ) {
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
      value={{ client, isConnected, isConnecting, error }}
    >
      {children}
    </YellowClientContext.Provider>
  );
}

export function useYellowClientContext(): YellowClientState {
  const ctx = useContext(YellowClientContext);
  if (!ctx) {
    throw new Error(
      'useYellowClientContext must be used within YellowClientProvider',
    );
  }
  return ctx;
}
