import { EventEmitter } from 'events';
import { PriceIngester } from '../ingester/priceIngester.js';
import { PriceAggregator } from '../aggregator/priceAggregator.js';
import { EigenDASubmitter } from '../eigenda/eigendaSubmitter.js';
import { ContractStorage } from '../contract/contractStorage.js';
import { PriceWindowPayload } from '../types/index.js';
import logger from '../utils/logger.js';

export class Orchestrator extends EventEmitter {
  private ingester: PriceIngester;
  private aggregator: PriceAggregator;
  private eigenDASubmitter: EigenDASubmitter;
  private contractStorage: ContractStorage;
  private isRunning = false;
  private windowCheckInterval: NodeJS.Timeout | null = null;

  constructor(
    ingester: PriceIngester,
    aggregator: PriceAggregator,
    eigenDASubmitter: EigenDASubmitter,
    contractStorage: ContractStorage
  ) {
    super();
    this.ingester = ingester;
    this.aggregator = aggregator;
    this.eigenDASubmitter = eigenDASubmitter;
    this.contractStorage = contractStorage;

    this.setupEventHandlers();
  }

  /**
   * Start the orchestrator
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Orchestrator already running');
      return;
    }

    logger.info('Starting orchestrator');
    this.isRunning = true;

    try {
      // Test connections (non-blocking - allow server to start even if test fails)
      logger.info('Testing connections...');

      const contractConnected = await this.contractStorage.testConnection();
      if (!contractConnected) {
        logger.warn('Contract connection test failed, but continuing startup. Contract will be tested when used.');
      }

      // Start price ingester
      await this.ingester.start();

      // Start window check interval (every 5 seconds)
      this.startWindowCheckInterval();

      logger.info('Orchestrator started successfully');
      this.emit('started');

    } catch (error) {
      logger.error('Failed to start orchestrator', error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop the orchestrator
   */
  public stop(): void {
    if (!this.isRunning) {
      logger.warn('Orchestrator not running');
      return;
    }

    logger.info('Stopping orchestrator');
    this.isRunning = false;

    // Stop window check interval
    if (this.windowCheckInterval) {
      clearInterval(this.windowCheckInterval);
      this.windowCheckInterval = null;
    }

    // Stop ingester
    this.ingester.stop();

    logger.info('Orchestrator stopped');
    this.emit('stopped');
  }

  /**
   * Get orchestrator status
   */
  public getStatus(): {
    isRunning: boolean;
    websocketConnected: boolean;
    bufferSize: number;
    currentWindow: number;
  } {
    return {
      isRunning: this.isRunning,
      websocketConnected: this.ingester.isConnected(),
      bufferSize: this.aggregator.getBufferSize(),
      currentWindow: this.aggregator.getCurrentWindowStart()
    };
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Handle price updates from ingester
    this.ingester.on('price', (priceEntry) => {
      this.aggregator.addPrice(priceEntry);
    });

    // Handle ingester connection events
    this.ingester.on('connected', () => {
      logger.info('Price ingester connected');
      this.emit('ingesterConnected');
    });

    this.ingester.on('disconnected', () => {
      logger.warn('Price ingester disconnected');
      this.emit('ingesterDisconnected');
    });

    this.ingester.on('error', (error) => {
      logger.error('Price ingester error', error);
      this.emit('ingesterError', error);
    });

    // Handle window ready events from aggregator
    this.aggregator.on('windowReady', async (payload: PriceWindowPayload) => {
      await this.handleWindowReady(payload);
    });

    this.aggregator.on('bufferSizeMismatch', (data) => {
      logger.warn('Buffer size mismatch detected', data);
      this.emit('bufferSizeMismatch', data);
    });

    this.aggregator.on('windowError', (data) => {
      logger.error('Window processing error', data);
      this.emit('windowError', data);
    });
  }

  /**
   * Handle window ready event
   */
  private async handleWindowReady(payload: PriceWindowPayload): Promise<void> {
    logger.info('Processing completed window', {
      windowStart: payload.windowStart,
      priceCount: payload.prices.length
    });

    try {
      // Step 1: Submit to EigenDA
      logger.info('Submitting to EigenDA', { windowStart: payload.windowStart });
      const commitment = await this.eigenDASubmitter.submitPayload(payload);

      this.emit('eigenDASubmitted', {
        windowStart: payload.windowStart,
        commitment: commitment.commitment
      });

      // Step 2: Store commitment on-chain
      logger.info('Storing commitment on-chain', {
        windowStart: payload.windowStart,
        commitment: commitment.commitment
      });

      const txHash = await this.contractStorage.storeCommitment(
        payload.windowStart,
        commitment.commitment
      );

      this.emit('commitmentStored', {
        windowStart: payload.windowStart,
        commitment: commitment.commitment,
        txHash
      });

      logger.info('Window processing completed successfully', {
        windowStart: payload.windowStart,
        commitment: commitment.commitment,
        txHash
      });

    } catch (error) {
      logger.error('Failed to process window', {
        windowStart: payload.windowStart,
        error
      });

      this.emit('windowProcessingError', {
        windowStart: payload.windowStart,
        error
      });

      throw error;
    }
  }

  /**
   * Start interval to check for ready windows
   * Note: Aggregator now uses timer-based processing at minute boundaries,
   * so this is just a backup check
   */
  private startWindowCheckInterval(): void {
    if (this.windowCheckInterval) {
      clearInterval(this.windowCheckInterval);
    }

    // Keep a lightweight interval just for monitoring
    this.windowCheckInterval = setInterval(() => {
      // Just log metrics occasionally
      const metrics = this.getMetrics();
      logger.debug('Orchestrator metrics', metrics);
    }, 30000); // Check every 30 seconds
  }

  /**
   * Get metrics
   */
  public getMetrics(): {
    websocketConnected: boolean;
    lastPriceUpdate: number;
    bufferSize: number;
    currentWindow: number;
  } {
    return {
      websocketConnected: this.ingester.isConnected(),
      lastPriceUpdate: this.ingester.getLastMessageTime(),
      bufferSize: this.aggregator.getBufferSize(),
      currentWindow: this.aggregator.getCurrentWindowStart()
    };
  }

  /**
   * Get current ticker symbol
   */
  public getCurrentTicker(): string {
    return this.ingester.getTickerSymbol();
  }

  /**
   * Update ticker symbol
   */
  public updateTicker(tickerSymbol: string): void {
    logger.info('Updating ticker symbol', { old: this.ingester.getTickerSymbol(), new: tickerSymbol });
    this.ingester.updateTicker(tickerSymbol);
  }
}

export default Orchestrator;

