import { parseUnits } from 'viem';
import { webSocketService } from '../../lib/websockets';

const USDC_DECIMALS = 6;

export async function resizeChannelOnChain(
    channelId: string,
    resizeAmount?: string,
    allocateAmount?: string
): Promise<{ txHash: string }> {
    const resizeAmountBigInt = resizeAmount !== undefined
        ? parseUnits(resizeAmount, USDC_DECIMALS)
        : undefined;

    const allocateAmountBigInt = allocateAmount !== undefined
        ? parseUnits(allocateAmount, USDC_DECIMALS)
        : undefined;

    const result = await webSocketService.resizeChannelOnChain(
        channelId,
        resizeAmountBigInt,
        allocateAmountBigInt
    );

    console.log(`Channel ${channelId} resized on-chain (tx: ${result.txHash})`);
    return result;
}
