/**
 * App state submission utility.
 * Submits state updates to an app session on Yellow Network.
 */
import {
  createSubmitAppStateMessage,
  type MessageSigner,
  RPCAppStateIntent,
  RPCProtocolVersion,
  type RPCAppSessionAllocation,
} from '@erc7824/nitrolite';
import type { Hex } from 'viem';

export interface SubmitAppStateParams {
  appSessionId: Hex;
  intent: RPCAppStateIntent;
  version: number;
  allocations: RPCAppSessionAllocation[];
  sessionData?: string;
}

/**
 * Build the RPC message to submit app state.
 */
export async function buildSubmitAppStateMessage(
  signer: MessageSigner,
  params: SubmitAppStateParams
): Promise<string> {
  return createSubmitAppStateMessage<typeof RPCProtocolVersion.NitroRPC_0_4>(signer, {
    app_session_id: params.appSessionId,
    intent: params.intent,
    version: params.version,
    allocations: params.allocations,
    session_data: params.sessionData,
  });
}
