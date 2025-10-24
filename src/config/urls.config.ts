import { registerAs } from '@nestjs/config';

export interface UrlsConfigInterface {
  rpcBackendUrl: string;

  baseUrl: string;
  swaggerUrl: string;
}

export const UrlsConfig = registerAs('urls', () => {
  const host = process.env.DEFAULT_HOST || 'localhost';
  const port = parseInt(process.env.DEFAULT_PORT || '3000', 10);

  const protocol = 'http';

  const baseUrl = `${protocol}://${host}:${port}`;
  const swaggerUrl = `${baseUrl}/api-docs`;

  return {
    rpcBackendUrl: process.env.RPC_BACKEND_URL || `${baseUrl}/api/rpc`,

    baseUrl,
    swaggerUrl,
  };
});
