/**
 * Yellow Network authentication utilities.
 * Handles session key generation, auth request/verify flow.
 */
import {
  createAuthRequestMessage,
  createAuthVerifyMessageFromChallenge,
  createEIP712AuthMessageSigner,
  createECDSAMessageSigner,
  type MessageSigner,
} from '@erc7824/nitrolite';
import { createWalletClient, http, type Hex, type Address } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { VIEM_CHAIN, PRIVATE_KEY, YELLOW_APPLICATION, YELLOW_SCOPE, YELLOW_ASSET } from '../lib/config.js';
import { setSession, type SessionData } from '../lib/sessionStore.js';

const SESSION_DURATION = 86400; // 24 hours in seconds
const DEFAULT_ALLOWANCE_AMOUNT = '1000000000000'; // large allowance for session

export interface AuthResult {
  sessionSigner: MessageSigner;
  sessionAddress: Address;
  walletAddress: Address;
  expiresAt: number;
}

/**
 * Get the wallet account from the private key.
 */
export function getWalletAccount() {
  const key = PRIVATE_KEY.startsWith('0x')
    ? PRIVATE_KEY as `0x${string}`
    : `0x${PRIVATE_KEY}` as `0x${string}`;
  return privateKeyToAccount(key);
}

/**
 * Create auth request parameters for Yellow Network.
 */
export function createAuthParams(walletAddress: Address, sessionKeyAddress: Address) {
  const expiresAt = BigInt(Math.floor(Date.now() / 1000) + SESSION_DURATION);
  return {
    address: walletAddress,
    session_key: sessionKeyAddress,
    application: YELLOW_APPLICATION,
    allowances: [{ asset: YELLOW_ASSET, amount: DEFAULT_ALLOWANCE_AMOUNT }],
    expires_at: expiresAt,
    scope: YELLOW_SCOPE,
  };
}

/**
 * Generate a new session key pair and ECDSA signer.
 */
export function generateSessionKey(): { privateKey: Hex; address: Address; signer: MessageSigner } {
  const sessionPrivateKey = generatePrivateKey();
  const sessionAccount = privateKeyToAccount(sessionPrivateKey);
  const sessionSigner = createECDSAMessageSigner(sessionPrivateKey);
  return {
    privateKey: sessionPrivateKey,
    address: sessionAccount.address,
    signer: sessionSigner,
  };
}

/**
 * Create the EIP-712 auth message signer for the wallet.
 */
export function createWalletSigner(walletAddress: Address, sessionKeyAddress: Address) {
  const key = PRIVATE_KEY.startsWith('0x')
    ? PRIVATE_KEY as `0x${string}`
    : `0x${PRIVATE_KEY}` as `0x${string}`;
  const account = privateKeyToAccount(key);
  const walletClient = createWalletClient({
    account,
    chain: VIEM_CHAIN,
    transport: http(),
  });

  const authParams = createAuthParams(walletAddress, sessionKeyAddress);

  return createEIP712AuthMessageSigner(
    walletClient as any,
    {
      scope: authParams.scope,
      session_key: authParams.session_key,
      expires_at: authParams.expires_at,
      allowances: authParams.allowances,
    },
    { name: YELLOW_APPLICATION }
  );
}

/**
 * Create the initial auth request message to send to clearnode.
 */
export async function buildAuthRequest(walletAddress: Address, sessionKeyAddress: Address): Promise<string> {
  const authParams = createAuthParams(walletAddress, sessionKeyAddress);
  return createAuthRequestMessage(authParams);
}

/**
 * Create the auth verify message from the challenge.
 */
export async function buildAuthVerify(
  walletAddress: Address,
  sessionKeyAddress: Address,
  challengeMessage: string
): Promise<string> {
  const signer = createWalletSigner(walletAddress, sessionKeyAddress);
  return createAuthVerifyMessageFromChallenge(signer, challengeMessage);
}

/**
 * Store authenticated session data.
 */
export function storeSession(result: AuthResult): void {
  const sessionData: SessionData = {
    walletAddress: result.walletAddress,
    sessionKey: result.sessionAddress,
    sessionSigner: result.sessionSigner,
    expiresAt: result.expiresAt,
  };
  setSession(sessionData);
}
