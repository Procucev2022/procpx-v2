import { NextRequest } from 'next/server';
import { GET, PUT } from '../src/app/api/procurement/vendors/[id]/route';
import { prisma } from '../src/lib/prisma';
import { apiError, apiSuccess, isApiContext, requireAuth } from '../src/lib/api-utils';
import { hasPermission } from '../src/lib/permissions';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { VENDOR_PROFILE_AUDIT_INSERT_AFTER_UPDATE_SQL, VENDOR_PROFILE_UPDATE_SQL } from '../src/app/api/procurement/vendors/[id]/route.constants';


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    vendor: { findFirst: jest.fn(), findMany: jest.fn() },
    user: { findMany: jest.fn() },
    auditLog: { findMany: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
}));
jest.mock('../src/lib/permissions', () => ({ hasPermission: jest.fn() }));
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn().mockResolvedValue(undefined) }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const permission = hasPermission as jest.Mock;
const writeBatch = writeD1BatchAtomically as jest.Mock;
const writeLog = writeStructuredLog as jest.Mock;
const errorResult = apiError as jest.Mock;
const baseUpdatedAt = new Date('2026-11-04T00:00:00.000Z');
const baseVendor = {
  id: 'vendor-1', tenantId: 'tenant-1', vendorType: 'LOCAL', code: 'V-1', name: 'Northwind',
  contactPerson: 'Alice', email: 'alice@example.test', phone: '111', categories: 'Electrical',
  operatingLocation: 'West', city: 'Pune', state: 'MH', country: 'India', legalStructure: 'LLP',
  gstin: 'GST-1', pan: 'PAN-1', website: 'https://example.test', address: 'Old address',
  experienceYears: 4, turnoverCrores: 12, capabilities: '[]', serviceCoverage: '[]',
  clientReferences: '[]', certifications: '[]', documents: '[]', status: 'ACTIVE',
  updatedAt: baseUpdatedAt, evaluations: [],
};

function params(id = 'vendor-1') {
  return { params: Promise.resolve({ id }) };
}

function getRequest() {
  return new NextRequest('http://localhost/api/procurement/vendors/vendor-1');
}

function putRequest(body: unknown, includeRequestId = true) {
  return {
    json: jest.fn().mockResolvedValue(body),
    headers: new Headers(includeRequestId ? { 'x-request-id': 'vendor-update-request' } : {}),
  } as unknown as NextRequest;
}

describe('vendor detail route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue({ tenantId: 'tenant-1', userId: 'user-1', role: 'ADMIN', vendorId: undefined });
    isContext.mockReturnValue(true);
    permission.mockReturnValue(false);
    writeLog.mockResolvedValue(undefined);
    writeBatch.mockResolvedValue([
      { success: true, meta: { changes: 1 }, results: [{ ...baseVendor }] },
      { success: true, meta: { changes: 1 }, results: [] },
    ]);
    db.vendor.findFirst.mockResolvedValue(baseVendor);
    db.vendor.findMany.mockResolvedValue([]);
    db.user.findMany.mockResolvedValue([{ id: 'rater-1', name: 'Rater One', role: 'PROJECT_APPROVER', email: 'rater@example.test' }]);
    db.auditLog.findMany.mockResolvedValue([{ id: 'audit-1', action: 'VENDOR_UPDATED' }]);
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns authorization and missing-vendor errors for GET and PUT', async () => {
    const denied = { ok: false, status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET({} as NextRequest, params())).resolves.toBe(denied);

    db.vendor.findFirst.mockResolvedValueOnce(null);
    await expect(GET({} as NextRequest, params('missing'))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.vendorNotFoundOrAccessDenied2, status: 404 });

    permission.mockReturnValue(false);
    await expect(PUT(putRequest({}), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.forbiddenInsufficientPermissions, status: 403 });
    permission.mockReturnValueOnce(true);
    db.vendor.findFirst.mockResolvedValueOnce(null);
    await expect(PUT(putRequest({}), params('missing'))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.vendorNotFoundOrAccessDenied2, status: 404 });
  });

  it('returns a compact tenant-scoped vendor profile and bounded audit history', async () => {
    const result = await GET(getRequest(), params());
    expect(result).toMatchObject({ ok: true, data: {
      vendor: { id: 'vendor-1', name: 'Northwind', evaluations: [] },
      auditLogs: [{ id: 'audit-1', action: 'VENDOR_UPDATED' }], currentUserRole: 'ADMIN', isProcurementUser: false,
    } });
    expect(db.vendor.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'vendor-1', OR: [{ tenantId: 'tenant-1' }, { vendorType: 'PROCUCEV_VENDOR' }] },
      select: expect.objectContaining({
        id: true,
        evaluations: expect.objectContaining({ where: { tenantId: 'tenant-1' }, take: 1 }),
      }),
    }));
    expect(db.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', entityId: 'vendor-1' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }));
    expect(db.vendor.findFirst.mock.calls[0][0].select).not.toHaveProperty('ppos');
    expect(db.vendor.findFirst.mock.calls[0][0].select).not.toHaveProperty('ppoRatings');

    auth.mockResolvedValueOnce({ tenantId: 'tenant-1', userId: 'buyer-1', role: 'PROCUREMENT_USER' });
    await expect(GET(getRequest(), params())).resolves.toMatchObject({
      data: { vendor: expect.not.objectContaining({ ppoRatings: expect.anything(), ppos: expect.anything() }), isProcurementUser: true },
    });
  });

  it('logs vendor profile query errors and returns a stable generic response', async () => {
    db.vendor.findFirst.mockRejectedValueOnce(new Error('vendor read failed'));
    await expect(GET(getRequest(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchVendorProfile, status: 500 });
    expect(writeLog).toHaveBeenCalledWith('error', 'vendor.profile_read_failed', expect.objectContaining({ vendorId: 'vendor-1', tenantId: 'tenant-1' }));
    db.vendor.findFirst.mockRejectedValueOnce({});
    await expect(GET(getRequest(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchVendorProfile, status: 500 });
  });

  it('updates profiles with a tenant-scoped compare-and-set and an atomic audit entry', async () => {
    permission.mockReturnValue(true);
    const updatedResult = await PUT(putRequest({
      name: ' New Vendor ', contactPerson: null, email: ' new@example.test ', phone: null,
      categories: ['Electrical'], operatingLocation: 'North', city: 'Delhi', state: 'DL', country: 'India',
      legalStructure: 'Private Limited', gstin: '', pan: '', website: null, address: ' New address ',
      experienceYears: 0, turnoverCrores: 0, capabilities: '["testing"]', serviceCoverage: { areas: ['North'] },
      clientReferences: 'Client A', certifications: ['ISO'], documents: { certificate: 'doc-1' }, status: '',
    }), params());
    expect(updatedResult).toMatchObject({ ok: true, data: { message: 'Vendor profile updated successfully.' } });
    expect(db.vendor.findFirst).toHaveBeenCalledWith({ where: { id: 'vendor-1', OR: [{ tenantId: 'tenant-1' }, { vendorType: 'PROCUCEV_VENDOR' }] } });
    const [updateStatement, auditStatement] = writeBatch.mock.calls[0][0];
    expect(updateStatement.sql).toBe(VENDOR_PROFILE_UPDATE_SQL);
    expect(updateStatement.values).toEqual([
      'New Vendor', null, 'new@example.test', null, '["Electrical"]', 'North', 'Delhi', 'DL', 'India', 'Private Limited',
      null, null, null, ' New address ', null, null, '["testing"]', JSON.stringify({ areas: ['North'] }), 'Client A',
      '["ISO"]', JSON.stringify({ certificate: 'doc-1' }), 'ACTIVE', expect.any(Date), 'vendor-1', 'tenant-1', baseUpdatedAt,
    ]);
    expect(auditStatement.sql).toBe(VENDOR_PROFILE_AUDIT_INSERT_AFTER_UPDATE_SQL);
    expect(auditStatement.values).toEqual([
      expect.any(String), 'tenant-1', 'user-1', 'vendor-1', expect.any(String),
      JSON.stringify({ name: 'Northwind', contactPerson: 'Alice' }),
      JSON.stringify({ name: 'New Vendor', contactPerson: null }), expect.any(Date),
    ]);
    expect(writeBatch.mock.calls[0][0]).toHaveLength(2);
  });

  it('allows a vendor to update its own profile and preserves omitted values', async () => {
    auth.mockResolvedValue({ tenantId: 'tenant-1', userId: 'vendor-user', role: 'VENDOR', vendorId: 'vendor-1' });
    permission.mockImplementation((_role: string, name: string) => name === 'VENDOR_PROFILE_EDIT');
    await expect(PUT(putRequest({}), params())).resolves.toMatchObject({ ok: true });
    const [updateStatement] = writeBatch.mock.calls[0][0];
    expect(updateStatement.values.slice(0, 22)).toEqual([
      'Northwind', 'Alice', 'alice@example.test', '111', 'Electrical', 'West', 'Pune', 'MH', 'India', 'LLP',
      'GST-1', 'PAN-1', 'https://example.test', 'Old address', 4, 12, '[]', '[]', '[]', '[]', '[]', 'ACTIVE',
    ]);
    expect(updateStatement.values.slice(23)).toEqual(['vendor-1', 'tenant-1', baseUpdatedAt]);
    expect(permission).toHaveBeenCalledWith(UI_STRINGS.common.vENDOR, 'VENDOR_MANAGE');
    expect(permission).toHaveBeenCalledWith(UI_STRINGS.common.vENDOR, 'VENDOR_PROFILE_EDIT');
  });

  it('advances the compare-and-set timestamp when updates happen within the same millisecond', async () => {
    permission.mockReturnValue(true);
    jest.spyOn(Date, 'now').mockReturnValue(baseUpdatedAt.getTime());

    await expect(PUT(putRequest({ name: 'Same-millisecond update' }), params())).resolves.toMatchObject({ ok: true });

    const [updateStatement] = writeBatch.mock.calls[0][0];
    expect(updateStatement.values[22]).toEqual(new Date(baseUpdatedAt.getTime() + 1));
  });

  it('normalizes vendor tax fields, numeric values, and both structured and serialized profile fields', async () => {
    permission.mockReturnValue(true);
    await expect(PUT(putRequest({
      gstin: ' gst-2 ', pan: ' pan-2 ', experienceYears: 8, turnoverCrores: 24.5,
      capabilities: { equipment: ['crane'] }, serviceCoverage: '["West"]',
      clientReferences: { customer: 'Northwind' }, documents: '["doc-2"]',
    }), params())).resolves.toMatchObject({ ok: true });

    const [updateStatement] = writeBatch.mock.calls[0][0];
    expect(updateStatement.values[10]).toBe('GST-2');
    expect(updateStatement.values[11]).toBe('PAN-2');
    expect(updateStatement.values[14]).toBe(8);
    expect(updateStatement.values[15]).toBe(24.5);
    expect(updateStatement.values[16]).toBe(JSON.stringify({ equipment: ['crane'] }));
    expect(updateStatement.values[17]).toBe('["West"]');
    expect(updateStatement.values[18]).toBe(JSON.stringify({ customer: 'Northwind' }));
    expect(updateStatement.values[19]).toBe('[]');
    expect(updateStatement.values[20]).toBe('["doc-2"]');
  });

  it('returns a PUT server error when updating the vendor fails', async () => {
    auth.mockResolvedValueOnce({ status: 401 });
    isContext.mockReturnValueOnce(false);
    await expect(PUT(putRequest({}), params())).resolves.toEqual({ status: 401 });

    permission.mockReturnValue(true);
    writeBatch.mockRejectedValueOnce(new Error('vendor write failed'));
    await expect(PUT(putRequest({}), params())).resolves.toEqual({
      ok: false,
      error: UI_STRINGS.common.userMessages.failedToUpdateVendorProfile,
      status: 500,
    });
    writeBatch.mockRejectedValueOnce({});
    await expect(PUT(putRequest({}, false), params())).resolves.toEqual({
      ok: false,
      error: UI_STRINGS.common.userMessages.failedToUpdateVendorProfile,
      status: 500,
    });
    expect(writeLog).toHaveBeenNthCalledWith(1, 'error', 'vendor.profile_update_failed', expect.objectContaining({
      operation: 'update_vendor_profile',
      route: '/api/procurement/vendors/[id]',
      requestId: 'vendor-update-request',
      tenantId: 'tenant-1',
      userId: 'user-1',
      role: 'ADMIN',
      vendorId: 'vendor-1',
      durationMs: expect.any(Number),
      error: { name: 'Error', message: 'vendor write failed' },
    }));
    expect(writeLog).toHaveBeenNthCalledWith(2, 'error', 'vendor.profile_update_failed', expect.objectContaining({
      requestId: null,
      error: { type: 'object' },
    }));
    expect(errorResult).toHaveBeenNthCalledWith(1, UI_STRINGS.common.userMessages.failedToUpdateVendorProfile, 500);
    expect(errorResult).toHaveBeenNthCalledWith(2, UI_STRINGS.common.userMessages.failedToUpdateVendorProfile, 500);
  });

  it('returns a conflict when a vendor profile update collides on the normalized tenant name', async () => {
    permission.mockReturnValue(true);
    db.vendor.findFirst.mockResolvedValueOnce(baseVendor);
    writeBatch.mockRejectedValueOnce(new Error('UNIQUE constraint failed: vendors_tenant_normalized_name_unique_idx'));

    await expect(PUT(putRequest({ name: 'Duplicate Supplier' }), params())).resolves.toEqual({
      ok: false,
      error: UI_STRINGS.appApiProcurementVendorsRoute.vendorNameAlreadyExistsForThisTenant,
      status: 409,
    });
    expect(writeLog).toHaveBeenCalledWith('warn', 'vendor.duplicate_name_conflict', expect.objectContaining({
      operation: 'update_vendor_profile', vendorId: 'vendor-1', tenantId: 'tenant-1',
    }));
  });

  it('keeps the stable profile error response if structured error storage fails', async () => {
    permission.mockReturnValue(true);
    writeBatch.mockRejectedValueOnce(new Error('database write failed'));
    writeLog.mockRejectedValueOnce(new Error('local log storage failed'));

    await expect(PUT(putRequest({}), params())).resolves.toEqual({
      ok: false,
      error: UI_STRINGS.common.userMessages.failedToUpdateVendorProfile,
      status: 500,
    });
  });

  it('reports a refresh conflict when another profile update wins the compare-and-set', async () => {
    permission.mockReturnValue(true);
    db.vendor.findFirst
      .mockResolvedValueOnce(baseVendor)
      .mockResolvedValueOnce({ updatedAt: new Date('2026-11-04T00:00:01.000Z') });
    writeBatch.mockRejectedValueOnce(new Error('audit guard rolled back stale profile write'));

    await expect(PUT(putRequest({ name: 'Stale name' }), params())).resolves.toEqual({
      ok: false,
      error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh,
      status: 409,
    });
    expect(writeLog).toHaveBeenCalledWith('warn', 'vendor.profile_update_conflict', expect.objectContaining({ vendorId: 'vendor-1' }));
  });

  it('returns the committed update fallback when D1 omits RETURNING rows', async () => {
    permission.mockReturnValue(true);
    writeBatch.mockResolvedValueOnce([
      { success: true, meta: { changes: 1 }, results: [] },
      { success: true, meta: { changes: 1 }, results: [] },
    ]);

    await expect(PUT(putRequest({ name: 'Fallback vendor' }), params())).resolves.toMatchObject({
      ok: true,
      data: { vendor: { name: 'Fallback vendor' } },
    });
  });

  it.each([
    ['profile update was not applied', [{ meta: { changes: 0 } }, { meta: { changes: 0 } }]],
    ['audit row was not reported', [{ meta: { changes: 1 } }, { meta: { changes: 0 } }]],
  ])('fails safely when D1 reports that the %s', async (_scenario, results) => {
    permission.mockReturnValue(true);
    writeBatch.mockResolvedValueOnce(results);

    await expect(PUT(putRequest({ name: 'Uncommitted vendor' }), params())).resolves.toEqual({
      ok: false,
      error: UI_STRINGS.common.userMessages.failedToUpdateVendorProfile,
      status: 500,
    });
    expect(writeLog).toHaveBeenCalledWith('error', 'vendor.profile_update_failed', expect.objectContaining({ vendorId: 'vendor-1' }));
  });

  it('preserves the conflict response if conflict logging fails', async () => {
    permission.mockReturnValue(true);
    db.vendor.findFirst
      .mockResolvedValueOnce(baseVendor)
      .mockResolvedValueOnce({ updatedAt: new Date('2026-11-04T00:00:02.000Z') });
    writeBatch.mockRejectedValueOnce(new Error('stale update rolled back'));
    writeLog.mockRejectedValueOnce(new Error('local log storage failed'));

    await expect(PUT(putRequest({ name: 'Stale name' }, false), params())).resolves.toEqual({
      ok: false,
      error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh,
      status: 409,
    });
  });

  it('logs the original update failure when the conflict probe is unavailable', async () => {
    permission.mockReturnValue(true);
    db.vendor.findFirst
      .mockResolvedValueOnce(baseVendor)
      .mockRejectedValueOnce(new Error('conflict probe unavailable'));
    writeBatch.mockRejectedValueOnce(new Error('database write failed'));

    await expect(PUT(putRequest({}), params())).resolves.toEqual({
      ok: false,
      error: UI_STRINGS.common.userMessages.failedToUpdateVendorProfile,
      status: 500,
    });
    expect(writeLog).toHaveBeenCalledWith('error', 'vendor.profile_update_failed', expect.objectContaining({
      vendorId: 'vendor-1',
      error: { name: 'Error', message: 'database write failed' },
    }));
  });

  it('logs profile lookup errors before a compare-and-set timestamp is available', async () => {
    permission.mockReturnValue(true);
    db.vendor.findFirst.mockRejectedValueOnce(new Error('profile lookup unavailable'));

    await expect(PUT(putRequest({}), params())).resolves.toEqual({
      ok: false,
      error: UI_STRINGS.common.userMessages.failedToUpdateVendorProfile,
      status: 500,
    });
    expect(writeLog).toHaveBeenCalledWith('error', 'vendor.profile_update_failed', expect.objectContaining({
      error: { name: 'Error', message: 'profile lookup unavailable' },
    }));
  });
});
