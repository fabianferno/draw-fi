/**
 * Channel deposit utility.
 * Deposits funds into an existing channel via resize.
 */
import {
  createResizeChannelMessage,
  type MessageSigner,
} from '@erc7824/nitrolite';
import type { Address, Hex } from 'viem';

export interface DepositParams {
  channelId: Hex;
  amount: bigint;
  fundsDestination: Address;
}

/**
 * Build the RPC message to deposit (resize) a channel.
 */
export async function buildDepositMessage(
  signer: MessageSigner,
  params: DepositParams
): Promise<string> {
  return createResizeChannelMessage(signer, {
    channel_id: params.channelId,
    resize_amount: params.amount,
    funds_destination: params.fundsDestination,
  });
}
