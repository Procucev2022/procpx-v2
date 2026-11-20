import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { createAuditLog } from '../src/lib/audit';
import { runAuditedD1UpdateAtomically } from '../src/lib/audited-update';
import { isApiContext, requireAuth } from '../src/lib/api-utils';
import bcrypt from 'bcryptjs';
import { PASSWORD_HASH_ROUNDS } from '../src/lib/password.constants';
import { GET as listUsers, POST as createUser } from '../src/app/api/admin/users/route';
import { PUT } from '../src/app/api/admin/users/[id]/route';
import { USER_INSERT_IF_EMAIL_AVAILABLE_SQL } from '../src/app/api/admin/users/route.constants';
import { checkRoleCapacity } from '../src/lib/tenant-role-limits';
import { AUDIT_LOG_INSERT_AFTER_CHANGE_SQL } from '../src/lib/d1-batch.constants';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from '@/lib/i18n';
import { writeStructuredLog } from '../src/lib/observability/server-logger';


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    user: { count: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
    tenant: { findFirst: jest.fn() },
  },
}));
jest.mock('../src/lib/tenant-role-limits', () => ({ checkRoleCapacity: jest.fn() }));
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn() }));
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
const tenantDb = prisma.tenant as unknown as { findFirst: jest.Mock };
const capacity = checkRoleCapacity as jest.Mock;
const batch = writeD1BatchAtomically as jest.Mock;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
const auditedUpdate = runAuditedD1UpdateAtomically as jest.Mock;
const passwordHash = bcrypt.hash as jest.Mock;
const logger = writeStructuredLog as jest.Mock;
const ctx = { tenantId: 'tenant-1', userId: 'editor-1', role: 'CLIENT_ADMIN' };
const superCtx = { tenantId: 'tenant-1', userId: 'root-1', role: 'SUPER_ADMIN' };
const RETAIL = { id: 'tenant-1', name: 'Procucev Retail Demo' };
const HOSPITALITY = { id: 'tenant-2', name: 'Procucev Hospitality Demo' };
const makeRequest = (body: unknown, method = 'PUT', url = 'http://localhost/api/admin/users/user-1') => new NextRequest(url, {
  method,
  ...(method === 'GET' || method === 'HEAD' ? {} : { body: JSON.stringify(body) }),
});
const params = { params: Promise.resolve({ id: 'user-1' }) };
const create = (body: unknown) => createUser(makeRequest(body, 'POST', 'http://localhost/api/admin/users'));
const VALID = { email: ' ADA@EXAMPLE.TEST ', name: ' Ada Lovelace ', role: 'FINANCE_USER', password: 'long-password' };
const changed = (changes: number) => ({ success: true, meta: { changes } });

describe('admin users API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(ctx);
    isContext.mockReturnValue(true);
    audit.mockResolvedValue(undefined);
    auditedUpdate.mockResolvedValue(undefined);
    passwordHash.mockResolvedValue('hashed-secret');
    userDb.findFirst.mockResolvedValue(null);
    tenantDb.findFirst.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(
      [RETAIL, HOSPITALITY].find((tenant) => tenant.id === where.id) ?? null,
    ));
    capacity.mockResolvedValue({ allowed: true, maxUsers: null, activeUsers: 0 });
    batch.mockResolvedValue([changed(1), changed(1)]);
  });

  describe('GET /api/admin/users', () => {
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
        select: expect.objectContaining({ tenant: { select: { id: true, name: true } } }),
      }));

      await listUsers(makeRequest({}, 'GET', 'http://localhost/api/admin/users?page=2&pageSize=5&search=ada'));
      expect(userDb.count).toHaveBeenLastCalledWith({ where: {
        tenantId: 'tenant-1', OR: [{ name: { contains: 'ada' } }, { email: { contains: 'ada' } }],
      } });
      expect(userDb.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 5, take: 5 }));

      await listUsers(makeRequest({}, 'GET', `http://localhost/api/admin/users?page=-1&pageSize=10000&search=${'a'.repeat(250)}`));
      expect(userDb.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 0, take: 100 }));
      expect(logger).not.toHaveBeenCalled();
    });

    it('lets only a Super Admin list users across every business', async () => {
      auth.mockResolvedValue(superCtx);
      userDb.count.mockResolvedValue(0);
      userDb.findMany.mockResolvedValue([]);
      await listUsers(makeRequest({}, 'GET', 'http://localhost/api/admin/users?search=ada'));
      expect(userDb.count).toHaveBeenLastCalledWith({ where: { OR: [{ name: { contains: 'ada' } }, { email: { contains: 'ada' } }] } });
    });

    it('logs sanitized read failures', async () => {
      userDb.count.mockResolvedValue(0);
      userDb.findMany.mockRejectedValueOnce(new Error('database details'));
      await expect(listUsers(makeRequest({}, 'GET', 'http://localhost/api/admin/users'))).resolves.toEqual({
        ok: false, error: UI_STRINGS.appApiAdminUsersRoute.failedToFetchUsers, status: 500,
      });
      expect(logger).toHaveBeenCalledWith('error', 'admin.user_list_read_failed', expect.objectContaining({ tenantId: 'tenant-1', userId: 'editor-1' }));

      userDb.findMany.mockRejectedValueOnce({ cause: 'unavailable' });
      await listUsers(makeRequest({}, 'GET', 'http://localhost/api/admin/users'));
      expect(logger).toHaveBeenLastCalledWith('error', 'admin.user_list_read_failed', expect.objectContaining({
        error: { type: 'object' },
      }));
    });
  });

  describe('POST /api/admin/users', () => {
    it('requires a user-create context and validates every field', async () => {
      const denied = { status: 403 };
      auth.mockResolvedValueOnce(denied);
      isContext.mockReturnValueOnce(false);
      await expect(create({})).resolves.toBe(denied);

      const bad = (error: string) => ({ ok: false, error, status: 400 });
      await expect(create({ email: ' ' })).resolves.toEqual(bad(UI_STRINGS.appApiAdminUsersRoute.emailIsRequired));
      await expect(create({ email: 42 })).resolves.toEqual(bad(UI_STRINGS.appApiAdminUsersRoute.emailIsRequired));
      await expect(create({ email: 'ada@example.test', name: ' ' })).resolves.toEqual(bad(UI_STRINGS.appApiAdminUsersRoute.nameIsRequired));
      await expect(create({ email: 'ada@example.test', name: 'Ada' })).resolves.toEqual(bad(UI_STRINGS.appApiAdminUsersRoute.roleIsRequired));
      await expect(create({ ...VALID, role: 'SUPER_ADMIN' })).resolves.toEqual(bad(UI_STRINGS.appApiAdminUsersRoute.roleIsInvalid));
      await expect(create({ ...VALID, role: 'VENDOR' })).resolves.toEqual(bad(UI_STRINGS.appApiAdminUsersRoute.roleIsInvalid));
      await expect(create({ ...VALID, password: 'short' })).resolves.toEqual(bad(UI_STRINGS.appApiAdminUsersRoute.passwordMustBeAtLeast8Characters));
      await expect(create({ ...VALID, password: undefined })).resolves.toEqual(bad(UI_STRINGS.appApiAdminUsersRoute.passwordMustBeAtLeast8Characters));
      expect(batch).not.toHaveBeenCalled();
    });

    it('rejects an email that already exists in any business', async () => {
      userDb.findFirst.mockResolvedValueOnce({ id: 'existing' });
      await expect(create(VALID)).resolves.toEqual({
        ok: false, error: UI_STRINGS.appApiAdminUsersRoute.aUserWithThisEmailAlreadyExists, status: 400,
      });
      expect(userDb.findFirst).toHaveBeenCalledWith({ where: { email: 'ada@example.test' }, select: { id: true } });
      expect(batch).not.toHaveBeenCalled();
    });

    it('creates the user in the admin\'s own business with a hashed password and an audit row', async () => {
      const response = await create({ ...VALID, businessId: 'tenant-1' });
      expect(response).toEqual({
        ok: true, status: 201,
        data: expect.objectContaining({
          email: 'ada@example.test', name: 'Ada Lovelace', role: 'FINANCE_USER', status: 'ACTIVE', tenant: RETAIL,
        }),
      });
      expect(passwordHash).toHaveBeenCalledWith('long-password', PASSWORD_HASH_ROUNDS);
      expect(tenantDb.findFirst).toHaveBeenCalledWith({ where: { id: 'tenant-1' }, select: { id: true, name: true } });
      expect(capacity).toHaveBeenCalledWith('tenant-1', 'FINANCE_USER');
      const [statements] = batch.mock.calls[0];
      expect(statements.map((s: { sql: string }) => s.sql)).toEqual([USER_INSERT_IF_EMAIL_AVAILABLE_SQL, AUDIT_LOG_INSERT_AFTER_CHANGE_SQL]);
      expect(statements[0].values).toEqual([
        expect.any(String), 'tenant-1', 'ada@example.test', 'Ada Lovelace', 'hashed-secret', 'FINANCE_USER', 'ACTIVE',
        expect.any(Date), expect.any(Date), 'editor-1', 'tenant-1', 'ada@example.test', 'tenant-1', 'FINANCE_USER',
      ]);
      expect(statements[1].values[1]).toBe('tenant-1');
      expect(statements[1].values[4]).toBe('USER');
      expect(logger).toHaveBeenCalledWith('info', 'admin.user_created', expect.objectContaining({ targetBusinessId: 'tenant-1' }));
    });

    it('auto-selects the Client Admin\'s own business when no company is sent', async () => {
      await create(VALID);
      expect(batch.mock.calls[0][0][0].values[1]).toBe('tenant-1');
    });

    it('stops a Client Admin from adding users to another business', async () => {
      await expect(create({ ...VALID, businessId: 'tenant-2' })).resolves.toEqual({
        ok: false, error: UI_STRINGS.appApiAdminUsersRoute.youCanOnlyAddUsersToYourOwnBusiness, status: 403,
      });
      expect(batch).not.toHaveBeenCalled();
    });

    it('requires a Super Admin to pick an existing company from the dropdown', async () => {
      auth.mockResolvedValue(superCtx);
      await expect(create(VALID)).resolves.toEqual({
        ok: false, error: UI_STRINGS.appApiAdminUsersRoute.companyIsRequired, status: 400,
      });
      await expect(create({ ...VALID, businessId: 42 })).resolves.toEqual(expect.objectContaining({ status: 400 }));
      await expect(create({ ...VALID, businessId: 'gone' })).resolves.toEqual({
        ok: false, error: UI_STRINGS.appApiAdminUsersRoute.companyNotFound, status: 404,
      });
      expect(batch).not.toHaveBeenCalled();
    });

    it('lets a Super Admin link the user to any existing company', async () => {
      auth.mockResolvedValue(superCtx);
      const response = await create({ ...VALID, businessId: ' tenant-2 ' });
      expect(response).toEqual(expect.objectContaining({ ok: true, status: 201, data: expect.objectContaining({ tenant: HOSPITALITY }) }));
      const [statements] = batch.mock.calls[0];
      expect(statements).toHaveLength(2);
      expect(statements[0].values[1]).toBe('tenant-2');
    });

    it('blocks the user when the company has used every seat for the role', async () => {
      capacity.mockResolvedValueOnce({ allowed: false, maxUsers: 2, activeUsers: 2 });
      await expect(create(VALID)).resolves.toEqual({
        ok: false, status: 409,
        error: interpolateUiString(UI_STRINGS.appApiAdminUsersRoute.roleLimitReachedForCompany, {
          company: RETAIL.name, count: 2, role: 'FINANCE_USER', max: 2,
        }),
      });
      expect(batch).not.toHaveBeenCalled();
    });

    it('reports a conflict when the email or last seat was taken by a concurrent request', async () => {
      batch.mockResolvedValueOnce([changed(0), changed(0)]);
      await expect(create(VALID)).resolves.toEqual({
        ok: false, error: UI_STRINGS.appApiAdminUsersRoute.emailOrRoleLimitChangedPleaseRefreshAndTryAgain, status: 409,
      });

      batch.mockResolvedValueOnce([{}, {}]);
      await expect(create(VALID)).resolves.toEqual(expect.objectContaining({ status: 409 }));
    });

    it('logs and reports a failed batch without exposing details', async () => {
      batch.mockRejectedValueOnce(new Error('D1 unavailable'));
      await expect(create(VALID)).resolves.toEqual({
        ok: false, error: UI_STRINGS.appApiAdminUsersRoute.failedToCreateUser, status: 500,
      });
      expect(logger).toHaveBeenCalledWith('error', 'admin.user_create_failed', expect.objectContaining({
        error: { name: 'Error', message: 'D1 unavailable' },
      }));

      batch.mockRejectedValueOnce('opaque');
      await create(VALID);
      expect(logger).toHaveBeenLastCalledWith('error', 'admin.user_create_failed', expect.objectContaining({ error: { type: 'string' } }));
    });
  });

  describe('PUT /api/admin/users/[id]', () => {
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
      userDb.findFirst.mockResolvedValue({ id: 'user-1', tenantId: 'tenant-1', email: 'member@example.test', name: 'Old name', role: 'PROJECT_USER', status: 'ACTIVE' });
      const updated = { id: 'user-1', email: 'member@example.test', name: 'New name', role: 'PROJECT_USER', status: 'ACTIVE', updatedAt: new Date('2026-01-01') };
      auditedUpdate.mockResolvedValue(updated);

      await expect(PUT(makeRequest({ name: ' New name ', role: null, status: undefined }), params)).resolves.toEqual({
        ok: true, data: updated, status: 200,
      });
      expect(auditedUpdate).toHaveBeenCalledWith(expect.objectContaining({
        table: 'user', id: 'user-1', tenantId: 'tenant-1',
        data: { name: 'New name', role: 'PROJECT_USER', status: UI_STRINGS.common.aCTIVE, updatedBy: 'editor-1' },
        route: '/api/admin/users/[id]',
        audit: expect.objectContaining({
          tenantId: 'tenant-1', userId: 'editor-1', entityType: UI_STRINGS.appAppAuditPage.uSER, entityId: 'user-1', action: UI_STRINGS.appAppAuditPage.uPDATE,
          description: 'User member@example.test updated (Role: PROJECT_USER, Status: ACTIVE)',
          oldValue: { role: 'PROJECT_USER', status: UI_STRINGS.common.aCTIVE }, newValue: { role: 'PROJECT_USER', status: UI_STRINGS.common.aCTIVE },
        }),
      }));
      expect(audit).not.toHaveBeenCalled();
    });

    it('keeps prior user values when fields are nullish and applies supplied role and status', async () => {
      userDb.findFirst.mockResolvedValue({ id: 'user-1', tenantId: 'tenant-1', email: 'member@example.test', name: 'Prior', role: 'PROJECT_USER', status: 'ACTIVE' });
      await PUT(makeRequest({ name: null, role: 'FINANCE_USER', status: 'INACTIVE' }), params);
      expect(auditedUpdate).toHaveBeenCalledWith(expect.objectContaining({
        table: 'user', id: 'user-1', tenantId: 'tenant-1', route: '/api/admin/users/[id]',
        data: { name: 'Prior', role: 'FINANCE_USER', status: 'INACTIVE', updatedBy: 'editor-1' },
        audit: expect.objectContaining({ entityType: 'USER', entityId: 'user-1' }),
      }));
    });

    it('refuses to grant roles that the Users screen cannot assign', async () => {
      userDb.findFirst.mockResolvedValue({ id: 'user-1', tenantId: 'tenant-1', email: 'member@example.test', name: 'Prior', role: 'PROJECT_USER', status: 'ACTIVE' });
      for (const role of ['SUPER_ADMIN', 'VENDOR', 'ADMIN']) {
        await expect(PUT(makeRequest({ role }), params)).resolves.toEqual({
          ok: false, error: UI_STRINGS.appApiAdminUsersIdRoute.roleIsInvalid, status: 400,
        });
      }
      expect(auditedUpdate).not.toHaveBeenCalled();
    });

    it('keeps an unchanged legacy role so status-only edits still work', async () => {
      userDb.findFirst.mockResolvedValue({ id: 'user-1', tenantId: 'tenant-1', email: 'vendor@example.test', name: 'Vendor', role: 'VENDOR', status: 'ACTIVE' });
      await PUT(makeRequest({ role: 'VENDOR', status: 'INACTIVE' }), params);
      expect(auditedUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: 'VENDOR', status: 'INACTIVE' }) }));
    });

    it('protects Super Admin accounts from other administrators', async () => {
      userDb.findFirst.mockResolvedValue({ id: 'user-1', tenantId: 'tenant-1', email: 'root@example.test', name: 'Root', role: 'SUPER_ADMIN', status: 'ACTIVE' });
      await expect(PUT(makeRequest({ status: 'INACTIVE' }), params)).resolves.toEqual({
        ok: false, error: UI_STRINGS.appApiAdminUsersIdRoute.superAdminAccountsCanOnlyBeChangedByASuperAdmin, status: 403,
      });
      expect(auditedUpdate).not.toHaveBeenCalled();
    });

    it('enforces the company role limit when a user changes role or is re-activated', async () => {
      const member = { id: 'user-1', tenantId: 'tenant-1', email: 'member@example.test', name: 'Member', role: 'PROJECT_USER', status: 'ACTIVE' };
      userDb.findFirst.mockResolvedValue(member);
      capacity.mockResolvedValue({ allowed: false, maxUsers: 1, activeUsers: 1 });

      await expect(PUT(makeRequest({ role: 'FINANCE_USER' }), params)).resolves.toEqual({
        ok: false, status: 409,
        error: interpolateUiString(UI_STRINGS.appApiAdminUsersIdRoute.roleLimitReachedForCompany, {
          company: RETAIL.name, count: 1, role: 'FINANCE_USER', max: 1,
        }),
      });
      expect(capacity).toHaveBeenLastCalledWith('tenant-1', 'FINANCE_USER', 'user-1');

      userDb.findFirst.mockResolvedValue({ ...member, tenantId: 'missing', status: 'INACTIVE' });
      await expect(PUT(makeRequest({ status: 'ACTIVE' }), params)).resolves.toEqual(expect.objectContaining({
        status: 409,
        error: interpolateUiString(UI_STRINGS.appApiAdminUsersIdRoute.roleLimitReachedForCompany, {
          company: 'missing', count: 1, role: 'PROJECT_USER', max: 1,
        }),
      }));
      expect(auditedUpdate).not.toHaveBeenCalled();

      // Disabling, or keeping the same active role, never needs a free seat.
      capacity.mockClear();
      userDb.findFirst.mockResolvedValue(member);
      await PUT(makeRequest({ status: 'INACTIVE', role: 'FINANCE_USER' }), params);
      await PUT(makeRequest({ name: 'Renamed' }), params);
      expect(capacity).not.toHaveBeenCalled();
      expect(auditedUpdate).toHaveBeenCalledTimes(2);

      capacity.mockResolvedValue({ allowed: true, maxUsers: 3, activeUsers: 1 });
      await PUT(makeRequest({ role: 'FINANCE_USER' }), params);
      expect(auditedUpdate).toHaveBeenCalledTimes(3);
    });

    it('lets a Super Admin edit users in another business under that business', async () => {
      auth.mockResolvedValue(superCtx);
      userDb.findFirst.mockResolvedValue({ id: 'user-1', tenantId: 'tenant-2', email: 'guest@example.test', name: 'Guest', role: 'PROJECT_USER', status: 'ACTIVE' });
      await PUT(makeRequest({ status: 'INACTIVE' }), params);
      expect(userDb.findFirst).toHaveBeenCalledWith({ where: { id: 'user-1' } });
      expect(auditedUpdate).toHaveBeenCalledWith(expect.objectContaining({
        tenantId: 'tenant-2', audit: expect.objectContaining({ tenantId: 'tenant-2', userId: 'root-1' }),
      }));
    });
  });
});
