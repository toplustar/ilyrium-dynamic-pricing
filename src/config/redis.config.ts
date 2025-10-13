import { registerAs } from '@nestjs/config';

export const RedisConfig = registerAs('redis', () => ({
  host: process.env.REDIS_HOST as string,
  port: parseInt(process.env.REDIS_PORT as string, 10) || 6379,
  password: process.env.REDIS_PASSWORD as string,
  database: parseInt(process.env.REDIS_DATABASE as string, 10) || 0,
  ttl: parseInt(process.env.CACHE_TTL as string, 10) || 3600,
  keyPrefix: process.env.REDIS_KEY_PREFIX ?? 'rpc:',
}));
