import dotenv from 'dotenv';

dotenv.config({ path: ".env.local" });

export interface Config {
  network: 'mainnet' | 'testnet' | 'local';
  ethereumRpcUrl: string;
  /** Optional fallback RPC URLs when primary returns 522/timeouts */
  ethereumRpcFallbackUrls: string[];
  ethereumPrivateKey: string;
  contractAddress: string;
  futuresContractAddress: string;
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
  /** Yellow Network - optional, enables Yellow integration */
  yellowClearnodeWsUrl: string;
  yellowPrivateKey: string | null;
  yellowRelayerEnabled: boolean;
  yellowEthToYtestRate: number;
  /** When true, faucet success also credits user's Draw-Fi balance (sandbox convenience - no separate transfer needed) */
  yellowFaucetAlsoCredit: boolean;
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
  ethereumRpcUrl: getOptionalEnvVar('ETHEREUM_RPC_URL', 'https://rpc.sepolia.org'),
  ethereumRpcFallbackUrls: (process.env.ETHEREUM_RPC_FALLBACK_URLS || '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean),
  ethereumPrivateKey: getEnvVar('ETHEREUM_SEPOLIA_PRIVATE_KEY'),
  contractAddress: getEnvVar('CONTRACT_ADDRESS'),
  futuresContractAddress: getEnvVar('FUTURES_CONTRACT_ADDRESS'),
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
  yellowClearnodeWsUrl: getOptionalEnvVar('YELLOW_CLEARNODE_WS_URL', 'wss://clearnet-sandbox.yellow.com/ws'),
  yellowPrivateKey: process.env.YELLOW_RELAYER_PRIVATE_KEY || null,
  yellowRelayerEnabled: process.env.YELLOW_RELAYER_ENABLED === 'true',
  /** 1 ETH (1e18 wei) = this many ytest.usd units (6 decimals). e.g. 100 = 1 ETH = 100 ytest.usd */
  yellowEthToYtestRate: (() => {
    const v = parseFloat(process.env.YELLOW_ETH_TO_ytest_RATE || '100');
    return Number.isFinite(v) && v > 0 ? v : 100;
  })(),
  yellowFaucetAlsoCredit: process.env.YELLOW_FAUCET_ALSO_CREDIT === 'true',
  skipPositionIds: (process.env.SKIP_POSITION_IDS || '')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0),
};

export default config;
