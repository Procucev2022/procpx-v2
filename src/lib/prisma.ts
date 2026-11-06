// lib/prisma.ts - Singleton D1-backed Prisma client. SQLite is schema dialect only.
import { PrismaClient } from '@prisma/client';
import { usesD1Database } from './runtime';
import { withD1Compat } from './d1-compat';
import {
  D1_BINDING_REQUIRED_MESSAGE,
  D1_PRISMA_TRANSACTION_UNSUPPORTED,
  D1_PROVIDER_REQUIRED_MESSAGE,
  PRISMA_CLIENT_PROXY_TAG,
} from './prisma.constants';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const log: ('error' | 'warn')[] = process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'];

function createD1Client(): PrismaClient {
  if (!usesD1Database()) throw new Error(D1_PROVIDER_REQUIRED_MESSAGE);
  // Loaded lazily so Next.js can import this module before a request-scoped D1 binding exists.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getCloudflareContext } = require('@opennextjs/cloudflare') as typeof import('@opennextjs/cloudflare');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaD1 } = require('@prisma/adapter-d1') as typeof import('@prisma/adapter-d1');
  const { env } = getCloudflareContext() as unknown as { env?: { DB?: ConstructorParameters<typeof PrismaD1>[0] } };
  if (!env?.DB) throw new Error(D1_BINDING_REQUIRED_MESSAGE);
  return withD1Compat(new PrismaClient({ adapter: new PrismaD1(env.DB), log }));
}

// The D1 binding is only readable inside a request, so the client
// is created on first use rather than at module load.
function createWorkerProxy(): PrismaClient {
  let client: PrismaClient | undefined;
  return new Proxy({} as PrismaClient, {
    get(_target, prop) {
      client ??= createD1Client();
      if (prop === '$transaction') {
        // D1's Prisma adapter ignores both callback and array transaction
        // boundaries. All multi-statement atomic writes must use DB.batch().
        return () => { throw new Error(D1_PRISMA_TRANSACTION_UNSUPPORTED); };
      }
      const value = Reflect.get(client, prop, client);
      return typeof value === 'function' ? value.bind(client) : value;
    },
  });
}

function createD1ProviderRequiredProxy(): PrismaClient {
  return new Proxy({} as PrismaClient, {
    get(_target, prop) {
      if (prop === Symbol.toStringTag) return PRISMA_CLIENT_PROXY_TAG;
      throw new Error(D1_PROVIDER_REQUIRED_MESSAGE);
    },
  });
}

const d1Configured = usesD1Database();
export const prisma = globalForPrisma.prisma ?? (d1Configured ? createWorkerProxy() : createD1ProviderRequiredProxy());

if (process.env.NODE_ENV !== 'production' && d1Configured) globalForPrisma.prisma = prisma;

export default prisma;
