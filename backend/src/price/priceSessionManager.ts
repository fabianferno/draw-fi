// backend-reference/src/price/priceSessionManager.ts

import { PriceEvent } from './priceIngester';
import { RPCAppStateIntent } from '@erc7824/nitrolite';

/** Stored price session data */
export interface PriceSessionEntry {
  appSessionId: string;
  prices: number[];
  windowStart: number;
}

/**
 * Generate session name from ticker and minute timestamp.
 * Format: {TICKER}-{YYYY-MM-DD}-{HH:mm} (UTC)
 */
export function getSessionName(ticker: string, minuteStart: number): string {
  const d = new Date(minuteStart * 1000);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${ticker}-${yyyy}-${mm}-${dd}-${hh}:${min}`;
}

/**
 * Parse a session name back to ticker and minute start.
 * Returns null if the name doesn't match the expected pattern.
 */
export function parseSessionName(name: string): { ticker: string; minuteStart: number } | null {
  // Pattern: TICKER-YYYY-MM-DD-HH:mm
  const match = name.match(/^(.+)-(\d{4})-(\d{2})-(\d{2})-(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, ticker, yyyy, mm, dd, hh, min] = match;
  const date = new Date(Date.UTC(
    parseInt(yyyy), parseInt(mm) - 1, parseInt(dd),
    parseInt(hh), parseInt(min), 0
  ));
  return { ticker, minuteStart: Math.floor(date.getTime() / 1000) };
}

/** Per-ticker tracking state */
interface TickerState {
  secondTracker: Map<number, number>;
  currentSessionId: string | null;
  currentMinuteStart: number;
}

/**
 * Interface for the WebSocket operations this manager needs.
 * Implemented by WebSocketService.
 */
export interface SessionManagerWSOperations {
  createAppSession(
    participants: string[],
    allocations: { participant: string; asset: string; amount: string }[],
    applicationName: string
  ): Promise<{ appSessionId: string }>;
  submitAppState(
    appSessionId: string,
    allocations: { participant: string; asset: string; amount: string }[],
    intent: any,
    sessionData?: Record<string, unknown>
  ): Promise<{ success: boolean }>;
  closeAppSession(
    appSessionId: string,
    allocations: { participant: string; asset: string; amount: string }[]
  ): Promise<{ success: boolean }>;
}

const RETENTION_HOURS = 24;

export class PriceSessionManager {
  private tickerStates: Map<string, TickerState> = new Map();
  private sessionIndex: Map<string, PriceSessionEntry> = new Map();
  private ws: SessionManagerWSOperations;
  private backendWallet: string;
  private minuteTimers: Map<string, NodeJS.Timeout> = new Map();
  private secondWallet: string;

  constructor(ws: SessionManagerWSOperations, backendWallet: string, secondWallet?: string) {
    this.ws = ws;
    this.backendWallet = backendWallet;
    this.secondWallet = secondWallet || backendWallet;
  }

  /**
   * Start tracking a ticker. Sets up minute-boundary timers.
   */
  public startTicker(ticker: string): void {
    if (this.tickerStates.has(ticker)) return;

    const now = Math.floor(Date.now() / 1000);
    const currentMinuteStart = Math.floor(now / 60) * 60;

    this.tickerStates.set(ticker, {
      secondTracker: new Map(),
      currentSessionId: null,
      currentMinuteStart,
    });

    // Calculate ms until next minute boundary
    const nextMinute = (currentMinuteStart + 60) * 1000;
    const msUntilNextMinute = nextMinute - Date.now();

    console.log(`[PriceSessionManager] Starting ticker ${ticker}, first window in ${msUntilNextMinute}ms`);

    // Schedule first processing at next minute boundary
    const firstTimer = setTimeout(() => {
      this.processMinuteBoundary(ticker);
      // Then every 60 seconds
      const intervalTimer = setInterval(() => {
        this.processMinuteBoundary(ticker);
      }, 60000);
      this.minuteTimers.set(`${ticker}-interval`, intervalTimer);
    }, msUntilNextMinute);

    this.minuteTimers.set(`${ticker}-first`, firstTimer);
  }

  /**
   * Stop tracking a ticker.
   */
  public stopTicker(ticker: string): void {
    this.tickerStates.delete(ticker);
    const firstTimer = this.minuteTimers.get(`${ticker}-first`);
    const intervalTimer = this.minuteTimers.get(`${ticker}-interval`);
    if (firstTimer) clearTimeout(firstTimer);
    if (intervalTimer) clearInterval(intervalTimer);
    this.minuteTimers.delete(`${ticker}-first`);
    this.minuteTimers.delete(`${ticker}-interval`);
  }

  /**
   * Stop all tickers.
   */
  public stopAll(): void {
    for (const ticker of this.tickerStates.keys()) {
      this.stopTicker(ticker);
    }
  }

  /**
   * Handle an incoming price event from PriceIngester.
   */
  public addPrice(event: PriceEvent): void {
    const state = this.tickerStates.get(event.ticker);
    if (!state) return;
    const second = Math.floor(event.timestamp / 1000);
    state.secondTracker.set(second, event.price);
  }

  /**
   * Get prices for a session by name.
   */
  public getSession(sessionName: string): PriceSessionEntry | undefined {
    return this.sessionIndex.get(sessionName);
  }

  /**
   * Get all tracked tickers.
   */
  public getTickers(): string[] {
    return [...this.tickerStates.keys()];
  }

  /**
   * Get recent sessions for a ticker.
   */
  public getRecentSessions(ticker: string, count: number = 10): PriceSessionEntry[] {
    const entries: PriceSessionEntry[] = [];
    for (const [name, entry] of this.sessionIndex) {
      if (name.startsWith(ticker + '-')) {
        entries.push(entry);
      }
    }
    // Sort by windowStart descending, take most recent
    entries.sort((a, b) => b.windowStart - a.windowStart);
    return entries.slice(0, count);
  }

  /**
   * Rebuild in-memory index from Yellow app sessions (for restart recovery).
   */
  public addToIndex(sessionName: string, entry: PriceSessionEntry): void {
    this.sessionIndex.set(sessionName, entry);
  }

  /**
   * Process minute boundary: build 60 prices, submit to app session, rotate.
   */
  private async processMinuteBoundary(ticker: string): Promise<void> {
    const state = this.tickerStates.get(ticker);
    if (!state) return;

    const now = Math.floor(Date.now() / 1000);
    const windowEnd = Math.floor(now / 60) * 60;
    const windowStart = windowEnd - 60;

    // Build 60 prices from secondTracker
    const prices = this.buildPriceArray(state.secondTracker, windowStart);

    if (!prices) {
      console.warn(`[PriceSessionManager] No price data for ${ticker} window ${windowStart}`);
      state.currentMinuteStart = windowEnd;
      return;
    }

    const sessionName = getSessionName(ticker, windowStart);

    try {
      // Two participants required by Yellow Network
      const participants = [this.backendWallet, this.secondWallet];
      const allocations = participants.map(p => ({ participant: p, asset: 'usdc', amount: '0' }));

      // Submit to current session or create one
      if (state.currentSessionId) {
        // Submit final state and close
        await this.ws.submitAppState(state.currentSessionId, allocations, RPCAppStateIntent.Operate, {
          ticker,
          windowStart,
          windowEnd: windowEnd - 1,
          prices,
        });
        await this.ws.closeAppSession(state.currentSessionId, allocations);

        // Store in index
        this.sessionIndex.set(sessionName, {
          appSessionId: state.currentSessionId,
          prices,
          windowStart,
        });

        console.log(`[PriceSessionManager] Window ${sessionName} stored (${prices.length} prices)`);
      }

      // Create next minute's session
      // Use 'Median App' as applicationName to match session key scope
      const { appSessionId } = await this.ws.createAppSession(
        participants,
        allocations,
        'Median App'
      );

      state.currentSessionId = appSessionId;
      state.currentMinuteStart = windowEnd;

      // Clean old entries from secondTracker
      const cutoff = windowStart - 60;
      for (const [sec] of state.secondTracker) {
        if (sec < cutoff) state.secondTracker.delete(sec);
      }

      // Evict old sessions from index (>24h)
      this.evictOldSessions();

    } catch (error) {
      console.error(`[PriceSessionManager] Error processing ${ticker} window:`, error);
    }
  }

  /**
   * Build array of 60 prices for a minute window.
   * Uses backward fill then forward fill for gaps.
   * Returns null if no real data exists.
   */
  private buildPriceArray(
    secondTracker: Map<number, number>,
    windowStart: number
  ): number[] | null {
    const prices: (number | undefined)[] = new Array(60);

    // First pass: fill from tracker
    for (let i = 0; i < 60; i++) {
      prices[i] = secondTracker.get(windowStart + i);
    }

    // Check if we have any data
    const hasData = prices.some(p => p !== undefined);
    if (!hasData) return null;

    // Backward fill
    let nextKnown: number | undefined = undefined;
    for (let i = 59; i >= 0; i--) {
      if (prices[i] !== undefined) {
        nextKnown = prices[i];
      } else if (nextKnown !== undefined) {
        prices[i] = nextKnown;
      }
    }

    // Forward fill remaining gaps
    let lastKnown: number | undefined = undefined;
    for (let i = 0; i < 60; i++) {
      if (prices[i] !== undefined) {
        lastKnown = prices[i];
      } else if (lastKnown !== undefined) {
        prices[i] = lastKnown;
      }
    }

    return prices as number[];
  }

  /**
   * Remove sessions older than 24 hours from the in-memory index.
   */
  private evictOldSessions(): void {
    const cutoff = Math.floor(Date.now() / 1000) - RETENTION_HOURS * 3600;
    for (const [name, entry] of this.sessionIndex) {
      if (entry.windowStart < cutoff) {
        this.sessionIndex.delete(name);
      }
    }
  }
}
