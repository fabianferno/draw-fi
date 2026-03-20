import dotenv from 'dotenv';

dotenv.config({ path: ".env" });

export interface Config {
  network: 'mainnet' | 'testnet' | 'local';
  ethereumRpcUrl: string;
  /** Optional fallback RPC URLs when primary returns 522/timeouts */
  ethereumRpcFallbackUrls: string[];
  ethereumPrivateKey: string;
  mongodbUri: string;
  mongodbDatabase: string;
  port: number;
  apiHost: string;
  bybitWssUrl: string;
  logLevel: string;
  alertWebhookUrl?: string;
  adminApiKey: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  defaultPriceSymbol: string;
  /** Futures contract address — required to enable futures/prediction features */
  futuresContractAddress: string | null;
  /** Yellow Network - optional, enables Yellow integration */
  yellowClearnodeWsUrl: string;
  yellowPrivateKey: string | null;
  yellowRelayerEnabled: boolean;
  yellowAsset: string;
  usdcContractAddress: string;
  custodyContractAddress: string;
  adjudicatorContractAddress: string;
  ethUsdRate: number;
  /** Position IDs to never attempt to close (e.g. after data loss). Comma-separated, e.g. "4,5" */
  skipPositionIds: number[];
}

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value) {
    throw new Error(`Environment variable ${key} is required but not set`);
  }
  return value;
}

function getOptionalEnvVar(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export const config: Config = {
  network: (process.env.NETWORK || 'local') as 'mainnet' | 'testnet' | 'local',
  ethereumRpcUrl: getOptionalEnvVar('ETHEREUM_RPC_URL', 'https://mainnet.base.org'),
  ethereumRpcFallbackUrls: (process.env.ETHEREUM_RPC_FALLBACK_URLS || '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean),
  ethereumPrivateKey: getEnvVar('ETHEREUM_PRIVATE_KEY'),
  mongodbUri: getEnvVar('MONGODB_URI'),
  mongodbDatabase: getOptionalEnvVar('MONGODB_DATABASE', 'drawfi'),
  port: parseInt(process.env.PORT || '3001', 10),
  apiHost: process.env.API_HOST || '0.0.0.0',
  bybitWssUrl: getOptionalEnvVar('BYBIT_WSS_URL', 'wss://stream.bybit.com/v5/public/spot'),
  logLevel: process.env.LOG_LEVEL || 'info',
  alertWebhookUrl: process.env.ALERT_WEBHOOK_URL,
  adminApiKey: getEnvVar('ADMIN_API_KEY'),
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '10', 10),
  defaultPriceSymbol: getOptionalEnvVar('PRICE_SYMBOL', 'BTCUSDT'),
  futuresContractAddress: process.env.FUTURES_CONTRACT_ADDRESS || null,
  yellowClearnodeWsUrl: getOptionalEnvVar('YELLOW_CLEARNODE_WS_URL', 'wss://clearnet.yellow.com/ws'),
  yellowPrivateKey: process.env.YELLOW_RELAYER_PRIVATE_KEY || null,
  yellowRelayerEnabled: process.env.YELLOW_RELAYER_ENABLED === 'true',
  ethUsdRate: (() => {
    const v = parseFloat(process.env.ETH_USD_RATE || '3000');
    return Number.isFinite(v) && v > 0 ? v : 3000;
  })(),
  yellowAsset: getOptionalEnvVar('YELLOW_ASSET', 'usdc'),
  usdcContractAddress: getOptionalEnvVar('USDC_CONTRACT_ADDRESS', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'),
  custodyContractAddress: getOptionalEnvVar('CUSTODY_CONTRACT_ADDRESS', '0x019B65A265EB3363822f2752141b3dF16131b262'),
  adjudicatorContractAddress: getOptionalEnvVar('ADJUDICATOR_CONTRACT_ADDRESS', '0x7c7ccbc98469190849BCC6c926307794fDfB11F2'),
  skipPositionIds: (process.env.SKIP_POSITION_IDS || '')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0),
};

export default config;
