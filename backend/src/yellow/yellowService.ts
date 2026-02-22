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

const USDC_DECIMALS = 6;
const ETH_DECIMALS = 18;

/** Convert ETH wei to USDC units (6 decimals). Rate: 1 ETH = config.ethUsdRate USDC */
function ethWeiToUsdc(wei: bigint): string {
  const rate = BigInt(Math.floor(config.ethUsdRate));
  const usdcUnits = (wei * rate * BigInt(10 ** USDC_DECIMALS)) / BigInt(10 ** ETH_DECIMALS);
  return usdcUnits.toString();
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

  /** Get user's Draw-Fi Yellow balance (from deposits, in USDC units) */
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
    const amountUsdc = ethWeiToUsdc(params.amountWei);
    const db = this.yellowBalanceDb!;
    const relayer = this.relayerService!;
    const balance = db.getBalance(params.userAddress);
    if (BigInt(balance) < BigInt(amountUsdc)) {
      throw new Error('Insufficient balance');
    }
    const result = await relayer.fundPosition(params);
    const debited = db.debit(params.userAddress, amountUsdc);
    if (!debited) {
      logger.error('Balance debit failed after position opened - potential double-spend', {
        positionId: result.positionId,
        user: params.userAddress,
      });
    }
    db.recordYellowFundedPosition(
      result.positionId,
      params.userAddress,
      amountUsdc
    );
    return result;
  }

  /**
   * Process Yellow payout when a position closes.
   * Transfer (amount + pnl - fee) in USDC to the user.
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
    const amountUsdc = ethWeiToUsdc(finalAmountWei);
    const ok = await transferToUser(record.userAddress as Address, [
      { asset: config.yellowAsset, amount: amountUsdc },
    ]);
    if (ok) {
      this.yellowBalanceDb?.clearYellowFundedPosition(positionId);
      logger.info('Yellow payout sent', { positionId, user: record.userAddress, amountUsdc });
    }
    return ok;
  }

}
