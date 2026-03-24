export const USDC_DECIMALS = 6;

export const USDC_ADDRESS: Record<number, `0x${string}`> = {
  84532: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia USDC
  8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',  // Base mainnet USDC
};

export const BLOCK_EXPLORER: Record<number, string> = {
  84532: 'https://sepolia.basescan.org',
  8453: 'https://basescan.org',
};

export const RPC_URL: Record<number, string> = {
  84532: 'https://sepolia.base.org',
  8453: 'https://mainnet.base.org',
};

export function getYellowChainId(): number {
  return parseInt(process.env.NEXT_PUBLIC_YELLOW_CHAIN_ID || '84532', 10);
}

export function getYellowWsUrl(): string {
  return process.env.NEXT_PUBLIC_YELLOW_WS_URL || 'wss://clearnet.yellow.com/ws';
}

export function getUsdcAddress(): `0x${string}` {
  const chainId = getYellowChainId();
  const addr = USDC_ADDRESS[chainId];
  if (!addr) throw new Error(`No USDC address for chain ${chainId}`);
  return addr;
}

export function getBlockExplorerUrl(): string {
  const chainId = getYellowChainId();
  return BLOCK_EXPLORER[chainId] || 'https://sepolia.basescan.org';
}

export function getRpcUrl(): string {
  const chainId = getYellowChainId();
  return process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL || RPC_URL[chainId] || 'https://sepolia.base.org';
}

/** Format bigint USDC amount (6 decimals) to human-readable string */
export function formatUsdc(amount: bigint): string {
  const whole = amount / BigInt(10 ** USDC_DECIMALS);
  const frac = amount % BigInt(10 ** USDC_DECIMALS);
  const fracStr = frac.toString().padStart(USDC_DECIMALS, '0').replace(/0+$/, '') || '0';
  return `${whole}.${fracStr.slice(0, 2).padEnd(2, '0')}`;
}

/** Parse human-readable USDC string to bigint (6 decimals) */
export function parseUsdc(input: string): bigint {
  const trimmed = input.trim();
  if (!trimmed || trimmed === '.') return 0n;
  const parts = trimmed.split('.');
  const whole = parts[0] || '0';
  const frac = (parts[1] || '').slice(0, USDC_DECIMALS).padEnd(USDC_DECIMALS, '0');
  const n = BigInt(whole) * BigInt(10 ** USDC_DECIMALS) + BigInt(frac);
  return n < 0n ? 0n : n;
}

export function getBackendUrl(): string {
  return process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
}

export function getCustodyAddress(): `0x${string}` {
  const addr = process.env.NEXT_PUBLIC_CUSTODY_ADDRESS;
  if (!addr) return '0x0000000000000000000000000000000000000000' as `0x${string}`;
  return addr as `0x${string}`;
}

export function getAdjudicatorAddress(): `0x${string}` {
  const addr = process.env.NEXT_PUBLIC_ADJUDICATOR_ADDRESS;
  if (!addr) return '0x0000000000000000000000000000000000000000' as `0x${string}`;
  return addr as `0x${string}`;
}
