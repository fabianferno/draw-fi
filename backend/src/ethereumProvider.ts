/**
 * Shared Ethereum RPC provider with optional fallback URLs.
 * When the primary RPC returns 522/timeouts, FallbackProvider tries alternate endpoints.
 */
import { ethers } from 'ethers';
import config from './config/config.js';
import logger from './utils/logger.js';

const SEPOLIA_CHAIN_ID = 11155111;
let cachedProvider: ethers.AbstractProvider | null = null;

function getProvider(): ethers.AbstractProvider {
  if (cachedProvider) return cachedProvider;

  const primary = config.ethereumRpcUrl;
  const fallbacks = config.ethereumRpcFallbackUrls ?? [];

  if (fallbacks.length === 0) {
    cachedProvider = new ethers.JsonRpcProvider(primary);
    logger.info('Ethereum provider: single RPC', { url: primary });
    return cachedProvider;
  }

  const network = new ethers.Network('sepolia', SEPOLIA_CHAIN_ID);
  const providerList = [
    new ethers.JsonRpcProvider(primary, network),
    ...fallbacks.map((url) => new ethers.JsonRpcProvider(url, network)),
  ];
  cachedProvider = new ethers.FallbackProvider(providerList, network, { quorum: 1 });
  logger.info('Ethereum provider: primary + fallbacks', {
    primary,
    fallbacks: fallbacks.length,
  });
  return cachedProvider;
}

/** Get the shared Ethereum provider (single JsonRpcProvider or FallbackProvider). */
export function getEthereumProvider(): ethers.AbstractProvider {
  return getProvider();
}

/** Primary RPC URL (for logging only). */
export function getEthereumRpcUrl(): string {
  return config.ethereumRpcUrl;
}
