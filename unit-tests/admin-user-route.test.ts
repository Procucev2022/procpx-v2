import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { createAuditLog } from '../src/lib/audit';
import { runAuditedD1UpdateAtomically } from '../src/lib/audited-update';
import { isApiContext, requireAuth } from '../src/lib/api-utils';
import bcrypt from 'bcryptjs';
import { PASSWORD_HASH_ROUNDS } from '../src/lib/password.constants';
import { GET as listUsers, POST as createUser } from '../src/app/api/admin/users/route';
import { PUT } from '../src/app/api/admin/users/[id]/route';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { writeStructuredLog } from '../src/lib/observability/server-logger';


jest.mock('../src/lib/prisma', () => ({
  prisma: { user: { count: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), create: jest.fn() } },
}));
jest.mock('../src/lib/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('../src/lib/audited-update', () => ({ runAuditedD1UpdateAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));
jest.mock('bcryptjs', () => ({ hash: jest.fn() }));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  getListPageWindow: (params: URLSearchParams) => {
    const rawPage = Number(params.get('page'));
    const rawPageSize = Number(params.get('pageSize'));
    const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 1_000_000) : 1;
    const pageSize = Number.isSafeInteger(rawPageSize) && rawPageSize > 0 ? Math.min(rawPageSize, 100) : 50;
    return { page, pageSize, skip: (page - 1) * pageSize };
  },
}));

const userDb = prisma.user as unknown as {
  count: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock; create: jest.Mock;
};
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
const auditedUpdate = runAuditedD1UpdateAtomically as jest.Mock;
const passwordHash = bcrypt.hash as jest.Mock;
const logger = writeStructuredLog as jest.Mock;
const ctx = { tenantId: 'tenant-1', userId: 'editor-1', role: 'ADMIN' };
const makeRequest = (body: unknown, method = 'PUT', url = 'http://localhost/api/admin/users/user-1') => new NextRequest(url, {
  method,
  ...(method === 'GET' || method === 'HEAD' ? {} : { body: JSON.stringify(body) }),
});
const params = { params: Promise.resolve({ id: 'user-1' }) };

describe('admin user update route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(ctx);
    isContext.mockReturnValue(true);
    audit.mockResolvedValue(undefined);
    auditedUpdate.mockResolvedValue(undefined);
    passwordHash.mockResolvedValue('hashed-secret');
  });

  it('lists users by tenant with defaults and optional search pagination', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(listUsers(makeRequest({}, 'GET', 'http://localhost/api/admin/users'))).resolves.toBe(denied);

    userDb.count.mockResolvedValue(21);
    userDb.findMany.mockResolvedValue([{ id: 'user-1' }]);
    await expect(listUsers(makeRequest({}, 'GET', 'http://localhost/api/admin/users'))).resolves.toEqual({
      ok: true, data: { data: [{ id: 'user-1' }], total: 21, page: 1, pageSize: 50, totalPages: 1 }, status: 200,
    });
    expect(userDb.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1' }, skip: 0, take: 50, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }));

    await listUsers(makeRequest({}, 'GET', 'http://localhost/api/admin/users?page=2&pageSize=5&search=ada'));
    expect(userDb.count).toHaveBeenLastCalledWith({ where: {
      tenantId: 'tenant-1', OR: [{ name: { contains: 'ada' } }, { email: { contains: 'ada' } }],
    } });
    expect(userDb.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 5, take: 5 }));

    await listUsers(makeRequest({}, 'GET', `http://localhost/api/admin/users?page=-1&pageSize=10000&search=${'a'.repeat(250)}`));
    expect(userDb.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 0, take: 100 }));
    expect(logger).not.toHaveBeenCalled();

    userDb.findMany.mockRejectedValueOnce(new Error('database details'));
    await expect(listUsers(makeRequest({}, 'GET', 'http://localhost/api/admin/users'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiAdminUsersRoute.failedToFetchUsers, status: 500,
    });
    expect(logger).toHaveBeenCalledWith('error', 'admin.user_list_read_failed', expect.objectContaining({ tenantId: 'tenant-1', userId: 'editor-1' }));

    userDb.findMany.mockRejectedValueOnce({ cause: 'unavailable' });
    await expect(listUsers(makeRequest({}, 'GET', 'http://localhost/api/admin/users'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiAdminUsersRoute.failedToFetchUsers, status: 500,
    });
    expect(logger).toHaveBeenLastCalledWith('error', 'admin.user_list_read_failed', expect.objectContaining({
      error: { type: 'object' },
    }));
  });

  it('validates user creation, prevents duplicate accounts and hashes the password', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(createUser(makeRequest({}, 'POST'))).resolves.toBe(denied);

    const create = (body: unknown) => createUser(makeRequest(body, 'POST'));
    await expect(create({ email: ' ' })).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiAdminUsersRoute.emailIsRequired, status: 400 });
    await expect(create({ email: 'ada@example.test', name: ' ' })).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiAdminUsersRoute.nameIsRequired, status: 400 });
    await expect(create({ email: 'ada@example.test', name: 'Ada' })).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiAdminUsersRoute.roleIsRequired, status: 400 });
    await expect(create({ email: 'ada@example.test', name: 'Ada', role: 'BUYER', password: 'short' })).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiAdminUsersRoute.passwordMustBeAtLeast8Characters, status: 400,
    });
    await expect(create({ email: 'ada@example.test', name: 'Ada', role: 'BUYER' })).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiAdminUsersRoute.passwordMustBeAtLeast8Characters, status: 400,
    });

    userDb.findFirst.mockResolvedValueOnce({ id: 'existing' });
    await expect(create({ email: 'ada@example.test', name: 'Ada', role: 'BUYER', password: 'long-password' })).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiAdminUsersRoute.aUserWithThisEmailAlreadyExists, status: 400,
    });

    userDb.findFirst.mockResolvedValueOnce(null);
    userDb.create.mockResolvedValue({ id: 'new-user', email: 'ada@example.test' });
    await expect(create({ email: ' ADA@EXAMPLE.TEST ', name: ' Ada Lovelace ', role: 'BUYER', password: 'long-password' })).resolves.toEqual({
      ok: true, data: { id: 'new-user', email: 'ada@example.test' }, status: 201,
    });
    expect(passwordHash).toHaveBeenCalledWith('long-password', PASSWORD_HASH_ROUNDS);
    expect(userDb.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-1', email: 'ada@example.test', name: 'Ada Lovelace', role: 'BUYER',
        passwordHash: 'hashed-secret', status: UI_STRINGS.common.aCTIVE, createdBy: 'editor-1',
      },
      select: { id: true, email: true, name: true, role: true, status: true, createdAt: true },
    });
  });

  it('requires a user-edit context and reports missing users', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(PUT(makeRequest({}), params)).resolves.toBe(denied);

    userDb.findFirst.mockResolvedValueOnce(null);
    await expect(PUT(makeRequest({}), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiAdminUsersIdRoute.userNotFound, status: 404 });
    expect(userDb.findFirst).toHaveBeenCalledWith({ where: { id: 'user-1', tenantId: 'tenant-1' } });
    expect(userDb.update).not.toHaveBeenCalled();
  });

  it('trims supplied names, preserves nullish fields and audits the change', async () => {
    userDb.findFirst.mockResolvedValue({ id: 'user-1', email: 'member@example.test', name: 'Old name', role: 'BUYER', status: 'ACTIVE' });
    const updated = { id: 'user-1', email: 'member@example.test', name: 'New name', role: 'BUYER', status: 'ACTIVE', updatedAt: new Date('2026-01-01') };
    auditedUpdate.mockResolvedValue(updated);

    await expect(PUT(makeRequest({ name: ' New name ', role: null, status: undefined }), params)).resolves.toEqual({
      ok: true, data: updated, status: 200,
    });
    expect(auditedUpdate).toHaveBeenCalledWith(expect.objectContaining({
      table: 'user', id: 'user-1', tenantId: 'tenant-1',
      data: { name: 'New name', role: 'BUYER', status: UI_STRINGS.common.aCTIVE, updatedBy: 'editor-1' },
      route: '/api/admin/users/[id]',
      audit: expect.objectContaining({
        tenantId: 'tenant-1', userId: 'editor-1', entityType: UI_STRINGS.appAppAuditPage.uSER, entityId: 'user-1', action: UI_STRINGS.appAppAuditPage.uPDATE,
      description: 'User member@example.test updated (Role: BUYER, Status: ACTIVE)',
      oldValue: { role: 'BUYER', status: UI_STRINGS.common.aCTIVE }, newValue: { role: 'BUYER', status: UI_STRINGS.common.aCTIVE },
      }),
    }));
    expect(audit).not.toHaveBeenCalled();
  });

  it('keeps prior user values when fields are nullish and applies supplied role and status', async () => {
    userDb.findFirst.mockResolvedValue({ id: 'user-1', email: 'member@example.test', name: 'Prior', role: 'BUYER', status: 'ACTIVE' });
    userDb.update.mockResolvedValue({ id: 'user-1', name: 'Prior', role: 'MANAGER', status: 'INACTIVE' });
    await PUT(makeRequest({ name: null, role: 'MANAGER', status: 'INACTIVE' }), params);
    expect(auditedUpdate).toHaveBeenCalledWith(expect.objectContaining({
      table: 'user', id: 'user-1', tenantId: 'tenant-1', route: '/api/admin/users/[id]',
      data: { name: 'Prior', role: 'MANAGER', status: 'INACTIVE', updatedBy: 'editor-1' },
      audit: expect.objectContaining({ entityType: 'USER', entityId: 'user-1' }),
    }));
  });
});
