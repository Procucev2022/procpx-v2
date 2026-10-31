export const D1_ENVIRONMENT_VARIABLES = {
  accountId: 'CLOUDFLARE_ACCOUNT_ID',
  apiToken: 'CLOUDFLARE_API_TOKEN',
  databaseId: 'CLOUDFLARE_DATABASE_ID',
} as const;

export const D1_ADAPTER_TOKEN_KEY = 'CLOUDFLARE_D1_TOKEN';

export const D1_MISSING_CONFIGURATION_MESSAGE =
  'Cloudflare D1 is not configured. Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, and CLOUDFLARE_DATABASE_ID before using database-backed features.';

export const PRISMA_CLIENT_PROXY_TAG = 'PrismaClient';
