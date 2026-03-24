/**
 * App session creation utility.
 * Creates a new app session on Yellow Network.
 */
import {
  createAppSessionMessage,
  type MessageSigner,
  RPCProtocolVersion,
  type RPCAppSessionAllocation,
} from '@erc7824/nitrolite';
import type { Hex } from 'viem';

export interface CreateAppSessionParams {
  participants: Hex[];
  allocations: RPCAppSessionAllocation[];
  applicationName: string;
  sessionData?: string;
}

/**
 * Build the RPC message to create a new app session.
 */
export async function buildCreateAppSessionMessage(
  signer: MessageSigner,
  params: CreateAppSessionParams
): Promise<string> {
  return createAppSessionMessage(signer, {
    definition: {
      application: params.applicationName,
      protocol: RPCProtocolVersion.NitroRPC_0_4,
      participants: params.participants,
      weights: params.participants.map(() => 1),
      quorum: params.participants.length,
      challenge: 0,
    },
    allocations: params.allocations,
    session_data: params.sessionData,
  });
}
