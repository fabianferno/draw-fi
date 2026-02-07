/**
 * Yellow integration service - deposit -> off-chain balance -> position -> settle on-chain -> payout via Yellow
 */
import type { Address } from 'viem';
import {
  getLedgerBalances,
  getYellowConfig,
  getDepositAddress,
  transferToUser,
} from './yellowAuth.js';
import { RelayerService, type FundPositionParams } from './relayerService.js';
import type { YellowBalanceDatabase } from './yellowBalanceDatabase.js';
import config from '../config/config.js';
import logger from '../utils/logger.js';

const YELLOW_FAUCET_URL = 'https://clearnet-sandbox.yellow.com/faucet/requestTokens';

const YTEST_USD = 'ytest.usd';
const ETH_DECIMALS = 18;
const YTEST_DECIMALS = 6;

/** Convert ETH wei to ytest.usd units (6 decimals). Rate: 1 ETH = config.yellowEthToYtestRate ytest.usd */
function ethWeiToYtest(wei: bigint): string {
  const rate = BigInt(Math.floor(config.yellowEthToYtestRate));
  const ytestUnits = (wei * rate * BigInt(10 ** YTEST_DECIMALS)) / BigInt(10 ** ETH_DECIMALS);
  return ytestUnits.toString();
}

/** Convert ytest.usd units to ETH wei */
function ytestToEthWei(ytestUnits: string): bigint {
  const rate = BigInt(Math.floor(config.yellowEthToYtestRate));
  const units = BigInt(ytestUnits);
  return (units * BigInt(10 ** ETH_DECIMALS)) / (rate * BigInt(10 ** YTEST_DECIMALS));
}

export class YellowService {
  private relayerService?: RelayerService;
  private yellowBalanceDb?: YellowBalanceDatabase;

  constructor(yellowBalanceDb?: YellowBalanceDatabase) {
    this.yellowBalanceDb = yellowBalanceDb;
    if (config.yellowRelayerEnabled) {
      try {
        this.relayerService = new RelayerService();
      } catch (e) {
        logger.warn('RelayerService init failed', e);
      }
    }
  }

  /** Request test tokens from Yellow Sandbox faucet. When yellowFaucetAlsoCredit is true, also credits Draw-Fi balance (sandbox convenience). */
  async requestFaucetTokens(userAddress: string): Promise<{ success: boolean; message?: string }> {
    try {
      const res = await fetch(YELLOW_FAUCET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAddress }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok) {
        return { success: false, message: data.error || `Faucet returned ${res.status}` };
      }
      if (config.yellowFaucetAlsoCredit && this.yellowBalanceDb) {
        const FAUCET_CREDIT_AMOUNT = '1000000000'; // 1000 ytest.usd (6 decimals)
        const credited = this.yellowBalanceDb.credit(
          userAddress,
          FAUCET_CREDIT_AMOUNT,
          YTEST_USD,
          -Date.now()
        );
        if (credited) {
          logger.info('Faucet also credited Draw-Fi balance', { userAddress, amount: FAUCET_CREDIT_AMOUNT });
        }
      }
      return { success: data.success !== false, message: data.error };
    } catch (e) {
      logger.error('Yellow faucet request failed', { userAddress, error: e });
      return { success: false, message: e instanceof Error ? e.message : 'Faucet request failed' };
    }
  }

  /** Get Yellow Unified Balance for address */
  async getBalance(address: Address): Promise<{ asset: string; amount: string }[]> {
    return getLedgerBalances(address);
  }

  /** Get Yellow network config */
  async getConfig(): Promise<Record<string, unknown>> {
    return getYellowConfig();
  }

  /** Get our deposit address (users transfer here to fund positions) */
  getDepositAddress(): string {
    return getDepositAddress();
  }

  /** Get user's Draw-Fi Yellow balance (from deposits, in ytest.usd units) */
  getYellowDepositBalance(address: string): string {
    return this.yellowBalanceDb?.getBalance(address) ?? '0';
  }

  /**
   * Check if opening positions with Yellow balance is available.
   * Use this to return a clear 503 reason to the client.
   */
  getFundingAvailability(): { available: boolean; reason?: string } {
    if (!this.yellowBalanceDb) {
      return { available: false, reason: 'Yellow balance database not initialized' };
    }
    if (!config.yellowRelayerEnabled) {
      return { available: false, reason: 'Pay with Yellow balance is disabled on this server (relayer not enabled)' };
    }
    if (!this.relayerService) {
      return { available: false, reason: 'Yellow relayer failed to start (check YELLOW_RELAYER_PRIVATE_KEY)' };
    }
    return { available: true };
  }

  /**
   * Open position using Yellow balance (off-chain fund -> on-chain settle).
   * User signs EIP-712; we verify Yellow balance, relayer submits to LineFutures, then we deduct.
   */
  async openPositionWithYellow(params: FundPositionParams): Promise<{ positionId: number; txHash: string }> {
    const availability = this.getFundingAvailability();
    if (!availability.available) {
      throw new Error(availability.reason ?? 'Yellow position funding not available');
    }
    const amountYtest = ethWeiToYtest(params.amountWei);
    const db = this.yellowBalanceDb!;
    const relayer = this.relayerService!;
    const balance = db.getBalance(params.userAddress);
    if (BigInt(balance) < BigInt(amountYtest)) {
      throw new Error('Insufficient Yellow balance');
    }
    const result = await relayer.fundPosition(params);
    const debited = db.debit(params.userAddress, amountYtest);
    if (!debited) {
      logger.error('Yellow debit failed after position opened - potential double-spend', {
        positionId: result.positionId,
        user: params.userAddress,
      });
    }
    db.recordYellowFundedPosition(
      result.positionId,
      params.userAddress,
      amountYtest
    );
    return result;
  }

  /**
   * Process Yellow payout when a position closes.
   * Transfer (amount + pnl - fee) in ytest.usd to the user.
   */
  async processYellowPayout(
    positionId: number,
    amountWei: bigint,
    pnlWei: bigint,
    feeWei: bigint
  ): Promise<boolean> {
    const record = this.yellowBalanceDb?.getYellowFundedPosition(positionId);
    if (!record) return false;
    const finalAmountWei = amountWei + pnlWei - feeWei;
    if (finalAmountWei <= 0n) return true; // User lost, nothing to pay
    const amountYtest = ethWeiToYtest(finalAmountWei);
    const ok = await transferToUser(record.userAddress as Address, [
      { asset: YTEST_USD, amount: amountYtest },
    ]);
    if (ok) {
      this.yellowBalanceDb?.clearYellowFundedPosition(positionId);
      logger.info('Yellow payout sent', { positionId, user: record.userAddress, amountYtest });
    }
    return ok;
  }

}
