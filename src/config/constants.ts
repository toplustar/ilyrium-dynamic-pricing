/**
 * Application Constants
 * Centralized configuration values to reduce environment variable dependencies
 */

export const SERVER_CONFIG = {
  PORT: 3000,
  ENVIRONMENT: 'production',
  CORS_ORIGIN: '*',
} as const;

export const RPC_CONFIG = {
  ENDPOINT: 'https://elite.rpc.solanavibestation.com/',
  RATE_LIMIT: 500,
  TIMEOUT: 30000,
  BACKEND_URL: 'http://65.109.56.146:3000/api/rpc',
} as const;

export const SOLANA_CONFIG = {
  PAYMENT_RPC_URL: 'https://api.devnet.solana.com',
  CONFIRMATION_COUNT: 1,
  USE_NATIVE_SOL: true,
  ACTIVITY_RPC_URL: 'https://api.mainnet-beta.solana.com',
  USDC_MINT: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
} as const;

export const PRICING_CONFIG = {
  PRICE_MIN: 0.001,
  PRICE_MAX: 0.01,
  TOTAL_RPS: 500,
  CACHE_TTL: 60,
  K: 4,
  ALPHA: 0.6,
  PHI: 0.4,
} as const;

export const PAYMENT_CONFIG = {
  POLL_INTERVAL: 10000,
  EXPIRY_MINUTES: 60,
} as const;

export const API_KEY_CONFIG = {
  PREFIX: '',
  EXPIRY_DAYS: 365,
} as const;

export const CACHE_CONFIG = {
  TTL: 3600,
  KEY_PREFIX: 'dynamic_pricing:',
} as const;

export const DATABASE_CONFIG = {
  PORT: 5432,
  LOGGING: false,
  SSL: false,
} as const;

export const REDIS_CONFIG = {
  PORT: 6379,
  DATABASE: 0,
} as const;

export const JWT_CONFIG = {
  EXPIRES_IN: '1h',
} as const;
