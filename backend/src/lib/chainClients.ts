import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia, sepolia, hardhat } from 'viem/chains';
import { NitroliteClient, WalletStateSigner } from '@erc7824/nitrolite';
import { SUPPORTED_CHAINS, getChainById, type ChainConfig } from './config';

// Map chain IDs to viem chain objects
const viemChains = {
    8453: base,
    84532: baseSepolia,
    11155111: sepolia,
    31337: hardhat,
} as const;

interface ChainClients {
    publicClient: PublicClient;
    walletClient: WalletClient;
    nitroliteClient: NitroliteClient;
    config: ChainConfig;
}

/**
 * Manages NitroliteClient instances for multiple chains
 * Uses singleton pattern to reuse clients across the application
 */
class ChainClientManager {
    private clients: Map<number, ChainClients> = new Map();
    private wallet: ReturnType<typeof privateKeyToAccount> | null = null;

    private getWallet() {
        if (!this.wallet) {
            const privateKey = process.env.PRIVATE_KEY;
            if (!privateKey) {
                throw new Error('PRIVATE_KEY environment variable is not set');
            }
            this.wallet = privateKeyToAccount(
                privateKey.startsWith('0x') ? privateKey as `0x${string}` : `0x${privateKey}`
            );
        }
        return this.wallet;
    }

    /**
     * Get or create clients for a specific chain
     */
    getClients(chainId: number): ChainClients {
        if (this.clients.has(chainId)) {
            return this.clients.get(chainId)!;
        }

        const chainConfig = getChainById(chainId);
        const viemChain = viemChains[chainId as keyof typeof viemChains];

        if (!chainConfig) {
            throw new Error(`Unsupported chain ID: ${chainId}`);
        }
        if (!viemChain) {
            throw new Error(`No viem chain definition for chain ID: ${chainId}`);
        }

        const wallet = this.getWallet();

        console.log(`🔧 Initializing clients for ${chainConfig.name} (${chainId})`);

        const publicClient = createPublicClient({
            chain: viemChain,
            transport: http(chainConfig.rpcUrl),
        });

        const walletClient = createWalletClient({
            account: wallet,
            chain: viemChain,
            transport: http(chainConfig.rpcUrl),
        });

        const nitroliteClient = new NitroliteClient({
            walletClient: walletClient as any,
            publicClient: publicClient as any,
            stateSigner: new WalletStateSigner(walletClient as any),
            addresses: {
                custody: chainConfig.custody,
                adjudicator: chainConfig.adjudicator,
            },
            chainId,
            challengeDuration: 3600n,
        });

        const clients: ChainClients = {
            publicClient: publicClient as PublicClient,
            walletClient: walletClient as WalletClient,
            nitroliteClient,
            config: chainConfig,
        };

        this.clients.set(chainId, clients);
        console.log(`✅ Clients initialized for ${chainConfig.name}`);

        return clients;
    }

    /**
     * Get NitroliteClient for a specific chain
     */
    getNitroliteClient(chainId: number): NitroliteClient {
        return this.getClients(chainId).nitroliteClient;
    }

    /**
     * Get the backend wallet address
     */
    getWalletAddress(): `0x${string}` {
        return this.getWallet().address;
    }

    /**
     * Check token allowance on a specific chain
     */
    async getTokenAllowance(chainId: number): Promise<bigint> {
        const { nitroliteClient, config } = this.getClients(chainId);
        try {
            return await nitroliteClient.getTokenAllowance(config.usdcToken);
        } catch (error) {
            console.warn(`Failed to get allowance on chain ${chainId}:`, error);
            return 0n;
        }
    }

    /**
     * Approve tokens on a specific chain
     */
    async approveTokens(chainId: number, amount: bigint): Promise<string> {
        const { nitroliteClient, config } = this.getClients(chainId);
        console.log(`📝 Approving ${amount} USDC on ${config.name}...`);
        const hash = await nitroliteClient.approveTokens(config.usdcToken, amount);
        console.log(`✅ Approved on ${config.name}: ${hash}`);
        return hash;
    }

    /**
     * Deposit to custody on a specific chain
     */
    async depositToCustody(chainId: number, amount: bigint): Promise<string> {
        const { nitroliteClient, config } = this.getClients(chainId);
        console.log(`📥 Depositing ${amount} USDC to custody on ${config.name}...`);
        const hash = await nitroliteClient.deposit(config.usdcToken, amount);
        console.log(`✅ Deposited on ${config.name}: ${hash}`);
        return hash;
    }

    /**
     * Withdraw from custody on a specific chain
     */
    async withdrawFromCustody(chainId: number, amount: bigint): Promise<string> {
        const { nitroliteClient, config } = this.getClients(chainId);
        console.log(`📤 Withdrawing ${amount} USDC from custody on ${config.name}...`);
        const hash = await nitroliteClient.withdrawal(config.usdcToken, amount);
        console.log(`✅ Withdrew on ${config.name}: ${hash}`);
        return hash;
    }

    /**
     * Get account balance in custody on a specific chain
     */
    async getCustodyBalance(chainId: number): Promise<bigint> {
        const { nitroliteClient, config } = this.getClients(chainId);
        try {
            return await nitroliteClient.getAccountBalance(config.usdcToken);
        } catch (error) {
            console.warn(`Failed to get custody balance on chain ${chainId}:`, error);
            return 0n;
        }
    }
}

// Export singleton instance
export const chainClientManager = new ChainClientManager();
