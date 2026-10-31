// lib/prisma.ts - Singleton Prisma client
// Local dev uses the SQLite file in DATABASE_URL. On Cloudflare Workers (or
// locally with DATABASE_PROVIDER=d1) the client is backed by the D1 binding `DB`
// through the Prisma D1 adapter.
import { PrismaClient } from '@prisma/client';
import { usesD1Database } from './runtime';
import { withD1Compat } from './d1-compat';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const log: ('error' | 'warn')[] = process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'];

function createD1Client(): PrismaClient {
  // Loaded lazily so the Cloudflare packages stay out of the default SQLite runtime.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getCloudflareContext } = require('@opennextjs/cloudflare') as typeof import('@opennextjs/cloudflare');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaD1 } = require('@prisma/adapter-d1') as typeof import('@prisma/adapter-d1');
  const { env } = getCloudflareContext() as unknown as { env: { DB: ConstructorParameters<typeof PrismaD1>[0] } };
  return withD1Compat(new PrismaClient({ adapter: new PrismaD1(env.DB), log }));
}

// The D1 binding is only readable inside a request, so the client
// is created on first use rather than at module load.
function createWorkerProxy(): PrismaClient {
  let client: PrismaClient | undefined;
  return new Proxy({} as PrismaClient, {
    get(_target, prop) {
      client ??= createD1Client();
      const d1 = client;
      if (prop === '$transaction') {
        // Prisma refuses interactive transactions on D1. D1 has no interactive
        // transactions, so run the callback directly (as the adapter does for
        // batches); batch arrays still go through $transaction.
        return (input: unknown, options?: unknown) =>
          typeof input === 'function'
            ? (input as (tx: PrismaClient) => Promise<unknown>)(d1)
            : (d1.$transaction as (i: unknown, o?: unknown) => Promise<unknown>)(input, options);
      }
      const value = Reflect.get(client, prop, client);
      return typeof value === 'function' ? value.bind(client) : value;
    },
  });
}

export const prisma =
  globalForPrisma.prisma ??
  (usesD1Database() ? createWorkerProxy() : new PrismaClient({ log }));

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
