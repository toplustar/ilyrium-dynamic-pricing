import { registerAs } from '@nestjs/config';
import { PAYMENT_CONFIG } from './constants';

export default registerAs('payment', () => ({
  pollInterval: PAYMENT_CONFIG.POLL_INTERVAL,
  expiryMinutes: PAYMENT_CONFIG.EXPIRY_MINUTES,
}));
