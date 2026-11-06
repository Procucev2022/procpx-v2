import { NextRequest } from 'next/server';
import { auth } from '../src/lib/auth';
import { prisma } from '../src/lib/prisma';
import { getListPageWindow, isApiContext, requireAuth } from '../src/lib/api-utils';
import { GET as getAudit } from '../src/app/api/audit/route';
import { GET as getAuditDetail } from '../src/app/api/audit/[id]/route';
import { GET as getUoms, POST as createUom } from '../src/app/api/masters/uom/route';
import { GET as getMe } from '../src/app/api/auth/me/route';
import { GET as getVendorPpos } from '../src/app/api/vendor-portal/ppos/route';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { writeStructuredLog } from '../src/lib/observability/server-logger';


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    auditLog: { count: jest.fn(), findFirst: jest.fn() },
    uomMaster: { findMany: jest.fn(), create: jest.fn() },
    user: { findUnique: jest.fn() },
    ppo: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn(), aggregate: jest.fn() },
  },
}));

jest.mock('../src/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));

jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  getListPageWindow: jest.fn((params: URLSearchParams) => {
    const rawPage = Number(params.get('page'));
    const rawSize = Number(params.get('pageSize'));
    const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 1_000_000) : 1;
    const pageSize = Number.isSafeInteger(rawSize) && rawSize > 0 ? Math.min(rawSize, 100) : 50;
    return { page, pageSize, skip: (page - 1) * pageSize };
  }),
}));

const prismaMock = prisma as unknown as {
  $queryRaw: jest.Mock;
  auditLog: { count: jest.Mock; findFirst: jest.Mock };
  uomMaster: { findMany: jest.Mock; create: jest.Mock };
  user: { findUnique: jest.Mock };
  ppo: { findMany: jest.Mock; findFirst: jest.Mock; count: jest.Mock; aggregate: jest.Mock };
};
const authMock = auth as jest.Mock;
const requireAuthMock = requireAuth as jest.Mock;
const isApiContextMock = isApiContext as unknown as jest.Mock;
const listPageWindowMock = getListPageWindow as unknown as jest.Mock;
const baseContext = { tenantId: 'tenant-1', role: 'ADMIN', vendorId: 'vendor-1' };
const request = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) => new NextRequest(new URL(url, 'http://localhost'), init);

describe('basic API routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireAuthMock.mockResolvedValue(baseContext);
    isApiContextMock.mockReturnValue(true);
    authMock.mockResolvedValue(null);
    prismaMock.ppo.count.mockResolvedValue(1);
    prismaMock.ppo.aggregate.mockResolvedValue({ _sum: { totalValue: 100 } });
  });

  it('filters, paginates and defaults audit log queries', async () => {
    prismaMock.auditLog.count.mockResolvedValue(11);
    prismaMock.$queryRaw.mockResolvedValue([{
      id: 'log-1', createdAt: new Date('2026-10-01T10:00:00.000Z'), entityType: 'PR', entityId: 'pr-1',
      action: 'APPROVED', description: 'Approved PR', hasDiff: 1,
      userId: 'user-1', userName: 'Ada', userEmail: 'ada@example.test',
    }]);

    const result = await getAudit(request('/api/audit?page=2&pageSize=10&entityType=PR&action=APPROVED&projectId=project-1'));

    expect(prismaMock.auditLog.count).toHaveBeenCalledWith({ where: {
      tenantId: 'tenant-1', entityType: 'PR', action: UI_STRINGS.common.aPPROVED, projectId: 'project-1',
    } });
    const pageQuery = prismaMock.$queryRaw.mock.calls[0][0] as { sql: string; values: unknown[] };
    expect(pageQuery.sql).toContain('ORDER BY audit_log."createdAt" DESC, audit_log."id" DESC');
    expect(pageQuery.sql).toContain('LIMIT ? OFFSET ?');
    expect(pageQuery.sql).toContain('CASE WHEN audit_log."oldValue" IS NOT NULL OR audit_log."newValue" IS NOT NULL');
    expect(pageQuery.sql).not.toContain('audit_log."oldValue",');
    expect(pageQuery.sql).not.toContain('audit_log."newValue",');
    expect(pageQuery.sql).toContain('user."id" = audit_log."userId" AND user."tenantId" = audit_log."tenantId"');
    expect(pageQuery.values).toEqual(expect.arrayContaining(['tenant-1', 'PR', 'APPROVED', 'project-1']));
    expect(pageQuery.values).toContain(10);
    expect(result).toEqual({ ok: true, data: { data: [{
      id: 'log-1', createdAt: '2026-10-01T10:00:00.000Z', entityType: 'PR', entityId: 'pr-1',
      action: 'APPROVED', description: 'Approved PR', hasDiff: true, user: { name: 'Ada', email: 'ada@example.test' },
    }], total: 11, page: 2, pageSize: 10, totalPages: 2 }, status: 200 });

    await getAudit(request('/api/audit'));
    expect(prismaMock.$queryRaw.mock.calls[1][0].values).toContain(50);

    await getAudit(request('/api/audit?page=999999999&pageSize=5000'));
    expect(prismaMock.$queryRaw.mock.calls[2][0].values).toEqual(expect.arrayContaining([100, 99_999_900]));
  });

  it('normalizes string timestamps and nullable users from raw audit rows', async () => {
    prismaMock.auditLog.count.mockResolvedValue(2);
    prismaMock.$queryRaw.mockResolvedValueOnce([
      { id: 'log-system', createdAt: '2026-10-01T10:00:00.000Z', entityType: 'SYSTEM', entityId: 'system', action: 'LOGIN', description: 'System login', hasDiff: 0, userId: null, userName: null, userEmail: null },
      { id: 'log-user', createdAt: '2026-10-01T11:00:00.000Z', entityType: 'USER', entityId: 'user-2', action: 'UPDATE', description: 'User updated', hasDiff: 1, userId: 'user-2', userName: null, userEmail: null },
    ]);

    await expect(getAudit(request('/api/audit'))).resolves.toMatchObject({
      ok: true,
      data: { data: [
        { id: 'log-system', createdAt: '2026-10-01T10:00:00.000Z', hasDiff: false, user: null },
        { id: 'log-user', createdAt: '2026-10-01T11:00:00.000Z', hasDiff: true, user: { name: null, email: '' } },
      ] },
    });
  });

  it('returns a safe error and logs tenant-scoped audit query context', async () => {
    prismaMock.auditLog.count.mockRejectedValueOnce(new Error('database internals'));
    await expect(getAudit(request('/api/audit?entityType=PROJECT&action=CREATE&projectId=project-1&page=3&pageSize=25')))
      .resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchAuditTrail, status: 500 });
    expect(writeStructuredLog).toHaveBeenCalledWith('error', 'audit.trail_read_failed', expect.objectContaining({
      operation: 'list_audit_trail', route: '/api/audit', tenantId: 'tenant-1',
      entityType: 'PROJECT', action: 'CREATE', projectId: 'project-1', page: 3, pageSize: 25,
      error: expect.objectContaining({ message: 'database internals' }),
    }), 'application');
  });

  it('logs empty filters and non-Error audit list failures safely', async () => {
    prismaMock.auditLog.count.mockResolvedValueOnce(0);
    prismaMock.$queryRaw.mockRejectedValueOnce({ code: 'D1_ERROR' });
    await expect(getAudit(request('/api/audit'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToFetchAuditTrail, status: 500,
    });
    expect(writeStructuredLog).toHaveBeenCalledWith('error', 'audit.trail_read_failed', expect.objectContaining({
      entityType: undefined, action: undefined, projectId: undefined,
      error: { type: 'object' },
    }), 'application');
  });

  it('loads audit snapshots on demand and scopes the record lookup to the active tenant', async () => {
    const auditDetail = { id: 'audit-1', oldValue: '{"status":"DRAFT"}', newValue: '{"status":"APPROVED"}' };
    prismaMock.auditLog.findFirst.mockResolvedValue(auditDetail);
    await expect(getAuditDetail(request('/api/audit/audit-1'), { params: Promise.resolve({ id: 'audit-1' }) }))
      .resolves.toEqual({ ok: true, data: { data: auditDetail }, status: 200 });
    expect(prismaMock.auditLog.findFirst).toHaveBeenCalledWith({
      where: { id: 'audit-1', tenantId: 'tenant-1' },
      select: { id: true, oldValue: true, newValue: true },
    });

    prismaMock.auditLog.findFirst.mockResolvedValueOnce(null);
    await expect(getAuditDetail(request('/api/audit/missing'), { params: Promise.resolve({ id: 'missing' }) }))
      .resolves.toEqual({ ok: false, error: UI_STRINGS.appAppAuditPage.auditRecordNotFound, status: 404 });
  });

  it('logs audit snapshot read failures and returns a safe response', async () => {
    prismaMock.auditLog.findFirst.mockRejectedValueOnce(new Error('database internals'));
    await expect(getAuditDetail(request('/api/audit/audit-2'), { params: Promise.resolve({ id: 'audit-2' }) }))
      .resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchAuditTrail, status: 500 });
    expect(writeStructuredLog).toHaveBeenCalledWith('error', 'audit.event_detail_read_failed', expect.objectContaining({
      operation: 'read_audit_event_detail', route: '/api/audit/[id]', tenantId: 'tenant-1', auditLogId: 'audit-2',
      error: expect.objectContaining({ message: 'database internals' }),
    }), 'application');

    prismaMock.auditLog.findFirst.mockRejectedValueOnce({ code: 'D1_ERROR' });
    await expect(getAuditDetail(request('/api/audit/audit-3'), { params: Promise.resolve({ id: 'audit-3' }) }))
      .resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchAuditTrail, status: 500 });
    expect(writeStructuredLog).toHaveBeenLastCalledWith('error', 'audit.event_detail_read_failed', expect.objectContaining({
      auditLogId: 'audit-3', error: { type: 'object' },
    }), 'application');
  });

  it('returns the auth context response unchanged for audit and UOM routes', async () => {
    const response = { status: 401, body: 'no session' };
    requireAuthMock.mockResolvedValue(response);
    isApiContextMock.mockReturnValue(false);
    await expect(getAudit(request('/api/audit'))).resolves.toBe(response);
    await expect(getAuditDetail(request('/api/audit/audit-1'), { params: Promise.resolve({ id: 'audit-1' }) })).resolves.toBe(response);
    await expect(getUoms(request('/api/masters/uom'))).resolves.toBe(response);
    await expect(createUom(request('/api/masters/uom', { method: 'POST', body: '{}' }))).resolves.toBe(response);
    expect(prismaMock.auditLog.count).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.uomMaster.findMany).not.toHaveBeenCalled();
    expect(prismaMock.uomMaster.create).not.toHaveBeenCalled();
  });

  it('lists active tenant UOMs and validates then normalizes UOM creation', async () => {
    const uoms = [{ code: 'MTR', name: 'Meter' }];
    prismaMock.uomMaster.findMany.mockResolvedValue(uoms);
    await expect(getUoms(request('/api/masters/uom'))).resolves.toEqual({ ok: true, data: uoms, status: 200 });
    expect(prismaMock.uomMaster.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', isActive: true }, orderBy: [{ category: 'asc' }, { code: 'asc' }, { id: 'asc' }], take: 501,
    });

    await expect(createUom(request('/api/masters/uom', { method: 'POST', body: JSON.stringify({ code: '  ' }) })))
      .resolves.toEqual({ ok: false, error: UI_STRINGS.appApiMastersUomRoute.uOMCodeIsRequired, status: 400 });
    await expect(createUom(request('/api/masters/uom', { method: 'POST', body: JSON.stringify({ code: 'kg', name: '  ' }) })))
      .resolves.toEqual({ ok: false, error: UI_STRINGS.appApiMastersUomRoute.uOMNameIsRequired, status: 400 });

    const created = { id: 'uom-1', code: 'BOX' };
    prismaMock.uomMaster.create.mockResolvedValue(created);
    await expect(createUom(request('/api/masters/uom', { method: 'POST', body: JSON.stringify({
      code: ' box ', name: ' Box ', aliases: ['carton', 'case'], category: 'PACKAGING',
    }) }))).resolves.toEqual({ ok: true, data: created, status: 201 });
    expect(prismaMock.uomMaster.create).toHaveBeenCalledWith({ data: {
      tenantId: 'tenant-1', code: 'BOX', name: 'Box', aliases: '["carton","case"]', category: 'PACKAGING',
    } });

    await createUom(request('/api/masters/uom', { method: 'POST', body: JSON.stringify({ code: 'ea', name: 'Each', aliases: null, category: '' }) }));
    expect(prismaMock.uomMaster.create).toHaveBeenLastCalledWith({ data: {
      tenantId: 'tenant-1', code: 'EA', name: 'Each', aliases: null, category: UI_STRINGS.appAppProjectsIdPage.oTHER,
    } });
  });

  it('rejects oversized UOM catalogs and logs unexpected read failures', async () => {
    prismaMock.uomMaster.findMany.mockResolvedValueOnce(Array.from({ length: 501 }, (_, index) => ({ id: `uom-${index}` })));
    await expect(getUoms(request('/api/masters/uom'))).resolves.toEqual({
      ok: false,
      error: 'The active unit-of-measure list exceeds the supported limit of 500 items.',
      status: 413,
    });
    expect(writeStructuredLog).toHaveBeenCalledWith('warn', 'masters.uom_result_limit_exceeded', expect.objectContaining({
      operation: 'list_active_uoms', tenantId: 'tenant-1', resultCountAtLeast: 501, maxItems: 500,
    }));

    prismaMock.uomMaster.findMany.mockRejectedValueOnce(new Error('database internals'));
    await expect(getUoms(request('/api/masters/uom'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiMastersUomRoute.activeUomListReadFailed, status: 500,
    });
    expect(writeStructuredLog).toHaveBeenCalledWith('error', 'masters.uom_list_failed', expect.objectContaining({
      operation: 'list_active_uoms', tenantId: 'tenant-1',
      error: expect.objectContaining({ message: 'database internals' }),
    }));
  });

  it('resolves the test-user header, session, and unauthorized auth-me paths', async () => {
    const user = { id: 'user-1', name: 'Ada', email: 'ada@example.test', role: 'ADMIN', tenantId: 'tenant-1', tenant: { name: 'Tenant One' } };
    prismaMock.user.findUnique.mockResolvedValue(user);
    await expect(getMe(request('/api/auth/me', { headers: { 'x-test-user-id': 'user-1' } }))).resolves.toEqual({
      ok: true,
      data: { user: { id: 'user-1', name: 'Ada', email: 'ada@example.test', role: 'ADMIN', tenantId: 'tenant-1', tenantName: 'Tenant One' } },
      status: 200,
    });
    expect(authMock).not.toHaveBeenCalled();

    prismaMock.user.findUnique.mockResolvedValue({ ...user, tenant: null });
    await expect(getMe(request('/api/auth/me', { headers: { 'x-test-user-id': 'user-2' } }))).resolves.toEqual({
      ok: true,
      data: { user: { id: 'user-1', name: 'Ada', email: 'ada@example.test', role: 'ADMIN', tenantId: 'tenant-1', tenantName: undefined } },
      status: 200,
    });

    prismaMock.user.findUnique.mockResolvedValue(null);
    authMock.mockResolvedValue(null);
    await expect(getMe(request('/api/auth/me', { headers: { 'x-test-user-id': 'missing' } }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiAuthMeRoute.unauthorized, status: 401,
    });
    authMock.mockResolvedValue({ user: { id: 'session-user', email: 'session@example.test' } });
    await expect(getMe(request('/api/auth/me'))).resolves.toEqual({
      ok: true, data: { user: { id: 'session-user', email: 'session@example.test' } }, status: 200,
    });
  });

  it('enforces vendor PPO account mapping and handles listing failures', async () => {
    requireAuthMock.mockResolvedValueOnce({ status: 401 });
    isApiContextMock.mockReturnValueOnce(false);
    await expect(getVendorPpos(request('/api/vendor-portal/ppos'))).resolves.toEqual({ status: 401 });

    requireAuthMock.mockResolvedValue({ tenantId: 'tenant-1', role: 'BUYER' });
    await expect(getVendorPpos(request('/api/vendor-portal/ppos'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.forbiddenVendorPortalIsAccessibleOnlyToMappedVendorAccounts, status: 403,
    });

    requireAuthMock.mockResolvedValue({ tenantId: 'tenant-1', role: 'VENDOR' });
    await expect(getVendorPpos(request('/api/vendor-portal/ppos'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.vendorRecordNotAssociatedWithThisUserAccount, status: 404,
    });

    requireAuthMock.mockResolvedValue({ tenantId: 'tenant-1', role: 'BUYER', vendorId: 'vendor-1' });
    await expect(getVendorPpos(request('/api/vendor-portal/ppos'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.forbiddenVendorPortalIsAccessibleOnlyToMappedVendorAccounts, status: 403,
    });

    requireAuthMock.mockResolvedValue({ tenantId: 'tenant-1', role: 'VENDOR', vendorId: 'vendor-1' });
    prismaMock.ppo.findMany.mockResolvedValue([{ id: 'ppo-1', totalValue: 100, createdAt: new Date(), issuedAt: null, _count: { lines: 2 } }]);
    prismaMock.ppo.count.mockResolvedValue(1);
    await expect(getVendorPpos(request('/api/vendor-portal/ppos'))).resolves.toEqual({
      ok: true, data: {
        ppos: [expect.objectContaining({ id: 'ppo-1', lineCount: 2, grossTotal: 100, totalAmount: 100 })],
        total: 1, page: 1, pageSize: 50, totalPages: 1, hasMore: false,
        summary: { total: 1, totalValue: 100, pendingCount: 1 },
      }, status: 200,
    });

    listPageWindowMock.mockReturnValueOnce({ page: 1, pageSize: 0, skip: 0 });
    prismaMock.ppo.findMany.mockResolvedValueOnce([]);
    prismaMock.ppo.count.mockResolvedValueOnce(0);
    prismaMock.ppo.count.mockResolvedValueOnce(0);
    prismaMock.ppo.aggregate.mockResolvedValueOnce({ _sum: { totalValue: null } });
    await expect(getVendorPpos(request('/api/vendor-portal/ppos'))).resolves.toMatchObject({
      ok: true, data: { pageSize: 50, totalPages: 0 },
    });
    expect(prismaMock.ppo.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', vendorId: 'vendor-1' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 0, take: 50,
    }));
    expect(prismaMock.ppo.count).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1', vendorId: 'vendor-1' } });

    prismaMock.ppo.findMany.mockResolvedValueOnce([]);
    prismaMock.ppo.count.mockResolvedValueOnce(0).mockResolvedValueOnce(3).mockResolvedValueOnce(2);
    prismaMock.ppo.aggregate.mockResolvedValueOnce({ _sum: { totalValue: null } });
    await expect(getVendorPpos(request('/api/vendor-portal/ppos?search=Campus&pageSize=500'))).resolves.toMatchObject({
      ok: true, data: { ppos: [], total: 0, pageSize: 100, totalPages: 0, hasMore: false, summary: { total: 3, totalValue: 0, pendingCount: 2 } },
    });
    expect(prismaMock.ppo.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', vendorId: 'vendor-1', OR: [
        { ppoNumber: { contains: 'Campus' } }, { project: { name: { contains: 'Campus' } } }, { rfq: { rfqNumber: { contains: 'Campus' } } },
      ] }, take: 100,
    }));

    prismaMock.ppo.findFirst.mockResolvedValueOnce(null);
    await expect(getVendorPpos(request('/api/vendor-portal/ppos?ppoId=missing'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.purchaseOrderNotFoundOrAccessDenied, status: 404,
    });

    prismaMock.ppo.findFirst.mockResolvedValueOnce({
      id: 'ppo-1', totalValue: 100, createdAt: new Date(), issuedAt: null, lines: [
        { id: 'line-1', itemDescription: 'Cable', orderedQuantity: 2, uom: 'M', orderedUnitRate: 50, orderedAmount: 100, taxAmount: 18, totalOrderValue: 118 },
        { id: 'line-2', itemDescription: 'Fasteners', orderedQuantity: 0, uom: 'EA', orderedUnitRate: 5, orderedAmount: 0, taxAmount: 0, totalOrderValue: 0 },
      ],
    });
    await expect(getVendorPpos(request('/api/vendor-portal/ppos?ppoId=ppo-1'))).resolves.toMatchObject({
      ok: true, data: { lines: [
        { id: 'line-1', itemDescription: 'Cable', quantity: 2, uom: 'M', unitRate: 50, gstPercent: 18, totalAmount: 118 },
        { id: 'line-2', gstPercent: 0, totalAmount: 0 },
      ] }, status: 200,
    });
    expect(prismaMock.ppo.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'ppo-1', tenantId: 'tenant-1', vendorId: 'vendor-1' } }));

    prismaMock.ppo.findFirst.mockRejectedValueOnce(new Error('detail unavailable'));
    await expect(getVendorPpos(request('/api/vendor-portal/ppos?ppoId=ppo-1'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToLoadPurchaseOrders, status: 500,
    });

    prismaMock.ppo.findFirst.mockRejectedValueOnce({ database: 'offline' });
    await expect(getVendorPpos(request('/api/vendor-portal/ppos?ppoId=ppo-1'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToLoadPurchaseOrders, status: 500,
    });

    const logger = writeStructuredLog as jest.Mock;
    prismaMock.ppo.findMany.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(getVendorPpos(request('/api/vendor-portal/ppos'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToLoadPurchaseOrders, status: 500,
    });
    expect(logger).toHaveBeenCalledWith('error', 'vendor_portal.ppo_list_read_failed', expect.objectContaining({ vendorId: 'vendor-1', page: 1 }));

    prismaMock.ppo.findMany.mockRejectedValueOnce({});
    await expect(getVendorPpos(request('/api/vendor-portal/ppos'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToLoadPurchaseOrders, status: 500,
    });
  });
});
