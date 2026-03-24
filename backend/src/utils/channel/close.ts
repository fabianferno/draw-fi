import { webSocketService } from '../../lib/websockets';

export async function closeChannelOnChain(channelId: string): Promise<{ txHash: string }> {
    const result = await webSocketService.closeChannelOnChain(channelId);
    console.log(`Channel ${channelId} closed on-chain (tx: ${result.txHash})`);
    return result;
}
