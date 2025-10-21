import { registerAs } from '@nestjs/config';

export interface TierConfigInterface {
  name: string;
  rps: number;
  description: string;
  emoji: string;
}

export const TierConfig = registerAs('tiers', () => ({
  tiers: [
    {
      name: 'Basic',
      rps: 10,
      description: '10 requests per second - Perfect for testing and small applications',
      emoji: '📊',
    },
    {
      name: 'Ultra',
      rps: 25,
      description: '25 requests per second - For production applications',
      emoji: '⚡',
    },
    {
      name: 'Elite',
      rps: 50,
      description: '50 requests per second - High-performance for large-scale operations',
      emoji: '💎',
    },
  ],
}));
