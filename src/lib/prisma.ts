// lib/prisma.ts - Singleton Prisma client
// Local dev uses the SQLite file in DATABASE_URL. On Cloudflare Workers the
// client is backed by the D1 binding `DB` through the Prisma D1 adapter.
import { PrismaClient } from '@prisma/client';
import { isCloudflareWorker } from './runtime';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const log: ('error' | 'warn')[] = process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'];

function createD1Client(): PrismaClient {
  // Loaded lazily so the Cloudflare packages never enter the local Node runtime.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getCloudflareContext } = require('@opennextjs/cloudflare') as typeof import('@opennextjs/cloudflare');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaD1 } = require('@prisma/adapter-d1') as typeof import('@prisma/adapter-d1');
  const { env } = getCloudflareContext() as unknown as { env: { DB: ConstructorParameters<typeof PrismaD1>[0] } };
  return new PrismaClient({ adapter: new PrismaD1(env.DB), log });
}

// On Workers the D1 binding is only readable inside a request, so the client
// is created on first use rather than at module load.
function createWorkerProxy(): PrismaClient {
  let client: PrismaClient | undefined;
  return new Proxy({} as PrismaClient, {
    get(_target, prop) {
      client ??= createD1Client();
      const value = Reflect.get(client, prop, client);
      return typeof value === 'function' ? value.bind(client) : value;
    },
  });
}

export const prisma =
  globalForPrisma.prisma ??
  (isCloudflareWorker() ? createWorkerProxy() : new PrismaClient({ log }));

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
