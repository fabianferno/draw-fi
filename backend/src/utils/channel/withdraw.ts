/**
 * Channel withdraw utility.
 * Withdraws funds from a channel via resize with negative amount.
 */
import {
  createResizeChannelMessage,
  type MessageSigner,
} from '@erc7824/nitrolite';
import type { Address, Hex } from 'viem';

export interface WithdrawParams {
  channelId: Hex;
  amount: bigint;
  fundsDestination: Address;
}

/**
 * Build the RPC message to withdraw from a channel.
 */
export async function buildWithdrawMessage(
  signer: MessageSigner,
  params: WithdrawParams
): Promise<string> {
  return createResizeChannelMessage(signer, {
    channel_id: params.channelId,
    allocate_amount: params.amount,
    funds_destination: params.fundsDestination,
  });
}
