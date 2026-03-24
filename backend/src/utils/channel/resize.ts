/**
 * Channel resize utility.
 * Resizes a channel's allocation on Yellow Network.
 */
import {
  createResizeChannelMessage,
  type MessageSigner,
} from '@erc7824/nitrolite';
import type { Address, Hex } from 'viem';

export interface ResizeParams {
  channelId: Hex;
  resizeAmount?: bigint;
  allocateAmount?: bigint;
  fundsDestination: Address;
}

/**
 * Build the RPC message to resize a channel.
 */
export async function buildResizeMessage(
  signer: MessageSigner,
  params: ResizeParams
): Promise<string> {
  return createResizeChannelMessage(signer, {
    channel_id: params.channelId,
    resize_amount: params.resizeAmount,
    allocate_amount: params.allocateAmount,
    funds_destination: params.fundsDestination,
  });
}
