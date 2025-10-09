import { createClient } from 'redis';
import { config } from '../config/config';

export type RedisClient = ReturnType<typeof createClient>;

let redisClient: RedisClient | null = null;

export const initRedis = async (): Promise<RedisClient> => {
  if (redisClient) {
    return redisClient;
  }

  redisClient = createClient({
    socket: {
      host: config.redis.host,
      port: config.redis.port,
    },
    password: config.redis.password,
  });

  redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err);
  });

  redisClient.on('connect', () => {
    console.log('Redis connected successfully');
  });

  await redisClient.connect();
  return redisClient;
};

export const getRedisClient = (): RedisClient => {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call initRedis() first.');
  }
  return redisClient;
};

export const closeRedis = async (): Promise<void> => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
};

