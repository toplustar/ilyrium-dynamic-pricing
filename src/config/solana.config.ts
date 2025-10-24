import { registerAs } from '@nestjs/config';
import { SOLANA_CONFIG } from './constants';

export default registerAs('solana', () => ({
  rpcUrl: SOLANA_CONFIG.PAYMENT_RPC_URL,
  paymentWallet: process.env.SOLANA_PAYMENT_WALLET as string, // Keep as env var for security
  usdcMint: SOLANA_CONFIG.USDC_MINT,
  confirmationCount: SOLANA_CONFIG.CONFIRMATION_COUNT,
  useNativeSOL: SOLANA_CONFIG.USE_NATIVE_SOL,
}));
