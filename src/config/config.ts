import dotenv from 'dotenv';

dotenv.config();

export const config = {
  server: {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0',
  },
  database: {
    url: process.env.DATABASE_URL || '',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  pricing: {
    priceMin: parseFloat(process.env.PRICE_MIN || '0.001'),
    priceMax: parseFloat(process.env.PRICE_MAX || '0.01'),
    totalRps: parseInt(process.env.TOTAL_RPS || '10000', 10),
  },
  admin: {
    key: process.env.ADMIN_KEY || '',
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
};

export const validateConfig = () => {
  if (!config.database.url) {
    throw new Error('DATABASE_URL is required');
  }
  if (!config.admin.key) {
    console.warn('Warning: ADMIN_KEY is not set');
  }
};

