import NextAuth from 'next-auth';
import { prisma } from '../src/lib/prisma';
import { verifyPassword } from '../src/lib/password';
import { logEvent } from '../src/lib/observability/server-logger';
import {
  AUTH_ACCOUNT_RECHECK_INTERVAL_MS,
  AUTH_MAX_FAILED_LOGIN_ATTEMPTS,
  AUTH_TIMING_DUMMY_HASH,
} from '../src/lib/auth.constants';
import '../src/lib/auth';

jest.mock('next-auth', () => ({
  __esModule: true,
  default: jest.fn(() => ({ handlers: {}, auth: jest.fn(), signIn: jest.fn(), signOut: jest.fn() })),
}));
jest.mock('next-auth/providers/credentials', () => ({
  __esModule: true,
  default: (options: unknown) => ({ id: 'credentials', options }),
}));
jest.mock('../src/lib/prisma', () => ({
  prisma: { user: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() } },
}));
jest.mock('../src/lib/password', () => ({
  verifyPassword: jest.fn(),
  hashPassword: jest.fn(),
  passwordNeedsRehash: jest.fn(() => false),
}));
jest.mock('../src/lib/observability/server-logger', () => ({ logEvent: jest.fn() }));

const config = (NextAuth as unknown as jest.Mock).mock.calls[0][0];
const authorize = config.providers[0].options.authorize as (credentials: Record<string, string>) => Promise<unknown>;
const jwt = config.callbacks.jwt as (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
const session = config.callbacks.session as (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
const users = prisma.user as unknown as { findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
const verify = verifyPassword as unknown as jest.Mock;
const log = logEvent as unknown as jest.Mock;

const dbUser = {
  id: 'user-1',
  email: 'user@example.test',
  name: 'User',
  role: 'PROJECT_USER',
  tenantId: 'tenant-1',
  tenant: { name: 'Tenant One', slug: 'tenant-one' },
  vendorId: null,
  passwordHash: 'stored-hash',
  failedLoginCount: 0,
  lockedUntil: null,
};
const credentials = { email: 'user@example.test', password: 'secret' };

describe('account security during sign-in', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    users.findMany.mockReset();
    users.findMany.mockResolvedValue([]);
  });

  it('refuses a locked account without checking the password or writing anything', async () => {
    users.findMany.mockResolvedValueOnce([{ ...dbUser, lockedUntil: new Date(Date.now() + 60_000) }]);

    await expect(authorize(credentials)).resolves.toBeNull();
    expect(verify).not.toHaveBeenCalled();
    expect(users.update).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('warn', 'auth.account_locked', expect.objectContaining({ userId: 'user-1' }));
  });

  it('locks the account when a failed password reaches the threshold', async () => {
    users.findMany.mockResolvedValueOnce([{ ...dbUser, failedLoginCount: AUTH_MAX_FAILED_LOGIN_ATTEMPTS - 1 }]);
    verify.mockResolvedValueOnce(false);

    await expect(authorize(credentials)).resolves.toBeNull();
    const data = users.update.mock.calls[0][0].data;
    expect(data.failedLoginCount).toBe(AUTH_MAX_FAILED_LOGIN_ATTEMPTS);
    expect(data.lockedUntil).toBeInstanceOf(Date);
    expect(log).toHaveBeenCalledWith('warn', 'auth.login_failed', expect.objectContaining({ failures: AUTH_MAX_FAILED_LOGIN_ATTEMPTS, locked: true }));
  });

  it('keeps counting below the threshold without locking the account', async () => {
    users.findMany.mockResolvedValueOnce([dbUser]);
    verify.mockResolvedValueOnce(false);

    await expect(authorize(credentials)).resolves.toBeNull();
    expect(users.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { failedLoginCount: 1, lockedUntil: null } });
  });

  it('still rejects the password and logs when the failure counter cannot be written', async () => {
    users.findMany.mockResolvedValueOnce([dbUser]);
    verify.mockResolvedValueOnce(false);
    users.update.mockRejectedValueOnce(new Error('D1 unavailable'));

    await expect(authorize(credentials)).resolves.toBeNull();
    expect(log).toHaveBeenCalledWith('error', 'auth.failed_login_record_failed', expect.objectContaining({ userId: 'user-1' }));
  });

  it('clears an earlier failure streak after a successful sign-in', async () => {
    users.findMany.mockResolvedValueOnce([{ ...dbUser, failedLoginCount: 3 }]);
    verify.mockResolvedValueOnce(true);

    await expect(authorize(credentials)).resolves.toMatchObject({ id: 'user-1', tenantSlug: 'tenant-one' });
    expect(users.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ failedLoginCount: 0, lockedUntil: null }),
    }));
  });

  it('spends comparable password time for an unknown email', async () => {
    await expect(authorize({ email: 'nobody@example.test', password: 'secret' })).resolves.toBeNull();
    expect(verify).toHaveBeenCalledWith('secret', AUTH_TIMING_DUMMY_HASH);
    expect(users.update).not.toHaveBeenCalled();
  });
});

describe('session account rechecks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('revokes a session whose account has been deactivated since sign-in', async () => {
    users.findUnique.mockResolvedValueOnce({ role: 'PROJECT_USER', status: 'INACTIVE', tenantId: 'tenant-1', vendorId: null, tenant: { name: 'T', slug: 't' } });
    const token = await jwt({ token: { id: 'user-1', role: 'PROJECT_USER', checkedAt: 0 } });

    expect(token).toMatchObject({ revoked: true });
    expect(log).toHaveBeenCalledWith('warn', 'auth.session_revoked', expect.objectContaining({ userId: 'user-1' }));
    await expect(session({ session: { expires: 'later', user: { id: 'user-1' } }, token })).resolves.toEqual({ expires: 'later' });
  });

  it('revokes a session whose account no longer exists', async () => {
    users.findUnique.mockResolvedValueOnce(null);
    await expect(jwt({ token: { id: 'deleted-user', checkedAt: 0 } })).resolves.toMatchObject({ revoked: true });
  });

  it('applies a changed role and tenant once the recheck interval has passed', async () => {
    users.findUnique.mockResolvedValueOnce({ role: 'CLIENT_ADMIN', status: 'ACTIVE', tenantId: 'tenant-2', vendorId: null, tenant: { name: 'Tenant Two', slug: 'two' } });
    const token = await jwt({
      token: { id: 'user-1', role: 'PROJECT_USER', tenantId: 'tenant-1', checkedAt: Date.now() - AUTH_ACCOUNT_RECHECK_INTERVAL_MS - 1 },
    });

    expect(token).toMatchObject({ role: 'CLIENT_ADMIN', tenantId: 'tenant-2', tenantName: 'Tenant Two', tenantSlug: 'two' });
  });

  it('does not query the database while the last check is recent, or once revoked', async () => {
    const recent = { id: 'user-1', role: 'PROJECT_USER', checkedAt: Date.now() };
    await expect(jwt({ token: recent })).resolves.toBe(recent);
    const revoked = { id: 'user-1', revoked: true, checkedAt: 0 };
    await expect(jwt({ token: revoked })).resolves.toBe(revoked);
    await expect(jwt({ token: {} })).resolves.toEqual({});
    expect(users.findUnique).not.toHaveBeenCalled();
  });

  it('exposes identity fields for a valid session', async () => {
    const result = await session({
      session: { expires: 'later', user: {} },
      token: { id: 'user-1', role: 'VIEWER', tenantId: 'tenant-1', tenantName: 'Tenant One', tenantSlug: 'tenant-one', vendorId: null },
    });

    expect(result).toMatchObject({ user: { id: 'user-1', role: 'VIEWER', tenantId: 'tenant-1' } });
  });
});
