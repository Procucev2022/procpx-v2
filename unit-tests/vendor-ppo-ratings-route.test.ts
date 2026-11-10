import { NextRequest } from 'next/server';
import { GET, POST } from '../src/app/api/procurement/vendors/[id]/ppo-ratings/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext, getListPageWindow } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { isUserAuthorizedForProject } from '../src/lib/project-auth';
import { logEvent, writeStructuredLog } from '../src/lib/observability/server-logger';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { dispatchPreparedWorkflowNotification } from '../src/lib/notifications';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    ppoVendorRating: { findMany: jest.fn(), groupBy: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    user: { findMany: jest.fn() },
    vendor: { findFirst: jest.fn() },
    ppo: { findFirst: jest.fn(), groupBy: jest.fn(), update: jest.fn() },
    notification: { create: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  getListPageWindow: jest.fn(() => ({ page: 1, pageSize: 50, skip: 0 })),
}));
jest.mock('../src/lib/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('../src/lib/project-auth', () => ({ isUserAuthorizedForProject: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({
  logEvent: jest.fn(), writeStructuredLog: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/notifications', () => ({ dispatchPreparedWorkflowNotification: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const pageWindow = getListPageWindow as jest.Mock;
const audit = createAuditLog as jest.Mock;
const projectAuth = isUserAuthorizedForProject as jest.Mock;
const writeLog = writeStructuredLog as jest.Mock;
const logHandled = logEvent as jest.Mock;
const writeBatch = writeD1BatchAtomically as jest.Mock;
const dispatchPrepared = dispatchPreparedWorkflowNotification as jest.Mock;
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
    db.ppoVendorRating.groupBy.mockReset().mockResolvedValue([]);
    db.ppoVendorRating.findUnique.mockReset().mockResolvedValue(null);
    db.ppoVendorRating.findFirst.mockReset().mockResolvedValue(null);
    db.ppoVendorRating.create.mockReset().mockImplementation(async ({ data }: { data: Record<string, any> }) => ({ id: 'rating-new', ...data }));
    db.ppoVendorRating.update.mockReset().mockImplementation(async ({ data }: { data: Record<string, any> }) => ({ id: 'rating-existing', ...data }));
    db.user.findMany.mockReset().mockResolvedValue([]);
    db.vendor.findFirst.mockReset().mockResolvedValue(vendor);
    db.ppo.findFirst.mockReset().mockResolvedValue(ppo);
    db.ppo.groupBy.mockReset().mockResolvedValue([]);
    db.ppo.update.mockReset().mockResolvedValue({ ...ppo, status: 'COMPLETED' });
    db.notification.create.mockReset().mockResolvedValue({ id: 'notification-1' });
    audit.mockReset().mockResolvedValue(undefined);
    projectAuth.mockReset().mockResolvedValue(true);
    writeLog.mockReset().mockResolvedValue(undefined);
    logHandled.mockReset();
    writeBatch.mockReset().mockImplementation(async (statements: Array<{ values: unknown[] }>) => statements.map((statement, index) => ({
      meta: { changes: 1 },
      ...(index === 0 ? { results: [{ id: statement.values[0], status: statement.values[15] }] } : {}),
    })));
    dispatchPrepared.mockReset().mockResolvedValue(undefined);
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
      rating({ id: 'rating-invalid-shape', status: 'DRAFT', criteriaDetails: '[]' }),
    ]);
    db.ppoVendorRating.groupBy.mockResolvedValueOnce([
      { status: 'APPROVED', _count: { _all: 2 }, _avg: { overallScore: 3.5, qualityScore: 4, deliveryScore: 3, commercialComplianceScore: 4, responsivenessScore: 3, documentationClosureScore: 4 } },
      { status: 'DRAFT', _count: { _all: 2 }, _avg: { overallScore: 2, qualityScore: 2, deliveryScore: 2, commercialComplianceScore: 2, responsivenessScore: 2, documentationClosureScore: 2 } },
      { status: 'RETURNED_FOR_CORRECTION', _count: { _all: 1 }, _avg: { overallScore: 2, qualityScore: 2, deliveryScore: 2, commercialComplianceScore: 2, responsivenessScore: 2, documentationClosureScore: 2 } },
    ]);
    db.ppo.groupBy.mockResolvedValueOnce([
      { status: 'COMPLETED', _count: { _all: 2 } },
      { status: 'ISSUED', _count: { _all: 1 } },
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
        { ratedByName: 'Reviewer', criteriaDetailsParsed: {}, qualityComments: '', decisionHistory: [] },
      ],
      summary: { ppoRatingsCount: 2, averageOverall: 3.5, avgQuality: 4, avgDelivery: 3, avgCommercial: 4, avgResponsiveness: 3, avgDocumentation: 4, ppoCount: 3, completedPpoCount: 2 },
      userRole: 'PROJECT_APPROVER', isProcurementUser: false,
      pagination: { page: 1, pageSize: 50, total: 5, hasMore: false },
    } });
    expect(logHandled).toHaveBeenCalledWith('warn', 'vendor_rating.criteria_details_invalid', expect.objectContaining({
      operation: 'list_vendor_ratings', route: '/api/procurement/vendors/[id]/ppo-ratings',
      tenantId: 'tenant-1', vendorId: 'vendor-1', fieldName: 'criteriaDetails', invalidCount: 2,
      sampleRatingId: 'rating-returned', fallback: 'empty_object',
    }));
    expect(db.ppoVendorRating.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { vendorId: 'vendor-1', tenantId: 'tenant-1' }, skip: 0, take: 51,
      orderBy: [{ ratedAt: 'desc' }, { id: 'desc' }],
    }));
    expect(db.user.findMany).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1', id: { in: ['user-1', 'missing-user'] } }, select: { id: true, name: true } });

    auth.mockResolvedValueOnce({ ...context, role: 'PROCUREMENT_USER' });
    await GET(getRequest(), params());
    expect(db.ppoVendorRating.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { vendorId: 'vendor-1', tenantId: 'tenant-1', status: 'APPROVED' } }));
  });

  it('returns null averages for empty scorecards and controlled GET failures', async () => {
    await expect(GET(getRequest(), params())).resolves.toMatchObject({ ok: true, data: {
      ratings: [], summary: { ppoRatingsCount: 0, averageOverall: null, avgQuality: null, avgDelivery: null, avgCommercial: null, avgResponsiveness: null, avgDocumentation: null },
    } });
    db.ppoVendorRating.groupBy.mockRejectedValueOnce(new Error('rating query failed'));
    await expect(GET(getRequest(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchPpoRatings, status: 500 });
    db.ppoVendorRating.groupBy.mockRejectedValueOnce({});
    await expect(GET(getRequest(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchPpoRatings, status: 500 });
  });

  it('trims the extra pagination row and counts accepted PPOs with zero-valued groups', async () => {
    db.ppoVendorRating.findMany.mockResolvedValueOnce(Array.from({ length: 51 }, (_, index) => rating({ id: `rating-${index}` })));
    db.ppo.groupBy.mockResolvedValueOnce([
      { status: 'ACCEPTED', _count: { _all: 0 } },
      { status: 'COMPLETED', _count: { _all: 2 } },
    ]);
    const result = await GET(getRequest(), params());
    expect(result).toMatchObject({ ok: true, data: {
      ratings: expect.any(Array), summary: { ppoCount: 2, completedPpoCount: 2 },
      pagination: { page: 1, pageSize: 50, hasMore: true },
    } });
    const resultBody = result as unknown as { data: { ratings: unknown[] } };
    expect(resultBody.data.ratings).toHaveLength(50);
  });

  it('chunks user lookups for a full 100-rating page and keeps them tenant-scoped', async () => {
    pageWindow.mockReturnValueOnce({ page: 1, pageSize: 100, skip: 0 });
    db.ppoVendorRating.findMany.mockResolvedValueOnce(Array.from({ length: 100 }, (_, index) => rating({
      id: `rating-${index}`,
      ratedBy: `user-${index}`,
    })));

    await GET(getRequest(), params());

    expect(db.user.findMany).toHaveBeenCalledTimes(2);
    expect(db.user.findMany.mock.calls.map(([query]) => query.where.id.in.length)).toEqual([90, 10]);
    expect(db.user.findMany.mock.calls.every(([query]) => query.where.tenantId === 'tenant-1')).toBe(true);
  });

  it('rejects malformed bodies and invalid assessment actions before PPO lookup', async () => {
    await expect(POST(postRequest([]), params())).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(POST(postRequest({ ppoId: 'ppo-1', action: 'UNKNOWN' }), params())).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(POST(postRequest({ ppoId: 'ppo-1', markPpoCompleted: 'yes' }), params())).resolves.toMatchObject({ ok: false, status: 400 });
    expect(db.ppo.findFirst).not.toHaveBeenCalled();
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
      db.ppoVendorRating.findFirst.mockResolvedValueOnce({ id: 'existing', status });
      await expect(POST(postRequest({ ppoId: 'ppo-1' }), params())).resolves.toMatchObject({ ok: false, error: expect.stringContaining('assessment'), status: 400 });
    }
    db.ppoVendorRating.findFirst.mockResolvedValueOnce({ id: 'existing', status: 'LOCKED' });
    await expect(POST(postRequest({ ppoId: 'ppo-1' }), params())).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(POST(postRequest({ ppoId: 'ppo-1' }), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.pleaseProvideFeedbackOrAreasForImprovementBeforeSubmittingForProjectApproval, status: 400 });
  });

  it('saves a clamped draft and submits a new assessment with completion, audit, and notification', async () => {
    const draft = await POST(postRequest({ ppoId: 'ppo-1', action: 'SAVE_DRAFT', qualityScore: 9, deliveryScore: 0,
      commercialComplianceScore: 'bad', responsivenessScore: 4, documentationClosureScore: 2, supportingEvidence: ['photo.png'] }), params());
    expect(draft).toMatchObject({ ok: true, status: 201, data: { rating: { status: 'DRAFT' }, message: 'Draft rating for PPO PPO-001 saved successfully.' } });
    const draftBatch = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(draftBatch).toHaveLength(2);
    expect(draftBatch[0].values).toEqual(expect.arrayContaining([
      'tenant-1', 'vendor-1', 'ppo-1', 'project-1', 'cc-1', 5, 3, 3, 4, 2, 3.7, 'DRAFT', 'user-1', '["photo.png"]',
    ]));
    expect(draftBatch[0].values.filter((value) => value === 'ppo-1')).toHaveLength(2);
    expect(db.ppo.update).not.toHaveBeenCalled();
    expect(db.notification.create).not.toHaveBeenCalled();

    const submitted = await POST(postRequest({ ppoId: 'ppo-1', qualityScore: 5, deliveryScore: 4, commercialComplianceScore: 3,
      responsivenessScore: 4, documentationClosureScore: 5, comments: 'Strong delivery', qualityComments: '  Good finish  ',
      overallImprovement: '  Keep consistency  ' }), params());
    expect(submitted).toMatchObject({ ok: true, status: 201, data: { rating: { id: expect.any(String) }, message: 'Performance assessment for PPO PPO-001 submitted for Project Approval.' } });
    const submitBatch = writeBatch.mock.calls[1][0] as Array<{ sql: string; values: unknown[] }>;
    expect(submitBatch).toHaveLength(4);
    expect(submitBatch[0].sql).toContain('ON CONFLICT ("ppoId") DO UPDATE');
    expect(submitBatch[1].values).toContain('PPO_RATING_SUBMITTED');
    expect(submitBatch[2].sql).toContain('UPDATE "ppos"');
    expect(submitBatch[3].sql).toContain('notification_outbox');
    expect(dispatchPrepared).toHaveBeenCalledWith(submitBatch[3].values[0], expect.any(Date), expect.objectContaining({ entityType: 'PPO', entityId: 'ppo-1' }));
    expect(db.ppo.update).not.toHaveBeenCalled();
    expect(db.notification.create).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('updates returned assessments, preserves history, skips repeated PPO completion, and handles POST errors', async () => {
    db.ppoVendorRating.findFirst.mockResolvedValueOnce({ id: 'rating-returned', status: 'RETURNED_FOR_CORRECTION', criteriaDetails: '{bad json' });
    db.ppo.findFirst.mockResolvedValueOnce({ ...ppo, status: 'COMPLETED' });
    await expect(POST(postRequest({ ppoId: 'ppo-1', comments: 'Updated notes', markPpoCompleted: false,
      qualityComments: '  Better  ' }), params())).resolves.toMatchObject({ ok: true, status: 201 });
    expect(logHandled).toHaveBeenCalledWith('warn', 'vendor_rating.criteria_details_invalid', expect.objectContaining({
      operation: 'submit_vendor_rating', route: '/api/procurement/vendors/[id]/ppo-ratings',
      tenantId: 'tenant-1', vendorId: 'vendor-1', ppoId: 'ppo-1', ratingId: 'rating-returned',
      fieldName: 'criteriaDetails', fallback: 'empty_object',
    }));
    const update = writeBatch.mock.calls[0][0][0].values;
    expect(update[15]).toBe(UI_STRINGS.common.sUBMITTED);
    expect(update[12]).toContain('RESUBMITTED');
    expect(update[12]).toContain('Better');
    expect(db.ppo.update).not.toHaveBeenCalled();
    const returnedBatch = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(returnedBatch).toHaveLength(3);
    expect(returnedBatch[2].sql).toContain('notification_outbox');
    expect(db.notification.create).not.toHaveBeenCalled();

    db.vendor.findFirst.mockRejectedValueOnce(new Error('rating write failed'));
    await expect(POST(postRequest({ ppoId: 'ppo-1', comments: 'Feedback' }), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToSubmitPpoRating, status: 500 });
    expect(writeLog).toHaveBeenCalledWith('error', 'vendor.rating_submission_failed', expect.objectContaining({ vendorId: 'vendor-1', ppoId: null }));
    db.vendor.findFirst.mockRejectedValueOnce({});
    await expect(POST(postRequest({ ppoId: 'ppo-1', comments: 'Feedback' }), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToSubmitPpoRating, status: 500 });
  });

  it('preserves valid object criteria from a returned assessment', async () => {
    db.ppoVendorRating.findFirst.mockResolvedValueOnce({
      id: 'rating-object-criteria', status: 'RETURNED_FOR_CORRECTION',
      criteriaDetails: { history: [{ action: 'SUBMITTED', performedBy: 'user-2' }] },
    });
    db.ppo.findFirst.mockResolvedValueOnce({ ...ppo, status: 'COMPLETED' });

    await expect(POST(postRequest({ ppoId: 'ppo-1', comments: 'Updated assessment', markPpoCompleted: false }), params()))
      .resolves.toMatchObject({ ok: true, status: 201 });

    const update = writeBatch.mock.calls[0][0][0].values;
    expect(update[12]).toContain('SUBMITTED');
    expect(update[12]).toContain('RESUBMITTED');
    expect(logHandled).not.toHaveBeenCalled();
  });

  it('logs and safely replaces valid JSON with an invalid array shape', async () => {
    db.ppoVendorRating.findFirst.mockResolvedValueOnce({
      id: 'rating-array-criteria', status: 'RETURNED_FOR_CORRECTION', criteriaDetails: '[]',
    });
    db.ppo.findFirst.mockResolvedValueOnce({ ...ppo, status: 'COMPLETED' });

    await expect(POST(postRequest({ ppoId: 'ppo-1', comments: 'Updated assessment', markPpoCompleted: false }), params()))
      .resolves.toMatchObject({ ok: true, status: 201 });

    expect(logHandled).toHaveBeenCalledWith('warn', 'vendor_rating.criteria_details_invalid', expect.objectContaining({
      operation: 'submit_vendor_rating', vendorId: 'vendor-1', ppoId: 'ppo-1',
      ratingId: 'rating-array-criteria', fieldName: 'criteriaDetails', fallback: 'empty_object',
    }));
    expect(writeBatch.mock.calls[0][0][0].values[12]).toContain('RESUBMITTED');
  });

  it('rejects oversized assessment text and concurrent rating state changes without dispatching a notification', async () => {
    await expect(POST(postRequest({ ppoId: 'ppo-1', comments: 'x'.repeat(4_001) }), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400,
    });
    writeBatch.mockResolvedValueOnce([{ meta: { changes: 0 }, results: [] }, { meta: { changes: 0 } }, { meta: { changes: 0 } }]);
    await expect(POST(postRequest({ ppoId: 'ppo-1', comments: 'Feedback' }), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToSubmitPpoRating, status: 409,
    });
    expect(dispatchPrepared).not.toHaveBeenCalled();
  });
});
