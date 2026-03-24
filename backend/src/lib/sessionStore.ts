/**
 * In-memory session store for Yellow Network session keys.
 * Tracks the session key, signer, and expiration for the authenticated session.
 */
import type { Address, Hex } from 'viem';
import type { MessageSigner } from '@erc7824/nitrolite';

export interface SessionData {
  walletAddress: Address;
  sessionKey: Address;
  sessionSigner: MessageSigner;
  expiresAt: number; // unix timestamp
}

let currentSession: SessionData | null = null;

export function setSession(session: SessionData): void {
  currentSession = session;
  console.log(`[SessionStore] Session stored for wallet ${session.walletAddress}, expires at ${session.expiresAt}`);
}

export function getSession(): SessionData | null {
  if (!currentSession) return null;
  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (now >= currentSession.expiresAt) {
    console.log('[SessionStore] Session expired, clearing');
    currentSession = null;
    return null;
  }
  return currentSession;
}

export function clearSession(): void {
  currentSession = null;
  console.log('[SessionStore] Session cleared');
}

export function hasValidSession(): boolean {
  return getSession() !== null;
}
