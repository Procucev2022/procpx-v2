import NextAuth from 'next-auth';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma';
import { handlers, signIn, signOut, auth } from '../src/lib/auth';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('next-auth', () => ({
  __esModule: true,
  default: jest.fn(() => ({ handlers: { GET: jest.fn() }, auth: jest.fn(), signIn: jest.fn(), signOut: jest.fn() })),
}));
jest.mock('next-auth/providers/credentials', () => ({
  __esModule: true,
  default: jest.fn((options) => options),
}));
jest.mock('bcryptjs', () => ({ __esModule: true, default: { compare: jest.fn() } }));
jest.mock('../src/lib/prisma', () => ({
  prisma: { user: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() } },
}));

const userModel = prisma.user as unknown as {
  findFirst: jest.Mock;
  findMany: jest.Mock;
  update: jest.Mock;
};
const compare = bcrypt.compare as jest.Mock;
const authOptions = (NextAuth as jest.Mock).mock.calls[0][0];
const authorize = authOptions.providers[0].authorize as (credentials: unknown) => Promise<unknown>;

const dbUser = {
  id: 'user-1',
  email: 'user@example.test',
  name: 'User One',
  role: 'PROJECT_USER',
  tenantId: 'tenant-1',
  passwordHash: 'hashed-password',
  vendorId: null,
  tenant: { name: 'Tenant One', slug: 'tenant-one' },
  vendor: null,
};

describe('NextAuth credentials provider', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    Reflect.set(process.env, 'NODE_ENV', 'test');
    userModel.findFirst.mockResolvedValue(null);
    userModel.findMany.mockResolvedValue([]);
    userModel.update.mockResolvedValue(undefined);
    compare.mockResolvedValue(true);
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
    else Reflect.set(process.env, 'NODE_ENV', originalNodeEnv);
  });

  it('exports the NextAuth handlers and actions', () => {
    expect(handlers).toHaveProperty('GET');
    expect(auth).toBeDefined();
    expect(signIn).toBeDefined();
    expect(signOut).toBeDefined();
    expect(authOptions.trustHost).toBe(true);
    expect(authOptions.session).toEqual({ strategy: 'jwt' });
    expect(authOptions.pages).toEqual({ signIn: UI_STRINGS.libAuth.login, error: UI_STRINGS.libAuth.login });
  });

  it.each([
    { password: 'password' },
    { email: 'user@example.test' },
    { email: '', password: 'password' },
  ])('rejects credentials with missing email or password', async (credentials) => {
    await expect(authorize(credentials)).resolves.toBeNull();
    expect(userModel.findFirst).not.toHaveBeenCalled();
  });

  it('normalizes email, validates the password, updates login time, and returns session fields', async () => {
    userModel.findFirst.mockResolvedValue(dbUser);

    await expect(authorize({ email: '  USER@EXAMPLE.TEST  ', password: 'secret' })).resolves.toEqual({
      id: 'user-1',
      email: 'user@example.test',
      name: 'User One',
      role: 'PROJECT_USER',
      tenantId: 'tenant-1',
      tenantName: 'Tenant One',
      tenantSlug: 'tenant-one',
      vendorId: null,
    });
    expect(userModel.findFirst).toHaveBeenCalledWith({
      where: { email: 'user@example.test', status: UI_STRINGS.common.aCTIVE }, include: { tenant: true },
    });
    expect(compare).toHaveBeenCalledWith('secret', 'hashed-password');
    expect(userModel.update).toHaveBeenCalledWith({
      where: { id: 'user-1' }, data: { lastLoginAt: expect.any(Date) },
    });
  });

  it('rejects an incorrect password without changing login history', async () => {
    userModel.findFirst.mockResolvedValue(dbUser);
    compare.mockResolvedValue(false);

    await expect(authorize({ email: 'user@example.test', password: 'wrong' })).resolves.toBeNull();
    expect(userModel.update).not.toHaveBeenCalled();
  });

  it('matches normalized vendor names and user names in non-production', async () => {
    userModel.findMany.mockResolvedValueOnce([{
      ...dbUser,
      name: '  Vendor   Contact ',
      role: 'VENDOR',
      vendorId: 'vendor-1',
      vendor: { name: 'Acme   Services', code: 'ACME-01' },
    }]);

    await expect(authorize({ email: '  ACME SERVICES ', password: 'secret' })).resolves.toMatchObject({
      id: 'user-1', role: 'VENDOR', vendorId: 'vendor-1',
    });
    expect(userModel.findMany).toHaveBeenCalledWith({
      where: { role: UI_STRINGS.common.vENDOR, status: UI_STRINGS.common.aCTIVE, vendorId: { not: null } },
      include: { tenant: true, vendor: true },
    });
  });

  it('disambiguates same-name vendors by a matching vendor code', async () => {
    userModel.findMany.mockResolvedValueOnce([
      { ...dbUser, id: 'vendor-user-1', role: 'VENDOR', vendor: { name: 'Acme', code: 'OTHER' } },
      { ...dbUser, id: 'vendor-user-2', role: 'VENDOR', vendor: { name: 'Acme', code: 'ACME' } },
    ]);

    await expect(authorize({ email: 'acme', password: 'secret' })).resolves.toMatchObject({ id: 'vendor-user-2' });
  });

  it('rejects ambiguous names, unlinked vendors, and invalid vendor passwords', async () => {
    userModel.findMany.mockResolvedValueOnce([
      { ...dbUser, role: 'VENDOR', vendor: { name: 'Acme', code: 'ONE' } },
      { ...dbUser, id: 'user-2', role: 'VENDOR', vendor: { name: 'Acme', code: 'TWO' } },
      { ...dbUser, id: 'user-3', role: 'VENDOR', name: 'Acme', vendor: null },
    ]);
    await expect(authorize({ email: 'acme', password: 'secret' })).resolves.toBeNull();

    userModel.findMany.mockResolvedValueOnce([
      { ...dbUser, role: 'VENDOR', vendor: { name: 'Acme', code: 'ACME-01' } },
    ]);
    compare.mockResolvedValueOnce(false);
    await expect(authorize({ email: 'acme', password: 'wrong' })).resolves.toBeNull();
  });

  it('does not use vendor-name login in production', async () => {
    Reflect.set(process.env, 'NODE_ENV', 'production');
    await expect(authorize({ email: 'acme services', password: 'secret' })).resolves.toBeNull();
    expect(userModel.findMany).not.toHaveBeenCalled();
  });
});

describe('NextAuth callbacks', () => {
  it('copies identity fields from the authenticated user into the JWT', async () => {
    const token = { subject: 'token-subject' };
    await expect(authOptions.callbacks.jwt({
      token,
      user: {
        id: 'user-1', role: 'VENDOR', tenantId: 'tenant-1', tenantName: 'Tenant One',
        tenantSlug: 'tenant-one', vendorId: 'vendor-1',
      },
    })).resolves.toEqual({
      subject: 'token-subject', id: 'user-1', role: UI_STRINGS.common.vENDOR, tenantId: 'tenant-1',
      tenantName: 'Tenant One', tenantSlug: 'tenant-one', vendorId: 'vendor-1',
    });
  });

  it('returns the original token when no user is supplied', async () => {
    const token = { subject: 'token-subject' };
    await expect(authOptions.callbacks.jwt({ token, user: undefined })).resolves.toBe(token);
  });

  it('adds JWT identity fields to the session', async () => {
    const session = { user: { name: 'User One', email: 'user@example.test' } };
    await expect(authOptions.callbacks.session({
      session,
      token: {
        id: 'user-1', role: 'PROJECT_USER', tenantId: 'tenant-1', tenantName: 'Tenant One',
        tenantSlug: 'tenant-one', vendorId: null,
      },
    })).resolves.toEqual({ user: {
      name: 'User One', email: 'user@example.test', id: 'user-1', role: 'PROJECT_USER', tenantId: 'tenant-1',
      tenantName: 'Tenant One', tenantSlug: 'tenant-one', vendorId: null,
    } });
  });

  it('leaves the session unchanged without a token', async () => {
    const session = { user: { name: 'User One' } };
    await expect(authOptions.callbacks.session({ session, token: null })).resolves.toBe(session);
  });
});
