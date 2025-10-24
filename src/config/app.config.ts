import { registerAs } from '@nestjs/config';
import { SERVER_CONFIG, RPC_CONFIG, PRICING_CONFIG, JWT_CONFIG } from './constants';

export const AppConfig = registerAs('app', () => ({
  port: SERVER_CONFIG.PORT,
  environment: SERVER_CONFIG.ENVIRONMENT,
  rpcBackendUrl: RPC_CONFIG.BACKEND_URL,
  rpcEndpoint: RPC_CONFIG.ENDPOINT,
  jwt: {
    secret: process.env.JWT_SECRET as string, // Keep as env var for security
    expiresIn: JWT_CONFIG.EXPIRES_IN,
  },
  // Dynamic pricing configuration
  priceMin: PRICING_CONFIG.PRICE_MIN,
  priceMax: PRICING_CONFIG.PRICE_MAX,
  totalRps: PRICING_CONFIG.TOTAL_RPS,
}));
