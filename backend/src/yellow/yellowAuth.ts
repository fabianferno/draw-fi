/**
 * Yellow Network authentication
 * Uses backend wallet (or dedicated Yellow key) for relayer session
 */
import {
  createAuthRequestMessage,
  createAuthVerifyMessageFromChallenge,
  createEIP712AuthMessageSigner,
  createECDSAMessageSigner,
  createGetLedgerBalancesMessage,
  createGetLedgerTransactionsMessage,
  createTransferMessage,
} from '@erc7824/nitrolite';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { base } from 'viem/chains';
import type { Hex, Address } from 'viem';
import { YellowClient } from './yellowClient.js';
import logger from '../utils/logger.js';
import config from '../config/config.js';

const APPLICATION_NAME = 'Draw-Fi';
const SCOPE = 'drawfi.app';

export interface YellowSession {
  sessionSigner: ReturnType<typeof createECDSAMessageSigner>;
  sessionAddress: Address;
}

export interface LedgerBalance {
  asset: string;
  amount: string;
}

let yellowClient: YellowClient | null = null;
let session: YellowSession | null = null;

function getYellowClient(): YellowClient {
  if (!yellowClient) {
    yellowClient = new YellowClient();
  }
  return yellowClient;
}

function getPrivateKey(): Hex {
  const key = config.yellowPrivateKey || config.ethereumPrivateKey;
  if (!key) throw new Error('YELLOW_RELAYER_PRIVATE_KEY or ETHEREUM_PRIVATE_KEY required for Yellow');
  return key.replace(/^0x/, '').length === 64 ? (`0x${key.replace(/^0x/, '')}` as Hex) : (key as Hex);
}

async function ensureSession(): Promise<YellowSession> {
  if (session) return session;

  const client = getYellowClient();
  await client.connect();

  const privateKey = getPrivateKey();
  const account = privateKeyToAccount(privateKey as Hex);
  const sessionPrivateKey = generatePrivateKey();
  const sessionAccount = privateKeyToAccount(sessionPrivateKey);
  const sessionSigner = createECDSAMessageSigner(sessionPrivateKey as Hex);

  const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 86400); // 24h
  const authParams = {
    address: account.address,
    session_key: sessionAccount.address,
    application: APPLICATION_NAME,
    allowances: [{ asset: config.yellowAsset, amount: '1000000000000' }],
    expires_at: expiresAt,
    scope: SCOPE,
  };

  const authMessage = await createAuthRequestMessage(authParams);
  const response = await client.sendAndWait(authMessage);
  const method = Array.isArray(response.res) ? response.res[1] : undefined;
  const params = (Array.isArray(response.res) ? response.res[2] : {}) as Record<string, unknown>;

  if (method === 'error') {
    throw new Error((params?.error as string) || 'Yellow auth error');
  }
  if (method !== 'auth_challenge' || !params?.challenge_message) {
    throw new Error('Yellow auth: unexpected response');
  }

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(config.ethereumRpcUrl),
  });
  const signer = createEIP712AuthMessageSigner(
    walletClient as never,
    { ...authParams, session_key: sessionAccount.address },
    { name: APPLICATION_NAME }
  );
  const verifyMsg = await createAuthVerifyMessageFromChallenge(
    signer,
    params.challenge_message as string
  );
  const verifyResponse = await client.sendAndWait(verifyMsg);
  const verifyMethod = Array.isArray(verifyResponse.res) ? verifyResponse.res[1] : undefined;
  const verifyParams = (Array.isArray(verifyResponse.res) ? verifyResponse.res[2] : {}) as Record<string, unknown>;

  if (verifyMethod === 'error') {
    throw new Error((verifyParams?.error as string) || 'Yellow auth verify failed');
  }
  if (verifyMethod !== 'auth_verify' || !verifyParams?.success) {
    throw new Error('Yellow auth did not complete');
  }

  session = { sessionSigner, sessionAddress: sessionAccount.address };
  logger.info('Yellow session authenticated');
  return session;
}

/** Get Yellow network config (chains, contracts, broker) - public, no auth */
export async function getYellowConfig(): Promise<Record<string, unknown>> {
  try {
    const client = getYellowClient();
    await client.connect();
    const msg = createGetConfigMessageV2();
    const response = await client.sendAndWait(msg);
    const method = Array.isArray(response.res) ? response.res[1] : undefined;
    const params = Array.isArray(response.res) ? response.res[2] : undefined;
    if (method === 'get_config' && params) return params as Record<string, unknown>;
    if ((response as { error?: { message: string } }).error) {
      throw new Error((response as { error: { message: string } }).error.message);
    }
  } catch (e) {
    logger.warn('Yellow getConfig failed', { error: e });
  }
  return {};
}

// V2 doesn't need signer for get_config
function createGetConfigMessageV2(): string {
  const requestId = Math.floor(Math.random() * 1e9);
  const timestamp = Math.floor(Date.now() / 1000);
  return JSON.stringify({
    req: [requestId, 'get_config', {}, timestamp],
  });
}

/** Get ledger balances for an account - requires authenticated session. Returns [] if Yellow not configured. */
export async function getLedgerBalances(accountAddress: Address): Promise<LedgerBalance[]> {
  if (!config.yellowPrivateKey && !config.ethereumPrivateKey) return [];
  try {
    const { sessionSigner } = await ensureSession();
    const client = getYellowClient();
    const msg = await createGetLedgerBalancesMessage(sessionSigner, accountAddress);
    const response = await client.sendAndWait(msg);
    const method = Array.isArray(response.res) ? response.res[1] : undefined;
    const params = Array.isArray(response.res) ? response.res[2] : undefined;
    if (method === 'get_ledger_balances' && params?.balances) {
      return (params.balances as { asset: string; amount: string }[]).map((b) => ({
        asset: b.asset,
        amount: b.amount,
      }));
    }
    if ((response as { error?: { message: string } }).error) {
      throw new Error((response as { error: { message: string } }).error.message);
    }
  } catch (e) {
    logger.warn('Yellow getLedgerBalances failed', { error: e });
  }
  return [];
}

/** Get deposit address (our wallet address - receives Yellow transfers) */
export function getDepositAddress(): Address {
  const privateKey = getPrivateKey();
  const account = privateKeyToAccount(privateKey as Hex);
  return account.address;
}

/** Get ledger transactions for our account (for deposit polling) */
export async function getLedgerTransactions(
  accountId: string,
  filters?: { tx_type?: string; asset?: string; limit?: number; offset?: number; sort?: string }
): Promise<Array<{ id: number; tx_type: string; from_account: string; to_account: string; asset: string; amount: string; created_at: Date }>> {
  try {
    const { sessionSigner } = await ensureSession();
    const client = getYellowClient();
    const msg = await createGetLedgerTransactionsMessage(sessionSigner, accountId, filters as never);
    const response = await client.sendAndWait(msg);
    const method = Array.isArray(response.res) ? response.res[1] : undefined;
    const params = Array.isArray(response.res) ? response.res[2] : undefined;
    if (method === 'get_ledger_transactions' && params?.transactions) {
      return (params.transactions as Array<{
        id: number;
        tx_type: string;
        from_account: string;
        to_account: string;
        asset: string;
        amount: string;
        created_at: string | Date;
      }>).map((t) => ({
        ...t,
        created_at: typeof t.created_at === 'string' ? new Date(t.created_at) : t.created_at,
      }));
    }
  } catch (e) {
    logger.warn('getLedgerTransactions failed', { error: e });
  }
  return [];
}

/** Transfer from our Yellow balance to user (payout) */
export async function transferToUser(
  destination: Address,
  allocations: Array<{ asset: string; amount: string }>
): Promise<boolean> {
  try {
    const { sessionSigner } = await ensureSession();
    const client = getYellowClient();
    const msg = await createTransferMessage(sessionSigner, { destination, allocations });
    const response = await client.sendAndWait(msg);
    const method = Array.isArray(response.res) ? response.res[1] : undefined;
    const params = Array.isArray(response.res) ? response.res[2] : undefined;
    if (method === 'transfer') return true;
    if (method === 'error') {
      logger.error('Yellow transfer failed', params);
      return false;
    }
  } catch (e) {
    logger.error('Yellow transfer failed', e);
  }
  return false;
}

export function closeYellowSession(): void {
  if (yellowClient) {
    yellowClient.disconnect();
    yellowClient = null;
  }
  session = null;
}
