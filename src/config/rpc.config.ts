import { registerAs } from '@nestjs/config';

export default registerAs('rpc', () => ({
  endpoint: process.env.RPC_ENDPOINT,
  apiKey: process.env.RPC_API_KEY,
  rateLimit: parseInt(process.env.RPC_RATE_LIMIT as string, 10), // requests per second
  timeout: parseInt(process.env.RPC_TIMEOUT || '30000', 10), // 30 seconds
}));
