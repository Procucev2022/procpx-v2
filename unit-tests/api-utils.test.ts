import { headers } from 'next/headers';
import { auth } from '../src/lib/auth';
import { prisma } from '../src/lib/prisma';
import {
  apiError,
  apiSuccess,
  isApiContext,
  paginate,
  getListPageWindow,
  requireAuth,
  setTestAuthContext,
} from '../src/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { logEvent } from '../src/lib/observability/server-logger';


jest.mock('../src/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('../src/lib/prisma', () => ({
  prisma: { user: { findFirst: jest.fn(), findUnique: jest.fn() } },
}));
jest.mock('next/headers', () => ({ headers: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ logEvent: jest.fn() }));
const structuredLog = logEvent as jest.Mock;

const authMock = auth as jest.Mock;
const headersMock = headers as jest.Mock;
const userModel = prisma.user as unknown as { findFirst: jest.Mock; findUnique: jest.Mock };

const dbUser = {
  id: 'user-1',
  tenantId: 'tenant-1',
  role: 'SUPER_ADMIN',
  name: 'A User',
  email: 'a@example.test',
  vendorId: null,
  tenant: { name: 'Tenant One' },
};

async function responseJson(response: unknown) {
  if (!(response instanceof Response)) throw new Error('Expected an HTTP response.');
  return { status: response.status, body: await response.json() };
}

describe('API response helpers', () => {
  it('recognizes an API context by its user identifier', () => {
    expect(isApiContext({ userId: 'u1' })).toBe(true);
    expect(isApiContext(null)).toBe(false);
    expect(isApiContext('u1')).toBe(false);
    expect(isApiContext({ tenantId: 't1' })).toBe(false);
  });

  it('creates JSON success and error responses', async () => {
    await expect(responseJson(apiSuccess({ ok: true }))).resolves.toEqual({ status: 200, body: { ok: true } });
    await expect(responseJson(apiSuccess({ created: true }, 201))).resolves.toEqual({ status: 201, body: { created: true } });
    await expect(responseJson(apiError('invalid'))).resolves.toEqual({ status: 400, body: { error: 'invalid' } });
    await expect(responseJson(apiError('denied', 403))).resolves.toEqual({ status: 403, body: { error: 'denied' } });
    await expect(responseJson(apiError('internal failure', 500))).resolves.toEqual({
      status: 500, body: { error: UI_STRINGS.common.userMessages.anUnexpectedErrorOccurred },
    });
    expect(structuredLog).toHaveBeenCalledWith('error', 'http.api_error_response', {
      operation: 'api_error_response', status: 500,
      publicError: UI_STRINGS.common.userMessages.anUnexpectedErrorOccurred, error: 'internal failure',
    });
    await expect(responseJson(apiError(UI_STRINGS.common.userMessages.failedToCreatePr, 500))).resolves.toEqual({
      status: 500, body: { error: UI_STRINGS.common.userMessages.failedToCreatePr },
    });
  });

  it('paginates a list and empty pages', () => {
    expect(paginate(['a', 'b', 'c', 'd', 'e'], 2, 2)).toEqual({
      data: ['c', 'd'], total: 5, page: 2, pageSize: 2, totalPages: 3,
    });
    expect(paginate([], 1, 10)).toEqual({ data: [], total: 0, page: 1, pageSize: 10, totalPages: 0 });
  });

  it('bounds database list windows and falls back on invalid pagination values', () => {
    expect(getListPageWindow(new URLSearchParams())).toEqual({ page: 1, pageSize: 50, skip: 0 });
    expect(getListPageWindow(new URLSearchParams('page=3&pageSize=25'))).toEqual({ page: 3, pageSize: 25, skip: 50 });
    expect(getListPageWindow(new URLSearchParams('page=2&pageSize=1000'))).toEqual({ page: 2, pageSize: 100, skip: 100 });
    expect(getListPageWindow(new URLSearchParams('page=-3&pageSize=0'))).toEqual({ page: 1, pageSize: 50, skip: 0 });
    expect(getListPageWindow(new URLSearchParams('page=2.5&pageSize=abc'))).toEqual({ page: 1, pageSize: 50, skip: 0 });
    expect(getListPageWindow(new URLSearchParams('page=9007199254740992&pageSize=9007199254740992')))
      .toEqual({ page: 1, pageSize: 50, skip: 0 });
  });
});

describe('requireAuth', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    setTestAuthContext(null);
    Reflect.set(process.env, 'NODE_ENV', 'test');
    authMock.mockResolvedValue(null);
    headersMock.mockRejectedValue(new Error('outside request context'));
    userModel.findFirst.mockResolvedValue(dbUser);
    userModel.findUnique.mockResolvedValue({ vendorId: 'vendor-1' });
  });

  afterEach(() => {
    setTestAuthContext(null);
    if (originalNodeEnv === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
    else Reflect.set(process.env, 'NODE_ENV', originalNodeEnv);
  });

  it('loads an authorized user from the explicit test context', async () => {
    setTestAuthContext({ userId: 'user-1' });

    await expect(requireAuth('PROJECT_CREATE')).resolves.toEqual({
      userId: 'user-1', tenantId: 'tenant-1', tenantName: 'Tenant One', role: 'SUPER_ADMIN',
      userName: 'A User', userEmail: 'a@example.test', vendorId: null,
    });
    expect(userModel.findFirst).toHaveBeenCalledWith({
      where: { id: 'user-1' }, include: { tenant: true },
    });
    expect(authMock).not.toHaveBeenCalled();
  });

  it('uses fallback tenant and display names when optional profile values are blank', async () => {
    setTestAuthContext({ userId: 'user-1' });
    userModel.findFirst.mockResolvedValueOnce({
      ...dbUser,
      name: '',
      email: '',
      tenant: null,
    });

    await expect(requireAuth()).resolves.toMatchObject({
      tenantName: 'Default Tenant',
      userName: 'User',
    });
  });

  it('supports tenant-only test context and rejects missing or unauthorized users', async () => {
    setTestAuthContext({ tenantId: 'tenant-1' });
    userModel.findFirst.mockResolvedValueOnce(dbUser);
    await expect(requireAuth()).resolves.toMatchObject({ tenantId: 'tenant-1' });
    expect(userModel.findFirst).toHaveBeenLastCalledWith({
      where: { tenantId: 'tenant-1' }, include: { tenant: true },
    });

    setTestAuthContext({ userId: 'missing-user' });
    userModel.findFirst.mockResolvedValueOnce(null);
    await expect(responseJson(await requireAuth())).resolves.toEqual({
      status: 401, body: { error: UI_STRINGS.libApiUtils.unauthenticated },
    });

    setTestAuthContext({ userId: 'user-1' });
    userModel.findFirst.mockResolvedValueOnce({ ...dbUser, role: 'VIEWER' });
    await expect(responseJson(await requireAuth('PROJECT_CREATE'))).resolves.toEqual({
      status: 403, body: { error: UI_STRINGS.common.forbiddenInsufficientPermissions },
    });
  });

  it('returns unauthenticated when auth and request headers have no identity', async () => {
    await expect(responseJson(await requireAuth())).resolves.toEqual({
      status: 401, body: { error: UI_STRINGS.libApiUtils.unauthenticated },
    });

    authMock.mockRejectedValueOnce(new Error('no request context'));
    await expect(responseJson(await requireAuth())).resolves.toEqual({
      status: 401, body: { error: UI_STRINGS.libApiUtils.unauthenticated },
    });
  });

  it('ignores development identity headers and requires a session', async () => {
    headersMock.mockResolvedValue({ get: (name: string) => name === 'x-test-user-id' ? 'header-user' : null });
    await expect(responseJson(await requireAuth())).resolves.toEqual({
      status: 401, body: { error: UI_STRINGS.libApiUtils.unauthenticated },
    });
    expect(userModel.findFirst).not.toHaveBeenCalled();
  });

  it('uses the session user and resolves a vendor link when needed', async () => {
    authMock.mockResolvedValue({ user: {
      id: 'session-user', tenantId: 'tenant-2', tenantName: 'Session Tenant', role: 'VENDOR', email: 'vendor@example.test',
    } });

    await expect(requireAuth()).resolves.toEqual({
      userId: 'session-user', tenantId: 'tenant-2', tenantName: 'Session Tenant', role: UI_STRINGS.common.vENDOR,
      userName: 'vendor@example.test', userEmail: 'vendor@example.test', vendorId: 'vendor-1',
    });
    expect(userModel.findUnique).toHaveBeenCalledWith({ where: { id: 'session-user' }, select: { vendorId: true } });

    authMock.mockResolvedValueOnce({ user: { id: 'session-user', tenantId: 'tenant-2', role: 'SUPER_ADMIN', name: 'Admin' } });
    await expect(requireAuth('PROJECT_CREATE')).resolves.toMatchObject({ userName: 'Admin', vendorId: undefined });
  });

  it('denies session permissions and tolerates vendor lookup failures', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'viewer', tenantId: 'tenant-1', role: 'VIEWER' } });
    await expect(responseJson(await requireAuth('PROJECT_CREATE'))).resolves.toEqual({
      status: 403, body: { error: UI_STRINGS.common.forbiddenInsufficientPermissions },
    });

    userModel.findUnique.mockRejectedValueOnce(new Error('lookup failed'));
    authMock.mockResolvedValueOnce({ user: { id: 'vendor', tenantId: 'tenant-1', role: 'VENDOR' } });
    await expect(requireAuth()).resolves.toMatchObject({ vendorId: undefined });
    expect(structuredLog).toHaveBeenCalledWith('warn', 'auth.vendor_lookup_failed', expect.objectContaining({ userId: 'vendor', tenantId: 'tenant-1' }));

    userModel.findUnique.mockResolvedValueOnce(null);
    authMock.mockResolvedValueOnce({ user: { id: 'vendor', tenantId: 'tenant-1', role: 'VENDOR' } });
    await expect(requireAuth()).resolves.toMatchObject({ vendorId: null });
  });

  it('does not read development headers in production', async () => {
    Reflect.set(process.env, 'NODE_ENV', 'production');
    await expect(responseJson(await requireAuth())).resolves.toEqual({
      status: 401, body: { error: UI_STRINGS.libApiUtils.unauthenticated },
    });
    expect(headersMock).not.toHaveBeenCalled();
  });
});
