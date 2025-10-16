import { registerAs } from '@nestjs/config';

export default registerAs('solana', () => ({
  rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  paymentWallet: process.env.SOLANA_PAYMENT_WALLET || '',
  usdcMint: process.env.SOLANA_USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  confirmationCount: parseInt(process.env.SOLANA_CONFIRMATION_COUNT || '1', 10),
  useNativeSOL: process.env.SOLANA_USE_NATIVE_SOL === 'true' || true,
}));
