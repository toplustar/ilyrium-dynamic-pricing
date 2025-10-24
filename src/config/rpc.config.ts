import { registerAs } from '@nestjs/config';
import { RPC_CONFIG } from './constants';

export default registerAs('rpc', () => ({
  endpoint: RPC_CONFIG.ENDPOINT,
  apiKey: process.env.RPC_API_KEY as string, // Keep as env var for security
  rateLimit: RPC_CONFIG.RATE_LIMIT,
  timeout: RPC_CONFIG.TIMEOUT,
}));
