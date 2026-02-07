'use client';

import { useEffect, useMemo, useState } from 'react';
import { BrowserProvider, JsonRpcSigner } from 'ethers';
import { usePrivy, useWallets } from '@privy-io/react-auth';

interface UsePrivyWalletResult {
  ready: boolean;
  authenticated: boolean;
  address: string | null;
  isWalletLoading: boolean;
  login: () => void;
  logout: () => void;
  getSigner: () => Promise<JsonRpcSigner | null>;
  getProvider: () => Promise<BrowserProvider | null>;
}

export function usePrivyWallet(): UsePrivyWalletResult {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const [provider, setProvider] = useState<BrowserProvider | null>(null);

  const embeddedWallet = useMemo(
    () =>
      // Use the Privy embedded wallet (not external extensions like MetaMask/Brave)
      wallets.find((w) => w.walletClientType === 'privy') ?? null,
    [wallets],
  );

  const address = embeddedWallet?.address ?? null;
  
  // Wallet is loading if authenticated but wallets aren't ready yet or wallet hasn't appeared
  const isWalletLoading = ready && authenticated && (!walletsReady || !embeddedWallet);
  
  // Debug logging
  useEffect(() => {
    if (ready && authenticated) {
      console.log('[usePrivyWallet] Authenticated, wallets:', wallets.length, 'embedded:', embeddedWallet ? 'found' : 'not found');
      if (embeddedWallet) {
        console.log('[usePrivyWallet] Embedded wallet address:', embeddedWallet.address);
      }
    }
  }, [ready, authenticated, wallets.length, embeddedWallet]);

  useEffect(() => {
    let cancelled = false;

    const setupProvider = async () => {
      if (!embeddedWallet) {
        setProvider(null);
        return;
      }

      try {
        // Privy wallets expose an EIP-1193 provider
        const ethProvider = await embeddedWallet.getEthereumProvider?.();
        if (!ethProvider || cancelled) return;
        const browserProvider = new BrowserProvider(ethProvider as any);
        setProvider(browserProvider);
      } catch (err) {
        console.error('Failed to create ethers provider from Privy wallet', err);
        if (!cancelled) {
          setProvider(null);
        }
      }
    };

    setupProvider();

    return () => {
      cancelled = true;
    };
  }, [embeddedWallet]);

  const getProvider = async () => {
    return provider;
  };

  const getSigner = async () => {
    if (!provider) return null;
    try {
      const signer = await provider.getSigner();
      return signer;
    } catch (err) {
      console.error('Failed to get signer from Privy provider', err);
      return null;
    }
  };

  return {
    ready: ready && walletsReady,
    authenticated,
    address,
    isWalletLoading,
    login,
    logout,
    getSigner,
    getProvider,
  };
}

