// backend-reference/src/perps/positionScheduler.ts

import { calculatePNL, validatePredictions, type PNLResult } from './pnlCalculator';
import { PriceSessionManager, getSessionName, parseSessionName } from '../price/priceSessionManager';
import { RPCAppStateIntent } from '@erc7824/nitrolite';

const DEFAULT_FEE_BPS = 100; // 1%
const DEFAULT_MIN_DURATION = 60;
const DEFAULT_MAX_DURATION = 86400;
const DEFAULT_MAX_LEVERAGE = 2500;
const CLOSE_RETRY_DELAY = 5000; // 5s
const CLOSE_MAX_RETRIES = 15; // Up to 75s total — covers worst case where position ends at :59 and next window stored at +60s
const RECOVERY_DELAY = 2000; // 2s between sequential closes

export interface PositionConfig {
  feeBps: number;
  minDuration: number;
  maxDuration: number;
  maxLeverage: number;
}

export interface ActivePosition {
  appSessionId: string;
  ticker: string;
  predictions: number[];
  leverage: number;
  amount: number;
  startTime: number;
  endTime: number;
  userWallet: string;
  timer: NodeJS.Timeout | null;
}

/**
 * Interface for the WebSocket operations this scheduler needs.
 */
export interface SchedulerWSOperations {
  submitAppState(
    appSessionId: string,
    allocations: { participant: string; asset: string; amount: string }[],
    intent: any,
    sessionData?: Record<string, unknown>
  ): Promise<{ success: boolean }>;
  getAppSessions(participant?: string, status?: any): Promise<any[]>;
  transfer(
    destination: string,
    allocations: { asset: string; amount: string }[]
  ): Promise<{ success: boolean }>;
}

export class PositionScheduler {
  private positions: Map<string, ActivePosition> = new Map();
  private ws: SchedulerWSOperations;
  private priceManager: PriceSessionManager;
  private backendWallet: string;
  private config: PositionConfig;
  private isProcessing = false;
  private activeTickers: Set<string>;

  constructor(
    ws: SchedulerWSOperations,
    priceManager: PriceSessionManager,
    backendWallet: string,
    activeTickers: Set<string>,
    config?: Partial<PositionConfig>
  ) {
    this.ws = ws;
    this.priceManager = priceManager;
    this.backendWallet = backendWallet;
    this.activeTickers = activeTickers;
    this.config = {
      feeBps: config?.feeBps ?? DEFAULT_FEE_BPS,
      minDuration: config?.minDuration ?? DEFAULT_MIN_DURATION,
      maxDuration: config?.maxDuration ?? DEFAULT_MAX_DURATION,
      maxLeverage: config?.maxLeverage ?? DEFAULT_MAX_LEVERAGE,
    };
  }

  /**
   * Validate a position's session data before activation.
   * Returns null if valid, error string otherwise.
   */
  public validatePosition(sessionData: any): string | null {
    if (sessionData.positionType !== 'directional-60') {
      return 'positionType must be "directional-60"';
    }
    const predErr = validatePredictions(sessionData.predictions);
    if (predErr) return predErr;

    const duration = sessionData.endTime - sessionData.startTime;
    if (duration < this.config.minDuration || duration > this.config.maxDuration) {
      return `Duration ${duration}s outside range [${this.config.minDuration}, ${this.config.maxDuration}]`;
    }
    if (sessionData.leverage < 1 || sessionData.leverage > this.config.maxLeverage) {
      return `Leverage ${sessionData.leverage} outside range [1, ${this.config.maxLeverage}]`;
    }
    const amount = parseInt(sessionData.amount);
    if (!amount || amount <= 0) return 'Amount must be positive';
    if (!sessionData.ticker || !this.activeTickers.has(sessionData.ticker)) {
      return `Ticker "${sessionData.ticker}" not tracked`;
    }
    if (!sessionData.userWallet) return 'userWallet required';
    return null;
  }

  /**
   * Activate a position after transfer is received.
   * Submits "filled" state and schedules close job.
   */
  public async activatePosition(
    appSessionId: string,
    sessionData: any,
    allocations: { participant: string; asset: string; amount: string }[]
  ): Promise<void> {
    const error = this.validatePosition(sessionData);
    if (error) throw new Error(`Invalid position: ${error}`);

    // Submit filled state
    await this.ws.submitAppState(appSessionId, allocations, RPCAppStateIntent.Operate, {
      ...sessionData,
      status: 'filled',
      filledAt: Math.floor(Date.now() / 1000),
    });

    // Schedule close
    this.scheduleClose(appSessionId, sessionData, allocations);

    console.log(`[PositionScheduler] Position ${appSessionId} activated, closes at ${sessionData.endTime}`);
  }

  /**
   * Schedule a close job at the position's endTime.
   */
  private scheduleClose(
    appSessionId: string,
    sessionData: any,
    allocations: { participant: string; asset: string; amount: string }[]
  ): void {
    const now = Math.floor(Date.now() / 1000);
    const delayMs = Math.max(0, (sessionData.endTime - now) * 1000);

    const timer = setTimeout(async () => {
      await this.closePosition(appSessionId, sessionData, allocations);
    }, delayMs);

    this.positions.set(appSessionId, {
      appSessionId,
      ticker: sessionData.ticker,
      predictions: sessionData.predictions,
      leverage: sessionData.leverage,
      amount: parseInt(sessionData.amount),
      startTime: sessionData.startTime,
      endTime: sessionData.endTime,
      userWallet: sessionData.userWallet,
      timer,
    });
  }

  /**
   * Close a position: stitch prices, sample 60 points, calculate PnL, submit state, transfer payout.
   */
  public async closePosition(
    appSessionId: string,
    sessionData: any,
    allocations: { participant: string; asset: string; amount: string }[]
  ): Promise<PNLResult | null> {
    console.log(`[PositionScheduler] Closing position ${appSessionId}`);

    try {
      // Step 1: Get 60 actual prices
      const actualPrices = await this.getActualPrices(
        sessionData.ticker,
        sessionData.startTime,
        sessionData.endTime
      );

      if (!actualPrices) {
        console.error(`[PositionScheduler] Could not get actual prices for ${appSessionId}`);
        return null;
      }

      // Step 2: Calculate PnL
      const pnlResult = calculatePNL({
        predictions: sessionData.predictions,
        actualPrices,
        amount: parseInt(sessionData.amount),
        leverage: sessionData.leverage,
        feeBps: this.config.feeBps,
      });

      console.log(`[PositionScheduler] PnL for ${appSessionId}: accuracy=${(pnlResult.accuracy * 100).toFixed(1)}%, pnl=${pnlResult.pnl}, final=${pnlResult.finalAmount}`);

      // Step 3: Build closed state data (don't spread original sessionData to avoid action:"open" in closed state)
      const amount = parseInt(sessionData.amount);
      const pnlPercent = amount > 0 ? ((pnlResult.pnl / amount) * 100).toFixed(2) : '0';

      const closedStateData = {
        positionType: sessionData.positionType,
        ticker: sessionData.ticker,
        predictions: sessionData.predictions,
        leverage: sessionData.leverage,
        amount: sessionData.amount,
        startTime: sessionData.startTime,
        endTime: sessionData.endTime,
        userWallet: sessionData.userWallet,
        action: 'close',
        status: 'closed',
        accuracy: pnlResult.accuracy,
        correctDirections: pnlResult.correctDirections,
        totalDirections: pnlResult.totalDirections,
        pnl: pnlResult.pnl.toString(),
        pnlPercent,
        fee: pnlResult.fee.toString(),
        returnAmount: pnlResult.finalAmount.toString(),
        closedAt: Math.floor(Date.now() / 1000),
      };

      await this.ws.submitAppState(appSessionId, allocations, RPCAppStateIntent.Operate, closedStateData);

      // Step 4: Transfer payout
      if (pnlResult.finalAmount > 0) {
        const returnAmountHuman = (pnlResult.finalAmount / 1_000_000).toString();
        try {
          await this.ws.transfer(sessionData.userWallet, [
            { asset: 'usdc', amount: returnAmountHuman },
          ]);
          console.log(`[PositionScheduler] Payout sent: ${returnAmountHuman} USDC to ${sessionData.userWallet}`);
        } catch (transferError) {
          console.error(`[PositionScheduler] Transfer failed for ${appSessionId}:`, transferError);
          // Mark transfer as failed — keep all PnL fields intact
          await this.ws.submitAppState(appSessionId, allocations, RPCAppStateIntent.Operate, {
            ...closedStateData,
            transferFailed: true,
          });
        }
      }

      // Clean up
      this.positions.delete(appSessionId);
      return pnlResult;

    } catch (error) {
      console.error(`[PositionScheduler] Error closing position ${appSessionId}:`, error);
      return null;
    }
  }

  /**
   * Stitch price sessions and sample 60 evenly-spaced points.
   * Retries up to CLOSE_MAX_RETRIES if price sessions are not yet available.
   */
  private async getActualPrices(
    ticker: string,
    startTime: number,
    endTime: number
  ): Promise<number[] | null> {
    for (let attempt = 0; attempt < CLOSE_MAX_RETRIES; attempt++) {
      const prices = this.samplePrices(ticker, startTime, endTime);
      if (prices) return prices;
      console.log(`[PositionScheduler] Price data not ready, retry ${attempt + 1}/${CLOSE_MAX_RETRIES}`);
      await new Promise(r => setTimeout(r, CLOSE_RETRY_DELAY));
    }
    return null;
  }

  /**
   * Sample 60 evenly-spaced prices from stitched minute sessions.
   */
  private samplePrices(
    ticker: string,
    startTime: number,
    endTime: number
  ): number[] | null {
    const duration = endTime - startTime;

    // Determine which minute sessions we need
    const firstMinute = Math.floor(startTime / 60) * 60;
    const lastMinute = Math.floor(endTime / 60) * 60;

    // Build second-by-second price map from all relevant sessions
    const priceMap: Map<number, number> = new Map();

    for (let minute = firstMinute; minute <= lastMinute; minute += 60) {
      const sessionName = getSessionName(ticker, minute);
      const session = this.priceManager.getSession(sessionName);
      if (!session) return null; // Missing session, caller should retry

      for (let i = 0; i < session.prices.length; i++) {
        priceMap.set(minute + i, session.prices[i]);
      }
    }

    // Sample 60 evenly-spaced points
    const interval = duration / 59;
    const sampled: number[] = [];

    for (let i = 0; i < 60; i++) {
      const sampleTime = startTime + i * interval;
      const nearestSecond = Math.round(sampleTime);
      const price = priceMap.get(nearestSecond);
      if (price === undefined) return null; // Gap in data
      sampled.push(price);
    }

    return sampled;
  }

  /**
   * Run recovery on startup: re-schedule open positions, retry failed payouts.
   */
  public async recover(): Promise<void> {
    console.log('[PositionScheduler] Starting recovery...');

    try {
      const sessions = await this.ws.getAppSessions();
      const now = Math.floor(Date.now() / 1000);
      let recoveredPositions = 0;
      let retriedPayouts = 0;
      const expiredQueue: Array<{ session: any; data: any }> = [];

      for (const session of sessions) {
        const sessionObj = session as any;
        const rawData = sessionObj.session_data || sessionObj.sessionData;
        if (!rawData) continue;

        let data: any;
        try {
          data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
        } catch { continue; }

        if (data.positionType !== 'directional-60') continue;

        // Re-schedule open positions
        if (data.status === 'filled') {
          // Reconstruct allocations from participants (participantAllocations not available on getAppSessions responses)
          const participants = sessionObj.participants || [];
          const allocations = participants.map((p: string) => ({
            participant: p, asset: 'usdc', amount: data.amount || '0',
          }));

          if (data.endTime > now) {
            this.scheduleClose(sessionObj.appSessionId, data, allocations);
            recoveredPositions++;
          } else {
            expiredQueue.push({ session: sessionObj, data });
          }
        }

        // Retry failed payouts
        if (data.status === 'closed' && data.transferFailed && data.returnAmount) {
          const returnAmountHuman = (parseInt(data.returnAmount) / 1_000_000).toString();
          try {
            await this.ws.transfer(data.userWallet, [
              { asset: 'usdc', amount: returnAmountHuman },
            ]);
            // Clear transferFailed flag to prevent double payment on next restart
            const retryParticipants = sessionObj.participants || [];
            const retryAllocations = retryParticipants.map((p: string) => ({
              participant: p, asset: 'usdc', amount: data.amount || '0',
            }));
            await this.ws.submitAppState(sessionObj.appSessionId, retryAllocations, RPCAppStateIntent.Operate, {
              ...data,
              transferFailed: false,
              transferRetriedAt: Math.floor(Date.now() / 1000),
            });
            retriedPayouts++;
            console.log(`[PositionScheduler] Retried payout for ${sessionObj.appSessionId}`);
          } catch (err) {
            console.error(`[PositionScheduler] Payout retry failed for ${sessionObj.appSessionId}:`, err);
          }
        }
      }

      // Process expired positions sequentially
      for (const { session, data } of expiredQueue) {
        if (this.isProcessing) {
          await new Promise(r => setTimeout(r, RECOVERY_DELAY));
        }
        this.isProcessing = true;
        // Reconstruct allocations from participants (participantAllocations not available on getAppSessions responses)
        const participants = session.participants || [];
        const allocations = participants.map((p: string) => ({
          participant: p, asset: 'usdc', amount: data.amount || '0',
        }));

        try {
          await this.closePosition(session.appSessionId, data, allocations);
          recoveredPositions++;
        } catch (err) {
          console.error(`[PositionScheduler] Recovery close failed for ${session.appSessionId}:`, err);
        }
        this.isProcessing = false;
        await new Promise(r => setTimeout(r, RECOVERY_DELAY));
      }

      console.log(`[PositionScheduler] Recovery complete: ${recoveredPositions} positions, ${retriedPayouts} payout retries`);
    } catch (error) {
      console.error('[PositionScheduler] Recovery failed:', error);
    }
  }

  /**
   * Get status of all active positions.
   */
  public getActivePositions(): Array<{
    appSessionId: string;
    ticker: string;
    endTime: number;
    amount: number;
    leverage: number;
  }> {
    return [...this.positions.values()].map(p => ({
      appSessionId: p.appSessionId,
      ticker: p.ticker,
      endTime: p.endTime,
      amount: p.amount,
      leverage: p.leverage,
    }));
  }
}
