import { config } from 'dotenv';
config();

import { base, baseSepolia, sepolia, hardhat } from 'viem/chains';

const CONFIGURED_CHAIN_ID = parseInt(process.env.CHAIN_ID || '11155111', 10);
export const CHAIN_ID = CONFIGURED_CHAIN_ID;

// Chain-specific defaults
const CHAIN_DEFAULTS: Record<number, { usdc: string; rpc: string; custody: string; adjudicator: string }> = {
    8453: {
        usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        rpc: `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY || ''}`,
        custody: '0x490fb189DdE3a01B00be9BA5F41e3447FbC838b6',
        adjudicator: '0xcbbc03a873c11beeFA8D99477E830be48d8Ae6D7',
    },
    84532: {
        usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        rpc: process.env.ETHEREUM_RPC_URL || 'https://sepolia.base.org',
        custody: process.env.CUSTODY_ADDRESS || '0x0000000000000000000000000000000000000000',
        adjudicator: process.env.ADJUDICATOR_ADDRESS || '0x0000000000000000000000000000000000000000',
    },
    11155111: {
        usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
        rpc: process.env.ETHEREUM_RPC_URL || 'https://rpc.sepolia.org',
        custody: process.env.CUSTODY_ADDRESS || '0x0000000000000000000000000000000000000000',
        adjudicator: process.env.ADJUDICATOR_ADDRESS || '0x0000000000000000000000000000000000000000',
    },
    31337: {
        usdc: '0xbD24c53072b9693A35642412227043Ffa5fac382',
        rpc: process.env.ETHEREUM_RPC_URL || 'http://localhost:8545',
        custody: process.env.CUSTODY_ADDRESS || '0x8658501c98C3738026c4e5c361c6C3fa95DfB255',
        adjudicator: process.env.ADJUDICATOR_ADDRESS || '0xcbbc03a873c11beeFA8D99477E830be48d8Ae6D7',
    },
};

const chainDefaults = CHAIN_DEFAULTS[CONFIGURED_CHAIN_ID] || CHAIN_DEFAULTS[31337];

export const USDC_TOKEN = (process.env.USDC_TOKEN || chainDefaults.usdc) as `0x${string}`;
export const AUTH_SCOPE = 'Median App';
export const SESSION_DURATION = 3600; // 1 hour in seconds

// RPC configuration
export const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || '';
export const ALCHEMY_RPC_URL = process.env.ETHEREUM_RPC_URL || chainDefaults.rpc;

// Viem chain object
const VIEM_CHAIN_MAP: Record<number, any> = {
    8453: base,
    84532: baseSepolia,
    11155111: sepolia,
    31337: hardhat,
};
export const VIEM_CHAIN = VIEM_CHAIN_MAP[CONFIGURED_CHAIN_ID] || hardhat;

// Chain configuration
const CHAIN_NAMES: Record<number, string> = { 8453: 'Base', 84532: 'Base Sepolia', 11155111: 'Sepolia', 31337: 'Anvil' };
export const SUPPORTED_CHAINS = {
    base: {
        id: CONFIGURED_CHAIN_ID,
        name: CHAIN_NAMES[CONFIGURED_CHAIN_ID] || 'Sepolia',
        rpcUrl: ALCHEMY_RPC_URL,
        usdcToken: USDC_TOKEN,
        custody: (process.env.CUSTODY_ADDRESS || chainDefaults.custody) as `0x${string}`,
        adjudicator: (process.env.ADJUDICATOR_ADDRESS || chainDefaults.adjudicator) as `0x${string}`,
    },
} as const;

export type ChainConfig = typeof SUPPORTED_CHAINS[keyof typeof SUPPORTED_CHAINS];

export function getChainById(chainId: number): ChainConfig | undefined {
    return Object.values(SUPPORTED_CHAINS).find(c => c.id === chainId);
}

export function getChainByName(name: keyof typeof SUPPORTED_CHAINS): ChainConfig {
    return SUPPORTED_CHAINS[name];
}

export const YELLOW_ASSET = process.env.YELLOW_ASSET || 'usdc';
export const AUTH_ALLOWANCES = [
    { asset: YELLOW_ASSET, amount: '100000000000' },
];

export default function getContractAddresses() {
    return {
        custody: SUPPORTED_CHAINS.base.custody,
        adjudicator: SUPPORTED_CHAINS.base.adjudicator,
    }
}