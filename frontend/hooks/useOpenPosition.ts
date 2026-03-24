'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { getBackendUrl } from '@/lib/yellow/constants';
import { useYellowClient } from './useYellowClient';
import { usePrivyWallet } from './usePrivyWallet';

export type PositionStatus = 'idle' | 'creating' | 'transferring' | 'active' | 'closed' | 'error';

export interface PositionResult {
  accuracy: number;
  correctDirections: number;
  totalDirections: number;
  pnl: string;
  pnlPercent: string;
  fee: string;
  returnAmount: string;
}

export interface OpenPositionParams {
  ticker: string;
  predictions: number[];
  leverage: number;
  amount: string;       // human-readable USDC e.g. "0.1"
  startTime: number;
  endTime: number;
}

export function useOpenPosition() {
  const { client, isConnected } = useYellowClient();
  const { address } = usePrivyWallet();
  const [status, setStatus] = useState<PositionStatus>('idle');
  const [appSessionId, setAppSessionId] = useState<string | null>(null);
  const [result, setResult] = useState<PositionResult | null>(null);
  const [endTime, setEndTime] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Countdown timer
  useEffect(() => {
    if (status !== 'active' || !endTime) return;
    const tick = () => {
      const remaining = endTime - Math.floor(Date.now() / 1000);
      setTimeRemaining(remaining > 0 ? remaining : 0);
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status, endTime]);

  // Poll for position result
  const startPolling = useCallback((sessionId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${getBackendUrl()}/positions/${sessionId}`);
        const data = await res.json();
        if (data.success && data.sessionData?.status === 'closed') {
          setResult({
            accuracy: data.sessionData.accuracy,
            correctDirections: data.sessionData.correctDirections,
            totalDirections: data.sessionData.totalDirections,
            pnl: data.sessionData.pnl,
            pnlPercent: data.sessionData.pnlPercent,
            fee: data.sessionData.fee,
            returnAmount: data.sessionData.returnAmount,
          });
          setStatus('closed');
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // Ignore poll errors, keep trying
      }
    }, 5000);
  }, []);

  const openPosition = useCallback(async (params: OpenPositionParams) => {
    if (!client || !isConnected || !address) {
      setError('Not connected to Yellow Network');
      setStatus('error');
      return;
    }

    setStatus('creating');
    setError(null);
    setResult(null);
    setAppSessionId(null);
    setEndTime(params.endTime);

    try {
      // Step 1: Create position on backend
      const amountAtomic = Math.floor(parseFloat(params.amount) * 1e6).toString();
      const backendUrl = getBackendUrl();
      const createRes = await fetch(`${backendUrl}/positions/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: params.ticker,
          predictions: params.predictions,
          leverage: params.leverage,
          amount: amountAtomic,
          startTime: params.startTime,
          endTime: params.endTime,
          userWallet: address,
        }),
      });
      const createData = await createRes.json();
      if (!createData.success) {
        throw new Error(createData.error || 'Failed to create position');
      }
      setAppSessionId(createData.appSessionId);

      // Step 2: Transfer collateral via Yellow
      setStatus('transferring');
      const yellowAsset = process.env.NEXT_PUBLIC_YELLOW_ASSET || 'usdc';
      await client.transfer(createData.backendWallet, [
        { asset: yellowAsset, amount: params.amount },
      ]);

      // Step 3: Position is now active, start polling
      setStatus('active');
      startPolling(createData.appSessionId);

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open position';
      setError(message);
      setStatus('error');
    }
  }, [client, isConnected, address, startPolling]);

  const reset = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    setStatus('idle');
    setAppSessionId(null);
    setResult(null);
    setEndTime(null);
    setTimeRemaining(null);
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return { openPosition, status, appSessionId, result, timeRemaining, error, reset };
}
