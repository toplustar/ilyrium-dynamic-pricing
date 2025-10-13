import { registerAs } from '@nestjs/config';

export default registerAs('apiKey', () => ({
  prefix: process.env.API_KEY_PREFIX || 'il_',
  expiryDays: parseInt(process.env.API_KEY_EXPIRY_DAYS || '365', 10),
}));
