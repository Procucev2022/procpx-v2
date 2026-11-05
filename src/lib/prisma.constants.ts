export const D1_PROVIDER_REQUIRED_MESSAGE =
  'Set DATABASE_PROVIDER=d1 and use the local Wrangler binding for development. Prisma SQLite is schema-generation-only; there is no application SQLite fallback.';

export const D1_BINDING_REQUIRED_MESSAGE =
  'The Cloudflare runtime did not provide the required D1 binding named DB.';

export const PRISMA_CLIENT_PROXY_TAG = 'PrismaClient';

export const D1_PRISMA_TRANSACTION_UNSUPPORTED =
  'The Prisma D1 adapter ignores transaction boundaries. Use a native D1 batch for atomic multi-write workflows.';
