jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation((options) => ({ options, id: Symbol('client') })),
}));

const PrismaClientMock = (require('@prisma/client') as { PrismaClient: jest.Mock }).PrismaClient;
const prismaGlobal = globalThis as typeof globalThis & { prisma?: unknown };

function loadPrismaModule() {
  let moduleExports: typeof import('../src/lib/prisma') | undefined;
  jest.isolateModules(() => {
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

  it('does not store a newly-created client on the global in production', () => {
    Reflect.set(process.env, 'NODE_ENV', 'production');
    const loaded = loadPrismaModule();

    expect(PrismaClientMock).toHaveBeenCalledWith({ log: ['error'] });
    expect(prismaGlobal.prisma).toBeUndefined();
    expect(loaded.prisma).toBe(loaded.default);
  });
});
