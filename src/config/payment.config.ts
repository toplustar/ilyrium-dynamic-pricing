import { registerAs } from '@nestjs/config';

export default registerAs('payment', () => ({
  pollInterval: parseInt(process.env.PAYMENT_POLL_INTERVAL || '10000', 10),
  expiryMinutes: parseInt(process.env.PAYMENT_EXPIRY_MINUTES || '60', 10), // Payment link expires in 60 minutes (1 hour)
}));
