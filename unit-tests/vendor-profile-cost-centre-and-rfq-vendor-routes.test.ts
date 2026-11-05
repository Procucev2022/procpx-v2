import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { writeD1BatchAtomically, writeRfqVendorInvitationsAtomically } from '../src/lib/d1-batch';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { GET as getVendorProfile, PATCH as updateVendorProfile } from '../src/app/api/vendor-portal/me/route';
import { GET as getCostCentre, PUT as updateCostCentre } from '../src/app/api/cost-centres/[id]/route';
import { POST as inviteRfqVendors } from '../src/app/api/procurement/rfqs/[id]/vendors/route';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { COST_CENTRE_AUDIT_AFTER_UPDATE_SQL, COST_CENTRE_UPDATE_IF_CURRENT_SQL } from '../src/app/api/cost-centres/[id]/route.constants';


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    vendor: { findFirst: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    costCentre: { findFirst: jest.fn() },
    rfq: { findFirst: jest.fn() },
    rfqVendor: { upsert: jest.fn() },
    $transaction: jest.fn(),
    auditLog: { create: jest.fn(), findFirst: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));
jest.mock('../src/lib/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn(), writeRfqVendorInvitationsAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn().mockResolvedValue(undefined) }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
const writeBatch = writeD1BatchAtomically as jest.Mock;
const writeInvitations = writeRfqVendorInvitationsAtomically as jest.Mock;
const writeLog = writeStructuredLog as jest.Mock;
const baseContext = {
  tenantId: 'tenant-1', userId: 'user-1', userName: 'Vendor User', userEmail: 'vendor@example.test', role: 'VENDOR', vendorId: 'vendor-1',
};
const request = (body?: unknown, method = 'POST') => new NextRequest('http://localhost/api/test', {
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const idParams = (id = 'record-1') => ({ params: Promise.resolve({ id }) });

describe('vendor profile, cost centre, and RFQ vendor routes', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(baseContext);
    isContext.mockReturnValue(true);
    audit.mockResolvedValue(undefined);
    writeBatch.mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    writeInvitations.mockResolvedValue(0);
    writeLog.mockResolvedValue(undefined);
    db.$transaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('reads vendor profiles with role, linkage, tenant, and server-error checks', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(getVendorProfile()).resolves.toBe(denied);

    auth.mockResolvedValueOnce({ ...baseContext, role: 'PROJECT_USER', vendorId: undefined });
    await expect(getVendorProfile()).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.forbiddenVendorPortalIsAccessibleOnlyToMappedVendorAccounts, status: 403,
    });
    auth.mockResolvedValueOnce({ ...baseContext, vendorId: undefined });
    await expect(getVendorProfile()).resolves.toEqual({ ok: false, error: UI_STRINGS.common.vendorRecordNotAssociatedWithThisUserAccount, status: 404 });

    db.vendor.findFirst.mockResolvedValueOnce(null);
    await expect(getVendorProfile()).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiVendorPortalMeRoute.vendorProfileNotFound, status: 404 });
    const vendor = { id: 'vendor-1', tenantId: 'tenant-1', name: 'Acme', tenant: { slug: 'tenant-one' } };
    db.vendor.findFirst.mockResolvedValueOnce(vendor);
    await expect(getVendorProfile()).resolves.toEqual({ ok: true, data: { vendor }, status: 200 });
    expect(db.vendor.findFirst).toHaveBeenLastCalledWith({
      where: { id: 'vendor-1', tenantId: 'tenant-1' }, include: { tenant: { select: { id: true, name: true, slug: true } } },
    });

    db.vendor.findFirst.mockRejectedValueOnce(new Error('profile database error'));
    await expect(getVendorProfile()).resolves.toEqual({ ok: false, error: 'profile database error', status: 500 });
    db.vendor.findFirst.mockRejectedValueOnce({});
    await expect(getVendorProfile()).resolves.toEqual({ ok: false, error: 'Failed to fetch vendor profile', status: 500 });
  });

  it('limits vendor profile patches to approved fields and normalizes numeric fields', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(updateVendorProfile(request({ phone: '123' }))).resolves.toBe(denied);
    auth.mockResolvedValueOnce({ ...baseContext, role: 'PROJECT_USER', vendorId: undefined });
    await expect(updateVendorProfile(request({ phone: '123' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.forbiddenVendorPortalIsAccessibleOnlyToMappedVendorAccounts, status: 403,
    });
    auth.mockResolvedValueOnce({ ...baseContext, vendorId: undefined });
    await expect(updateVendorProfile(request({ phone: '123' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.vendorRecordNotAssociatedWithThisUserAccount, status: 404 });
    await expect(updateVendorProfile(request())).resolves.toMatchObject({ ok: false, status: 500 });
    db.vendor.findFirst.mockResolvedValueOnce(null);
    await expect(updateVendorProfile(request({ phone: '123' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiVendorPortalMeRoute.vendorProfileNotFound, status: 404 });

    const body = {
      contactPerson: 'Buyer Contact', phone: '9876543210', website: 'https://acme.test', address: 'Main Road', city: 'Pune',
      state: 'Maharashtra', country: 'India', operatingLocation: 'West', capabilities: ['electrical'], serviceCoverage: ['MH'],
      clientReferences: ['Client A'], certifications: ['ISO'], documents: [{ name: 'certificate.pdf' }], gstin: 'GST-1', pan: 'PAN-1',
      legalStructure: 'Private Limited', experienceYears: '12', turnoverCrores: '5.5', qualificationScore: 99, status: 'DISABLED',
    };
    db.vendor.findFirst.mockResolvedValueOnce({ id: 'vendor-1' });
    db.vendor.update.mockResolvedValueOnce({ id: 'vendor-1', phone: body.phone });
    await expect(updateVendorProfile(request(body))).resolves.toMatchObject({
      ok: true, data: { vendor: { phone: '9876543210' }, message: 'Company profile updated successfully' },
    });
    expect(db.vendor.update).toHaveBeenLastCalledWith({ where: { id: 'vendor-1' }, data: {
      contactPerson: 'Buyer Contact', phone: '9876543210', website: 'https://acme.test', address: 'Main Road', city: 'Pune',
      state: 'Maharashtra', country: UI_STRINGS.common.india, operatingLocation: 'West', capabilities: ['electrical'], serviceCoverage: ['MH'],
      clientReferences: ['Client A'], certifications: ['ISO'], documents: [{ name: 'certificate.pdf' }], gstin: 'GST-1', pan: 'PAN-1',
      legalStructure: 'Private Limited', experienceYears: 12, turnoverCrores: 5.5,
    } });
    expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'VENDOR_PROFILE_SELF_UPDATED', entityId: 'vendor-1' }));

    db.vendor.findFirst.mockResolvedValueOnce({ id: 'vendor-1' });
    db.vendor.update.mockResolvedValueOnce({ id: 'vendor-1' });
    await updateVendorProfile(request({ experienceYears: null, turnoverCrores: '' }));
    expect(db.vendor.update).toHaveBeenLastCalledWith({ where: { id: 'vendor-1' }, data: { experienceYears: null, turnoverCrores: null } });

    db.vendor.findFirst.mockResolvedValueOnce({ id: 'vendor-1' });
    db.vendor.update.mockResolvedValueOnce({ id: 'vendor-1' });
    await updateVendorProfile(request({ qualificationScore: 100, status: 'ACTIVE' }));
    expect(db.vendor.update).toHaveBeenLastCalledWith({ where: { id: 'vendor-1' }, data: {} });

    db.vendor.findFirst.mockResolvedValueOnce({ id: 'vendor-1' });
    db.vendor.update.mockRejectedValueOnce(new Error('profile update error'));
    await expect(updateVendorProfile(request({ phone: '111' }))).resolves.toEqual({ ok: false, error: 'profile update error', status: 500 });
    db.vendor.findFirst.mockResolvedValueOnce({ id: 'vendor-1' });
    db.vendor.update.mockRejectedValueOnce({});
    await expect(updateVendorProfile(request({ phone: '111' }))).resolves.toEqual({ ok: false, error: 'Failed to update company profile', status: 500 });
  });

  it('returns cost centre aggregates and calculates the approved rate per square foot', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(getCostCentre(request(), idParams('cc-1'))).resolves.toBe(denied);
    db.costCentre.findFirst.mockResolvedValueOnce(null);
    await expect(getCostCentre(request(), idParams('cc-1'))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiCostCentresIdRoute.costCentreNotFound, status: 404 });

    db.costCentre.findFirst.mockResolvedValueOnce({
      id: 'cc-1', areaSqFt: 30, budgets: [{ totalAmount: 1000, approvedAmount: 500 }, { totalAmount: null, approvedAmount: 250 }],
    });
    await expect(getCostCentre(request(), idParams('cc-1'))).resolves.toMatchObject({
      ok: true, data: { totalBudget: 1000, approvedBudget: 750, ratePerSqFt: 25 },
    });
    expect(db.costCentre.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: 'cc-1', tenantId: 'tenant-1' } }));

    db.costCentre.findFirst.mockResolvedValueOnce({ id: 'cc-2', areaSqFt: 0, budgets: [{ totalAmount: null, approvedAmount: null }] });
    await expect(getCostCentre(request(), idParams('cc-2'))).resolves.toMatchObject({
      ok: true, data: { totalBudget: 0, approvedBudget: 0, ratePerSqFt: null },
    });
  });

  it('updates cost centre fields with one tenant-scoped compare-and-set D1 batch', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(updateCostCentre(request({ name: 'New' }), idParams('cc-1'))).resolves.toBe(denied);
    db.costCentre.findFirst.mockResolvedValueOnce(null);
    await expect(updateCostCentre(request({ name: 'New' }), idParams('cc-1'))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiCostCentresIdRoute.costCentreNotFound, status: 404 });

    const existing = {
      id: 'cc-1', tenantId: 'tenant-1', projectId: 'project-1', code: 'CC-1', name: 'Old', description: 'Old desc',
      areaSqFt: 12, location: 'East', floorZone: 'L1', status: 'ACTIVE', updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      createdAt: new Date('2024-01-01T00:00:00.000Z'), createdBy: 'user-1',
    };
    db.costCentre.findFirst.mockResolvedValueOnce(existing);
    await expect(updateCostCentre(request({ name: ' New ', areaSqFt: '12.5', description: ' New desc ', location: ' West ', floorZone: ' L2 ', status: 'inactive' }), idParams('cc-1')))
      .resolves.toMatchObject({ ok: true, data: { ...existing, updatedAt: expect.any(Date), name: 'New', description: 'New desc', areaSqFt: 12.5, location: 'West', floorZone: 'L2', status: 'INACTIVE' } });
    const [statements] = writeBatch.mock.lastCall as [[{ sql: string; values: unknown[] }, { sql: string; values: unknown[] }]];
    expect(statements[0].sql).toBe(COST_CENTRE_UPDATE_IF_CURRENT_SQL);
    expect(statements[0].values).toEqual(['New', 'New desc', 12.5, 'West', 'L2', 'INACTIVE', expect.any(Date), 'cc-1', 'tenant-1', existing.updatedAt]);
    expect(statements[1].sql).toBe(COST_CENTRE_AUDIT_AFTER_UPDATE_SQL);
    expect(statements[1].sql).toContain('changes() = 1');
    expect(statements[1].values).toEqual([
      expect.any(String), 'tenant-1', 'user-1', expect.any(String), JSON.stringify(existing), expect.any(String), null, expect.any(Date), 'cc-1', 'tenant-1',
    ]);
    expect(db.costCentre.findFirst).toHaveBeenLastCalledWith({ where: { id: 'cc-1', tenantId: 'tenant-1' } });

    db.costCentre.findFirst.mockResolvedValueOnce(existing);
    await expect(updateCostCentre(request({ description: null, areaSqFt: 0, location: null, floorZone: null }), idParams('cc-1')))
      .resolves.toMatchObject({ ok: true, data: { name: 'Old', description: null, areaSqFt: null, location: null, floorZone: null, status: 'ACTIVE' } });
    const [clearStatements] = writeBatch.mock.lastCall as [[{ sql: string; values: unknown[] }, { sql: string; values: unknown[] }]];
    expect(clearStatements[0].values.slice(0, 6)).toEqual(['Old', null, null, null, null, 'ACTIVE']);

    db.costCentre.findFirst.mockResolvedValueOnce(existing);
    await expect(updateCostCentre(request(), idParams('cc-1'))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
    db.costCentre.findFirst.mockResolvedValueOnce(existing);
    await expect(updateCostCentre(request({ name: null }), idParams('cc-1'))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
    db.costCentre.findFirst.mockResolvedValueOnce(existing);
    await expect(updateCostCentre(request({ areaSqFt: 'Infinity' }), idParams('cc-1'))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
    db.costCentre.findFirst.mockResolvedValueOnce(existing);
    await expect(updateCostCentre(request({ status: 'ARCHIVED' }), idParams('cc-1'))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });

    db.costCentre.findFirst.mockResolvedValueOnce(existing);
    writeBatch.mockImplementationOnce(async (batchStatements: [{ values: unknown[] }, { values: unknown[] }]) => {
      const attemptedAt = batchStatements[0].values[6] as Date;
      db.costCentre.findFirst.mockResolvedValueOnce({ ...existing, updatedAt: attemptedAt, name: 'New' });
      db.auditLog.findFirst.mockResolvedValueOnce({ id: batchStatements[1].values[0] });
      throw new Error('response lost after D1 commit');
    });
    await expect(updateCostCentre(request({ name: 'New' }), idParams('cc-1'))).resolves.toMatchObject({ ok: true, data: { name: 'New' } });
    expect(writeLog).toHaveBeenCalledWith('warn', 'cost_centre.update_result_recovered', expect.objectContaining({ costCentreId: 'cc-1' }));

    db.costCentre.findFirst.mockResolvedValueOnce(existing);
    writeBatch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 0 } }]);
    db.costCentre.findFirst.mockResolvedValueOnce({ ...existing, updatedAt: new Date('2025-01-01T00:00:00.001Z') });
    await expect(updateCostCentre(request({ name: 'Competing edit' }), idParams('cc-1'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409,
    });

    db.costCentre.findFirst.mockResolvedValueOnce(existing);
    writeBatch.mockRejectedValueOnce({ failure: true });
    db.costCentre.findFirst.mockResolvedValueOnce(null);
    db.auditLog.findFirst.mockResolvedValueOnce(null);
    await expect(updateCostCentre(request({ name: 'New' }), idParams('cc-1'))).resolves.toEqual({ ok: false, error: 'Failed to update cost centre.', status: 500 });
    expect(writeLog).toHaveBeenCalledWith('error', 'cost_centre.update_failed', expect.objectContaining({ costCentreId: 'cc-1' }));
  });

  it('validates RFQ vendor invitations and upserts eligible vendors using RFQ status', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(inviteRfqVendors(request({ vendorIds: ['vendor-1'] }), idParams('rfq-1'))).resolves.toBe(denied);
    await expect(inviteRfqVendors(request({}), idParams('rfq-1'))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementRfqsIdVendorsRoute.atLeastOneVendorIDIsRequired, status: 400 });
    await expect(inviteRfqVendors(request({ vendorIds: Array.from({ length: 501 }, (_, index) => `vendor-${index}`) }), idParams('rfq-1'))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementRfqsIdVendorsRoute.maximumVendorInviteBatchLimit, status: 400 });
    expect(db.rfq.findFirst).not.toHaveBeenCalled();
    db.rfq.findFirst.mockResolvedValueOnce(null);
    await expect(inviteRfqVendors(request({ vendorIds: ['vendor-1'] }), idParams('rfq-1'))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rFQNotFoundOrAccessDenied, status: 404 });
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', status: 'DRAFT' });
    db.vendor.findMany.mockResolvedValueOnce([]);
    await expect(inviteRfqVendors(request({ vendorIds: ['blocked'] }), idParams('rfq-1'))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementRfqsIdVendorsRoute.noneOfTheSelectedVendorsAreEligibleOrActive, status: 400 });

    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', tenantId: 'tenant-1', status: 'DRAFT', projectId: 'project-1', rfqNumber: 'RFQ-001' });
    db.vendor.findMany.mockResolvedValueOnce([{ id: 'vendor-1', name: 'Acme' }, { id: 'vendor-2', name: 'BuildCo' }]);
    writeInvitations.mockResolvedValueOnce(2);
    await expect(inviteRfqVendors(request({ vendorIds: ['vendor-1', 'vendor-2'] }), idParams('rfq-1'))).resolves.toEqual({
      ok: true, data: { invited: 2, vendors: [{ id: 'vendor-1', name: 'Acme' }, { id: 'vendor-2', name: 'BuildCo' }], message: 'Successfully invited 2 vendors' }, status: 200,
    });
    expect(db.vendor.findMany).toHaveBeenLastCalledWith({
      where: { id: { in: ['vendor-1', 'vendor-2'] }, tenantId: 'tenant-1', isBlacklisted: false },
    });
    expect(writeInvitations).toHaveBeenLastCalledWith({
      tenantId: 'tenant-1', rfqId: 'rfq-1', vendorIds: ['vendor-1', 'vendor-2'], invitationStatus: UI_STRINGS.common.pENDING,
    });

    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', status: 'RELEASED', projectId: 'project-1', rfqNumber: 'RFQ-001' });
    db.vendor.findMany.mockResolvedValueOnce([{ id: 'vendor-3', name: 'OtherCo' }]);
    writeInvitations.mockResolvedValueOnce(1);
    await inviteRfqVendors(request({ vendorIds: ['vendor-3'] }), idParams('rfq-1'));
    expect(writeInvitations).toHaveBeenLastCalledWith({
      tenantId: 'tenant-1', rfqId: 'rfq-1', vendorIds: ['vendor-3'], invitationStatus: UI_STRINGS.appAppProcurementRfqsNewPage.iNVITED,
    });

    await expect(inviteRfqVendors(request(), idParams('rfq-1'))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementRfqsIdVendorsRoute.failedToInviteVendors, status: 500 });
    db.rfq.findFirst.mockRejectedValueOnce(new Error('invite database error'));
    await expect(inviteRfqVendors(request({ vendorIds: ['vendor-1'] }), idParams('rfq-1'))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementRfqsIdVendorsRoute.failedToInviteVendors, status: 500 });
    expect(writeLog).toHaveBeenCalledWith('error', 'procurement.rfq_vendor_invites_failed', expect.objectContaining({
      operation: 'invite_vendors', route: '/api/procurement/rfqs/[id]/vendors', tenantId: 'tenant-1', rfqId: 'rfq-1', error: expect.any(Error),
    }), 'application');
  });
});
