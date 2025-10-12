import { registerAs } from '@nestjs/config';

export default registerAs('payment', () => ({
  pollInterval: parseInt(process.env.PAYMENT_POLL_INTERVAL || '10000', 10),
  memoExpiryDays: parseInt(process.env.PAYMENT_MEMO_EXPIRY_DAYS || '7', 10),
}));
