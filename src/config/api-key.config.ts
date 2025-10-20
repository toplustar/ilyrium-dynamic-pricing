import { registerAs } from '@nestjs/config';

export default registerAs('apiKey', () => ({
  prefix: process.env.API_KEY_PREFIX || '', // No prefix for new format
  expiryDays: parseInt(process.env.API_KEY_EXPIRY_DAYS || '365', 10),
}));
