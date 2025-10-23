import { registerAs } from '@nestjs/config';

export interface UrlsConfigInterface {
  // External URLs
  rpcBackendUrl: string;

  // Internal URLs (constructed from host/port)
  baseUrl: string;
  swaggerUrl: string;
}

export const UrlsConfig = registerAs('urls', () => {
  // Only truly environment-specific values
  const host = process.env.DEFAULT_HOST || 'localhost';
  const port = parseInt(process.env.DEFAULT_PORT || '3000', 10);

  // Fixed protocol
  const protocol = 'http';

  const baseUrl = `${protocol}://${host}:${port}`;
  const swaggerUrl = `${baseUrl}/api-docs`;

  return {
    // External URLs - these should be configurable
    rpcBackendUrl: process.env.RPC_BACKEND_URL || `${baseUrl}/api/rpc`,

    // Internal URLs (constructed from host/port)
    baseUrl,
    swaggerUrl,
  };
});
