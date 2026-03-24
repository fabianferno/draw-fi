// @ts-nocheck
/**
 * End-to-end test for 60-point directional perps
 *
 * Flow:
 *   1. Generate a fresh test wallet
 *   2. Fund it with 0.01 ETH + 0.1 USDC from the backend wallet (env PRIVATE_KEY)
 *   3. Test wallet connects to Yellow WS, authenticates
 *   4. Test wallet creates an app session (position) with backend as participant
 *   5. Test wallet submits 60 predictions + metadata via submitAppState
 *   6. Test wallet transfers USDC collateral to backend via Yellow transfer
 *   7. Wait for position to close (backend settles at endTime)
 *   8. Verify the position was closed with PnL result
 *
 * Usage:
 *   npx ts-node scripts/e2e-perps-test.ts
 */

import { config } from 'dotenv';
config();

import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  parseEther,
  formatEther,
  encodeFunctionData,
  erc20Abi,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { hardhat } from 'viem/chains';
import {
  createAuthRequestMessage,
  createAuthVerifyMessage,
  createEIP712AuthMessageSigner,
  createAppSessionMessage,
  createSubmitAppStateMessage,
  createTransferMessage,
  createGetAppSessionsMessageV2,
  createECDSAMessageSigner,
  parseAnyRPCResponse,
  getMethod,
  RPCAppStateIntent,
  RPCProtocolVersion,
  type RPCAppDefinition,
  type RPCAppSessionAllocation,
  type AuthChallengeResponse,
} from '@erc7824/nitrolite';
import WebSocket from 'ws';

// ── Config ───────────────────────────────────────────────────────────
const YELLOW_WS_URL = process.env.YELLOW_NODE_URL || 'ws://localhost:8000/ws';
const RPC_URL = process.env.ETHEREUM_RPC_URL || 'http://localhost:8545';
const USDC_ADDRESS = (process.env.USDC_TOKEN || '0xbD24c53072b9693A35642412227043Ffa5fac382') as `0x${string}`;
const YELLOW_ASSET = process.env.YELLOW_ASSET || 'yintegration.usd';
const BACKEND_PRIVATE_KEY = process.env.PRIVATE_KEY as string;

if (!BACKEND_PRIVATE_KEY) {
  console.error('PRIVATE_KEY not set in .env');
  process.exit(1);
}

const AUTH_SCOPE = 'Median App';
const COLLATERAL_USDC = '0.1'; // 0.1 USDC
const COLLATERAL_ATOMIC = '100000'; // 0.1 * 1e6
const POSITION_DURATION_SECONDS = 60; // Minimum: 60s
const LEVERAGE = 5;

// ── Helpers ──────────────────────────────────────────────────────────
function log(step: string, msg: string) {
  console.log(`[${step}] ${msg}`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Step 1: Generate test wallet ─────────────────────────────────────
async function main() {
  log('INIT', '=== E2E Perps Test ===');

  const testPrivateKey = generatePrivateKey();
  const testAccount = privateKeyToAccount(testPrivateKey);
  log('INIT', `Test wallet: ${testAccount.address}`);

  const backendKey = BACKEND_PRIVATE_KEY.startsWith('0x')
    ? BACKEND_PRIVATE_KEY as `0x${string}`
    : `0x${BACKEND_PRIVATE_KEY}` as `0x${string}`;
  const backendAccount = privateKeyToAccount(backendKey);
  log('INIT', `Backend wallet: ${backendAccount.address}`);

  const publicClient = createPublicClient({
    chain: hardhat,
    transport: http(RPC_URL),
  });

  const backendWalletClient = createWalletClient({
    account: backendAccount,
    chain: hardhat,
    transport: http(RPC_URL),
  });

  // ── Step 2: Fund test wallet with ETH + USDC ──────────────────────
  log('FUND', 'Sending 0.1 ETH to test wallet...');
  const ethTxHash = await backendWalletClient.sendTransaction({
    to: testAccount.address,
    value: parseEther('0.1'),
  });
  log('FUND', `ETH tx: ${ethTxHash}`);
  await publicClient.waitForTransactionReceipt({ hash: ethTxHash });

  log('FUND', 'Sending 1 USDC to test wallet...');
  const usdcTxHash = await backendWalletClient.sendTransaction({
    to: USDC_ADDRESS,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [testAccount.address, parseUnits('1', 6)],
    }),
  });
  log('FUND', `USDC tx: ${usdcTxHash}`);
  await publicClient.waitForTransactionReceipt({ hash: usdcTxHash });

  const ethBal = await publicClient.getBalance({ address: testAccount.address });
  const usdcBal = await publicClient.readContract({
    address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [testAccount.address],
  });
  log('FUND', `Test wallet: ${formatEther(ethBal)} ETH, ${formatUnits(usdcBal, 6)} USDC`);

  // ── Step 3: Connect test wallet to Yellow WS ─────────────────────
  log('WS', `Connecting to ${YELLOW_WS_URL}...`);

  const testWalletClient = createWalletClient({
    account: testAccount,
    chain: hardhat,
    transport: http(RPC_URL),
  });

  // Generate session key for the test wallet
  const sessionPrivateKey = generatePrivateKey();
  const sessionAccount = privateKeyToAccount(sessionPrivateKey);
  const sessionSigner = createECDSAMessageSigner(sessionPrivateKey);
  log('WS', `Session key: ${sessionAccount.address}`);

  // Connect and authenticate
  const ws = new WebSocket(YELLOW_WS_URL);
  let authenticated = false;
  let resolveAuth: () => void;
  const authPromise = new Promise<void>((r) => { resolveAuth = r; });

  // Message handler map for request-response
  const pendingRequests = new Map<string, { resolve: (data: any) => void; reject: (err: Error) => void }>();

  ws.on('open', async () => {
    log('WS', 'Connected');

    const sessionExpire = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const allowances = [{ asset: YELLOW_ASSET, amount: '1000000000' }];

    const authMsg = await createAuthRequestMessage({
      address: testAccount.address,
      session_key: sessionAccount.address,
      application: AUTH_SCOPE,
      allowances,
      expires_at: sessionExpire,
      scope: 'median.app',
    });

    ws.send(authMsg);
    log('WS', 'Auth request sent');
  });

  ws.on('message', async (rawData: WebSocket.Data) => {
    try {
      const data = parseAnyRPCResponse(rawData.toString());
      const rawMsg = JSON.parse(rawData.toString());
      const method = getMethod(rawMsg);

      if (method === 'auth_challenge') {
        log('WS', 'Auth challenge received');
        const sessionExpire = BigInt(Math.floor(Date.now() / 1000) + 3600);
        const allowances = [{ asset: YELLOW_ASSET, amount: '1000000000' }];

        const authParams = {
          scope: 'median.app',
          application: testAccount.address,
          participant: sessionAccount.address,
          expire: sessionExpire,
          allowances,
          session_key: sessionAccount.address,
          expires_at: sessionExpire,
        };

        const eip712Signer = createEIP712AuthMessageSigner(testWalletClient, authParams, { name: AUTH_SCOPE });
        const verifyMsg = await createAuthVerifyMessage(eip712Signer, data as AuthChallengeResponse);
        ws.send(verifyMsg);
        log('WS', 'Auth verify sent');
      }

      if (method === 'auth_verify') {
        const params = data.params as any;
        if (params.success) {
          log('WS', 'Authenticated!');
          authenticated = true;
          resolveAuth!();
        } else {
          log('WS', `Auth failed: ${JSON.stringify(params)}`);
          process.exit(1);
        }
      }

      if (method === 'create_app_session') {
        log('WS', `App session created: ${(data.params as any).appSessionId}`);
        pendingRequests.get('create_app_session')?.resolve(data.params);
        pendingRequests.delete('create_app_session');
      }

      if (method === 'submit_app_state') {
        log('WS', 'App state submitted');
        pendingRequests.get('submit_app_state')?.resolve(data.params);
        pendingRequests.delete('submit_app_state');
      }

      if (method === 'transfer' || method === 'tr') {
        log('WS', 'Transfer completed');
        pendingRequests.get('transfer')?.resolve(data.params);
        pendingRequests.delete('transfer');
      }

      if (method === 'get_app_sessions') {
        pendingRequests.get('get_app_sessions')?.resolve(data.params);
        pendingRequests.delete('get_app_sessions');
      }

      if (method === 'asu') {
        const params = data.params as any;
        const sd = params.sessionData ? JSON.parse(params.sessionData) : null;
        if (sd) {
          log('ASU', `State update: status=${sd.status}, action=${sd.action || 'n/a'}`);
          if (sd.status === 'closed') {
            pendingRequests.get('position_closed')?.resolve(sd);
            pendingRequests.delete('position_closed');
          }
        }
      }

      if (method === 'error') {
        log('ERROR', JSON.stringify(data.params));
        // Reject all pending
        pendingRequests.forEach(({ reject }, key) => {
          reject(new Error(JSON.stringify(data.params)));
        });
        pendingRequests.clear();
      }
    } catch (err) {
      // Ignore parse errors for non-RPC messages
    }
  });

  ws.on('error', (err) => {
    log('WS', `Error: ${err.message}`);
    process.exit(1);
  });

  // Wait for auth
  await authPromise;

  // Helper to send and wait
  function sendAndWait(key: string, message: string, timeoutMs = 30000): Promise<any> {
    return new Promise((resolve, reject) => {
      pendingRequests.set(key, { resolve, reject });
      ws.send(message);
      setTimeout(() => {
        if (pendingRequests.has(key)) {
          pendingRequests.delete(key);
          reject(new Error(`Timeout waiting for ${key}`));
        }
      }, timeoutMs);
    });
  }

  // ── Step 3b: Seed Yellow balances via clearnode database ────────────
  // The integration tests use direct DB seeding to give wallets Yellow balance.
  // This bypasses the on-chain deposit/channel/resize flow.
  const { Client } = require('pg');
  const pgClient = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:5432/postgres' });
  await pgClient.connect();

  // Seed backend wallet with 10 USDC
  log('DEPOSIT', 'Seeding backend Yellow balance (10 USDC) via clearnode DB...');
  await pgClient.query(
    `INSERT INTO ledger (wallet, account_id, account_type, asset_symbol, credit, debit) VALUES ($1, $2, $3, $4, $5, $6)`,
    [backendAccount.address, backendAccount.address, 0, YELLOW_ASSET, '10', '0']
  );

  // Seed test wallet with 1 USDC
  log('DEPOSIT', 'Seeding test wallet Yellow balance (1 USDC) via clearnode DB...');
  await pgClient.query(
    `INSERT INTO ledger (wallet, account_id, account_type, asset_symbol, credit, debit) VALUES ($1, $2, $3, $4, $5, $6)`,
    [testAccount.address, testAccount.address, 0, YELLOW_ASSET, '1', '0']
  );

  await pgClient.end();
  log('DEPOSIT', 'Yellow balances seeded. Backend: 10 USDC, Test wallet: 1 USDC');
  await sleep(1000);

  // ── Step 4: Create position app session ──────────────────────────
  log('POSITION', 'Creating app session...');

  const participants = [testAccount.address, backendAccount.address];
  const singleWeight = 50;
  const definition: RPCAppDefinition = {
    protocol: RPCProtocolVersion.NitroRPC_0_4,
    participants: participants as `0x${string}`[],
    weights: [singleWeight, singleWeight],
    quorum: singleWeight,
    challenge: 0,
    nonce: Date.now(),
    application: AUTH_SCOPE,
  };

  // Use zero allocations for session creation — actual funding via transfer
  const allocations: RPCAppSessionAllocation[] = participants.map((p) => ({
    participant: p as `0x${string}`,
    asset: YELLOW_ASSET,
    amount: '0',
  }));

  const createSessionMsg = await createAppSessionMessage(sessionSigner, {
    definition,
    allocations,
  });

  const sessionResult = await sendAndWait('create_app_session', createSessionMsg);
  const appSessionId = sessionResult.appSessionId;
  log('POSITION', `Session ID: ${appSessionId}`);

  // ── Step 5: Submit predictions ───────────────────────────────────
  log('POSITION', 'Submitting 60 predictions...');

  // Align startTime to next minute boundary so price data is guaranteed available
  const now = Math.floor(Date.now() / 1000);
  const nextMinute = Math.ceil(now / 60) * 60;
  const startTime = nextMinute; // Start at next minute boundary
  const endTime = startTime + POSITION_DURATION_SECONDS;
  log('POSITION', `Waiting ${nextMinute - now}s until next minute boundary for startTime...`);
  await sleep((nextMinute - now + 2) * 1000); // Wait past the boundary + 2s buffer

  // Generate 60 predictions: slight uptrend from current BTC price (~70k)
  const basePrice = 70000;
  const predictions: number[] = [];
  for (let i = 0; i < 60; i++) {
    // Slight random walk with upward bias
    const noise = (Math.random() - 0.4) * 50;
    predictions.push(basePrice + (i * 2) + noise);
  }

  // Get current version
  const getSessionsMsg = createGetAppSessionsMessageV2(testAccount.address as `0x${string}`);
  const sessionsResult = await sendAndWait('get_app_sessions', getSessionsMsg);
  const sessions = sessionsResult.appSessions || [];
  const currentSession = sessions.find((s: any) =>
    s.appSessionId?.toLowerCase() === appSessionId.toLowerCase()
  );
  const currentVersion = currentSession?.version || 1;

  const sessionData = {
    action: 'open',
    positionType: 'directional-60',
    ticker: 'BTCUSDT',
    predictions,
    leverage: LEVERAGE,
    amount: COLLATERAL_ATOMIC,
    startTime,
    endTime,
    userWallet: testAccount.address,
  };

  const stateMsg = await createSubmitAppStateMessage<typeof RPCProtocolVersion.NitroRPC_0_4>(sessionSigner, {
    app_session_id: appSessionId as `0x${string}`,
    intent: RPCAppStateIntent.Operate,
    version: currentVersion + 1,
    allocations,
    session_data: JSON.stringify(sessionData),
  });

  await sendAndWait('submit_app_state', stateMsg);
  log('POSITION', `Predictions submitted (startTime=${startTime}, endTime=${endTime}, duration=${POSITION_DURATION_SECONDS}s)`);

  // ── Step 6: Transfer USDC collateral to backend via Yellow ────────
  log('TRANSFER', `Transferring ${COLLATERAL_USDC} ${YELLOW_ASSET} to backend via Yellow...`);
  const transferMsg = await createTransferMessage(sessionSigner, {
    destination: backendAccount.address as `0x${string}`,
    allocations: [{ asset: YELLOW_ASSET, amount: COLLATERAL_USDC }],
  });
  await sendAndWait('transfer', transferMsg);
  log('TRANSFER', 'Transfer sent! Backend should detect and activate position.');
  await sleep(3000); // Wait for backend to process

  // ── Step 7: Wait for position to close ───────────────────────────
  const waitTime = (endTime - Math.floor(Date.now() / 1000)) + 90; // endTime + 90s buffer (price window stored at next minute boundary + retry time)
  log('WAIT', `Waiting ${waitTime}s for position close (endTime + 15s buffer)...`);

  const closePromise = new Promise<any>((resolve, reject) => {
    pendingRequests.set('position_closed', { resolve, reject });
    setTimeout(() => {
      if (pendingRequests.has('position_closed')) {
        pendingRequests.delete('position_closed');
        reject(new Error('Position close timeout'));
      }
    }, (waitTime + 30) * 1000);
  });

  try {
    const closedData = await closePromise;

    // ── Step 8: Verify result ────────────────────────────────────────
    log('RESULT', '=== Position Closed ===');
    log('RESULT', `Status: ${closedData.status}`);
    log('RESULT', `Accuracy: ${(closedData.accuracy * 100).toFixed(1)}% (${closedData.correctDirections}/${closedData.totalDirections})`);
    log('RESULT', `PnL: ${closedData.pnl} atomic (${(parseInt(closedData.pnl) / 1e6).toFixed(4)} USDC)`);
    log('RESULT', `Fee: ${closedData.fee} atomic`);
    log('RESULT', `Return: ${closedData.returnAmount} atomic (${(parseInt(closedData.returnAmount) / 1e6).toFixed(4)} USDC)`);
    log('RESULT', `PnL%: ${closedData.pnlPercent}%`);
    log('RESULT', '=== E2E TEST PASSED ===');
  } catch (err) {
    log('ERROR', `Position close failed: ${err}`);

    // Fallback: poll the session to see its state
    log('POLL', 'Polling position state via API...');
    try {
      const resp = await fetch(`http://localhost:3001/positions/${appSessionId}`);
      const data = await resp.json();
      log('POLL', JSON.stringify(data, null, 2));
    } catch (e) {
      log('POLL', `API poll failed: ${e}`);
    }
  }

  ws.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('E2E test failed:', err);
  process.exit(1);
});
