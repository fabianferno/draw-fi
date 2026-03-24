import { base, baseSepolia, hardhat, sepolia } from 'viem/chains';
import type { Chain } from 'viem';

// Chain configuration - supports base, baseSepolia, hardhat (31337), sepolia (11155111)
const CHAIN_MAP: Record<string, Chain> = {
  base,
  baseSepolia,
  hardhat,
  sepolia,
};

export const VIEM_CHAIN: Chain = CHAIN_MAP[process.env.VIEM_CHAIN || 'base'] || base;

export const YELLOW_WS_URL = process.env.YELLOW_WS_URL || 'wss://clearnet.yellow.com/ws';
export const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
export const YELLOW_APPLICATION = process.env.YELLOW_APPLICATION || 'Draw-Fi';
export const YELLOW_SCOPE = process.env.YELLOW_SCOPE || 'drawfi.app';
export const YELLOW_ASSET = process.env.YELLOW_ASSET || 'usdc';
export const PORT = parseInt(process.env.PORT || '3001', 10);
export const HOST = process.env.HOST || '0.0.0.0';

// CCTP config
export const CCTP_DOMAIN = parseInt(process.env.CCTP_DOMAIN || '6', 10);
export const CCTP_TOKEN_MESSENGER = process.env.CCTP_TOKEN_MESSENGER || '0xBd3fa81B58Ba92a82136038B25aDec7066af3155';
export const CCTP_MESSAGE_TRANSMITTER = process.env.CCTP_MESSAGE_TRANSMITTER || '0x0a992d191deec32afe36203ad87d7d289a738f81';
export const USDC_ADDRESS = process.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
