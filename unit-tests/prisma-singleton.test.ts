import {
  D1_ADAPTER_TOKEN_KEY,
  D1_ENVIRONMENT_VARIABLES,
  D1_MISSING_CONFIGURATION_MESSAGE,
  PRISMA_CLIENT_PROXY_TAG,
} from '@/lib/prisma.constants';
import { PrismaD1 } from '@prisma/adapter-d1';
import { PrismaClient } from '@prisma/client';

jest.mock('@prisma/adapter-d1', () => ({
  PrismaD1: jest.fn().mockImplementation((configuration) => ({ configuration })),
}));

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation((options) => ({
    options,
    id: Symbol('client'),
    $connect: jest.fn(),
  })),
}));

const PrismaClientMock = PrismaClient as unknown as jest.Mock;
const PrismaD1Mock = PrismaD1 as unknown as jest.Mock;
const prismaGlobal = globalThis as typeof globalThis & { prisma?: unknown };

function loadPrismaModule() {
  let moduleExports: typeof import('../src/lib/prisma') | undefined;
  jest.isolateModules(() => {
    moduleExports = jest.requireActual('../src/lib/prisma') as typeof import('../src/lib/prisma');
  });
  return moduleExports!;
}

function configureD1Environment() {
  Reflect.set(process.env, D1_ENVIRONMENT_VARIABLES.accountId, 'account-id');
  Reflect.set(process.env, D1_ENVIRONMENT_VARIABLES.apiToken, 'api-token');
  Reflect.set(process.env, D1_ENVIRONMENT_VARIABLES.databaseId, 'database-id');
}

describe('Prisma D1 client singleton', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalGlobalClient = prismaGlobal.prisma;
  const originalD1Environment = Object.fromEntries(
    Object.values(D1_ENVIRONMENT_VARIABLES).map((key) => [key, process.env[key]]),
  );

  beforeEach(() => {
    jest.clearAllMocks();
    delete prismaGlobal.prisma;
    Reflect.set(process.env, 'NODE_ENV', 'test');
    configureD1Environment();
  });

  afterEach(() => {
    delete prismaGlobal.prisma;
    if (originalGlobalClient !== undefined) prismaGlobal.prisma = originalGlobalClient;
    if (originalNodeEnv === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
    else Reflect.set(process.env, 'NODE_ENV', originalNodeEnv);
    for (const [key, value] of Object.entries(originalD1Environment)) {
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else Reflect.set(process.env, key, value);
    }
  });

  it('defers client creation until the first Prisma property is used', () => {
    const loaded = loadPrismaModule();

    expect(PrismaClientMock).not.toHaveBeenCalled();
    expect(loaded.prisma[Symbol.toStringTag]).toBe(PRISMA_CLIENT_PROXY_TAG);
    expect(PrismaClientMock).not.toHaveBeenCalled();

    void loaded.prisma.$connect;
    void loaded.prisma.$connect;
    expect(PrismaClientMock).toHaveBeenCalledTimes(1);
  });

  it('forwards property writes to the lazily created Prisma client', () => {
    const loaded = loadPrismaModule();

    Reflect.set(loaded.prisma, 'testMarker', 'connected');

    expect(PrismaClientMock).toHaveBeenCalledTimes(1);
    expect(PrismaClientMock.mock.results[0].value.testMarker).toBe('connected');
  });

  it('creates the adapter with the D1 HTTP configuration and caches the client outside production', () => {
    const first = loadPrismaModule();
    void first.prisma.$connect;
    const second = loadPrismaModule();

    expect(PrismaD1Mock).toHaveBeenCalledWith({
      [D1_ADAPTER_TOKEN_KEY]: 'api-token',
      [D1_ENVIRONMENT_VARIABLES.accountId]: 'account-id',
      [D1_ENVIRONMENT_VARIABLES.databaseId]: 'database-id',
    });
    expect(PrismaClientMock).toHaveBeenCalledTimes(1);
    expect(PrismaClientMock).toHaveBeenCalledWith({
      adapter: expect.objectContaining({ configuration: expect.any(Object) }),
      log: ['error'],
    });
    expect(first.default).toBe(first.prisma);
    expect(second.prisma).toBe(first.prisma);
    expect(prismaGlobal.prisma).toBe(first.prisma);
  });

  it('enables warning logs in development', () => {
    Reflect.set(process.env, 'NODE_ENV', 'development');
    const loaded = loadPrismaModule();
    void loaded.prisma.$connect;

    expect(PrismaClientMock).toHaveBeenCalledWith(expect.objectContaining({ log: ['error', 'warn'] }));
  });

  it('does not store a newly created lazy client on the global in production', () => {
    Reflect.set(process.env, 'NODE_ENV', 'production');
    const loaded = loadPrismaModule();
    void loaded.prisma.$connect;

    expect(prismaGlobal.prisma).toBeUndefined();
    expect(loaded.prisma).toBe(loaded.default);
    expect(PrismaClientMock).toHaveBeenCalledTimes(1);
  });

  it('requires all D1 environment values before creating a database client', () => {
    const loaded = loadPrismaModule();

    expect(() => loaded.createD1PrismaClient({})).toThrow(D1_MISSING_CONFIGURATION_MESSAGE);
    expect(PrismaClientMock).not.toHaveBeenCalled();
    expect(PrismaD1Mock).not.toHaveBeenCalled();
  });
});
