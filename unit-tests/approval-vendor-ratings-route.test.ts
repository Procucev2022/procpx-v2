import { NextRequest } from 'next/server';
import { GET, POST } from '../src/app/api/approvals/vendor-ratings/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { isUserAuthorizedForProject, getUserAuthorizedProjectIds } from '../src/lib/project-auth';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    ppoVendorRating: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    user: { findMany: jest.fn() },
    vendor: { update: jest.fn() },
    ppo: { update: jest.fn() },
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
jest.mock('../src/lib/project-auth', () => ({ isUserAuthorizedForProject: jest.fn(), getUserAuthorizedProjectIds: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
const projectAuth = isUserAuthorizedForProject as jest.Mock;
const authorizedProjects = getUserAuthorizedProjectIds as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'approver-1', userName: 'Project Approver', role: 'PROJECT_APPROVER' };
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
    authorizedProjects.mockResolvedValue(['project-1']);
    projectAuth.mockResolvedValue(true);
    db.ppoVendorRating.findMany.mockReset().mockResolvedValue([]);
    db.ppoVendorRating.findFirst.mockReset().mockResolvedValue(rating());
    db.ppoVendorRating.update.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'rating-1', ...data }));
    db.user.findMany.mockReset().mockResolvedValue([]);
    db.vendor.update.mockReset().mockResolvedValue({});
    db.ppo.update.mockReset().mockResolvedValue({});
    db.notification.create.mockReset().mockResolvedValue({ id: 'notification-1' });
    audit.mockReset().mockResolvedValue(undefined);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('loads the scoped queue, parses criteria, resolves submitters, and calculates KPIs', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(getRequest())).resolves.toBe(denied);

    db.ppoVendorRating.findMany
      .mockResolvedValueOnce([
        rating({ id: 'submitted-1', criteriaDetails: JSON.stringify({ qualityComments: 'Pass', approvedBy: 'approver-1', history: [{ action: 'SUBMITTED' }] }) }),
        rating({ id: 'submitted-2', ratedBy: null, criteriaDetails: { deliveryComments: 'On time', returnReason: 'Revised' } }),
        rating({ id: 'malformed', ratedBy: 'unknown-user', criteriaDetails: '{broken json' }),
      ])
      .mockResolvedValueOnce([
        { status: 'SUBMITTED', ppo: { totalValue: 1000 } },
        { status: 'APPROVED', ppo: { totalValue: 2500 } },
        { status: 'APPROVED', ppo: null },
        { status: 'RETURNED_FOR_CORRECTION', ppo: { totalValue: 500 } },
        { status: 'DRAFT', ppo: { totalValue: 900 } },
      ]);
    db.user.findMany.mockResolvedValueOnce([{ id: 'user-1', name: 'Submitter' }]);
    const result = await GET(getRequest('?status=SUBMITTED'));
    expect(result).toMatchObject({ ok: true, data: {
      ratings: [
        { ratedByName: 'Submitter', qualityComments: 'Pass', approvedBy: 'approver-1', decisionHistory: [{ action: 'SUBMITTED' }] },
        { ratedByName: null, deliveryComments: 'On time', returnReason: 'Revised', approvedBy: null },
        { ratedByName: 'unknown-user', criteriaDetailsParsed: {}, qualityComments: '', decisionHistory: [] },
      ],
      counts: { pendingCount: 1, approvedCount: 2, returnedCount: 1, totalCount: 5, totalEvaluatedValue: 2500 },
    } });
    expect(db.ppoVendorRating.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { tenantId: 'tenant-1', status: UI_STRINGS.common.sUBMITTED, OR: [
        { projectId: { in: ['project-1'] } }, { projectId: null }, { ppo: { projectId: { in: ['project-1'] } } },
      ] },
    }));
    expect(db.ppoVendorRating.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { tenantId: 'tenant-1', OR: [
        { projectId: { in: ['project-1'] } }, { projectId: null }, { ppo: { projectId: { in: ['project-1'] } } },
      ] },
    }));
    expect(db.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['user-1', 'unknown-user'] } }, select: { id: true, name: true, role: true, email: true },
    });
  });

  it('supports an unfiltered organization queue and handles GET provider errors', async () => {
    authorizedProjects.mockResolvedValueOnce(null);
    db.ppoVendorRating.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(GET(getRequest('?status=ALL'))).resolves.toMatchObject({ ok: true, data: {
      ratings: [], counts: { pendingCount: 0, approvedCount: 0, returnedCount: 0, totalCount: 0, totalEvaluatedValue: 0 },
    } });
    expect(db.ppoVendorRating.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { tenantId: 'tenant-1' } }));

    authorizedProjects.mockRejectedValueOnce(new Error('project lookup failed'));
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: 'project lookup failed', status: 500 });
    db.ppoVendorRating.findMany.mockRejectedValueOnce({});
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: 'Failed to fetch approvals queue', status: 500 });
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
    expect(result).toMatchObject({ ok: true, data: { message: 'Assessment for PPO PPO-001 has been accepted and approved score published.' } });
    const saved = JSON.parse(db.ppoVendorRating.update.mock.calls[0][0].data.criteriaDetails);
    expect(saved).toMatchObject({ approvedBy: 'approver-1', approvedByName: 'Project Approver', approverComments: 'Approved',
      history: [{ action: 'APPROVED', comments: 'Approved', performedByName: 'Project Approver' }] });
    expect(db.vendor.update).toHaveBeenCalledWith({ where: { id: 'vendor-1' }, data: { performanceScore: 86 } });
    expect(db.ppo.update).toHaveBeenCalledWith({ where: { id: 'ppo-1' }, data: { status: 'COMPLETED', completedAt: expect.any(Date) } });
    expect(db.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: 'user-1', type: 'SUCCESS', entityId: 'ppo-1', recordNumber: 'PPO-001',
    }) });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'PPO_RATING_APPROVED', newValue: expect.objectContaining({ status: UI_STRINGS.common.aPPROVED, approverComments: UI_STRINGS.common.approved }) }));
  });

  it('returns assessments for correction and rejects them with recorded decision history', async () => {
    db.ppoVendorRating.findFirst.mockResolvedValueOnce(rating({
      criteriaDetails: { history: [{ action: 'SUBMITTED' }], approvedByName: 'Earlier Approver' },
    }));
    await expect(POST(postRequest({ ratingId: 'rating-1', action: 'RETURN', approverComments: 'Add invoice copy' })))
      .resolves.toMatchObject({ ok: true, data: { message: 'Assessment for PPO PPO-001 returned to submitter for correction.' } });
    const returned = JSON.parse(db.ppoVendorRating.update.mock.calls[0][0].data.criteriaDetails);
    expect(returned).toMatchObject({ returnReason: 'Add invoice copy', returnedBy: 'approver-1', returnedByName: 'Project Approver',
      approvedByName: 'Earlier Approver', history: [{ action: 'SUBMITTED' }, { action: 'RETURNED_FOR_CORRECTION', comments: 'Add invoice copy' }] });
    expect(db.notification.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ type: 'WARNING', title: 'Rating Returned for Correction: PPO-001' }) });

    auth.mockResolvedValueOnce({ ...context, userName: '' });
    db.ppoVendorRating.findFirst.mockResolvedValueOnce(rating({
      criteriaDetails: '{bad json', ratedBy: 'submitter-2', ppo: { id: 'ppo-1', ppoNumber: 'PPO-001', status: 'COMPLETED', totalValue: 1000 },
    }));
    const result = await POST(postRequest({ ratingId: 'rating-1', action: 'REJECT', approverComments: '  Unsupported cost  ' }));
    expect(result).toMatchObject({ ok: true, data: { message: 'Assessment for PPO PPO-001 has been rejected.' } });
    const rejected = JSON.parse(db.ppoVendorRating.update.mock.calls[1][0].data.criteriaDetails);
    expect(rejected).toMatchObject({ rejectionReason: 'Unsupported cost', rejectedByName: 'Project Approver', approverComments: 'Unsupported cost',
      history: [{ action: 'REJECTED', comments: 'Unsupported cost', performedByName: 'Project Approver' }] });
    expect(db.ppo.update).not.toHaveBeenCalled();
    expect(db.notification.create).toHaveBeenCalledTimes(2);
    expect(db.notification.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ type: 'INFO' }) });
  });

  it('falls back to the rating score when no prior approvals exist and preserves completed PPO state', async () => {
    db.ppoVendorRating.findFirst.mockResolvedValueOnce(rating({ ratedBy: null, criteriaDetails: null,
      ppo: { id: 'ppo-1', ppoNumber: 'PPO-001', status: 'COMPLETED', totalValue: 1000 } }));
    db.ppoVendorRating.findMany.mockResolvedValueOnce([]);
    await POST(postRequest({ ratingId: 'rating-1', action: 'ACCEPT' }));
    expect(db.vendor.update).toHaveBeenCalledWith({ where: { id: 'vendor-1' }, data: { performanceScore: 85 } });
    expect(db.ppo.update).not.toHaveBeenCalled();
    expect(db.notification.create).not.toHaveBeenCalled();
  });

  it('returns POST errors for provider failures and malformed requests', async () => {
    db.ppoVendorRating.findFirst.mockRejectedValueOnce(new Error('approval store failed'));
    await expect(POST(postRequest({ ratingId: 'rating-1', action: 'ACCEPT' }))).resolves.toEqual({ ok: false, error: 'approval store failed', status: 500 });
    db.ppoVendorRating.findFirst.mockRejectedValueOnce({});
    await expect(POST(postRequest({ ratingId: 'rating-1', action: 'ACCEPT' }))).resolves.toEqual({ ok: false, error: 'Failed to record approver decision', status: 500 });
    const badJson = { json: jest.fn().mockRejectedValue(new Error('invalid request')) } as unknown as NextRequest;
    await expect(POST(badJson)).resolves.toEqual({ ok: false, error: 'invalid request', status: 500 });
  });
});
