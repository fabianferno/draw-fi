import { PriceIngester } from './ingester/priceIngester.js';
import { PriceAggregator } from './aggregator/priceAggregator.js';
import { EigenDASubmitter } from './eigenda/eigendaSubmitter.js';
import { ContractStorage } from './contract/contractStorage.js';
import { RetrievalService } from './retrieval/retrievalService.js';
import { Orchestrator } from './orchestrator/orchestrator.js';
import { HealthMonitor } from './monitor/healthMonitor.js';
import { APIServer } from './api/server.js';
import { PredictionService } from './futures/predictionService.js';
import { FuturesContractStorage } from './contract/futuresContractStorage.js';
import { PNLCalculator } from './pnl/pnlCalculator.js';
import { PositionService } from './futures/positionService.js';
import { PositionCloser } from './futures/positionCloser.js';
import { PositionDatabase } from './database/positionDatabase.js';
import { YellowService } from './yellow/yellowService.js';
import { YellowBalanceDatabase } from './yellow/yellowBalanceDatabase.js';
import { startYellowDepositPoller, stopYellowDepositPoller } from './yellow/yellowDepositPoller.js';
import logger from './utils/logger.js';
import config from './config/config.js';

/**
 * Main application class
 */
class MNTPriceOracleApp {
  private ingester: PriceIngester;
  private aggregator: PriceAggregator;
  private eigenDASubmitter: EigenDASubmitter;
  private contractStorage: ContractStorage;
  private retrievalService: RetrievalService;
  private orchestrator: Orchestrator;
  private healthMonitor: HealthMonitor;
  private apiServer: APIServer;

  // Futures components
  private futuresContractStorage?: FuturesContractStorage;
  private predictionService?: PredictionService;
  private pnlCalculator?: PNLCalculator;
  private positionService?: PositionService;
  private positionCloser?: PositionCloser;
  private positionDatabase?: PositionDatabase;
  private yellowBalanceDb?: YellowBalanceDatabase;
  private yellowService?: YellowService;

  constructor() {
    logger.info('Initializing Price Oracle & Line Futures', {
      network: config.network,
      contractAddress: config.contractAddress,
      futuresContractAddress: config.futuresContractAddress
    });

    // Initialize oracle components
    this.ingester = new PriceIngester(config.defaultPriceSymbol);
    this.aggregator = new PriceAggregator();
    this.eigenDASubmitter = new EigenDASubmitter();
    this.contractStorage = new ContractStorage();

    this.retrievalService = new RetrievalService(
      this.contractStorage,
      this.eigenDASubmitter
    );

    this.orchestrator = new Orchestrator(
      this.ingester,
      this.aggregator,
      this.eigenDASubmitter,
      this.contractStorage
    );

    this.healthMonitor = new HealthMonitor(
      this.orchestrator,
      this.contractStorage
    );

    // Initialize position database (for leaderboard)
    this.positionDatabase = new PositionDatabase();
    this.positionDatabase.initialize();
    logger.info('Position database initialized');

    // Initialize futures components if contract address is configured
    if (config.futuresContractAddress) {
      logger.info('Initializing futures components');

      this.futuresContractStorage = new FuturesContractStorage();

      this.predictionService = new PredictionService(
        this.eigenDASubmitter,
        config.rateLimitWindowMs,
        config.rateLimitMaxRequests
      );

      this.pnlCalculator = new PNLCalculator();

      this.yellowBalanceDb = new YellowBalanceDatabase();
      this.yellowBalanceDb.initialize();
      this.yellowService = new YellowService(
        this.predictionService,
        this.pnlCalculator,
        this.retrievalService,
        this.yellowBalanceDb
      );

      this.positionService = new PositionService(
        this.futuresContractStorage,
        this.predictionService,
        this.pnlCalculator,
        this.eigenDASubmitter,
        this.contractStorage,
        this.retrievalService,
        this.positionDatabase,
        this.yellowService
      );

      this.positionCloser = new PositionCloser(
        this.positionService,
        this.futuresContractStorage
      );
    } else {
      logger.warn('Futures contract address not configured, futures features disabled');
    }

    this.apiServer = new APIServer(
      this.retrievalService,
      this.healthMonitor,
      this.orchestrator,
      this.predictionService,
      this.positionService,
      this.positionCloser,
      this.positionDatabase,
      this.yellowService
    );

    this.setupSignalHandlers();
  }

  /**
   * Start the application
   */
  public async start(): Promise<void> {
    try {
      logger.info('Starting Price Oracle & Line Futures application');

      // Start orchestrator (includes ingester)
      await this.orchestrator.start();

      // Start health monitor
      this.healthMonitor.start();

      // Start position closer cron job if available
      if (this.positionCloser) {
        this.positionCloser.start();
        logger.info('Position closer cron job started');
      }

      if (this.yellowBalanceDb) {
        startYellowDepositPoller(this.yellowBalanceDb);
      }

      // Start API server
      await this.apiServer.start();

      logger.info('Price Oracle & Line Futures application started successfully');
      logger.info('API available at', {
        url: `http://${config.apiHost}:${config.port}`
      });

    } catch (error) {
      logger.error('Failed to start application', error);
      throw error;
    }
  }

  /**
   * Stop the application
   */
  public async stop(): Promise<void> {
    logger.info('Stopping Price Oracle & Line Futures application');

    try {
      // Stop API server
      await this.apiServer.stop();

      // Stop position closer cron job
      if (this.positionCloser) {
        this.positionCloser.stop();
        logger.info('Position closer cron job stopped');
      }

      stopYellowDepositPoller();

      // Stop health monitor
      this.healthMonitor.stop();

      // Stop orchestrator
      this.orchestrator.stop();

      // Close database connection
      if (this.positionDatabase) {
        this.positionDatabase.close();
        logger.info('Position database connection closed');
      }

      if (this.yellowBalanceDb) {
        this.yellowBalanceDb.close();
        logger.info('Yellow balance database closed');
      }

      logger.info('Price Oracle & Line Futures application stopped successfully');
    } catch (error) {
      logger.error('Error stopping application', error);
      throw error;
    }
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully`);

      try {
        await this.stop();
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Promise Rejection', { reason, promise });
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', error);
      process.exit(1);
    });
  }
}

// Start the application if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  const app = new MNTPriceOracleApp();

  app.start().catch((error) => {
    logger.error('Fatal error during startup', error);
    process.exit(1);
  });
}

export default MNTPriceOracleApp;

