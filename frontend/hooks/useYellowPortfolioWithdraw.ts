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
