import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type PublicClient,
  type WalletClient,
  type Chain,
} from 'viem';
import { baseSepolia, base } from 'viem/chains';
import { getYellowChainId, getRpcUrl } from './constants';

const CHAIN_MAP: Record<number, Chain> = {
  84532: baseSepolia,
  8453: base,
};

export function getYellowChain(): Chain {
  const chainId = getYellowChainId();
  return CHAIN_MAP[chainId] || baseSepolia;
}

export function createYellowPublicClient(): PublicClient {
  const chain = getYellowChain();
  const rpcUrl = getRpcUrl();
  return createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
}

export function createYellowWalletClient(
  // Privy's EIP-1193 provider type doesn't exactly match viem's strict EIP1193Provider
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eip1193Provider: { request: (...args: any[]) => Promise<any> },
  account: `0x${string}`,
): WalletClient {
  const chain = getYellowChain();
  return createWalletClient({
    account,
    chain,
    transport: custom(eip1193Provider),
  });
}
