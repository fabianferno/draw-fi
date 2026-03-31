import { webSocketService } from '../../lib/websockets';
import { RPCAppStateIntent } from '@erc7824/nitrolite';

export interface SubmitAppStateParams {
    appSessionId: string;
    allocations: { participant: string; asset: string; amount: string }[];
    sessionData?: Record<string, unknown>;
    intent?: 'operate' | 'deposit' | 'withdraw';
}

export async function submitAppState(params: SubmitAppStateParams): Promise<{ success: boolean }> {
    const intentMap: Record<string, RPCAppStateIntent> = {
        operate: RPCAppStateIntent.Operate,
        deposit: RPCAppStateIntent.Deposit,
        withdraw: RPCAppStateIntent.Withdraw,
    };
    const intent = params.intent ? intentMap[params.intent] : RPCAppStateIntent.Operate;

    const result = await webSocketService.submitAppState(
        params.appSessionId,
        params.allocations,
        intent,
        params.sessionData
    );
    console.log(`App state submitted for session: ${params.appSessionId}`);
    return result;
}
