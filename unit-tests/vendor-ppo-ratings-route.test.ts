import { NextRequest } from 'next/server';
import { GET, POST } from '../src/app/api/procurement/vendors/[id]/ppo-ratings/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { isUserAuthorizedForProject } from '../src/lib/project-auth';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    ppoVendorRating: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    user: { findMany: jest.fn() },
    vendor: { findFirst: jest.fn() },
    ppo: { findFirst: jest.fn(), update: jest.fn() },
    notification: { create: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));
jest.mock('../src/lib/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('../src/lib/project-auth', () => ({ isUserAuthorizedForProject: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
const projectAuth = isUserAuthorizedForProject as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1', userName: 'Project Reviewer', role: 'PROJECT_APPROVER' };
const params = (id = 'vendor-1') => ({ params: Promise.resolve({ id }) });
const getRequest = () => new NextRequest('http://localhost/api/vendors/vendor-1/ppo-ratings');
const postRequest = (body: unknown) => new NextRequest('http://localhost/api/vendors/vendor-1/ppo-ratings', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const vendor = { id: 'vendor-1', name: 'Acme', tenantId: 'tenant-1' };
const ppo = {
  id: 'ppo-1', ppoNumber: 'PPO-001', status: 'ISSUED', vendorId: 'vendor-1', projectId: 'project-1', costCentreId: 'cc-1',
  project: { id: 'project-1', name: 'West Campus', projectCode: 'P-01' }, costCentre: { id: 'cc-1', name: 'Electrical', code: 'CC-1' },
};

function rating(overrides: Record<string, any> = {}) {
  return {
    id: 'rating-1', vendorId: 'vendor-1', ppoId: 'ppo-1', ratedBy: 'user-1', status: 'APPROVED',
    overallScore: 4, qualityScore: 5, deliveryScore: 4, commercialComplianceScore: 3,
    responsivenessScore: 4, documentationClosureScore: 5,
    criteriaDetails: JSON.stringify({ qualityComments: 'Good quality', overallImprovement: 'Maintain delivery', history: [{ action: 'SUBMITTED' }] }),
    ppo: { id: 'ppo-1', ppoNumber: 'PPO-001' }, ...overrides,
  };
}

describe('vendor PPO ratings API', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.ppoVendorRating.findMany.mockReset().mockResolvedValue([]);
    db.ppoVendorRating.findUnique.mockReset().mockResolvedValue(null);
    db.ppoVendorRating.create.mockReset().mockImplementation(async ({ data }: { data: Record<string, any> }) => ({ id: 'rating-new', ...data }));
    db.ppoVendorRating.update.mockReset().mockImplementation(async ({ data }: { data: Record<string, any> }) => ({ id: 'rating-existing', ...data }));
    db.user.findMany.mockReset().mockResolvedValue([]);
    db.vendor.findFirst.mockReset().mockResolvedValue(vendor);
    db.ppo.findFirst.mockReset().mockResolvedValue(ppo);
    db.ppo.update.mockReset().mockResolvedValue({ ...ppo, status: 'COMPLETED' });
    db.notification.create.mockReset().mockResolvedValue({ id: 'notification-1' });
    audit.mockReset().mockResolvedValue(undefined);
    projectAuth.mockReset().mockResolvedValue(true);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('returns parsed rating details and approved scorecard averages, filtering procurement reads', async () => {
    db.ppoVendorRating.findMany.mockResolvedValueOnce([
      rating(),
      rating({ id: 'rating-2', ratedBy: 'missing-user', overallScore: 3, qualityScore: 3, deliveryScore: 2,
        commercialComplianceScore: 5, responsivenessScore: 2, documentationClosureScore: 3,
        criteriaDetails: { deliveryComments: 'Arrived late', approvedBy: 'user-2', approvedByName: 'Approver', history: [] } }),
      rating({ id: 'rating-returned', status: 'RETURNED_FOR_CORRECTION', criteriaDetails: '{broken json' }),
      rating({ id: 'rating-empty', status: 'DRAFT', ratedBy: null, criteriaDetails: null }),
    ]);
    db.user.findMany.mockResolvedValueOnce([{ id: 'user-1', name: 'Reviewer' }, { id: 'user-2', name: 'Approver' }]);
    const result = await GET(getRequest(), params());
    expect(result).toMatchObject({ ok: true, data: {
      ratings: [
        { ratedByName: 'Reviewer', criteriaDetailsParsed: { qualityComments: 'Good quality' }, qualityComments: 'Good quality',
          deliveryComments: '', overallImprovement: 'Maintain delivery', decisionHistory: [{ action: 'SUBMITTED' }] },
        { ratedByName: 'missing-user', deliveryComments: 'Arrived late', approvedBy: 'user-2', approvedByName: 'Approver', decisionHistory: [] },
        { ratedByName: 'Reviewer', criteriaDetailsParsed: {}, qualityComments: '', returnReason: null, decisionHistory: [] },
        { ratedByName: null, criteriaDetailsParsed: {}, qualityComments: '', decisionHistory: [] },
      ],
      summary: { ppoRatingsCount: 2, averageOverall: 3.5, avgQuality: 4, avgDelivery: 3, avgCommercial: 4, avgResponsiveness: 3, avgDocumentation: 4 },
      userRole: 'PROJECT_APPROVER', isProcurementUser: false,
    } });
    expect(db.ppoVendorRating.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { vendorId: 'vendor-1', tenantId: 'tenant-1' } }));
    expect(db.user.findMany).toHaveBeenCalledWith({ where: { id: { in: ['user-1', 'missing-user'] } }, select: { id: true, name: true, role: true, email: true } });

    auth.mockResolvedValueOnce({ ...context, role: 'PROCUREMENT_USER' });
    await GET(getRequest(), params());
    expect(db.ppoVendorRating.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { vendorId: 'vendor-1', tenantId: 'tenant-1', status: UI_STRINGS.common.aPPROVED } }));
  });

  it('returns null averages for empty scorecards and controlled GET failures', async () => {
    await expect(GET(getRequest(), params())).resolves.toMatchObject({ ok: true, data: {
      ratings: [], summary: { ppoRatingsCount: 0, averageOverall: null, avgQuality: null, avgDelivery: null, avgCommercial: null, avgResponsiveness: null, avgDocumentation: null },
    } });
    db.ppoVendorRating.findMany.mockRejectedValueOnce(new Error('rating query failed'));
    await expect(GET(getRequest(), params())).resolves.toEqual({ ok: false, error: 'rating query failed', status: 500 });
    db.ppoVendorRating.findMany.mockRejectedValueOnce({});
    await expect(GET(getRequest(), params())).resolves.toEqual({ ok: false, error: 'Failed to fetch PPO ratings', status: 500 });
  });

  it('validates rating permissions, vendor, PPO eligibility, project scope, and existing decision state', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(postRequest({}), params())).resolves.toBe(denied);
    auth.mockResolvedValueOnce({ ...context, role: 'PROCUREMENT_USER' });
    await expect(POST(postRequest({}), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementVendorsIdPpoRatingsRoute.forbiddenProcurementUsersHaveReadOnlyAccessToVendorRatings, status: 403 });

    db.vendor.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest({ ppoId: 'ppo-1' }), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.vendorNotFoundOrAccessDenied2, status: 404 });
    await expect(POST(postRequest({}), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementVendorsIdPpoRatingsRoute.pPOIDIsRequiredToRecordPerformanceEvaluation, status: 400 });
    db.ppo.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest({ ppoId: 'missing' }), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementVendorsIdPpoRatingsRoute.pPONotFoundOrDoesNotBelongToThisVendor, status: 404 });

    for (const status of ['DRAFT', 'CANCELLED']) {
      db.ppo.findFirst.mockResolvedValueOnce({ ...ppo, status });
      await expect(POST(postRequest({ ppoId: 'ppo-1' }), params())).resolves.toMatchObject({ ok: false, error: expect.stringContaining('is not eligible'), status: 400 });
    }

    projectAuth.mockResolvedValueOnce(false);
    await expect(POST(postRequest({ ppoId: 'ppo-1' }), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementVendorsIdPpoRatingsRoute.accessDeniedYouAreNotAuthorisedToEvaluatePPOsForThisProject, status: 403 });

    for (const status of ['APPROVED', 'REJECTED', 'SUBMITTED']) {
      db.ppoVendorRating.findUnique.mockResolvedValueOnce({ id: 'existing', status });
      await expect(POST(postRequest({ ppoId: 'ppo-1' }), params())).resolves.toMatchObject({ ok: false, error: expect.stringContaining('assessment'), status: 400 });
    }
    await expect(POST(postRequest({ ppoId: 'ppo-1' }), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.pleaseProvideFeedbackOrAreasForImprovementBeforeSubmittingForProjectApproval, status: 400 });
  });

  it('saves a clamped draft and submits a new assessment with completion, audit, and notification', async () => {
    db.ppoVendorRating.create.mockResolvedValueOnce({ id: 'draft-rating', status: 'DRAFT' });
    const draft = await POST(postRequest({ ppoId: 'ppo-1', action: 'SAVE_DRAFT', qualityScore: 9, deliveryScore: 0,
      commercialComplianceScore: 'bad', responsivenessScore: 4, documentationClosureScore: 2, supportingEvidence: ['photo.png'] }), params());
    expect(draft).toMatchObject({ ok: true, status: 201, data: { rating: { id: 'draft-rating' }, message: 'Draft rating for PPO PPO-001 saved successfully.' } });
    expect(db.ppoVendorRating.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({
      tenantId: 'tenant-1', vendorId: 'vendor-1', ppoId: 'ppo-1', projectId: 'project-1', costCentreId: 'cc-1',
      qualityScore: 5, deliveryScore: 3, commercialComplianceScore: 3, responsivenessScore: 4, documentationClosureScore: 2,
      overallScore: 3.7, comments: null, supportingEvidence: ['photo.png'], status: 'DRAFT',
    }) });
    expect(db.ppo.update).not.toHaveBeenCalled();
    expect(db.notification.create).not.toHaveBeenCalled();

    db.ppoVendorRating.create.mockResolvedValueOnce({ id: 'submitted-rating', status: 'SUBMITTED' });
    const submitted = await POST(postRequest({ ppoId: 'ppo-1', qualityScore: 5, deliveryScore: 4, commercialComplianceScore: 3,
      responsivenessScore: 4, documentationClosureScore: 5, comments: 'Strong delivery', qualityComments: '  Good finish  ',
      overallImprovement: '  Keep consistency  ' }), params());
    expect(submitted).toMatchObject({ ok: true, status: 201, data: { rating: { id: 'submitted-rating' }, message: 'Performance assessment for PPO PPO-001 submitted for Project Approval.' } });
    expect(db.ppo.update).toHaveBeenCalledWith({ where: { id: 'ppo-1' }, data: { status: 'COMPLETED', completedAt: expect.any(Date) } });
    expect(db.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ targetRole: 'PROJECT_APPROVER', entityId: 'ppo-1', recordNumber: 'PPO-001' }) });
    expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'PPO_RATING_SUBMITTED', entityId: 'vendor-1' }));
  });

  it('updates returned assessments, preserves history, skips repeated PPO completion, and handles POST errors', async () => {
    db.ppoVendorRating.findUnique.mockResolvedValueOnce({ id: 'rating-returned', status: 'RETURNED_FOR_CORRECTION', criteriaDetails: '{bad json' });
    db.ppoVendorRating.update.mockResolvedValueOnce({ id: 'rating-returned', status: 'SUBMITTED' });
    db.ppo.findFirst.mockResolvedValueOnce({ ...ppo, status: 'COMPLETED' });
    await expect(POST(postRequest({ ppoId: 'ppo-1', comments: 'Updated notes', markPpoCompleted: false,
      qualityComments: '  Better  ' }), params())).resolves.toMatchObject({ ok: true, status: 201 });
    const update = db.ppoVendorRating.update.mock.calls[0][0];
    expect(update.data.status).toBe(UI_STRINGS.common.sUBMITTED);
    expect(update.data.criteriaDetails).toContain('RESUBMITTED');
    expect(update.data.criteriaDetails).toContain('Better');
    expect(db.ppo.update).not.toHaveBeenCalled();
    expect(db.notification.create).toHaveBeenCalledTimes(1);

    db.vendor.findFirst.mockRejectedValueOnce(new Error('rating write failed'));
    await expect(POST(postRequest({ ppoId: 'ppo-1', comments: 'Feedback' }), params())).resolves.toEqual({ ok: false, error: 'rating write failed', status: 500 });
    db.vendor.findFirst.mockRejectedValueOnce({});
    await expect(POST(postRequest({ ppoId: 'ppo-1', comments: 'Feedback' }), params())).resolves.toEqual({ ok: false, error: 'Failed to submit PPO rating', status: 500 });
  });
});
