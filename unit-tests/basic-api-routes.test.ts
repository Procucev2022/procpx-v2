import { NextRequest } from 'next/server';
import { auth } from '../src/lib/auth';
import { prisma } from '../src/lib/prisma';
import { isApiContext, requireAuth } from '../src/lib/api-utils';
import { GET as getAudit } from '../src/app/api/audit/route';
import { GET as getUoms, POST as createUom } from '../src/app/api/masters/uom/route';
import { GET as getMe } from '../src/app/api/auth/me/route';
import { GET as getVendorPpos } from '../src/app/api/vendor-portal/ppos/route';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    auditLog: { count: jest.fn(), findMany: jest.fn() },
    uomMaster: { findMany: jest.fn(), create: jest.fn() },
    user: { findUnique: jest.fn() },
    ppo: { findMany: jest.fn() },
  },
}));

jest.mock('../src/lib/auth', () => ({ auth: jest.fn() }));

jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));

const prismaMock = prisma as unknown as {
  auditLog: { count: jest.Mock; findMany: jest.Mock };
  uomMaster: { findMany: jest.Mock; create: jest.Mock };
  user: { findUnique: jest.Mock };
  ppo: { findMany: jest.Mock };
};
const authMock = auth as jest.Mock;
const requireAuthMock = requireAuth as jest.Mock;
const isApiContextMock = isApiContext as unknown as jest.Mock;
const baseContext = { tenantId: 'tenant-1', role: 'ADMIN', vendorId: 'vendor-1' };
const request = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) => new NextRequest(new URL(url, 'http://localhost'), init);

describe('basic API routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireAuthMock.mockResolvedValue(baseContext);
    isApiContextMock.mockReturnValue(true);
    authMock.mockResolvedValue(null);
  });

  it('filters, paginates and defaults audit log queries', async () => {
    prismaMock.auditLog.count.mockResolvedValue(11);
    prismaMock.auditLog.findMany.mockResolvedValue([{ id: 'log-1' }]);

    const result = await getAudit(request('/api/audit?page=2&pageSize=10&entityType=PR&action=APPROVED&projectId=project-1'));

    expect(prismaMock.auditLog.count).toHaveBeenCalledWith({ where: {
      tenantId: 'tenant-1', entityType: 'PR', action: UI_STRINGS.common.aPPROVED, projectId: 'project-1',
    } });
    expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', entityType: 'PR', action: UI_STRINGS.common.aPPROVED, projectId: 'project-1' },
      skip: 10, take: 10, orderBy: { createdAt: 'desc' },
    }));
    expect(result).toEqual({ ok: true, data: { data: [{ id: 'log-1' }], total: 11, page: 2, pageSize: 10, totalPages: 2 }, status: 200 });

    await getAudit(request('/api/audit'));
    expect(prismaMock.auditLog.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1' }, skip: 0, take: 50,
    }));
  });

  it('returns the auth context response unchanged for audit and UOM routes', async () => {
    const response = { status: 401, body: 'no session' };
    requireAuthMock.mockResolvedValue(response);
    isApiContextMock.mockReturnValue(false);
    await expect(getAudit(request('/api/audit'))).resolves.toBe(response);
    await expect(getUoms(request('/api/masters/uom'))).resolves.toBe(response);
    await expect(createUom(request('/api/masters/uom', { method: 'POST', body: '{}' }))).resolves.toBe(response);
    expect(prismaMock.auditLog.count).not.toHaveBeenCalled();
    expect(prismaMock.uomMaster.findMany).not.toHaveBeenCalled();
    expect(prismaMock.uomMaster.create).not.toHaveBeenCalled();
  });

  it('lists active tenant UOMs and validates then normalizes UOM creation', async () => {
    const uoms = [{ code: 'MTR', name: 'Meter' }];
    prismaMock.uomMaster.findMany.mockResolvedValue(uoms);
    await expect(getUoms(request('/api/masters/uom'))).resolves.toEqual({ ok: true, data: uoms, status: 200 });
    expect(prismaMock.uomMaster.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', isActive: true }, orderBy: [{ category: 'asc' }, { code: 'asc' }],
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
    requireAuthMock.mockResolvedValue({ tenantId: 'tenant-1', role: 'BUYER' });
    await expect(getVendorPpos(request('/api/vendor-portal/ppos'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.forbiddenVendorPortalIsAccessibleOnlyToMappedVendorAccounts, status: 403,
    });

    requireAuthMock.mockResolvedValue({ tenantId: 'tenant-1', role: 'VENDOR' });
    await expect(getVendorPpos(request('/api/vendor-portal/ppos'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.vendorRecordNotAssociatedWithThisUserAccount, status: 404,
    });

    requireAuthMock.mockResolvedValue({ tenantId: 'tenant-1', role: 'BUYER', vendorId: 'vendor-1' });
    prismaMock.ppo.findMany.mockResolvedValue([{ id: 'ppo-1' }]);
    await expect(getVendorPpos(request('/api/vendor-portal/ppos'))).resolves.toEqual({
      ok: true, data: { ppos: [{ id: 'ppo-1' }], total: 1 }, status: 200,
    });
    expect(prismaMock.ppo.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', vendorId: 'vendor-1' },
      orderBy: { createdAt: 'desc' },
    }));

    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    prismaMock.ppo.findMany.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(getVendorPpos(request('/api/vendor-portal/ppos'))).resolves.toEqual({
      ok: false, error: 'database unavailable', status: 500,
    });
    expect(errorLog).toHaveBeenCalledWith('Error fetching vendor PPOs:', expect.any(Error));

    prismaMock.ppo.findMany.mockRejectedValueOnce({});
    await expect(getVendorPpos(request('/api/vendor-portal/ppos'))).resolves.toEqual({
      ok: false, error: 'Failed to fetch PPOs', status: 500,
    });
    errorLog.mockRestore();
  });
});
