import { webSocketService } from '../../lib/websockets';

export interface CreateAppSessionParams {
    participants: string[];
    allocations: { participant: string; asset: string; amount: string }[];
    applicationName?: string;
}

export async function createAppSession(params: CreateAppSessionParams): Promise<{ appSessionId: string }> {
    const result = await webSocketService.createAppSession(
        params.participants,
        params.allocations,
        params.applicationName || 'Median App'
    );
    console.log(`App session created: ${result.appSessionId}`);
    return result;
}
