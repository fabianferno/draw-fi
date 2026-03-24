'use client';

import { useState, useCallback, useRef } from 'react';
import { getBackendUrl } from '@/lib/yellow/constants';

export interface DepositStep {
  id: 'deposit' | 'channel' | 'resize' | 'close';
  label: string;
  status: 'pending' | 'active' | 'complete' | 'error';
  txHash?: string;
}

const INITIAL_STEPS: DepositStep[] = [
  { id: 'deposit', label: 'Depositing to custody', status: 'pending' },
  { id: 'channel', label: 'Creating channel', status: 'pending' },
  { id: 'resize', label: 'Moving to Yellow balance', status: 'pending' },
  { id: 'close', label: 'Releasing channel lock', status: 'pending' },
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function useDepositToYellow() {
  const [steps, setSteps] = useState<DepositStep[]>(INITIAL_STEPS);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const updateStep = (id: string, update: Partial<DepositStep>) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...update } : s)),
    );
  };

  const backendFetch = async (path: string, body?: object) => {
    const url = `${getBackendUrl()}${path}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...(body && { body: JSON.stringify(body) }),
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || `Failed: ${path}`);
    }
    return data;
  };

  const execute = useCallback(async (amount: string) => {
    if (isRunning) return;
    setIsRunning(true);
    setError(null);
    setSteps(INITIAL_STEPS);
    abortRef.current = false;

    try {
      // Step 1: Deposit
      updateStep('deposit', { status: 'active' });
      const depositResult = await backendFetch('/deposit', { amount });
      updateStep('deposit', { status: 'complete', txHash: depositResult.txHash });

      if (abortRef.current) return;

      // Step 2: Create channel
      updateStep('channel', { status: 'active' });
      const channelResult = await backendFetch('/channels/onchain');
      updateStep('channel', { status: 'complete', txHash: channelResult.txHash });

      if (abortRef.current) return;

      // Wait for clearnode to index channel
      await sleep(5000);

      // Step 3: Resize
      updateStep('resize', { status: 'active' });
      const resizeResult = await backendFetch('/channels/resize', {
        channelId: channelResult.channelId,
        resizeAmount: amount,
      });
      updateStep('resize', { status: 'complete', txHash: resizeResult.txHash });

      if (abortRef.current) return;

      // Wait for resize to settle
      await sleep(3000);

      // Step 4: Close channel
      updateStep('close', { status: 'active' });
      const closeResult = await backendFetch('/channels/close', {
        channelId: channelResult.channelId,
      });
      updateStep('close', { status: 'complete', txHash: closeResult.txHash });

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Deposit flow failed';
      setError(message);
      // Mark current active step as error
      setSteps((prev) =>
        prev.map((s) => (s.status === 'active' ? { ...s, status: 'error' } : s)),
      );
    } finally {
      setIsRunning(false);
    }
  }, [isRunning]);

  const reset = useCallback(() => {
    abortRef.current = true;
    setSteps(INITIAL_STEPS);
    setError(null);
    setIsRunning(false);
  }, []);

  return { execute, steps, isRunning, error, reset };
}
