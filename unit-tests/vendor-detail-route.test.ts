import { NextRequest } from 'next/server';
import { GET, PUT } from '../src/app/api/procurement/vendors/[id]/route';
import { prisma } from '../src/lib/prisma';
import { apiError, apiSuccess, isApiContext, requireAuth } from '../src/lib/api-utils';
import { hasPermission } from '../src/lib/permissions';
import { createAuditLog } from '../src/lib/audit';
import { getUserAuthorizedProjectIds } from '../src/lib/project-auth';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    vendor: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
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
jest.mock('../src/lib/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('../src/lib/project-auth', () => ({ getUserAuthorizedProjectIds: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const permission = hasPermission as jest.Mock;
const audit = createAuditLog as jest.Mock;
const authorizedProjects = getUserAuthorizedProjectIds as jest.Mock;
const successResult = apiSuccess as jest.Mock;
const errorResult = apiError as jest.Mock;
const baseVendor = {
  id: 'vendor-1', tenantId: 'tenant-1', vendorType: 'LOCAL', code: 'V-1', name: 'Northwind',
  contactPerson: 'Alice', email: 'alice@example.test', phone: '111', categories: 'Electrical',
  operatingLocation: 'West', city: 'Pune', state: 'MH', country: 'India', legalStructure: 'LLP',
  gstin: 'GST-1', pan: 'PAN-1', website: 'https://example.test', address: 'Old address',
  experienceYears: 4, turnoverCrores: 12, capabilities: '[]', serviceCoverage: '[]',
  clientReferences: '[]', certifications: '[]', documents: '[]', status: 'ACTIVE',
};

function params(id = 'vendor-1') {
  return { params: Promise.resolve({ id }) };
}

function putRequest(body: unknown) {
  return { json: jest.fn().mockResolvedValue(body) } as unknown as NextRequest;
}

describe('vendor detail route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue({ tenantId: 'tenant-1', userId: 'user-1', role: 'ADMIN', vendorId: undefined });
    isContext.mockReturnValue(true);
    permission.mockReturnValue(false);
    audit.mockResolvedValue(undefined);
    authorizedProjects.mockResolvedValue(['project-1']);
    db.vendor.findFirst.mockResolvedValue(baseVendor);
    db.vendor.findMany.mockResolvedValue([]);
    db.vendor.update.mockImplementation(({ data }: { data: unknown }) => Promise.resolve({ ...baseVendor, ...(data as object) }));
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
    await expect(GET({} as NextRequest, params('missing'))).resolves.toEqual({ ok: false, error: 'Vendor not found or access denied.', status: 404 });

    permission.mockReturnValue(false);
    await expect(PUT(putRequest({}), params())).resolves.toEqual({ ok: false, error: 'Forbidden: insufficient permissions', status: 403 });
    permission.mockReturnValueOnce(true);
    db.vendor.findFirst.mockResolvedValueOnce(null);
    await expect(PUT(putRequest({}), params('missing'))).resolves.toEqual({ ok: false, error: 'Vendor not found or access denied.', status: 404 });
  });

  it('parses ratings, hides unapproved ratings from procurement users, and filters eligible PPOs', async () => {
    const ratings = [
      {
        id: 'rating-approved', ppoId: 'ppo-locked', ratedBy: 'rater-1', status: 'APPROVED', overallScore: 90,
        qualityScore: 91, deliveryScore: 92, commercialComplianceScore: 93, responsivenessScore: 94, documentationClosureScore: 95,
        criteriaDetails: JSON.stringify({ qualityComments: 'Excellent', approvedBy: 'approver-1', history: [{ action: 'APPROVE' }] }),
      },
      {
        id: 'rating-submitted', ppoId: 'ppo-submitted', ratedBy: 'unknown-rater', status: 'SUBMITTED', overallScore: 70,
        qualityScore: 71, deliveryScore: 72, commercialComplianceScore: 73, responsivenessScore: 74, documentationClosureScore: 75,
        criteriaDetails: { deliveryComments: 'Waiting', returnReason: 'Clarify' },
      },
      { id: 'rating-invalid', ppoId: 'ppo-other', ratedBy: null, status: 'RETURNED', criteriaDetails: '{bad json' },
    ];
    db.vendor.findFirst.mockResolvedValue({
      ...baseVendor,
      ppoRatings: ratings,
      ppos: [
        { id: 'ppo-locked', status: 'ISSUED', projectId: 'project-1' },
        { id: 'ppo-submitted', status: 'ISSUED', projectId: 'project-1' },
        { id: 'ppo-draft', status: 'DRAFT', projectId: 'project-1' },
        { id: 'ppo-cancelled', status: 'CANCELLED', projectId: 'project-1' },
        { id: 'ppo-forbidden-project', status: 'ISSUED', projectId: 'project-2' },
        { id: 'ppo-eligible', status: 'COMPLETED', projectId: 'project-1' },
        { id: 'ppo-no-project', status: 'ISSUED', projectId: null, project: null },
        { id: 'ppo-project-fallback', status: 'ISSUED', projectId: null, project: { id: 'project-1' } },
      ],
    });
    const result = await GET({} as NextRequest, params());
    expect(result).toMatchObject({ ok: true, data: {
      eligiblePposToRate: [
        { id: 'ppo-eligible', status: 'COMPLETED', projectId: 'project-1' },
        { id: 'ppo-no-project', status: 'ISSUED', projectId: null, project: null },
        { id: 'ppo-project-fallback', status: 'ISSUED', projectId: null, project: { id: 'project-1' } },
      ],
      performanceSummary: {
        ppoRatingsCount: 1, averagePpoRating: 90, avgQuality: 91, avgDelivery: 92,
        avgCommercial: 93, avgResponsiveness: 94, avgDocumentation: 95,
      },
      auditLogs: [{ id: 'audit-1', action: 'VENDOR_UPDATED' }], currentUserRole: 'ADMIN', isProcurementUser: false,
    } });
    const data = (result as any).data;
    expect(data.vendor.ppoRatings[0]).toMatchObject({
      ratedByName: 'Rater One', criteriaDetailsParsed: { qualityComments: 'Excellent', approvedBy: 'approver-1' },
      qualityComments: 'Excellent', deliveryComments: '', approvedByName: null,
      decisionHistory: [{ action: 'APPROVE' }],
    });
    expect(data.vendor.ppoRatings[1]).toMatchObject({ ratedByName: 'unknown-rater', deliveryComments: 'Waiting', returnReason: 'Clarify' });
    expect(data.vendor.ppoRatings[2]).toMatchObject({ criteriaDetailsParsed: {}, responsivenessComments: '', decisionHistory: [] });
    expect(authorizedProjects).toHaveBeenCalledWith('user-1', 'ADMIN');

    auth.mockResolvedValueOnce({ tenantId: 'tenant-1', userId: 'buyer-1', role: 'PROCUREMENT_USER' });
    await expect(GET({} as NextRequest, params())).resolves.toMatchObject({
      data: { vendor: { ppoRatings: [{ id: 'rating-approved' }] }, eligiblePposToRate: [], isProcurementUser: true },
    });
    expect(authorizedProjects).toHaveBeenCalledTimes(1);
  });

  it('uses null averages for vendors with no approved ratings and handles GET failures', async () => {
    db.vendor.findFirst.mockResolvedValue({ ...baseVendor, ppoRatings: [], ppos: [] });
    authorizedProjects.mockResolvedValue(null);
    await expect(GET({} as NextRequest, params())).resolves.toMatchObject({
      data: { eligiblePposToRate: [], performanceSummary: {
        ppoRatingsCount: 0, averagePpoRating: null, avgQuality: null, avgDelivery: null,
        avgCommercial: null, avgResponsiveness: null, avgDocumentation: null, mostRecentRating: null,
      } },
    });

    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    db.vendor.findFirst.mockRejectedValueOnce(new Error('vendor read failed'));
    await expect(GET({} as NextRequest, params())).resolves.toEqual({ ok: false, error: 'vendor read failed', status: 500 });
    db.vendor.findFirst.mockRejectedValueOnce({});
    await expect(GET({} as NextRequest, params())).resolves.toEqual({ ok: false, error: 'Failed to fetch vendor profile', status: 500 });
    expect(errorResult).toHaveBeenCalledWith('vendor read failed', 500);
    expect(errorResult).toHaveBeenCalledWith('Failed to fetch vendor profile', 500);
  });

  it('updates profiles as internal managers with normalized values and audit history', async () => {
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
    expect(db.vendor.update).toHaveBeenCalledWith({ where: { id: 'vendor-1' }, data: {
      name: 'New Vendor', contactPerson: null, email: 'new@example.test', phone: null, categories: ['Electrical'],
      operatingLocation: 'North', city: 'Delhi', state: 'DL', country: 'India', legalStructure: 'Private Limited',
      gstin: null, pan: null, website: null, address: ' New address ', experienceYears: null,
      turnoverCrores: null, capabilities: '["testing"]', serviceCoverage: JSON.stringify({ areas: ['North'] }),
      clientReferences: 'Client A', certifications: ['ISO'], documents: JSON.stringify({ certificate: 'doc-1' }), status: 'ACTIVE',
    } });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'VENDOR_UPDATED', entityId: 'vendor-1' }));
  });

  it('allows a vendor to update its own profile and preserves omitted values', async () => {
    auth.mockResolvedValue({ tenantId: 'tenant-1', userId: 'vendor-user', role: 'VENDOR', vendorId: 'vendor-1' });
    permission.mockImplementation((_role: string, name: string) => name === 'VENDOR_PROFILE_EDIT');
    await expect(PUT(putRequest({}), params())).resolves.toMatchObject({ ok: true });
    expect(db.vendor.update).toHaveBeenCalledWith({ where: { id: 'vendor-1' }, data: {
      name: 'Northwind', contactPerson: 'Alice', email: 'alice@example.test', phone: '111', categories: 'Electrical',
      operatingLocation: 'West', city: 'Pune', state: 'MH', country: 'India', legalStructure: 'LLP', gstin: 'GST-1', pan: 'PAN-1',
      website: 'https://example.test', address: 'Old address', experienceYears: 4, turnoverCrores: 12,
      capabilities: '[]', serviceCoverage: '[]', clientReferences: '[]', certifications: '[]', documents: '[]', status: 'ACTIVE',
    } });
    expect(permission).toHaveBeenCalledWith('VENDOR', 'VENDOR_MANAGE');
    expect(permission).toHaveBeenCalledWith('VENDOR', 'VENDOR_PROFILE_EDIT');
  });

  it('returns a PUT server error when updating the vendor fails', async () => {
    auth.mockResolvedValueOnce({ status: 401 });
    isContext.mockReturnValueOnce(false);
    await expect(PUT(putRequest({}), params())).resolves.toEqual({ status: 401 });

    permission.mockReturnValue(true);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    db.vendor.update.mockRejectedValueOnce(new Error('vendor write failed'));
    await expect(PUT(putRequest({}), params())).resolves.toEqual({ ok: false, error: 'vendor write failed', status: 500 });
    db.vendor.update.mockRejectedValueOnce({});
    await expect(PUT(putRequest({}), params())).resolves.toEqual({ ok: false, error: 'Failed to update vendor profile', status: 500 });
    expect(errorResult).toHaveBeenCalledWith('vendor write failed', 500);
    expect(errorResult).toHaveBeenCalledWith('Failed to update vendor profile', 500);
  });
});
