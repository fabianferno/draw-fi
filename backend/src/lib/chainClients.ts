import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient, type Chain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia, hardhat, sepolia } from 'viem/chains';
import { VIEM_CHAIN, PRIVATE_KEY } from './config.js';

// Map of supported chains
const viemChains: Record<number, Chain> = {
  8453: base,
  84532: baseSepolia,
  31337: hardhat,
  11155111: sepolia,
};

export function getChain(): Chain {
  return VIEM_CHAIN;
}

export function getPublicClient(): PublicClient {
  const chain = getChain();
  return createPublicClient({
    chain,
    transport: http(),
  });
}

export function getWalletClient(): WalletClient {
  const chain = getChain();
  const account = privateKeyToAccount(
    PRIVATE_KEY.startsWith('0x')
      ? PRIVATE_KEY as `0x${string}`
      : `0x${PRIVATE_KEY}` as `0x${string}`
  );
  return createWalletClient({
    account,
    chain,
    transport: http(),
  });
}

export function getChainById(chainId: number): Chain | undefined {
  return viemChains[chainId];
}
