import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { webSocketService } from './lib/websockets';
import { createChannelOnChain } from './utils/channel/create';
import { closeChannelOnChain } from './utils/channel/close';
import { resizeChannelOnChain } from './utils/channel/resize';
import { depositToCustody } from './utils/channel/deposit';
import { withdrawFromCustody } from './utils/channel/withdraw';
import { createAppSession } from './utils/session/create';
import { submitAppState } from './utils/session/submitState';
import { closeAppSession } from './utils/session/close';
import { transfer } from './utils/session/transfer';
import { PriceIngester } from './price/priceIngester';
import { PriceSessionManager, getSessionName } from './price/priceSessionManager';
import { PositionScheduler } from './perps/positionScheduler';

dotenv.config();

// --- 60-point perps config ---
const PRICE_TICKERS = (process.env.PRICE_TICKERS || 'BTCUSDT').split(',').map(t => t.trim()).filter(Boolean);
const BYBIT_WSS_URL = process.env.BYBIT_WSS_URL || 'wss://stream.bybit.com/v5/public/spot';
const FEE_BPS = parseInt(process.env.FEE_BPS || '100', 10);
const MAX_LEVERAGE = parseInt(process.env.MAX_LEVERAGE || '2500', 10);
const MIN_POSITION_DURATION = parseInt(process.env.MIN_POSITION_DURATION || '60', 10);
const MAX_POSITION_DURATION = parseInt(process.env.MAX_POSITION_DURATION || '86400', 10);
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Welcome to the API' });
});

app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    websocket: webSocketService.getStatus(),
    authenticated: webSocketService.isAuthenticated(),
  });
});

import { privateKeyToAccount } from 'viem/accounts';

// ...

app.get('/ws/status', (req: Request, res: Response) => {
  let privateKey = process.env.PRIVATE_KEY as string || '';
  if (privateKey && !privateKey.startsWith('0x')) {
    privateKey = `0x${privateKey}`;
  }
  const wallet = privateKey ? privateKeyToAccount(privateKey as `0x${string}`) : null;

  res.json({
    status: webSocketService.getStatus(),
    authenticated: webSocketService.isAuthenticated(),
    sessionKey: webSocketService.getSessionKey()?.address || null,
    walletAddress: wallet?.address || null
  });
});

app.post('/channels/onchain', async (req: Request, res: Response) => {
  try {
    const result = await createChannelOnChain();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Failed to create channel on-chain:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.post('/channels/close', async (req: Request, res: Response) => {
  try {
    const { channelId } = req.body;
    if (!channelId || !channelId.startsWith('0x')) {
      res.status(400).json({ success: false, error: 'Invalid channelId. Provide a hex string starting with 0x.' });
      return;
    }
    const result = await closeChannelOnChain(channelId);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Failed to close channel:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.post('/channels/resize', async (req: Request, res: Response) => {
  try {
    const { channelId, resizeAmount, allocateAmount } = req.body;
    if (!channelId || !channelId.startsWith('0x')) {
      res.status(400).json({ success: false, error: 'Invalid channelId. Provide a hex string starting with 0x.' });
      return;
    }
    if (resizeAmount === undefined && allocateAmount === undefined) {
      res.status(400).json({ success: false, error: 'At least one of resizeAmount or allocateAmount must be provided.' });
      return;
    }
    const result = await resizeChannelOnChain(channelId, resizeAmount, allocateAmount);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Failed to resize channel:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.post('/deposit', async (req: Request, res: Response) => {
  try {
    const { amount } = req.body;
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      res.status(400).json({ success: false, error: 'Invalid amount. Provide a positive number.' });
      return;
    }
    const txHash = await depositToCustody(amount.toString());
    res.json({ success: true, txHash });
  } catch (error) {
    console.error('Failed to deposit:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.post('/withdraw', async (req: Request, res: Response) => {
  try {
    const { amount } = req.body;
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      res.status(400).json({ success: false, error: 'Invalid amount. Provide a positive number.' });
      return;
    }
    const txHash = await withdrawFromCustody(amount.toString());
    res.json({ success: true, txHash });
  } catch (error) {
    console.error('Failed to withdraw:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ==================== App Session Endpoints ====================

app.post('/sessions', async (req: Request, res: Response) => {
  try {
    const { participants, allocations, applicationName } = req.body;
    if (!participants || !Array.isArray(participants) || participants.length === 0) {
      res.status(400).json({ success: false, error: 'participants array is required.' });
      return;
    }
    if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
      res.status(400).json({ success: false, error: 'allocations array is required.' });
      return;
    }
    const result = await createAppSession({ participants, allocations, applicationName });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Failed to create app session:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.post('/sessions/:id/state', async (req: Request, res: Response) => {
  try {
    const appSessionId = req.params.id;
    const { allocations, sessionData, intent } = req.body;
    if (!appSessionId.startsWith('0x')) {
      res.status(400).json({ success: false, error: 'Invalid appSessionId. Provide a hex string starting with 0x.' });
      return;
    }
    if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
      res.status(400).json({ success: false, error: 'allocations array is required.' });
      return;
    }
    if (intent && !['operate', 'deposit', 'withdraw'].includes(intent)) {
      res.status(400).json({ success: false, error: 'Invalid intent. Use: operate, deposit, or withdraw.' });
      return;
    }
    const result = await submitAppState({ appSessionId, allocations, sessionData, intent });
    res.json(result);
  } catch (error) {
    console.error('Failed to submit app state:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.post('/sessions/:id/close', async (req: Request, res: Response) => {
  try {
    const appSessionId = req.params.id;
    const { allocations } = req.body;
    if (!appSessionId.startsWith('0x')) {
      res.status(400).json({ success: false, error: 'Invalid appSessionId. Provide a hex string starting with 0x.' });
      return;
    }
    if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
      res.status(400).json({ success: false, error: 'allocations array is required.' });
      return;
    }
    const result = await closeAppSession({ appSessionId, allocations });
    res.json(result);
  } catch (error) {
    console.error('Failed to close app session:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.post('/transfer', async (req: Request, res: Response) => {
  try {
    const { destination, allocations } = req.body;
    if (!destination || !destination.startsWith('0x')) {
      res.status(400).json({ success: false, error: 'Invalid destination. Provide a hex address starting with 0x.' });
      return;
    }
    if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
      res.status(400).json({ success: false, error: 'allocations array is required (e.g., [{ asset: "usdc", amount: "0.001" }]).' });
      return;
    }
    const result = await transfer({ destination, allocations });
    res.json(result);
  } catch (error) {
    console.error('Failed to transfer:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Bind to 0.0.0.0 for Render deployment
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Server is running on http://${HOST}:${PORT}`);
  console.log('WebSocket service will connect automatically...');

  // Initialize 60-point perps after server starts
  initPerps();
});

async function initPerps() {
  // Wait for Yellow WS authentication
  await webSocketService.waitForAuth();
  console.log('[Perps] Yellow WS authenticated, initializing...');

  const wallet = privateKeyToAccount(
    (process.env.PRIVATE_KEY || '').startsWith('0x')
      ? process.env.PRIVATE_KEY as `0x${string}`
      : `0x${process.env.PRIVATE_KEY}` as `0x${string}`
  );

  // 1. Price Ingester
  const priceIngester = new PriceIngester(PRICE_TICKERS, BYBIT_WSS_URL);

  // 2. Price Session Manager (session key as second participant — Yellow requires 2)
  const sessionKeyAddress = webSocketService.getSessionKey()?.address || wallet.address;
  const priceSessionManager = new PriceSessionManager(webSocketService, wallet.address, sessionKeyAddress);

  // Wire: ingester -> session manager
  priceIngester.on('price', (event) => {
    priceSessionManager.addPrice(event);
  });

  // Start tickers
  for (const ticker of PRICE_TICKERS) {
    priceSessionManager.startTicker(ticker);
  }

  // 3. Position Scheduler
  const activeTickers = new Set(PRICE_TICKERS);
  const positionScheduler = new PositionScheduler(
    webSocketService,
    priceSessionManager,
    wallet.address,
    activeTickers,
    { feeBps: FEE_BPS, maxLeverage: MAX_LEVERAGE, minDuration: MIN_POSITION_DURATION, maxDuration: MAX_POSITION_DURATION }
  );

  // 4. Hook into WebSocketService
  webSocketService.onDirectional60Open = async (params, sessionData) => {
    console.log('[Perps] Detected directional-60 position open:', sessionData);
    // Validate early so user gets feedback before transferring funds
    const validationError = positionScheduler.validatePosition(sessionData);
    if (validationError) {
      console.error(`[Perps] Invalid position rejected: ${validationError}`);
    }
  };

  webSocketService.onDirectional60Transfer = async (senderAddress, receivedAmount, sessions): Promise<boolean> => {
    console.log(`[Perps] Transfer hook: sender=${senderAddress}, amount=${receivedAmount}, sessions=${sessions.length}`);
    for (const session of sessions) {
      const sessionObj = session as any;
      const rawData = sessionObj.session_data || sessionObj.sessionData;
      if (!rawData) continue;

      let data: any;
      try { data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData; } catch { continue; }

      if (data.positionType !== 'directional-60') { continue; }
      if (data.action !== 'open') { continue; }
      if (data.status) { console.log(`[Perps] Skipping session ${sessionObj.appSessionId}: status=${data.status}`); continue; }

      const participants = sessionObj.participants || [];
      const isParticipant = participants.some(
        (p: string) => p.toLowerCase() === senderAddress.toLowerCase()
      );
      if (!isParticipant) continue;

      // Match amount — receivedAmount is human-readable (e.g. "1"), data.amount is atomic (e.g. "1000000")
      const receivedAtomic = Math.floor(parseFloat(receivedAmount) * 1_000_000).toString();
      console.log(`[Perps] Amount check: received=${receivedAmount} -> atomic=${receivedAtomic}, session=${data.amount}`);
      if (data.amount !== receivedAtomic) continue;

      // Found match — reconstruct allocations from participants (keep zero to match session creation)
      const yellowAsset = process.env.YELLOW_ASSET || 'usdc';
      const allocations = participants.map((p: string) => ({
        participant: p, asset: yellowAsset, amount: '0',
      }));

      try {
        await positionScheduler.activatePosition(sessionObj.appSessionId, data, allocations);
        console.log(`[Perps] Position ${sessionObj.appSessionId} activated from transfer`);
        return true; // Matched
      } catch (err) {
        console.error(`[Perps] Failed to activate position:`, err);
      }
    }
    return false; // No match found, fall through to spot trade logic
  };

  // 5. Start price ingester
  await priceIngester.start();
  console.log(`[Perps] Price ingester started for: ${PRICE_TICKERS.join(', ')}`);

  // 6. Run recovery
  // First recover price session index
  try {
    const allSessions = await webSocketService.getAppSessions();
    const now = Math.floor(Date.now() / 1000);
    const cutoff24h = now - 24 * 3600;

    for (const session of allSessions) {
      const sessionObj = session as any;
      const rawData = sessionObj.session_data || sessionObj.sessionData;
      if (!rawData) continue;
      let data: any;
      try { data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData; } catch { continue; }

      // Rebuild price session index
      if (data.prices && data.ticker && data.windowStart && data.windowStart >= cutoff24h) {
        const name = getSessionName(data.ticker, data.windowStart);
        priceSessionManager.addToIndex(name, {
          appSessionId: sessionObj.appSessionId,
          prices: data.prices,
          windowStart: data.windowStart,
        });
      }
    }
    console.log('[Perps] Price session index rebuilt');
  } catch (err) {
    console.error('[Perps] Price session recovery failed:', err);
  }

  // Then recover positions
  await positionScheduler.recover();

  // --- API Endpoints for perps ---

  app.get('/tickers', (req, res) => {
    res.json({ success: true, tickers: priceIngester.getTickers() });
  });

  app.post('/tickers', (req, res) => {
    if (ADMIN_API_KEY && req.headers['x-api-key'] !== ADMIN_API_KEY) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }
    const { ticker } = req.body;
    if (!ticker || typeof ticker !== 'string') {
      res.status(400).json({ success: false, error: 'ticker string required' });
      return;
    }
    priceIngester.addTicker(ticker);
    priceSessionManager.startTicker(ticker);
    activeTickers.add(ticker);
    res.json({ success: true, ticker });
  });

  app.get('/price-sessions/:ticker', (req, res) => {
    const count = parseInt(req.query.count as string) || 10;
    const sessions = priceSessionManager.getRecentSessions(req.params.ticker, count);
    res.json({ success: true, sessions });
  });

  app.get('/positions/active', (req, res) => {
    res.json({ success: true, positions: positionScheduler.getActivePositions() });
  });

  // Test-only: manually activate a position (bypasses transfer requirement)
  app.post('/positions/:appSessionId/activate', async (req, res) => {
    try {
      const { appSessionId } = req.params;
      const sessions = await webSocketService.getAppSessions();
      const session = sessions.find((s: any) =>
        (s.appSessionId || '').toLowerCase() === appSessionId.toLowerCase()
      );
      if (!session) {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }
      const sessionObj = session as any;
      const rawData = sessionObj.session_data || sessionObj.sessionData;
      let data: any;
      try { data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData; } catch {
        res.status(400).json({ success: false, error: 'Cannot parse session data' });
        return;
      }
      const participants = sessionObj.participants || [];
      const allocations = participants.map((p: string) => ({
        participant: p, asset: 'usdc', amount: '0',
      }));
      await positionScheduler.activatePosition(appSessionId, data, allocations);
      res.json({ success: true, message: 'Position activated' });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get('/positions/:appSessionId', async (req, res) => {
    try {
      const { appSessionId } = req.params;
      const sessions = await webSocketService.getAppSessions();
      const session = sessions.find((s: any) =>
        (s.appSessionId || '').toLowerCase() === appSessionId.toLowerCase()
      );
      if (!session) {
        res.status(404).json({ success: false, error: 'Position not found' });
        return;
      }
      const sessionObj = session as any;
      const rawData = sessionObj.session_data || sessionObj.sessionData;
      let data: any = null;
      try { data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData; } catch {}
      res.json({ success: true, appSessionId, sessionData: data, participants: sessionObj.participants });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/positions/open', async (req, res) => {
    try {
      const { ticker, predictions, leverage, amount, startTime, endTime, userWallet } = req.body;

      // Validate
      if (!ticker || typeof ticker !== 'string') {
        res.status(400).json({ success: false, error: 'ticker required' });
        return;
      }
      if (!Array.isArray(predictions) || predictions.length !== 60) {
        res.status(400).json({ success: false, error: 'predictions must be array of 60' });
        return;
      }
      if (!leverage || leverage < 1 || leverage > MAX_LEVERAGE) {
        res.status(400).json({ success: false, error: `leverage must be 1-${MAX_LEVERAGE}` });
        return;
      }
      if (!amount || parseInt(amount) <= 0) {
        res.status(400).json({ success: false, error: 'amount must be positive (atomic USDC)' });
        return;
      }
      const duration = endTime - startTime;
      if (duration < MIN_POSITION_DURATION || duration > MAX_POSITION_DURATION) {
        res.status(400).json({ success: false, error: `duration must be ${MIN_POSITION_DURATION}-${MAX_POSITION_DURATION}s` });
        return;
      }
      if (!userWallet || !userWallet.startsWith('0x')) {
        res.status(400).json({ success: false, error: 'valid userWallet required' });
        return;
      }

      // Create app session
      const yellowAsset = process.env.YELLOW_ASSET || 'usdc';
      const participants = [userWallet, wallet.address];
      const allocations = participants.map((p: string) => ({
        participant: p, asset: yellowAsset, amount: '0',
      }));

      const { appSessionId } = await webSocketService.createAppSession(
        participants,
        allocations,
        'Median App'
      );

      // Submit predictions
      const { RPCAppStateIntent } = await import('@erc7824/nitrolite');
      await webSocketService.submitAppState(appSessionId, allocations, RPCAppStateIntent.Operate, {
        action: 'open',
        positionType: 'directional-60',
        ticker,
        predictions,
        leverage,
        amount,
        startTime,
        endTime,
        userWallet,
      });

      res.json({ success: true, appSessionId, backendWallet: wallet.address });
    } catch (error) {
      console.error('Failed to open position:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  console.log('[Perps] Initialization complete');
}
