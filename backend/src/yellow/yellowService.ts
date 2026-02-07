/**
 * Yellow integration service - coordinates faucet, balance, demo, relayer,
 * and real Yellow flow: deposit -> off-chain balance -> position -> settle on-chain -> payout via Yellow
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
import {
  getDemoBalance,
  addDemoBalance,
  openDemoPosition,
  closeDemoPositionWithData,
  getDemoPositions,
  getOpenDemoPosition,
  type DemoPosition,
} from './demoPositions.js';
import type { PredictionService } from '../futures/predictionService.js';
import type { PNLCalculator } from '../pnl/pnlCalculator.js';
import type { RetrievalService } from '../retrieval/retrievalService.js';
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

  constructor(
    private predictionService?: PredictionService,
    private pnlCalculator?: PNLCalculator,
    private retrievalService?: RetrievalService,
    yellowBalanceDb?: YellowBalanceDatabase
  ) {
    this.yellowBalanceDb = yellowBalanceDb;
    if (config.yellowRelayerEnabled) {
      try {
        this.relayerService = new RelayerService();
      } catch (e) {
        logger.warn('RelayerService init failed', e);
      }
    }
  }

  /** Request test tokens from Yellow Sandbox faucet */
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
   * Open position using Yellow balance (off-chain fund -> on-chain settle).
   * User signs EIP-712; we verify Yellow balance, relayer submits to LineFutures, then we deduct.
   */
  async openPositionWithYellow(params: FundPositionParams): Promise<{ positionId: number; txHash: string }> {
    if (!this.relayerService || !this.yellowBalanceDb) {
      throw new Error('Yellow position funding not available');
    }
    const amountYtest = ethWeiToYtest(params.amountWei);
    const balance = this.yellowBalanceDb.getBalance(params.userAddress);
    if (BigInt(balance) < BigInt(amountYtest)) {
      throw new Error('Insufficient Yellow balance');
    }
    const result = await this.relayerService.fundPosition(params);
    const debited = this.yellowBalanceDb.debit(params.userAddress, amountYtest);
    if (!debited) {
      logger.error('Yellow debit failed after position opened - potential double-spend', {
        positionId: result.positionId,
        user: params.userAddress,
      });
    }
    this.yellowBalanceDb.recordYellowFundedPosition(
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

  // --- Demo mode ---

  getDemoBalance(address: string): number {
    return getDemoBalance(address);
  }

  addDemoBalance(address: string, amount: number): number {
    return addDemoBalance(address, amount);
  }

  openDemoPosition(
    userAddress: string,
    amount: number,
    leverage: number,
    predictionCommitmentId: string,
    openTimestamp: number
  ): DemoPosition | null {
    return openDemoPosition(userAddress, amount, leverage, predictionCommitmentId, openTimestamp);
  }

  async closeDemoPosition(
    positionId: string,
    predictions: number[],
    actualPrices: number[]
  ): Promise<DemoPosition | null> {
    if (!this.pnlCalculator) return null;
    return closeDemoPositionWithData(positionId, predictions, actualPrices, this.pnlCalculator);
  }

  getDemoPositions(userAddress: string): DemoPosition[] {
    return getDemoPositions(userAddress);
  }

  getOpenDemoPosition(positionId: string): DemoPosition | null {
    return getOpenDemoPosition(positionId);
  }

  /** Phase 2: Fund position via relayer (user signs, relayer submits) */
  async fundPosition(params: FundPositionParams): Promise<{ positionId: number; txHash: string }> {
    if (!this.relayerService) throw new Error('Relayer not available');
    return this.relayerService.fundPosition(params);
  }

  async getRelayerBalance(): Promise<bigint> {
    if (!this.relayerService) return 0n;
    return this.relayerService.getRelayerBalance();
  }

  /** Fetch predictions from EigenDA and close demo position */
  async closeDemoPositionByCommitment(positionId: string): Promise<DemoPosition | null> {
    const position = getOpenDemoPosition(positionId);
    if (!position || !this.predictionService || !this.pnlCalculator || !this.retrievalService) {
      return null;
    }
    const elapsed = Math.floor(Date.now() / 1000) - position.openTimestamp;
    if (elapsed < 60) return null;

    const [predictionsBlob, actualWindow] = await Promise.all([
      this.predictionService.retrievePredictions(position.predictionCommitmentId),
      this.retrievalService.getWindowForPosition(position.openTimestamp),
    ]);
    if (!predictionsBlob?.predictions || predictionsBlob.predictions.length !== 60) return null;
    if (!actualWindow?.prices || actualWindow.prices.length !== 60) return null;

    return this.closeDemoPosition(
      positionId,
      predictionsBlob.predictions,
      actualWindow.prices
    );
  }
}
