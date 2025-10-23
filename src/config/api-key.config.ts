import { registerAs } from '@nestjs/config';
import { API_KEY_CONFIG } from './constants';

export default registerAs('apiKey', () => ({
  prefix: API_KEY_CONFIG.PREFIX,
  expiryDays: API_KEY_CONFIG.EXPIRY_DAYS,
}));
