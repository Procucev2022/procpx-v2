jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation((options) => ({ options, id: Symbol('client') })),
}));
jest.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: jest.fn() }));
jest.mock('@prisma/adapter-d1', () => ({ PrismaD1: jest.fn().mockImplementation((db) => ({ db })) }));
jest.mock('../src/lib/d1-compat', () => ({ withD1Compat: jest.fn((client) => client) }));
import { PrismaClient } from '@prisma/client';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { PrismaD1 } from '@prisma/adapter-d1';
import {
  D1_BINDING_REQUIRED_MESSAGE,
  D1_PRISMA_TRANSACTION_UNSUPPORTED,
  D1_PROVIDER_REQUIRED_MESSAGE,
  PRISMA_CLIENT_PROXY_TAG,
} from '../src/lib/prisma.constants';

const PrismaClientMock = PrismaClient as unknown as jest.Mock;
const getCloudflareContextMock = getCloudflareContext as jest.Mock;
const PrismaD1Mock = PrismaD1 as unknown as jest.Mock;
const prismaGlobal = globalThis as typeof globalThis & { prisma?: unknown };

function loadPrismaModule() {
  let moduleExports: typeof import('../src/lib/prisma') | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolateModules needs a synchronous load.
    moduleExports = require('../src/lib/prisma') as typeof import('../src/lib/prisma');
  });
  return moduleExports!;
}

describe('Prisma client singleton', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalProvider = process.env.DATABASE_PROVIDER;
  const originalGlobalClient = prismaGlobal.prisma;

  beforeEach(() => {
    jest.clearAllMocks();
    getCloudflareContextMock.mockReturnValue({ env: { DB: { name: 'default' } } });
    PrismaD1Mock.mockImplementation((db) => ({ db }));
    delete prismaGlobal.prisma;
    delete process.env.DATABASE_PROVIDER;
    Reflect.set(process.env, 'NODE_ENV', 'test');
  });

  afterEach(() => {
    delete prismaGlobal.prisma;
    if (originalGlobalClient !== undefined) prismaGlobal.prisma = originalGlobalClient;
    if (originalProvider === undefined) delete process.env.DATABASE_PROVIDER;
    else process.env.DATABASE_PROVIDER = originalProvider;
    if (originalNodeEnv === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
    else Reflect.set(process.env, 'NODE_ENV', originalNodeEnv);
  });

  it('keeps D1 runtime errors centralized', () => {
    expect(D1_BINDING_REQUIRED_MESSAGE).toContain('binding named DB');
    expect(D1_PROVIDER_REQUIRED_MESSAGE).toContain('there is no application SQLite fallback');
    expect(PRISMA_CLIENT_PROXY_TAG).toBe('PrismaClient');
  });

  it('fails closed without D1 configuration and never creates a local SQLite client', () => {
    const userAgent = jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue('');
    const first = loadPrismaModule();
    const second = loadPrismaModule();

    expect(PrismaClientMock).not.toHaveBeenCalled();
    expect(first.default).toBe(first.prisma);
    expect(second.prisma).not.toBe(first.prisma);
    expect(() => first.prisma.user).toThrow(D1_PROVIDER_REQUIRED_MESSAGE);
    expect(prismaGlobal.prisma).toBeUndefined();
    userAgent.mockRestore();
  });

  it('exposes the Prisma client tag from the fail-closed proxy', () => {
    const userAgent = jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue('');
    const loaded = loadPrismaModule();
    expect(loaded.prisma[Symbol.toStringTag]).toBe(PRISMA_CLIENT_PROXY_TAG);
    userAgent.mockRestore();
  });

  it('enables warning logs for a configured local D1 client in development', () => {
    Reflect.set(process.env, 'NODE_ENV', 'development');
    process.env.DATABASE_PROVIDER = 'd1';
    getCloudflareContextMock.mockReturnValue({ env: { DB: { name: 'local' } } });
    const loaded = loadPrismaModule();
    void (loaded.prisma as unknown as { options: unknown }).options;
    expect(PrismaClientMock).toHaveBeenCalledWith({ adapter: { db: { name: 'local' } }, log: ['error', 'warn'] });
  });

  it('creates a D1-backed client on first use inside Cloudflare Workers', () => {
    const userAgent = jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Cloudflare-Workers');
    const binding = { name: 'DB' };
    getCloudflareContextMock.mockReturnValue({ env: { DB: binding } });

    const loaded = loadPrismaModule();
    expect(PrismaClientMock).not.toHaveBeenCalled();

    const client = loaded.prisma as unknown as { options: { adapter: { db: unknown }; log: string[] } };
    expect(client.options).toEqual({ adapter: { db: binding }, log: ['error'] });
    expect(PrismaClientMock).toHaveBeenCalledTimes(1);
    void (loaded.prisma as unknown as { options: unknown }).options;
    expect(PrismaClientMock).toHaveBeenCalledTimes(1);

    userAgent.mockRestore();
  });

  it('binds client methods to the D1-backed client', () => {
    const userAgent = jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Cloudflare-Workers');
    getCloudflareContextMock.mockReturnValue({ env: { DB: { name: 'DB' } } });
    PrismaD1Mock.mockImplementation((db) => ({ db }));
    PrismaClientMock.mockImplementationOnce(function (this: { tag: string }) {
      return { tag: 'd1', whoAmI(this: { tag: string }) { return this.tag; } };
    });

    const loaded = loadPrismaModule();
    const { whoAmI } = loaded.prisma as unknown as { whoAmI: () => string };
    expect(whoAmI()).toBe('d1');

    userAgent.mockRestore();
  });

  it('rejects callback and array transactions on D1 without calling the adapter', async () => {
    const userAgent = jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Cloudflare-Workers');
    getCloudflareContextMock.mockReturnValue({ env: { DB: { name: 'DB' } } });
    PrismaD1Mock.mockImplementation((db) => ({ db }));
    const batch = jest.fn().mockResolvedValue(['a', 'b']);
    const d1Client = { tag: 'd1', $transaction: batch };
    PrismaClientMock.mockImplementationOnce(() => d1Client);

    const loaded = loadPrismaModule();
    const callback = jest.fn(async (tx: unknown) => ({ usedClient: tx }));
    expect(() => loaded.prisma.$transaction(callback as never)).toThrow(D1_PRISMA_TRANSACTION_UNSUPPORTED);
    expect(callback).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();

    const ops = [Promise.resolve('a'), Promise.resolve('b')];
    expect(() => loaded.prisma.$transaction(ops as never, { isolationLevel: 'Serializable' } as never))
      .toThrow(D1_PRISMA_TRANSACTION_UNSUPPORTED);
    expect(batch).not.toHaveBeenCalled();

    userAgent.mockRestore();
  });

  it('does not create or cache a client on the global in production without D1', () => {
    Reflect.set(process.env, 'NODE_ENV', 'production');
    const loaded = loadPrismaModule();

    expect(PrismaClientMock).not.toHaveBeenCalled();
    expect(prismaGlobal.prisma).toBeUndefined();
    expect(loaded.prisma).toBe(loaded.default);
    expect(() => loaded.prisma.user).toThrow(D1_PROVIDER_REQUIRED_MESSAGE);
  });
});
