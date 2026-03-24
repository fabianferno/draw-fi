/**
 * Transfer utility.
 * Transfers funds between accounts on Yellow Network.
 */
import {
  createTransferMessage,
  type MessageSigner,
  type RPCTransferAllocation,
} from '@erc7824/nitrolite';
import type { Address } from 'viem';

export interface TransferParams {
  destination: Address;
  allocations: RPCTransferAllocation[];
}

/**
 * Build the RPC message to transfer funds.
 */
export async function buildTransferMessage(
  signer: MessageSigner,
  params: TransferParams
): Promise<string> {
  return createTransferMessage(signer, {
    destination: params.destination,
    allocations: params.allocations,
  });
}
