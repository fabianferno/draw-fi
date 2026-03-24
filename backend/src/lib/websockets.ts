import { config } from 'dotenv';
config(); // Load env vars before anything else

import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    createAuthRequestMessage,
    createAuthVerifyMessage,
    createCreateChannelMessage,
    createCloseChannelMessage,
    createResizeChannelMessage,
    createAppSessionMessage,
    createSubmitAppStateMessage,
    createCloseAppSessionMessage,
    createGetAppSessionsMessageV2,
    createTransferMessage,
    createEIP712AuthMessageSigner,
    createECDSAMessageSigner,
    AuthChallengeResponse,
    RPCMethod,
    RPCResponse,
    NitroliteClient,
    WalletStateSigner,
    Channel,
    StateIntent,
    Allocation,
    ContractAddresses,
    parseAnyRPCResponse,
    getMethod,
    State,
    RPCAppDefinition,
    RPCAppSessionAllocation,
    RPCProtocolVersion,
    RPCAppStateIntent,
    RPCAppSession,
    RPCChannelStatus
} from '@erc7824/nitrolite';
import { generateSessionKey, SessionKey } from './sessionStore';
import getContractAddresses, {
    CHAIN_ID,
    USDC_TOKEN,
    AUTH_SCOPE,
    SESSION_DURATION,
    AUTH_ALLOWANCES,
    ALCHEMY_RPC_URL,
    VIEM_CHAIN,
    getChainById
} from './config';
import { performCrossChainWithdrawal } from './cctp';
import { chainClientManager } from './chainClients';

export type WsStatus = 'Connecting' | 'Connected' | 'Authenticated' | 'Disconnected';

type StatusListener = (status: WsStatus) => void;
type MessageListener = (data: RPCResponse) => void;

// Create wallet and clients from environment
const getWallet = () => {
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error('PRIVATE_KEY environment variable is not set');
    }
    return privateKeyToAccount(privateKey.startsWith('0x') ? privateKey as `0x${string}` : `0x${privateKey}`);
};

class WebSocketService {
    private socket: WebSocket | null = null;
    private status: WsStatus = 'Disconnected';
    private statusListeners: Set<StatusListener> = new Set();
    private messageListeners: Set<MessageListener> = new Set();
    private messageQueue: string[] = [];
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 10;
    private reconnectDelay = 1000;

    // Authentication state
    private sessionKey: SessionKey | null = null;
    private sessionSigner: ReturnType<typeof createECDSAMessageSigner> | null = null;
    private walletSigner: ReturnType<typeof createECDSAMessageSigner> | null = null;
    private walletClient: any = null;
    private publicClient: any = null;
    private authResolvers: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
    private channelResolvers: Map<string, { resolve: (data: any) => void; reject: (error: Error) => void }> = new Map();
    private closeChannelResolvers: Map<string, { resolve: (data: any) => void; reject: (error: Error) => void }> = new Map();
    private resizeChannelResolvers: Map<string, { resolve: (data: any) => void; reject: (error: Error) => void }> = new Map();
    private appSessionResolvers: Map<string, { resolve: (data: any) => void; reject: (error: Error) => void }> = new Map();
    private submitAppStateResolvers: Map<string, { resolve: (data: any) => void; reject: (error: Error) => void }> = new Map();
    private closeAppSessionResolvers: Map<string, { resolve: (data: any) => void; reject: (error: Error) => void }> = new Map();
    private getAppSessionsResolvers: Map<string, { resolve: (data: any) => void; reject: (error: Error) => void }> = new Map();
    private transferResolvers: Map<string, { resolve: (data: any) => void; reject: (error: Error) => void }> = new Map();

    // Hook for PositionScheduler — set from index.ts after initialization
    public onDirectional60Open: ((params: any, sessionData: any) => Promise<void>) | null = null;
    public onDirectional60Transfer: ((senderAddress: string, receivedAmount: string, sessions: any[]) => Promise<boolean>) | null = null;

    // Track channel IDs by chain ID for cross-chain operations
    private channelIdsByChain: Map<number, string> = new Map();

    constructor() {
        // Initialize immediately when the module loads
        this.initialize();
    }

    private async initialize() {
        try {
            const wallet = getWallet();

            this.walletClient = createWalletClient({
                account: wallet,
                chain: VIEM_CHAIN,
                transport: http(ALCHEMY_RPC_URL),
            });

            this.publicClient = createPublicClient({
                chain: VIEM_CHAIN,
                transport: http(ALCHEMY_RPC_URL),
            });

            // Always generate a fresh session key - never store
            this.sessionKey = generateSessionKey();
            this.sessionSigner = createECDSAMessageSigner(this.sessionKey.privateKey);
            // Wallet signer for channel operations (create, close, resize)
            const walletPrivateKey = process.env.PRIVATE_KEY;
            if (walletPrivateKey) {
                const pk = walletPrivateKey.startsWith('0x') ? walletPrivateKey as `0x${string}` : `0x${walletPrivateKey}` as `0x${string}`;
                this.walletSigner = createECDSAMessageSigner(pk);
            }

            console.log('🔧 WebSocket service initialized');
            console.log(`📍 Wallet address: ${wallet.address}`);
            console.log(`🔑 Session key: ${this.sessionKey.address}`);

            // Connect and authenticate
            this.connect();
        } catch (error) {
            console.error('❌ Failed to initialize WebSocket service:', error);
        }
    }

    public connect() {
        if (this.socket && this.socket.readyState < 2) return;

        const wsUrl = process.env.YELLOW_NODE_URL;

        if (!wsUrl) {
            console.error('YELLOW_NODE_URL is not set');
            this.updateStatus('Disconnected');
            return;
        }

        console.log('🔌 Connecting to Yellow clearnet...');
        this.updateStatus('Connecting');

        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
            console.log('🔌 WebSocket Connected');
            this.updateStatus('Connected');
            this.reconnectAttempts = 0;

            // Send any queued messages
            this.messageQueue.forEach((msg) => this.socket?.send(msg));
            this.messageQueue = [];

            // Start authentication
            this.startAuthentication();
        };

        this.socket.onmessage = (event) => {
            try {
                console.log('📩 Raw message received:', event.data);
                // Parse the message using SDK utilities
                const data = parseAnyRPCResponse(event.data);
                const rawMessage = JSON.parse(event.data);
                const method = getMethod(rawMessage);
                console.log('📩 Parsed message method:', method);
                console.log('📩 Parsed data:', data);
                this.handleMessage(data, method);
                this.messageListeners.forEach((listener) => listener(data));
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        };

        this.socket.onclose = () => {
            console.log('🔌 WebSocket Disconnected');
            this.updateStatus('Disconnected');
            this.scheduleReconnect();
        };

        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.updateStatus('Disconnected');
        };
    }

    private scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('❌ Max reconnect attempts reached');
            this.authResolvers.forEach(({ reject }) => reject(new Error('Max reconnect attempts reached')));
            this.authResolvers = [];
            return;
        }

        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
        this.reconnectAttempts++;

        console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
        setTimeout(() => this.connect(), delay);
    }

    private async startAuthentication() {
        if (!this.sessionKey || !this.walletClient) {
            console.error('❌ Cannot authenticate: session key or wallet not initialized');
            return;
        }

        const wallet = getWallet();
        const sessionExpireTimestamp = BigInt(Math.floor(Date.now() / 1000) + SESSION_DURATION);

        const authMessage = await createAuthRequestMessage({
            address: wallet.address,
            session_key: this.sessionKey.address,
            application: AUTH_SCOPE,
            allowances: AUTH_ALLOWANCES,
            expires_at: sessionExpireTimestamp,
            scope: 'median.app',
        });

        console.log('📤 Sending auth request...');
        this.send(authMessage);
    }

    private async handleMessage(message: RPCResponse, method?: string) {
        // Use the extracted method if available
        const messageMethod = method || message.method;
        console.log('🔄 Handling message with method:', messageMethod);

        switch (messageMethod) {
            case RPCMethod.AuthChallenge:
            case 'auth_challenge':
                await this.handleAuthChallenge(message as AuthChallengeResponse);
                break;

            case RPCMethod.AuthVerify:
            case 'auth_verify':
                this.handleAuthVerify(message);
                break;

            case RPCMethod.CreateChannel:
            case 'create_channel':
                this.handleCreateChannel(message);
                break;

            case RPCMethod.CloseChannel:
            case 'close_channel':
                this.handleCloseChannel(message);
                break;

            case RPCMethod.ResizeChannel:
            case 'resize_channel':
                this.handleResizeChannel(message);
                break;

            case RPCMethod.CreateAppSession:
            case 'create_app_session':
                this.handleCreateAppSession(message);
                break;

            case RPCMethod.SubmitAppState:
            case 'submit_app_state':
                this.handleSubmitAppState(message);
                break;

            case 'asu':
                this.handleAppStateUpdate(message);
                break;

            case RPCMethod.CloseAppSession:
            case 'close_app_session':
                this.handleCloseAppSession(message);
                break;

            case RPCMethod.GetAppSessions:
            case 'get_app_sessions':
                this.handleGetAppSessions(message);
                break;

            case RPCMethod.Transfer:
            case 'transfer':
            case 'tr':
                this.handleTransfer(message);
                break;

            case RPCMethod.Error:
            case 'error':
                console.error('❌ RPC Error:', message.params);
                // Retry authentication on invalid challenge or signature
                if (
                    message.params &&
                    typeof (message.params as any).error === 'string' &&
                    (message.params as any).error.includes('invalid challenge or signature')
                ) {
                    console.log('🔄 Invalid challenge or signature — retrying authentication in 5 seconds...');
                    setTimeout(() => this.startAuthentication(), 5000);
                    break;
                }
                // Reject any pending resolvers
                this.channelResolvers.forEach(({ reject }) => reject(new Error(JSON.stringify(message.params))));
                this.channelResolvers.clear();
                this.closeChannelResolvers.forEach(({ reject }) => reject(new Error(JSON.stringify(message.params))));
                this.closeChannelResolvers.clear();
                this.resizeChannelResolvers.forEach(({ reject }) => reject(new Error(JSON.stringify(message.params))));
                this.resizeChannelResolvers.clear();
                this.appSessionResolvers.forEach(({ reject }) => reject(new Error(JSON.stringify(message.params))));
                this.appSessionResolvers.clear();
                this.submitAppStateResolvers.forEach(({ reject }) => reject(new Error(JSON.stringify(message.params))));
                this.submitAppStateResolvers.clear();
                this.closeAppSessionResolvers.forEach(({ reject }) => reject(new Error(JSON.stringify(message.params))));
                this.closeAppSessionResolvers.clear();
                this.getAppSessionsResolvers.forEach(({ reject }) => reject(new Error(JSON.stringify(message.params))));
                this.getAppSessionsResolvers.clear();
                this.transferResolvers.forEach(({ reject }) => reject(new Error(JSON.stringify(message.params))));
                this.transferResolvers.clear();
                break;

            default:
                console.log('📩 Unhandled message method:', messageMethod);
                break;
        }
    }

    private async handleAuthChallenge(message: AuthChallengeResponse) {
        console.log('🔐 Received auth challenge');

        if (!this.sessionKey || !this.walletClient) {
            console.error('❌ Cannot handle auth challenge: missing session key or wallet');
            return;
        }

        const wallet = getWallet();
        const sessionExpireTimestamp = BigInt(Math.floor(Date.now() / 1000) + SESSION_DURATION);

        const authParams = {
            scope: 'median.app',
            application: wallet.address,
            participant: this.sessionKey.address,
            expire: sessionExpireTimestamp,
            allowances: AUTH_ALLOWANCES,
            session_key: this.sessionKey.address,
            expires_at: sessionExpireTimestamp,
        };

        const eip712Signer = createEIP712AuthMessageSigner(this.walletClient, authParams, { name: AUTH_SCOPE });
        const authVerifyMessage = await createAuthVerifyMessage(eip712Signer, message);

        console.log('📤 Sending auth verification...');
        this.send(authVerifyMessage);
    }

    private handleAuthVerify(message: RPCResponse) {
        const params = message.params as { success?: boolean };
        if (params.success) {
            console.log('✅ Authentication successful');
            this.updateStatus('Authenticated');

            // Resolve all pending auth promises
            this.authResolvers.forEach(({ resolve }) => resolve());
            this.authResolvers = [];
        } else {
            console.error('❌ Authentication failed:', message.params);
            this.authResolvers.forEach(({ reject }) => reject(new Error('Authentication failed')));
            this.authResolvers = [];
        }
    }

    private handleCreateChannel(message: RPCResponse) {
        console.log('🧬 Channel created successfully!');
        console.log('\n📋 Channel Details:');
        console.log('Channel', message);
        const params = message.params as { channel?: { participants?: any[] } };
        console.log("Participants", params.channel?.participants);

        // Resolve all pending channel promises with the message
        this.channelResolvers.forEach(({ resolve }) => resolve(message.params));
        this.channelResolvers.clear();
    }

    private handleCloseChannel(message: RPCResponse) {
        console.log('🔒 Close channel approved by server!');
        console.log('Close channel response:', message);

        // Resolve all pending close channel promises with the message
        this.closeChannelResolvers.forEach(({ resolve }) => resolve(message.params));
        this.closeChannelResolvers.clear();
    }

    private handleResizeChannel(message: RPCResponse) {
        console.log('📐 Resize channel approved by server!');
        console.log('Resize channel response:', message);

        // Resolve all pending resize channel promises with the message
        this.resizeChannelResolvers.forEach(({ resolve }) => resolve(message.params));
        this.resizeChannelResolvers.clear();
    }

    private handleCreateAppSession(message: RPCResponse) {
        console.log('🎮 App session created successfully!');
        console.log('App session response:', message);

        // Resolve all pending app session promises with the message
        this.appSessionResolvers.forEach(({ resolve }) => resolve(message.params));
        this.appSessionResolvers.clear();
    }

    private handleSubmitAppState(message: RPCResponse) {
        console.log('📊 App state submitted successfully!');
        console.log('Submit app state response:', message);

        // Resolve all pending submit app state promises with the message
        this.submitAppStateResolvers.forEach(({ resolve }) => resolve(message.params));
        this.submitAppStateResolvers.clear();
    }

    private handleCloseAppSession(message: RPCResponse) {
        console.log('🏁 App session closed successfully!');
        console.log('Close app session response:', message);

        // Resolve all pending close app session promises with the message
        this.closeAppSessionResolvers.forEach(({ resolve }) => resolve(message.params));
        this.closeAppSessionResolvers.clear();
    }

    private handleGetAppSessions(message: RPCResponse) {
        console.log('📋 App sessions retrieved successfully!');
        console.log('Get app sessions response:', message);

        // Resolve all pending get app sessions promises with the message
        this.getAppSessionsResolvers.forEach(({ resolve }) => resolve(message.params));
        this.getAppSessionsResolvers.clear();
    }

    private async handleAppStateUpdate(message: RPCResponse) {
        console.log('🔄 Received App State Update (asu)');
        const params = message.params as any;

        // Check if we have session data to process
        if (!params.sessionData) return;

        try {
            const sessionData = JSON.parse(params.sessionData);
            console.log('📦 Processing session data:', sessionData);

            // Check if this is a CROSS-CHAIN WITHDRAWAL
            if (sessionData.action === 'crossChainWithdrawal' && sessionData.status !== 'completed' && sessionData.status !== 'failed') {
                await this.handleCrossChainWithdrawal(params, sessionData);
                return;
            }

            // Check if this is a DIRECTIONAL-60 position
            if (sessionData.positionType === 'directional-60') {
                if (sessionData.status === 'filled' || sessionData.status === 'closed') {
                    console.log('Skipping already processed directional-60 state:', sessionData.status);
                    return;
                }
                if (sessionData.action === 'open' && this.onDirectional60Open) {
                    await this.onDirectional60Open(params, sessionData);
                }
                return;
            }

            // Check if this is a PERPETUAL position (has tradePair field, not market)
            const isPerpetual = sessionData.positionId && sessionData.tradePair;

            if (isPerpetual) {
                // Skip already processed states
                if (sessionData.status === "filled" || sessionData.status === "closed") {
                    console.log('📦 Skipping already processed perpetual state:', sessionData.status);
                    return;
                }

                // Handle PERPETUAL positions - open
                if (sessionData.action === "open") {
                    await this.handleOpenPerpPosition(params, sessionData);
                    return;
                }

                // Handle PERPETUAL positions - close (entryPrice can be 0, so check !== undefined)
                if (sessionData.action === "close" && sessionData.entryPrice !== undefined) {
                    await this.handleClosePerpPosition(params, sessionData);
                    return;
                }

                console.log('📦 Unhandled perpetual action:', sessionData.action);
                return;
            }

            // SPOT TRADING: Avoid infinite loops - only process if user initiated "action" and not yet "filled"
            if (sessionData.action && !sessionData.executionStatus) {
                console.log('🤖 Detected spot trade action, executing...');

                const market = sessionData.market; // e.g., "AAPL/USDC" or "AAPL/TSLA"
                if (!market) {
                    console.log('📦 No market field, skipping spot trade processing');
                    return;
                }

                // Parse market format: TARGET/PAYMENT
                const [targetTicker, paymentTicker] = market.split('/');
                const paymentAsset = sessionData.paymentAsset || paymentTicker;

                console.log(`🔄 Processing ${market} trade (${targetTicker} with ${paymentAsset})`);

                // 1. Fetch target asset price
                const targetPrice = await this.fetchPrice(targetTicker);
                if (!targetPrice || targetPrice <= 0) {
                    console.error(`❌ Unable to fetch valid price for ${targetTicker}`);
                    return;
                }
                console.log(`📈 Target price for ${targetTicker}: $${targetPrice}`);

                // 2. Fetch payment asset price
                let paymentPrice = 1.0; // Default for USDC
                if (paymentAsset.toUpperCase() !== 'USDC') {
                    paymentPrice = await this.fetchPrice(paymentAsset);
                    if (!paymentPrice || paymentPrice <= 0) {
                        console.error(`❌ Unable to fetch valid price for ${paymentAsset}`);
                        return;
                    }
                }
                console.log(`📈 Payment price for ${paymentAsset}: $${paymentPrice}`);

                // 3. Calculate exchange based on both prices
                // Get payment amount from session data
                const payAmountAtomic = BigInt(sessionData.payAmountAtomic || sessionData.amount || '0');
                const decimals = paymentAsset.toUpperCase() === 'USDC' ? 6 : 18;
                const payAmount = Number(payAmountAtomic) / Math.pow(10, decimals);

                // Calculate value in USD
                const payValueUSD = payAmount * paymentPrice;

                // Calculate target stock quantity
                const targetStockQty = payValueUSD / targetPrice;

                console.log(`🔄 Stock-for-Stock Trade Calculation:`);
                console.log(`   Paying: ${payAmount} ${paymentAsset} @ $${paymentPrice}`);
                console.log(`   Value: $${payValueUSD}`);
                console.log(`   Receiving: ${targetStockQty} ${targetTicker} @ $${targetPrice}`);

                // 4. Submit filled state
                const executionData = {
                    ...sessionData,
                    executionStatus: 'filled',
                    paymentAsset: paymentAsset,
                    paymentPrice: paymentPrice,
                    paymentAmount: payAmount,
                    filledPrice: targetPrice,
                    filledQuantity: targetStockQty,
                    totalValueUSD: payValueUSD,
                    timestamp: Date.now()
                };

                const appSessionId = params.appSessionId;

                // Reconstruct allocations (using 0 as requested/current state)
                const allocations = params.participantAllocations?.map((p: any) => ({
                    participant: p.participant,
                    asset: p.asset,
                    amount: p.amount
                })) || [];

                // Use the helper to submit
                await this.submitAppState(
                    appSessionId,
                    allocations, // Keep existing allocations
                    RPCAppStateIntent.Operate,
                    executionData
                );
            }
        } catch (error) {
            console.error('❌ Error processing AS update:', error);
        }
    }

    // Helper to fetch price - tries Bybit for crypto, Finnhub for stocks
    private async fetchPrice(ticker: string): Promise<number> {
        const upperTicker = ticker.toUpperCase();

        // Known crypto tickers - use Bybit
        const cryptoTickers = ['BTC', 'ETH', 'SOL', 'LINK', 'SUI', 'DOGE', 'XRP', 'AVAX', 'ATOM', 'ADA', 'DOT', 'LTC', 'ARB', 'OP', 'PEPE', 'WIF', 'BONK', 'SEI', 'APT', 'FIL', 'NEAR', 'INJ', 'TIA'];
        const isCrypto = cryptoTickers.includes(upperTicker);

        if (isCrypto) {
            // Use Bybit API for crypto
            try {
                const symbol = `${upperTicker}USDT`;
                const response = await fetch(
                    `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`
                );
                const data = await response.json() as { result?: { list?: Array<{ lastPrice?: string }> } };
                const price = parseFloat(data.result?.list?.[0]?.lastPrice || '0');
                if (price > 0) {
                    console.log(`📈 Bybit price for ${ticker}: $${price}`);
                    return price;
                }
            } catch (err) {
                console.error('Failed to fetch Bybit price:', err);
            }
        }

        // Try Finnhub for stocks
        const apiKey = process.env.FINNHUB_API_KEY;
        if (!apiKey) {
            console.error('❌ FINNHUB_API_KEY is not set in environment variables');
        } else {
            try {
                const url = `https://finnhub.io/api/v1/quote?symbol=${upperTicker}&token=${apiKey}`;
                console.log(`🔍 Fetching Finnhub quote for ${upperTicker}...`);
                const response = await fetch(url);

                if (!response.ok) {
                    console.error(`❌ Finnhub API error: ${response.status} ${response.statusText}`);
                } else {
                    const data = await response.json() as { c: number; d: number; dp: number; h: number; l: number; o: number; pc: number };
                    console.log(`📊 Finnhub response for ${upperTicker}:`, JSON.stringify(data));

                    if (data.c > 0) {
                        console.log(`📈 Finnhub price for ${upperTicker}: $${data.c}`);
                        return data.c;
                    } else {
                        console.warn(`⚠️ Finnhub returned zero/null price for ${upperTicker}`);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch Finnhub price:', err);
            }
        }

        // Fallback mock price
        console.warn(`⚠️ Could not fetch price for ${ticker}, using mock price $100`);
        return 100;
    }

    private async handleOpenPerpPosition(params: any, sessionData: any) {
        console.log('📈 Processing OPEN perpetual position:', sessionData.positionId);

        const ticker = sessionData.ticker;
        const leverage = sessionData.leverage;
        const amountAtomic = parseInt(sessionData.amount);
        const collateral = amountAtomic / 1_000_000; // Convert to USDC
        const positionType = sessionData.type; // "long" or "short"

        // Fetch current price
        const entryPrice = await this.fetchPrice(ticker);

        // Calculate position details
        const positionSize = (collateral * leverage) / entryPrice;

        // Calculate liquidation price
        // For long: liq = entry * (1 - 1/leverage + maintenance_margin)
        // For short: liq = entry * (1 + 1/leverage - maintenance_margin)
        const maintenanceMargin = 0.005; // 0.5%
        const liquidationPrice = positionType === "long"
            ? entryPrice * (1 - (1 / leverage) + maintenanceMargin)
            : entryPrice * (1 + (1 / leverage) - maintenanceMargin);

        // Submit filled state
        const filledData = {
            ...sessionData,
            status: "filled",
            entryPrice,
            positionSize,
            liquidationPrice,
            filledAt: Date.now()
        };

        const appSessionId = params.appSessionId;
        const allocations = params.participantAllocations?.map((p: any) => ({
            participant: p.participant,
            asset: p.asset,
            amount: p.amount
        })) || [];

        await this.submitAppState(
            appSessionId,
            allocations,
            RPCAppStateIntent.Operate,
            filledData
        );

        console.log(`✅ Position ${sessionData.positionId} filled at $${entryPrice}`);
    }

    private async handleClosePerpPosition(params: any, sessionData: any) {
        console.log('📉 Processing CLOSE perpetual position:', sessionData.positionId);

        const ticker = sessionData.ticker;
        const leverage = sessionData.leverage;
        const amountAtomic = parseInt(sessionData.amount);
        const collateral = amountAtomic / 1_000_000;
        const positionType = sessionData.type;
        const entryPrice = sessionData.entryPrice;
        const userWallet = sessionData.userWallet;

        // Fetch current/exit price
        const exitPrice = await this.fetchPrice(ticker);

        // Calculate PnL
        // Long: PnL = collateral * leverage * (exitPrice - entryPrice) / entryPrice
        // Short: PnL = collateral * leverage * (entryPrice - exitPrice) / entryPrice
        let priceChange = 0;
        let pnl = 0;
        let pnlPercent = 0;

        if (entryPrice > 0) {
            priceChange = positionType === "long"
                ? (exitPrice - entryPrice) / entryPrice
                : (entryPrice - exitPrice) / entryPrice;
            pnl = collateral * leverage * priceChange;
            pnlPercent = priceChange * leverage * 100;
        } else {
            console.warn('⚠️ Entry price is 0, cannot calculate PnL');
        }

        const returnAmount = Math.max(0, collateral + pnl); // Can't go below 0 (liquidation)
        const returnAmountAtomic = Math.floor(returnAmount * 1_000_000).toString();

        console.log(`🧮 PnL Calculation:`);
        console.log(`   Entry: $${entryPrice}, Exit: $${exitPrice}`);
        console.log(`   Price change: ${(priceChange * 100).toFixed(2)}%`);
        console.log(`   Leveraged PnL: ${pnlPercent.toFixed(2)}%`);
        console.log(`   Collateral: $${collateral}, PnL: $${pnl.toFixed(2)}`);
        console.log(`   Return: $${returnAmount.toFixed(2)}`);

        // Submit closed state
        const closedData = {
            ...sessionData,
            status: "closed",
            exitPrice,
            pnl: pnl.toFixed(2),
            pnlPercent: pnlPercent.toFixed(2),
            returnAmount: returnAmountAtomic,
            closedAt: Date.now()
        };

        const appSessionId = params.appSessionId;
        const allocations = params.participantAllocations?.map((p: any) => ({
            participant: p.participant,
            asset: p.asset,
            amount: p.amount
        })) || [];

        await this.submitAppState(
            appSessionId,
            allocations,
            RPCAppStateIntent.Operate,
            closedData
        );

        // Transfer return amount to user
        if (returnAmount > 0) {
            console.log(`💸 Transferring $${returnAmount.toFixed(2)} USDC to ${userWallet}`);
            await this.transfer(userWallet, [
                {
                    asset: 'usdc',
                    amount: returnAmount.toString() // Human-readable format
                }
            ]);
        }

        console.log(`✅ Position ${sessionData.positionId} closed. PnL: $${pnl.toFixed(2)}`);
    }

    /**
     * Handle cross-chain withdrawal via CCTP
     * Delegates to performCrossChainWithdrawal in cctp.ts
     */
    private async handleCrossChainWithdrawal(params: any, sessionData: any) {
        console.log('🌉 Processing cross-chain withdrawal...');
        console.log('   Session data:', JSON.stringify(sessionData, null, 2));

        const { sourceChainId, destChainId, amount, userWallet } = sessionData;

        // Perform the cross-chain withdrawal
        const result = await performCrossChainWithdrawal(
            { sourceChainId, destChainId, amount, userWallet },
            {
                getOrCreateChannelForChain: this.getOrCreateChannelForChain.bind(this),
                resizeChannelOnChain: this.resizeChannelOnChain.bind(this),
            }
        );

        // Update app state with result
        if (result.success) {
            console.log(`✅ Cross-chain withdrawal complete!`);
            await this.updateCrossChainStatus(params, sessionData, 'completed', undefined, result.txHash);
        } else {
            console.error('❌ Cross-chain withdrawal failed:', result.error);
            await this.updateCrossChainStatus(params, sessionData, 'failed', result.error);
        }
    }

    /**
     * Helper to update cross-chain withdrawal status in app state
     */
    private async updateCrossChainStatus(
        params: any,
        sessionData: any,
        status: 'completed' | 'failed',
        error?: string,
        bridgeTxHash?: string
    ) {
        const updatedData = {
            ...sessionData,
            status,
            ...(error && { error }),
            ...(bridgeTxHash && { bridgeTxHash }),
            updatedAt: Date.now(),
        };

        const allocations = params.participantAllocations?.map((p: any) => ({
            participant: p.participant,
            asset: p.asset,
            amount: p.amount
        })) || [];

        await this.submitAppState(
            params.appSessionId,
            allocations,
            RPCAppStateIntent.Operate,
            updatedData
        );
    }

    private async handleTransfer(message: RPCResponse) {
        console.log('💸 Transfer received!');
        console.log('Transfer response:', JSON.stringify(message, null, 2));

        // Resolve all pending transfer promises with the message
        this.transferResolvers.forEach(({ resolve }) => resolve(message.params));
        this.transferResolvers.clear();

        // Handle incoming transfers - send stock tokens back to buyer
        try {
            const params = message.params as any;

            // Extract the sender address and asset from the transfer message
            const transactions = params.transactions || [];
            if (transactions.length === 0) {
                console.log('📋 No transactions in transfer message, skipping response');
                return;
            }

            const transaction = transactions[0];
            const senderAddress = transaction.fromAccount || transaction.from_account;
            const receivedAsset = transaction.asset || 'USDC'; // Asset received from sender
            const receivedAmount = transaction.amount;

            if (!senderAddress) {
                console.log('📋 No sender address found in transfer message, skipping response');
                return;
            }

            // Don't respond to our own outgoing transfers
            const wallet = getWallet();
            if (senderAddress.toLowerCase() === wallet.address.toLowerCase()) {
                console.log('📋 Transfer is outgoing, no response needed');
                return;
            }

            console.log(`📋 Received ${receivedAmount} ${receivedAsset} from ${senderAddress}`);

            // Check for directional-60 position funding before spot trade logic
            if (this.onDirectional60Transfer) {
                const sessions = await this.getAppSessions();
                const matched = await this.onDirectional60Transfer(senderAddress, receivedAmount, sessions);
                if (matched) return; // Matched directional-60 position, don't fall through to spot logic
            }

            // Get app sessions to find the one matching this transfer
            const sessions = await this.getAppSessions();

            // Find a session that expects this payment asset from this sender
            let matchingSession = null;
            let sessionData = null;

            for (const session of sessions) {
                const sessionObj = session as any;
                const participants = sessionObj.participants || [];
                const isParticipant = participants.some(
                    (p: string) => p.toLowerCase() === senderAddress.toLowerCase()
                );

                // Look for session_data (snake_case) or sessionData (camelCase)
                const rawSessionData = sessionObj.session_data || sessionObj.sessionData;

                if (rawSessionData) {
                    try {
                        const data = typeof rawSessionData === 'string'
                            ? JSON.parse(rawSessionData)
                            : rawSessionData;

                        // Check if this session expects this payment asset from this participant
                        const expectedPaymentAsset = data.paymentAsset || 'USDC';
                        if (data.executionStatus === 'filled' &&
                            expectedPaymentAsset.toUpperCase() === receivedAsset.toUpperCase() &&
                            isParticipant) {
                            matchingSession = session;
                            sessionData = data;
                            console.log(`📋 Found matching session: ${sessionObj.appSessionId}`);
                            console.log(`   Expected: ${expectedPaymentAsset}, Received: ${receivedAsset}`);
                            console.log(`   Market: ${data.market}`);
                            break;
                        }
                    } catch (e) {
                        console.log('📋 Could not parse session_data:', e);
                    }
                }
            }

            if (!matchingSession || !sessionData) {
                console.log('📋 No matching session found for this transfer');
                return;
            }

            // Send the target stock tokens to buyer
            const market = sessionData.market || 'AAPL/USDC';
            const targetTicker = market.split('/')[0].toUpperCase();
            const targetAmount = String(sessionData.filledQuantity);

            console.log(`💸 Sending ${targetAmount} ${targetTicker} to ${senderAddress}`);

            await this.transfer(senderAddress, [
                {
                    asset: targetTicker,
                    amount: targetAmount
                }
            ]);

            console.log(`✅ Trade completed: ${receivedAmount} ${receivedAsset} → ${targetAmount} ${targetTicker}`);

        } catch (error) {
            console.error('❌ Error processing transfer and sending tokens:', error);
        }
    }

    public send(payload: string) {
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(payload);
        } else {
            this.messageQueue.push(payload);
        }
    }

    private updateStatus(newStatus: WsStatus) {
        this.status = newStatus;
        this.statusListeners.forEach((listener) => listener(this.status));
    }

    public getStatus(): WsStatus {
        return this.status;
    }

    public isAuthenticated(): boolean {
        return this.status === 'Authenticated';
    }

    /**
     * Wait for authentication to complete
     * Returns immediately if already authenticated
     */
    public waitForAuth(): Promise<void> {
        if (this.status === 'Authenticated') {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            this.authResolvers.push({ resolve, reject });
        });
    }

    /**
     * Create a channel for USDC on Base
     * Waits for authentication if not already authenticated
     */
    public async createChannel(): Promise<any> {
        await this.waitForAuth();

        if (!this.walletSigner) {
            throw new Error('Wallet signer not initialized');
        }

        const createChannelMessage = await createCreateChannelMessage(this.walletSigner, {
            chain_id: CHAIN_ID,
            token: USDC_TOKEN,
        });

        console.log('📤 Creating channel for USDC on Base...');

        return new Promise((resolve, reject) => {
            const id = Date.now().toString();
            this.channelResolvers.set(id, { resolve, reject });
            this.send(createChannelMessage);

            // Timeout after 30 seconds
            setTimeout(() => {
                if (this.channelResolvers.has(id)) {
                    this.channelResolvers.delete(id);
                    reject(new Error('Channel creation timeout'));
                }
            }, 30000);
        });
    }

    /**
     * Create a NitroliteClient for on-chain operations
     */
    public getNitroliteClient(): NitroliteClient | null {
        if (!this.walletClient || !this.publicClient) {
            return null;
        }

        return new NitroliteClient({
            walletClient: this.walletClient,
            publicClient: this.publicClient as any,
            stateSigner: new WalletStateSigner(this.walletClient),
            addresses: getContractAddresses() as ContractAddresses,
            chainId: CHAIN_ID,
            challengeDuration: 3600n,
        });
    }

    /**
     * Create channel and submit to chain
     */
    public async createChannelOnChain(): Promise<{ channelId: string; txHash: string }> {
        const channelData = await this.createChannel();

        const nitroliteClient = this.getNitroliteClient();
        if (!nitroliteClient) {
            throw new Error('NitroliteClient not initialized');
        }

        const { channelId, txHash } = await nitroliteClient.createChannel({
            channel: channelData.channel as unknown as Channel,
            unsignedInitialState: {
                intent: channelData.state.intent as StateIntent,
                version: BigInt(channelData.state.version),
                data: channelData.state.stateData as `0x${string}`,
                allocations: channelData.state.allocations as Allocation[],
            },
            serverSignature: channelData.serverSignature as `0x${string}`,
        });

        console.log(`🧬 Channel ${channelId} created on-chain (tx: ${txHash})`);
        return { channelId, txHash };
    }

    /**
     * Get or create a channel for a specific chain
     * Used for cross-chain operations that need to interact with specific chains
     * Creates the channel both via WebSocket AND on-chain
     * @param chainId - The chain ID to get/create a channel for
     * @returns The channel ID
     */
    public async getOrCreateChannelForChain(chainId: number): Promise<string> {
        // Check if we already have a channel for this chain
        const existingChannelId = this.channelIdsByChain.get(chainId);
        if (existingChannelId) {
            console.log(`📋 Using existing channel for chain ${chainId}: ${existingChannelId}`);
            return existingChannelId;
        }

        // Get chain configuration
        const chainConfig = getChainById(chainId);
        if (!chainConfig) {
            throw new Error(`Unsupported chain ID: ${chainId}`);
        }

        await this.waitForAuth();

        if (!this.walletSigner) {
            throw new Error('Wallet signer not initialized');
        }

        // Helper to create channel via WebSocket
        const createChannelViaWebSocket = async (): Promise<any> => {
            console.log(`🧬 Creating channel for ${chainConfig.name} (${chainId})...`);

            const createChannelMessage = await createCreateChannelMessage(this.walletSigner!, {
                chain_id: chainId,
                token: chainConfig.usdcToken,
            });

            return new Promise<any>((resolve, reject) => {
                const id = Date.now().toString();
                this.channelResolvers.set(id, { resolve, reject });
                this.send(createChannelMessage);

                // Timeout after 30 seconds
                setTimeout(() => {
                    if (this.channelResolvers.has(id)) {
                        this.channelResolvers.delete(id);
                        reject(new Error(`Channel creation timeout for chain ${chainId}`));
                    }
                }, 30000);
            });
        };

        let channelData: any;
        let channelId: string;
        let needsOnChainCreation = true;

        try {
            channelData = await createChannelViaWebSocket();
            channelId = channelData.channel?.channelId || channelData.channelId;
            if (!channelId) {
                throw new Error(`No channel ID in response for chain ${chainId}`);
            }
        } catch (error) {
            const errorStr = String(error);
            // Check if channel already exists with broker
            const existingChannelMatch = errorStr.match(/already exists: (0x[a-fA-F0-9]+)/);
            if (existingChannelMatch) {
                channelId = existingChannelMatch[1];
                console.log(`📋 Using existing channel with broker: ${channelId}`);
                // Channel already exists, no need to create on-chain
                needsOnChainCreation = false;
            } else {
                throw error;
            }
        }

        // Only create on-chain if this is a new channel
        if (needsOnChainCreation && channelData) {
            console.log(`📝 Submitting channel ${channelId} to ${chainConfig.name} on-chain...`);
            const nitroliteClient = chainClientManager.getNitroliteClient(chainId);

            const { txHash } = await nitroliteClient.createChannel({
                channel: channelData.channel as unknown as Channel,
                unsignedInitialState: {
                    intent: channelData.state.intent as StateIntent,
                    version: BigInt(channelData.state.version),
                    data: channelData.state.stateData as `0x${string}`,
                    allocations: channelData.state.allocations as Allocation[],
                },
                serverSignature: channelData.serverSignature as `0x${string}`,
            });

            console.log(`✅ Channel ${channelId} created on-chain on ${chainConfig.name} (tx: ${txHash})`);

            // Wait 10 seconds for the channel to be indexed
            console.log(`⏳ Waiting 10 seconds for channel to be indexed...`);
            await new Promise(resolve => setTimeout(resolve, 10000));
        }

        // Store the channel ID for future use
        this.channelIdsByChain.set(chainId, channelId);

        return channelId;
    }

    /**
     * Close a channel - sends close request via WebSocket and executes on-chain
     */
    public async closeChannelOnChain(channelId: string): Promise<{ txHash: string }> {
        await this.waitForAuth();

        if (!this.walletSigner) {
            throw new Error('Wallet signer not initialized');
        }

        const wallet = getWallet();

        console.log(`🔒 Requesting channel close for: ${channelId}`);

        // Send close channel message via WebSocket
        const closeMessage = await createCloseChannelMessage(
            this.walletSigner,
            channelId as `0x${string}`,
            wallet.address
        );

        // Wait for server approval
        const closeData = await new Promise<any>((resolve, reject) => {
            const id = Date.now().toString();
            this.closeChannelResolvers.set(id, { resolve, reject });
            this.send(closeMessage);

            // Timeout after 30 seconds
            setTimeout(() => {
                if (this.closeChannelResolvers.has(id)) {
                    this.closeChannelResolvers.delete(id);
                    reject(new Error('Close channel timeout'));
                }
            }, 30000);
        });

        console.log('✅ Close approved by server, executing on-chain...');

        // Execute close on-chain
        const nitroliteClient = this.getNitroliteClient();
        if (!nitroliteClient) {
            throw new Error('NitroliteClient not initialized');
        }

        const txHash = await nitroliteClient.closeChannel({
            finalState: {
                intent: closeData.state.intent as StateIntent,
                channelId: closeData.channelId as `0x${string}`,
                data: closeData.state.stateData as `0x${string}`,
                allocations: closeData.state.allocations as Allocation[],
                version: BigInt(closeData.state.version),
                serverSignature: closeData.serverSignature as `0x${string}`,
            },
            stateData: closeData.state.stateData as `0x${string}`,
        });

        console.log(`🔒 Channel ${channelId} closed on-chain (tx: ${txHash})`);
        return { txHash };
    }

    /**
     * Resize a channel - sends resize request via WebSocket and executes on-chain
     * @param channelId - The channel ID to resize
     * @param resizeAmount - Amount to add/remove from channel (positive=custody→channel, negative=channel→custody)
     * @param allocateAmount - Amount to allocate/deallocate (positive=channel→unified, negative=unified→channel)
     * @param chainId - Optional chain ID to use chain-specific NitroliteClient
     */
    public async resizeChannelOnChain(
        channelId: string,
        resizeAmount?: bigint,
        allocateAmount?: bigint,
        chainId?: number
    ): Promise<{ txHash: string }> {
        await this.waitForAuth();

        if (!this.walletSigner) {
            throw new Error('Wallet signer not initialized');
        }

        const wallet = getWallet();
        const fundsDestination = wallet.address;

        console.log(`📐 Requesting channel resize for: ${channelId}`);
        if (resizeAmount !== undefined) {
            console.log(`   Resize amount: ${resizeAmount.toString()}`);
        }
        if (allocateAmount !== undefined) {
            console.log(`   Allocate amount: ${allocateAmount.toString()}`);
        }

        // Helper function to attempt resize
        const attemptResize = async (): Promise<any> => {
            const resizeMessage = await createResizeChannelMessage(this.walletSigner!, {
                channel_id: channelId as `0x${string}`,
                ...(resizeAmount !== undefined && { resize_amount: resizeAmount }),
                ...(allocateAmount !== undefined && { allocate_amount: allocateAmount }),
                funds_destination: fundsDestination,
            });

            return new Promise<any>((resolve, reject) => {
                const id = Date.now().toString();
                this.resizeChannelResolvers.set(id, { resolve, reject });
                this.send(resizeMessage);

                // Timeout after 30 seconds
                setTimeout(() => {
                    if (this.resizeChannelResolvers.has(id)) {
                        this.resizeChannelResolvers.delete(id);
                        reject(new Error('Resize channel timeout'));
                    }
                }, 30000);
            });
        };

        // Try resize with retry on "channel not found"
        let resizeData: any;
        try {
            resizeData = await attemptResize();
        } catch (error) {
            const errorStr = String(error);
            if (errorStr.includes('not found')) {
                console.log(`⏳ Channel not found, waiting 1 second and retrying...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                resizeData = await attemptResize();
            } else {
                throw error;
            }
        }

        console.log('✅ Resize approved by server, executing on-chain...');

        // Execute resize on-chain - use chain-specific client if chainId provided
        const nitroliteClient = chainId
            ? chainClientManager.getNitroliteClient(chainId)
            : this.getNitroliteClient();
        if (!nitroliteClient) {
            throw new Error('NitroliteClient not initialized');
        }

        // Fetch previous state for proof
        const previousState = await nitroliteClient.getChannelData(channelId as `0x${string}`);
        console.log('📋 Previous state fetched for proof');

        const { txHash } = await nitroliteClient.resizeChannel({
            resizeState: {
                channelId: resizeData.channelId as `0x${string}`,
                intent: resizeData.state.intent as StateIntent,
                version: BigInt(resizeData.state.version),
                data: resizeData.state.stateData as `0x${string}`,
                allocations: resizeData.state.allocations as Allocation[],
                serverSignature: resizeData.serverSignature as `0x${string}`,
            },
            proofStates: [previousState.lastValidState as State],
        });

        console.log(`📐 Channel ${channelId} resized on-chain (tx: ${txHash})`);
        return { txHash };
    }

    /**
     * Create a multi-party app session
     * @param participants - Array of participant addresses (including self)
     * @param allocations - Initial allocations for each participant
     * @param applicationName - Name of the application
     */
    public async createAppSession(
        participants: string[],
        allocations: { participant: string; asset: string; amount: string }[],
        applicationName: string = 'Median App'
    ): Promise<{ appSessionId: string }> {
        await this.waitForAuth();

        if (!this.sessionSigner) {
            throw new Error('Session signer not initialized');
        }

        console.log(`🎮 Creating app session for: ${applicationName}`);
        console.log(`   Participants: ${participants.join(', ')}`);

        // Each participant gets equal weight, quorum set to single participant weight
        // so only one party needs to sign
        const singleWeight = Math.floor(100 / participants.length);
        const definition: RPCAppDefinition = {
            protocol: RPCProtocolVersion.NitroRPC_0_4,
            participants: participants as `0x${string}`[],
            weights: participants.map(() => singleWeight),
            quorum: singleWeight, // Only one party needs to agree
            challenge: 0,
            nonce: Date.now(),
            application: applicationName,
        };

        const rpcAllocations: RPCAppSessionAllocation[] = allocations.map(a => ({
            participant: a.participant as `0x${string}`,
            asset: a.asset,
            amount: a.amount,
        }));

        const sessionMessage = await createAppSessionMessage(this.sessionSigner, {
            definition,
            allocations: rpcAllocations,
        });

        // Wait for server response
        const sessionData = await new Promise<any>((resolve, reject) => {
            const id = Date.now().toString();
            this.appSessionResolvers.set(id, { resolve, reject });
            this.send(sessionMessage);

            // Timeout after 30 seconds
            setTimeout(() => {
                if (this.appSessionResolvers.has(id)) {
                    this.appSessionResolvers.delete(id);
                    reject(new Error('Create app session timeout'));
                }
            }, 30000);
        });

        console.log(`🎮 App session created: ${sessionData.appSessionId}`);
        return { appSessionId: sessionData.appSessionId };
    }

    /**
     * Submit updated state for an app session
     * @param appSessionId - The app session ID
     * @param allocations - Updated allocations
     * @param intent - The state intent (default: Operate)
     * @param sessionData - Optional JSON payload to include with state update
     */
    public async submitAppState(
        appSessionId: string,
        allocations: { participant: string; asset: string; amount: string }[],
        intent: RPCAppStateIntent = RPCAppStateIntent.Operate,
        sessionData?: Record<string, unknown>
    ): Promise<{ success: boolean }> {
        await this.waitForAuth();

        if (!this.sessionSigner) {
            throw new Error('Session signer not initialized');
        }

        // Get current version from the app session
        const currentVersion = await this.getAppSessionVersion(appSessionId);
        const newVersion = currentVersion + 1;

        console.log(`📊 Submitting state update for session: ${appSessionId}`);
        console.log(`   Current version: ${currentVersion}, submitting version: ${newVersion}`);

        const rpcAllocations: RPCAppSessionAllocation[] = allocations.map(a => ({
            participant: a.participant as `0x${string}`,
            asset: a.asset,
            amount: a.amount,
        }));

        const stateMessage = await createSubmitAppStateMessage<typeof RPCProtocolVersion.NitroRPC_0_4>(this.sessionSigner, {
            app_session_id: appSessionId as `0x${string}`,
            intent,
            version: newVersion,
            allocations: rpcAllocations,
            ...(sessionData && { session_data: JSON.stringify(sessionData) }),
        });

        // Wait for server response
        await new Promise<any>((resolve, reject) => {
            const id = Date.now().toString();
            this.submitAppStateResolvers.set(id, { resolve, reject });
            this.send(stateMessage);

            // Timeout after 30 seconds
            setTimeout(() => {
                if (this.submitAppStateResolvers.has(id)) {
                    this.submitAppStateResolvers.delete(id);
                    reject(new Error('Submit app state timeout'));
                }
            }, 30000);
        });

        console.log(`📊 App state updated for session: ${appSessionId}`);
        return { success: true };
    }

    /**
     * Close an app session with final allocations
     * @param appSessionId - The app session ID
     * @param allocations - Final allocations
     */
    public async closeAppSession(
        appSessionId: string,
        allocations: { participant: string; asset: string; amount: string }[]
    ): Promise<{ success: boolean }> {
        await this.waitForAuth();

        if (!this.sessionSigner) {
            throw new Error('Session signer not initialized');
        }

        console.log(`🏁 Closing app session: ${appSessionId}`);

        const rpcAllocations: RPCAppSessionAllocation[] = allocations.map(a => ({
            participant: a.participant as `0x${string}`,
            asset: a.asset,
            amount: a.amount,
        }));

        const closeMessage = await createCloseAppSessionMessage(this.sessionSigner, {
            app_session_id: appSessionId as `0x${string}`,
            allocations: rpcAllocations,
        });

        // Wait for server response
        await new Promise<any>((resolve, reject) => {
            const id = Date.now().toString();
            this.closeAppSessionResolvers.set(id, { resolve, reject });
            this.send(closeMessage);

            // Timeout after 30 seconds
            setTimeout(() => {
                if (this.closeAppSessionResolvers.has(id)) {
                    this.closeAppSessionResolvers.delete(id);
                    reject(new Error('Close app session timeout'));
                }
            }, 30000);
        });

        console.log(`🏁 App session closed: ${appSessionId}`);
        return { success: true };
    }

    /**
     * Get app sessions for a participant
     * @param participant - The participant address (optional, defaults to wallet address)
     * @param status - Optional status filter (defaults to undefined = all statuses)
     */
    public async getAppSessions(participant?: string, status?: RPCChannelStatus): Promise<RPCAppSession[]> {
        await this.waitForAuth();

        const wallet = getWallet();
        const participantAddress = (participant || wallet.address) as `0x${string}`;

        console.log(`📋 Getting app sessions for: ${participantAddress}${status ? ` (status: ${status})` : ' (all statuses)'}`);

        const getSessionsMessage = createGetAppSessionsMessageV2(participantAddress, status);

        // Wait for server response
        const sessionsData = await new Promise<any>((resolve, reject) => {
            const id = Date.now().toString();
            this.getAppSessionsResolvers.set(id, { resolve, reject });
            this.send(getSessionsMessage);

            // Timeout after 30 seconds
            setTimeout(() => {
                if (this.getAppSessionsResolvers.has(id)) {
                    this.getAppSessionsResolvers.delete(id);
                    reject(new Error('Get app sessions timeout'));
                }
            }, 30000);
        });

        console.log(`📋 Raw sessions response:`, JSON.stringify(sessionsData, null, 2));
        console.log(`📋 Found ${sessionsData.appSessions?.length || 0} app sessions`);
        return sessionsData.appSessions || [];
    }

    /**
     * Get the current version for an app session
     * @param appSessionId - The app session ID
     */
    public async getAppSessionVersion(appSessionId: string): Promise<number> {
        const sessions = await this.getAppSessions();
        console.log(`📋 Looking for session ${appSessionId} in ${sessions.length} sessions`);
        console.log(`📋 Available sessions:`, sessions.map((s: RPCAppSession) => ({ id: s.appSessionId, version: s.version })));

        const session = sessions.find((s: RPCAppSession) =>
            s.appSessionId.toLowerCase() === appSessionId.toLowerCase()
        );
        if (!session) {
            throw new Error(`App session not found: ${appSessionId}`);
        }
        return session.version;
    }

    /**
     * Transfer funds to another participant
     * @param destination - The destination address
     * @param allocations - Array of allocations with asset and amount
     */
    public async transfer(
        destination: string,
        allocations: { asset: string; amount: string }[]
    ): Promise<{ success: boolean }> {
        await this.waitForAuth();

        if (!this.sessionSigner) {
            throw new Error('Session signer not initialized');
        }

        console.log(`💸 Initiating transfer to: ${destination}`);
        console.log(`   Allocations:`, allocations);

        const transferMessage = await createTransferMessage(this.sessionSigner, {
            destination: destination as `0x${string}`,
            allocations: allocations.map(a => ({
                asset: a.asset,
                amount: a.amount,
            })),
        });

        // Wait for server response
        await new Promise<any>((resolve, reject) => {
            const id = Date.now().toString();
            this.transferResolvers.set(id, { resolve, reject });
            this.send(transferMessage);

            // Timeout after 30 seconds
            setTimeout(() => {
                if (this.transferResolvers.has(id)) {
                    this.transferResolvers.delete(id);
                    reject(new Error('Transfer timeout'));
                }
            }, 30000);
        });

        console.log(`💸 Transfer completed to: ${destination}`);
        return { success: true };
    }

    public addStatusListener(listener: StatusListener) {
        this.statusListeners.add(listener);
        listener(this.status);
    }

    public removeStatusListener(listener: StatusListener) {
        this.statusListeners.delete(listener);
    }

    public addMessageListener(listener: MessageListener) {
        this.messageListeners.add(listener);
    }

    public removeMessageListener(listener: MessageListener) {
        this.messageListeners.delete(listener);
    }

    public getSessionKey(): SessionKey | null {
        return this.sessionKey;
    }
}

export const webSocketService = new WebSocketService();