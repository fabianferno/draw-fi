/**
 * Polls Yellow ledger for incoming transfers to our deposit address.
 * Credits user balances when we detect transfers from users.
 */
import { getDepositAddress, getLedgerTransactions } from './yellowAuth.js';
import { YellowBalanceDatabase } from './yellowBalanceDatabase.js';
import logger from '../utils/logger.js';
import config from '../config/config.js';

const POLL_INTERVAL_MS = 15_000; // 15 seconds

let pollerInterval: ReturnType<typeof setInterval> | null = null;

export function startYellowDepositPoller(yellowBalanceDb: YellowBalanceDatabase): void {
  if (pollerInterval) return;
  const run = async () => {
    try {
      const ourAddress = getDepositAddress();
      const txs = await getLedgerTransactions(ourAddress, {
        tx_type: 'transfer',
        asset: config.yellowAsset,
        limit: 50,
        sort: 'desc',
      });
      for (const tx of txs) {
        if (tx.to_account.toLowerCase() !== ourAddress.toLowerCase()) continue;
        if (yellowBalanceDb.hasProcessedTx(tx.id)) continue;
        const credited = yellowBalanceDb.credit(
          tx.from_account,
          tx.amount,
          tx.asset,
          tx.id
        );
        if (credited) {
          logger.info('Yellow deposit credited', {
            from: tx.from_account,
            amount: tx.amount,
            asset: tx.asset,
            txId: tx.id,
          });
        }
      }
    } catch (e) {
      logger.warn('Yellow deposit poller error', { error: e });
    }
  };
  run();
  pollerInterval = setInterval(run, POLL_INTERVAL_MS);
  logger.info('Yellow deposit poller started');
}

export function stopYellowDepositPoller(): void {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
    logger.info('Yellow deposit poller stopped');
  }
}
