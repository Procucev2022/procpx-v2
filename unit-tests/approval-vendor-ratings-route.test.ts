import { NextRequest } from 'next/server';
import { GET, POST } from '../src/app/api/approvals/vendor-ratings/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { getUserProjectAccessFilter, isUserAuthorizedForProject } from '../src/lib/project-auth';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from '../src/lib/i18n';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { logEvent, writeStructuredLog } from '../src/lib/observability/server-logger';


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    ppoVendorRating: { findMany: jest.fn(), groupBy: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    user: { findMany: jest.fn() },
    vendor: { update: jest.fn() },
    ppo: { update: jest.fn(), aggregate: jest.fn() },
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
jest.mock('../src/lib/project-auth', () => ({
  getUserProjectAccessFilter: jest.fn(),
  isUserAuthorizedForProject: jest.fn(),
}));
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ logEvent: jest.fn(), writeStructuredLog: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
const logHandled = logEvent as jest.Mock;
const projectAuth = isUserAuthorizedForProject as jest.Mock;
const projectAccessFilter = getUserProjectAccessFilter as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'approver-1', userName: 'Project Approver', role: 'PROJECT_APPROVER' };
const projectScope = { OR: [{ team: { some: { userId: 'approver-1', active: true } } }] };
const getRequest = (query = '') => new NextRequest(`http://localhost/api/approvals/vendor-ratings${query}`);
const postRequest = (body: unknown) => new NextRequest('http://localhost/api/approvals/vendor-ratings', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const rating = (overrides: Record<string, any> = {}) => ({
  id: 'rating-1', tenantId: 'tenant-1', vendorId: 'vendor-1', ppoId: 'ppo-1', projectId: 'project-1',
  ratedBy: 'user-1', status: 'SUBMITTED', overallScore: 4.25,
  criteriaDetails: JSON.stringify({ history: [{ action: 'SUBMITTED' }] }),
  ppo: { id: 'ppo-1', ppoNumber: 'PPO-001', status: 'ISSUED', totalValue: 1000 },
  vendor: { id: 'vendor-1', name: 'Acme' }, ...overrides,
});

describe('vendor rating approval queue API', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    projectAccessFilter.mockResolvedValue(projectScope);
    projectAuth.mockResolvedValue(true);
    db.ppoVendorRating.findMany.mockReset().mockResolvedValue([]);
    db.ppoVendorRating.groupBy.mockReset().mockResolvedValue([]);
    db.ppoVendorRating.findFirst.mockReset().mockResolvedValue(rating());
    db.ppoVendorRating.update.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'rating-1', ...data }));
    db.user.findMany.mockReset().mockResolvedValue([]);
    db.vendor.update.mockReset().mockResolvedValue({});
    db.ppo.update.mockReset().mockResolvedValue({});
    db.ppo.aggregate.mockReset().mockResolvedValue({ _sum: { totalValue: 0 } });
    db.notification.create.mockReset().mockResolvedValue({ id: 'notification-1' });
    audit.mockReset().mockResolvedValue(undefined);
    (writeD1BatchAtomically as jest.Mock).mockReset().mockResolvedValue(Array.from({ length: 6 }, () => ({ meta: { changes: 1 } })));
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('loads the scoped queue, parses criteria, resolves submitters, and calculates KPIs', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(getRequest())).resolves.toBe(denied);

    db.ppoVendorRating.findMany.mockResolvedValueOnce([
        rating({ id: 'submitted-1', criteriaDetails: JSON.stringify({ qualityComments: 'Pass', approvedBy: 'approver-1', history: [{ action: 'SUBMITTED' }] }) }),
        rating({ id: 'submitted-2', ratedBy: null, criteriaDetails: { deliveryComments: 'On time', returnReason: 'Revised' } }),
        rating({ id: 'malformed', ratedBy: 'unknown-user', criteriaDetails: '{broken json' }),
      ]);
    db.ppoVendorRating.groupBy.mockResolvedValueOnce([
      { status: 'SUBMITTED', _count: { _all: 1 } },
      { status: 'APPROVED', _count: { _all: 2 } },
      { status: 'RETURNED_FOR_CORRECTION', _count: { _all: 1 } },
      { status: 'DRAFT', _count: { _all: 1 } },
    ]);
    db.ppo.aggregate.mockResolvedValueOnce({ _sum: { totalValue: 2500 } });
    db.user.findMany.mockResolvedValueOnce([{ id: 'user-1', name: 'Submitter' }]);
    const result = await GET(getRequest('?status=SUBMITTED'));
    expect(result).toMatchObject({ ok: true, data: {
      ratings: [
        { ratedByName: 'Submitter', qualityComments: 'Pass', approvedBy: 'approver-1', decisionHistory: [{ action: 'SUBMITTED' }] },
        { ratedByName: null, deliveryComments: 'On time', returnReason: 'Revised', approvedBy: null },
        { ratedByName: 'unknown-user', criteriaDetailsParsed: {}, qualityComments: '', decisionHistory: [] },
      ],
      counts: { pendingCount: 1, approvedCount: 2, returnedCount: 1, totalCount: 5, totalEvaluatedValue: 2500 },
      pagination: { page: 1, pageSize: 50, hasMore: false },
    } });
    expect(logHandled).toHaveBeenCalledWith('warn', 'vendor_rating.criteria_details_invalid', expect.objectContaining({
      operation: 'list_vendor_rating_approvals', route: '/api/approvals/vendor-ratings',
      tenantId: 'tenant-1', fieldName: 'criteriaDetails', invalidCount: 1,
      sampleRatingId: 'malformed', fallback: 'empty_object',
    }));
    expect(db.ppoVendorRating.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      skip: 0, take: 51, orderBy: [{ ratedAt: 'desc' }, { id: 'desc' }],
      where: { tenantId: 'tenant-1', status: UI_STRINGS.common.sUBMITTED, ppo: { is: { project: { is: projectScope } } } },
    }));
    expect(db.ppoVendorRating.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ['status'], where: { tenantId: 'tenant-1', ppo: { is: { project: { is: projectScope } } } }, _count: { _all: true },
    }));
    expect(db.ppo.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-1', project: { is: projectScope } }),
      _sum: { totalValue: true },
    }));
    expect(db.ppoVendorRating.findMany).toHaveBeenCalledTimes(1);
    expect(db.user.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', id: { in: ['user-1', 'unknown-user'] } }, select: { id: true, name: true, role: true, email: true },
    });
  });

  it('supports an unfiltered organization queue and handles GET provider errors', async () => {
    projectAccessFilter.mockResolvedValueOnce(null);
    db.ppoVendorRating.findMany.mockResolvedValueOnce([]);
    db.ppoVendorRating.groupBy.mockResolvedValueOnce([]);
    await expect(GET(getRequest('?status=ALL'))).resolves.toMatchObject({ ok: true, data: {
      ratings: [], counts: { pendingCount: 0, approvedCount: 0, returnedCount: 0, totalCount: 0, totalEvaluatedValue: 0 }, pagination: { hasMore: false },
    } });
    expect(db.ppoVendorRating.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { tenantId: 'tenant-1' } }));

    projectAccessFilter.mockRejectedValueOnce(new Error('project lookup failed'));
    const failureRequest = new NextRequest('http://localhost/api/approvals/vendor-ratings', { headers: { 'x-request-id': 'req-vendor-rating' } });
    await expect(GET(failureRequest)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchApprovalsQueue, status: 500 });
    expect(writeStructuredLog).toHaveBeenCalledWith('error', 'vendor_rating.approval_queue_read_failed', expect.objectContaining({
      operation: 'list_vendor_rating_approvals', route: '/api/approvals/vendor-ratings', requestId: 'req-vendor-rating',
      tenantId: 'tenant-1', userId: 'approver-1', role: 'PROJECT_APPROVER',
      error: { name: 'Error', message: 'project lookup failed' },
    }));
    db.ppoVendorRating.findMany.mockRejectedValueOnce({});
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchApprovalsQueue, status: 500 });
  });

  it('caps vendor-rating pages and reports whether more rows are available', async () => {
    db.ppoVendorRating.findMany.mockResolvedValueOnce(Array.from({ length: 101 }, (_, index) => rating({
      id: `rating-${index}`,
      ratedBy: `user-${index}`,
    })));
    const result = await GET(getRequest('?page=2&pageSize=1000'));

    expect(result).toMatchObject({
      ok: true,
      data: { ratings: expect.any(Array), pagination: { page: 2, pageSize: 100, hasMore: true } },
    });
    expect((result as unknown as { data: { ratings: unknown[] } }).data.ratings).toHaveLength(100);
    expect(db.ppoVendorRating.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 100, take: 101 }));
    expect(db.user.findMany).toHaveBeenCalledTimes(2);
    expect(db.user.findMany.mock.calls.map(([query]) => query.where.id.in.length)).toEqual([90, 10]);
  });

  it('validates approval requests, access, review state, and mandatory return or reject comments', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(postRequest({ ratingId: 'rating-1', action: 'ACCEPT' }))).resolves.toBe(denied);
    await expect(POST(postRequest({ action: 'ACCEPT' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiApprovalsVendorRatingsRoute.ratingIDIsRequired, status: 400 });
    await expect(POST(postRequest({ ratingId: 'rating-1', action: 'OTHER' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiApprovalsVendorRatingsRoute.invalidDecisionActionMustBeACCEPTRETURNOrREJECT, status: 400,
    });
    db.ppoVendorRating.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest({ ratingId: 'missing', action: 'ACCEPT' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiApprovalsVendorRatingsRoute.ratingRecordNotFoundOrAccessDenied, status: 404,
    });

    projectAuth.mockResolvedValueOnce(false);
    await expect(POST(postRequest({ ratingId: 'rating-1', action: 'ACCEPT' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiApprovalsVendorRatingsRoute.accessDeniedYouAreNotAuthorisedToReviewAssessmentsForThisProject, status: 403,
    });
    db.ppoVendorRating.findFirst.mockResolvedValueOnce(rating({ status: 'APPROVED' }));
    await expect(POST(postRequest({ ratingId: 'rating-1', action: 'ACCEPT' }))).resolves.toMatchObject({
      ok: false, error: expect.stringContaining('Only submitted assessments'), status: 400,
    });
    await expect(POST(postRequest({ ratingId: 'rating-1', action: 'RETURN', approverComments: '  ' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiApprovalsVendorRatingsRoute.approverReviewCommentsAreMandatoryWhenRejectingOrReturningAnAssessmentForCorrection, status: 400,
    });
    await expect(POST(postRequest({ ratingId: 'rating-1', action: 'REJECT', approverComments: '' }))).resolves.toMatchObject({ ok: false, status: 400 });
  });

  it('accepts a submission, publishes its score, completes the PPO, audits, and notifies', async () => {
    db.ppoVendorRating.findFirst.mockResolvedValueOnce(rating({ criteriaDetails: '{bad json' }));
    db.ppoVendorRating.findMany.mockResolvedValueOnce([{ overallScore: 4 }, { overallScore: 4.5 }]);
    const result = await POST(postRequest({ ratingId: 'rating-1', action: 'ACCEPT', approverComments: '  Approved  ' }));
    expect(logHandled).toHaveBeenCalledWith('warn', 'vendor_rating.criteria_details_invalid', expect.objectContaining({
      operation: 'decide_vendor_rating', route: '/api/approvals/vendor-ratings',
      tenantId: 'tenant-1', ratingId: 'rating-1', vendorId: 'vendor-1', ppoId: 'ppo-1',
      fieldName: 'criteriaDetails', fallback: 'empty_object',
    }));
    expect(result).toMatchObject({ ok: true, data: {
      message: interpolateUiString(UI_STRINGS.appApiApprovalsVendorRatingsRoute.assessmentApprovedPpoMessage, { ppoNumber: 'PPO-001' }),
    } });
    const batch = (writeD1BatchAtomically as jest.Mock).mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    const saved = JSON.parse(String(batch[0].values[1]));
    expect(saved).toMatchObject({ approvedBy: 'approver-1', approvedByName: 'Project Approver', approverComments: 'Approved',
      history: [{ action: 'APPROVED', comments: 'Approved', performedByName: 'Project Approver' }] });
    expect(batch[1].values).toEqual(expect.arrayContaining(['PPO_RATING_APPROVED', expect.stringContaining('Approved')]));
    expect(batch[2].sql).toContain('AVG("overallScore")');
    expect(batch[3].sql).toContain("'COMPLETED'");
    expect(batch[4].sql).toContain('INSERT INTO "notifications"');
    expect(batch[4].values).toEqual(expect.arrayContaining(['user-1', 'SUCCESS', 'PPO', 'ppo-1', 'PPO-001']));
    expect(db.vendor.update).not.toHaveBeenCalled();
    expect(db.ppo.update).not.toHaveBeenCalled();
    expect(db.notification.create).not.toHaveBeenCalled();
  });

  it('returns assessments for correction and rejects them with recorded decision history', async () => {
    db.ppoVendorRating.findFirst.mockResolvedValueOnce(rating({
      criteriaDetails: { history: [{ action: 'SUBMITTED' }], approvedByName: 'Earlier Approver' },
    }));
    await expect(POST(postRequest({ ratingId: 'rating-1', action: 'RETURN', approverComments: 'Add invoice copy' })))
      .resolves.toMatchObject({ ok: true, data: { message: interpolateUiString(UI_STRINGS.appApiApprovalsVendorRatingsRoute.assessmentReturnedPpoMessage, { ppoNumber: 'PPO-001' }) } });
    let batch = (writeD1BatchAtomically as jest.Mock).mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    const returned = JSON.parse(String(batch[0].values[1]));
    expect(returned).toMatchObject({ returnReason: 'Add invoice copy', returnedBy: 'approver-1', returnedByName: 'Project Approver',
      approvedByName: 'Earlier Approver', history: [{ action: 'SUBMITTED' }, { action: 'RETURNED_FOR_CORRECTION', comments: 'Add invoice copy' }] });
    expect(batch[2].values).toEqual(expect.arrayContaining(['WARNING', 'PPO']));
    expect(batch[2].values).toContain(UI_STRINGS.appApiApprovalsVendorRatingsRoute.performanceAssessmentReturnedNotificationTitle.replace('{{ppoNumber}}', 'PPO-001'));

    auth.mockResolvedValueOnce({ ...context, userName: '' });
    db.ppoVendorRating.findFirst.mockResolvedValueOnce(rating({
      criteriaDetails: '{bad json', ratedBy: 'submitter-2', ppo: { id: 'ppo-1', ppoNumber: 'PPO-001', status: 'COMPLETED', totalValue: 1000 },
    }));
    const result = await POST(postRequest({ ratingId: 'rating-1', action: 'REJECT', approverComments: '  Unsupported cost  ' }));
    expect(result).toMatchObject({ ok: true, data: { message: interpolateUiString(UI_STRINGS.appApiApprovalsVendorRatingsRoute.assessmentRejectedPpoMessage, { ppoNumber: 'PPO-001' }) } });
    batch = (writeD1BatchAtomically as jest.Mock).mock.calls[1][0];
    const rejected = JSON.parse(String(batch[0].values[1]));
    expect(rejected).toMatchObject({ rejectionReason: 'Unsupported cost', rejectedByName: 'Project Approver', approverComments: 'Unsupported cost',
      history: [{ action: 'REJECTED', comments: 'Unsupported cost', performedByName: 'Project Approver' }] });
    expect(db.ppo.update).not.toHaveBeenCalled();
    expect(writeD1BatchAtomically).toHaveBeenCalledTimes(2);
    expect(batch[2].values).toContain('INFO');
  });

  it('returns a conflict when another reviewer records the decision first', async () => {
    db.ppoVendorRating.findFirst.mockResolvedValueOnce(rating());
    (writeD1BatchAtomically as jest.Mock).mockResolvedValueOnce([{ meta: { changes: 0 } }]);
    await expect(POST(postRequest({ ratingId: 'rating-1', action: 'ACCEPT' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiApprovalsVendorRatingsRoute.ratingChangedPleaseRefresh, status: 409,
    });
  });

  it('falls back to the rating score when no prior approvals exist and preserves completed PPO state', async () => {
    db.ppoVendorRating.findFirst.mockResolvedValueOnce(rating({ ratedBy: null, criteriaDetails: null,
      ppo: { id: 'ppo-1', ppoNumber: 'PPO-001', status: 'COMPLETED', totalValue: 1000 } }));
    db.ppoVendorRating.findMany.mockResolvedValueOnce([]);
    await POST(postRequest({ ratingId: 'rating-1', action: 'ACCEPT' }));
    const batch = (writeD1BatchAtomically as jest.Mock).mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(batch).toHaveLength(3);
    expect(batch[2].sql).toContain('AVG("overallScore")');
  });

  it('returns POST errors for provider failures and malformed requests', async () => {
    db.ppoVendorRating.findFirst.mockRejectedValueOnce(new Error('approval store failed'));
    await expect(POST(postRequest({ ratingId: 'rating-1', action: 'ACCEPT' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToRecordApproverDecision, status: 500,
    });
    db.ppoVendorRating.findFirst.mockRejectedValueOnce({});
    await expect(POST(postRequest({ ratingId: 'rating-1', action: 'ACCEPT' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToRecordApproverDecision, status: 500,
    });
    const badJson = { json: jest.fn().mockRejectedValue(new Error('invalid request')), headers: new Headers() } as unknown as NextRequest;
    await expect(POST(badJson)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToRecordApproverDecision, status: 500 });
  });
});
