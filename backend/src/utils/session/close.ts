/**
 * App session close utility.
 * Closes an app session on Yellow Network.
 */
import {
  createCloseAppSessionMessage,
  type MessageSigner,
  type RPCAppSessionAllocation,
} from '@erc7824/nitrolite';
import type { Hex } from 'viem';

/**
 * Build the RPC message to close an app session.
 */
export async function buildCloseAppSessionMessage(
  signer: MessageSigner,
  appSessionId: Hex,
  allocations: RPCAppSessionAllocation[],
  sessionData?: string
): Promise<string> {
  return createCloseAppSessionMessage(signer, {
    app_session_id: appSessionId,
    allocations,
    session_data: sessionData,
  });
}
