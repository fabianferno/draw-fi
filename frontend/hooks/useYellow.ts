'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getYellowBalance,
  requestYellowFaucet,
  getDemoBalance,
  addDemoBalance,
  getDepositAddress,
  getYellowDepositBalance,
  type YellowBalance,
  type DemoPosition,
} from '@/lib/api/yellow';

export function useYellowBalance(address: string | null) {
  const [balances, setBalances] = useState<YellowBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const b = await getYellowBalance(address);
      setBalances(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { balances, loading, error, refresh };
}

export function useYellowFaucet(address: string | null) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message?: string } | null>(null);

  const request = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setResult(null);
    try {
      const r = await requestYellowFaucet(address);
      setResult(r);
    } catch (e) {
      setResult({ success: false, message: e instanceof Error ? e.message : 'Request failed' });
    } finally {
      setLoading(false);
    }
  }, [address]);

  return { request, loading, result };
}

export function useDemoBalance(address: string | null, isDemoMode: boolean) {
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!address || !isDemoMode) return;
    setLoading(true);
    try {
      const b = await getDemoBalance(address);
      setBalance(b);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [address, isDemoMode]);

  const addFunds = useCallback(async (amount = 1000) => {
    if (!address) return;
    setLoading(true);
    try {
      const b = await addDemoBalance(address, amount);
      setBalance(b);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { balance, loading, refresh, addFunds };
}

export function useYellowDeposit(address: string | null) {
  const [depositAddress, setDepositAddress] = useState<string>('');
  const [depositBalance, setDepositBalance] = useState<string>('0');
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const addr = await getDepositAddress();
      setDepositAddress(addr);
      if (address) {
        const bal = await getYellowDepositBalance(address);
        setDepositBalance(bal);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { depositAddress, depositBalance, loading, refresh };
}

export function useDemoPositions(address: string | null, isDemoMode: boolean) {
  const [positions, setPositions] = useState<DemoPosition[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!address || !isDemoMode) return;
    setLoading(true);
    try {
      const p = await getDemoPositions(address);
      setPositions(p);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [address, isDemoMode]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { positions, loading, refresh };
}
