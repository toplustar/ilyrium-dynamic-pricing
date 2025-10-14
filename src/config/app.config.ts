import { registerAs } from '@nestjs/config';

export const AppConfig = registerAs('app', () => ({
  port: parseInt(process.env.PORT as string, 10) || 3000,
  environment: process.env.NODE_ENV || 'local',
  rpcBackendUrl: process.env.RPC_BACKEND_URL as string,
  rpcEndpoint: process.env.RPC_ENDPOINT || 'elite.rpc.solanavibestation.com',
  jwt: {
    secret: process.env.JWT_SECRET as string,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
  },
  // Dynamic pricing configuration
  priceMin: parseFloat(process.env.PRICE_MIN || '0.001'),
  priceMax: parseFloat(process.env.PRICE_MAX || '0.01'),
  totalRps: parseInt(process.env.TOTAL_RPS || '10000', 10),
}));
