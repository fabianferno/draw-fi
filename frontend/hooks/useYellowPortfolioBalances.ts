'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { erc20Abi } from 'viem';
import { useYellowClient } from './useYellowClient';
import { usePrivyWallet } from './usePrivyWallet';
import { createYellowPublicClient } from '@/lib/yellow/signers';
import { getUsdcAddress } from '@/lib/yellow/constants';

const POLL_INTERVAL_MS = 10_000;

export function useYellowPortfolioBalances() {
  const { client, isConnected } = useYellowClient();
  const { address } = usePrivyWallet();
  const [walletBalance, setWalletBalance] = useState<bigint>(0n);
  const [offchainBalance, setOffchainBalance] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchBalances = useCallback(async () => {
    if (!address) return;

    setLoading(true);
    try {
      // Fetch on-chain wallet USDC balance via viem readContract directly
      // This doesn't require ClearNode connection
      try {
        const publicClient = createYellowPublicClient();
        const usdcAddress = getUsdcAddress();
        const bal = await publicClient.readContract({
          address: usdcAddress,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [address as `0x${string}`],
        });
        setWalletBalance(bal);
      } catch (err) {
        console.warn('Failed to fetch wallet balance:', err);
      }

      // Fetch off-chain balance from ClearNode (requires connection)
      if (client && isConnected) {
        try {
          const info = await client.getAccountInfo();
          const infoRecord = info as Record<string, unknown>;
          const available = typeof info === 'object' && info !== null
            ? (infoRecord.available as bigint) ?? (infoRecord.balance as bigint) ?? 0n
            : 0n;
          setOffchainBalance(BigInt(available));
        } catch {
          setOffchainBalance(0n);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [client, isConnected, address]);

  // Start polling as soon as we have a wallet address (not gated on ClearNode)
  useEffect(() => {
    if (address) {
      fetchBalances();
      intervalRef.current = setInterval(fetchBalances, POLL_INTERVAL_MS);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [address, fetchBalances]);

  return {
    walletBalance,
    offchainBalance,
    loading,
    refresh: fetchBalances,
  };
}
