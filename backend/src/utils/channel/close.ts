/**
 * Channel close utility.
 * Closes an existing payment channel on Yellow Network.
 */
import {
  createCloseChannelMessage,
  type MessageSigner,
} from '@erc7824/nitrolite';
import type { Address, Hex } from 'viem';

/**
 * Build the RPC message to close a channel.
 */
export async function buildCloseChannelMessage(
  signer: MessageSigner,
  channelId: Hex,
  fundsDestination: Address
): Promise<string> {
  return createCloseChannelMessage(signer, channelId, fundsDestination);
}
