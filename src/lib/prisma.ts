import { PrismaD1 } from '@prisma/adapter-d1';
import { PrismaClient } from '@prisma/client';
import {
  D1_ADAPTER_TOKEN_KEY,
  D1_ENVIRONMENT_VARIABLES,
  D1_MISSING_CONFIGURATION_MESSAGE,
  PRISMA_CLIENT_PROXY_TAG,
} from './prisma.constants';
import type { D1Environment, D1HttpConfiguration } from '@app-types/database.types';

type GlobalPrisma = typeof globalThis & { prisma?: PrismaClient };
const globalForPrisma = globalThis as GlobalPrisma;

function getD1Configuration(environment: D1Environment = process.env): D1HttpConfiguration {
  const accountId = environment[D1_ENVIRONMENT_VARIABLES.accountId];
  const apiToken = environment[D1_ENVIRONMENT_VARIABLES.apiToken];
  const databaseId = environment[D1_ENVIRONMENT_VARIABLES.databaseId];

  if (!accountId || !apiToken || !databaseId) {
    throw new Error(D1_MISSING_CONFIGURATION_MESSAGE);
  }

  return {
    [D1_ENVIRONMENT_VARIABLES.accountId]: accountId,
    [D1_ADAPTER_TOKEN_KEY]: apiToken,
    [D1_ENVIRONMENT_VARIABLES.databaseId]: databaseId,
  };
}

export function createD1PrismaClient(environment: D1Environment = process.env): PrismaClient {
  const adapter = new PrismaD1(getD1Configuration(environment));
  const log: Array<'error' | 'warn'> = process.env.NODE_ENV === 'development'
    ? ['error', 'warn']
    : ['error'];

  return new PrismaClient({ adapter, log });
}

function createLazyPrismaClient(): PrismaClient {
  let client: PrismaClient | undefined;
  const resolveClient = () => {
    client ??= createD1PrismaClient();
    return client;
  };

  return new Proxy({} as PrismaClient, {
    get(_target, property) {
      if (property === Symbol.toStringTag) return PRISMA_CLIENT_PROXY_TAG;
      const resolvedClient = resolveClient();
      const value = Reflect.get(resolvedClient, property, resolvedClient) as unknown;
      return typeof value === 'function' ? value.bind(resolvedClient) : value;
    },
    set(_target, property, value) {
      const resolvedClient = resolveClient();
      return Reflect.set(resolvedClient, property, value, resolvedClient);
    },
  });
}

export const prisma = globalForPrisma.prisma ?? createLazyPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
