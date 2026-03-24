import { webSocketService } from '../../lib/websockets';

export interface TransferParams {
    destination: string;
    allocations: { asset: string; amount: string }[];
}

export async function transfer(params: TransferParams): Promise<{ success: boolean }> {
    const result = await webSocketService.transfer(
        params.destination,
        params.allocations
    );
    console.log(`Transfer completed to: ${params.destination}`);
    return result;
}
