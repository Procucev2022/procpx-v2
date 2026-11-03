jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation((options) => ({ options, id: Symbol('client') })),
}));
jest.mock('../src/lib/d1-compat', () => ({ withD1Compat: jest.fn((client) => client) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- reads the jest.mock factory result above.
const PrismaClientMock = (require('@prisma/client') as { PrismaClient: jest.Mock }).PrismaClient;
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
  const originalGlobalClient = prismaGlobal.prisma;

  beforeEach(() => {
    jest.clearAllMocks();
    delete prismaGlobal.prisma;
    Reflect.set(process.env, 'NODE_ENV', 'test');
  });

  afterEach(() => {
    delete prismaGlobal.prisma;
    if (originalGlobalClient !== undefined) prismaGlobal.prisma = originalGlobalClient;
    if (originalNodeEnv === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
    else Reflect.set(process.env, 'NODE_ENV', originalNodeEnv);
  });

  it('creates and caches one client outside production', () => {
    const first = loadPrismaModule();
    const firstClient = first.prisma;
    const second = loadPrismaModule();

    expect(PrismaClientMock).toHaveBeenCalledTimes(1);
    expect(PrismaClientMock).toHaveBeenCalledWith({ log: ['error'] });
    expect(first.default).toBe(firstClient);
    expect(second.prisma).toBe(firstClient);
    expect(prismaGlobal.prisma).toBe(firstClient);
  });

  it('enables warning logs in development', () => {
    Reflect.set(process.env, 'NODE_ENV', 'development');
    loadPrismaModule();
    expect(PrismaClientMock).toHaveBeenCalledWith({ log: ['error', 'warn'] });
  });

  it('creates a D1-backed client on first use inside Cloudflare Workers', () => {
    const userAgent = jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Cloudflare-Workers');
    const binding = { name: 'DB' };
    jest.doMock('@opennextjs/cloudflare', () => ({ getCloudflareContext: () => ({ env: { DB: binding } }) }));
    jest.doMock('@prisma/adapter-d1', () => ({ PrismaD1: jest.fn().mockImplementation((db) => ({ db })) }));

    const loaded = loadPrismaModule();
    expect(PrismaClientMock).not.toHaveBeenCalled();

    const client = loaded.prisma as unknown as { options: { adapter: { db: unknown }; log: string[] } };
    expect(client.options).toEqual({ adapter: { db: binding }, log: ['error'] });
    expect(PrismaClientMock).toHaveBeenCalledTimes(1);
    void (loaded.prisma as unknown as { options: unknown }).options;
    expect(PrismaClientMock).toHaveBeenCalledTimes(1);

    userAgent.mockRestore();
    jest.dontMock('@opennextjs/cloudflare');
    jest.dontMock('@prisma/adapter-d1');
  });

  it('binds client methods to the D1-backed client', () => {
    const userAgent = jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Cloudflare-Workers');
    jest.doMock('@opennextjs/cloudflare', () => ({ getCloudflareContext: () => ({ env: { DB: {} } }) }));
    jest.doMock('@prisma/adapter-d1', () => ({ PrismaD1: jest.fn() }));
    PrismaClientMock.mockImplementationOnce(function (this: { tag: string }) {
      return { tag: 'd1', whoAmI(this: { tag: string }) { return this.tag; } };
    });

    const loaded = loadPrismaModule();
    const { whoAmI } = loaded.prisma as unknown as { whoAmI: () => string };
    expect(whoAmI()).toBe('d1');

    userAgent.mockRestore();
    jest.dontMock('@opennextjs/cloudflare');
    jest.dontMock('@prisma/adapter-d1');
  });

  it('runs interactive transactions directly on D1 and passes batches through', async () => {
    const userAgent = jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Cloudflare-Workers');
    jest.doMock('@opennextjs/cloudflare', () => ({ getCloudflareContext: () => ({ env: { DB: {} } }) }));
    jest.doMock('@prisma/adapter-d1', () => ({ PrismaD1: jest.fn() }));
    const batch = jest.fn().mockResolvedValue(['a', 'b']);
    const d1Client = { tag: 'd1', $transaction: batch };
    PrismaClientMock.mockImplementationOnce(() => d1Client);

    const loaded = loadPrismaModule();
    const callback = jest.fn(async (tx: unknown) => ({ usedClient: tx }));
    await expect(loaded.prisma.$transaction(callback as never)).resolves.toEqual({ usedClient: d1Client });
    expect(batch).not.toHaveBeenCalled();

    const ops = [Promise.resolve('a'), Promise.resolve('b')];
    await expect(loaded.prisma.$transaction(ops as never, { isolationLevel: 'Serializable' } as never)).resolves.toEqual(['a', 'b']);
    expect(batch).toHaveBeenCalledWith(ops, { isolationLevel: 'Serializable' });

    userAgent.mockRestore();
    jest.dontMock('@opennextjs/cloudflare');
    jest.dontMock('@prisma/adapter-d1');
  });

  it('does not store a newly-created client on the global in production', () => {
    Reflect.set(process.env, 'NODE_ENV', 'production');
    const loaded = loadPrismaModule();

    expect(PrismaClientMock).toHaveBeenCalledWith({ log: ['error'] });
    expect(prismaGlobal.prisma).toBeUndefined();
    expect(loaded.prisma).toBe(loaded.default);
  });
});
