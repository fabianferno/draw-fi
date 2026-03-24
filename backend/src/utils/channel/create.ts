/**
 * Channel creation utility.
 * Creates a new payment channel on Yellow Network.
 */
import {
  createCreateChannelMessage,
  type MessageSigner,
} from '@erc7824/nitrolite';
import type { Address } from 'viem';

export interface CreateChannelParams {
  chainId: number;
  tokenAddress: Address;
}

/**
 * Build the RPC message to create a new channel.
 */
export async function buildCreateChannelMessage(
  signer: MessageSigner,
  params: CreateChannelParams
): Promise<string> {
  return createCreateChannelMessage(signer, {
    chain_id: params.chainId,
    token: params.tokenAddress,
  });
}
