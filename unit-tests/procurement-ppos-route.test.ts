import { NextRequest } from 'next/server';
import { GET, POST } from '../src/app/api/procurement/ppos/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { dispatchPreparedWorkflowNotification, notifyNextResponsibleParty } from '../src/lib/notifications';
import { hasPermission } from '../src/lib/permissions';
import { getUserProjectAccessFilter, isUserAuthorizedForProject } from '../src/lib/project-auth';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { AUDIT_LOG_INSERT_AFTER_CHANGE_SQL, MAX_PPO_CREATE_LINES, PPO_INSERT_IF_VALID_SQL, PPO_LINE_INSERT_SQL, RFQ_MARK_AWARDED_AFTER_PPO_INSERT_SQL } from '../src/lib/d1-batch.constants';
import { logEvent, writeStructuredLog } from '../src/lib/observability/server-logger';


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    ppo: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn(), aggregate: jest.fn() },
    ppoVendorRating: { groupBy: jest.fn() },
    rfq: { findFirst: jest.fn() },
    quote: { findFirst: jest.fn() },
    awardRecommendation: { findFirst: jest.fn() },
    vendor: { findFirst: jest.fn() },
    rfqVendor: { findFirst: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  getListPageWindow: jest.fn((params: URLSearchParams) => {
    const page = Math.max(1, Number(params.get('page')) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.get('pageSize')) || 50));
    return { page, pageSize, skip: (page - 1) * pageSize };
  }),
}));
jest.mock('../src/lib/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('../src/lib/notifications', () => ({
  dispatchPreparedWorkflowNotification: jest.fn(),
  notifyNextResponsibleParty: jest.fn(),
}));
jest.mock('../src/lib/permissions', () => ({ hasPermission: jest.fn() }));
jest.mock('../src/lib/project-auth', () => ({
  getUserProjectAccessFilter: jest.fn(),
  isUserAuthorizedForProject: jest.fn(),
}));
jest.mock('../src/lib/d1-batch', () => ({ isD1BatchWithinLimits: (input: Array<{ values: unknown[] }>) => input.reduce((total, item) => total + item.values.length, 0) <= 4500 && input.every((item) => item.values.length <= 100), writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ logEvent: jest.fn(), writeStructuredLog: jest.fn() }));

const db = prisma as unknown as Record<string, any>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
const notify = notifyNextResponsibleParty as jest.Mock;
const dispatchPrepared = dispatchPreparedWorkflowNotification as jest.Mock;
const permission = hasPermission as jest.Mock;
const projectAccessFilter = getUserProjectAccessFilter as jest.Mock;
const projectAuthorized = isUserAuthorizedForProject as jest.Mock;
const writeBatch = writeD1BatchAtomically as jest.Mock;
const logHandled = logEvent as jest.Mock;
const structuredLog = writeStructuredLog as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1', userName: 'Buyer', role: 'PROCUREMENT_USER' };
const getRequest = (query = '') => new NextRequest(`http://localhost/api/procurement/ppos${query}`);
const postRequest = (body: unknown) => new NextRequest('http://localhost/api/procurement/ppos', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const quote = (vendorId: string, amount: number, quoteVersion = 1, lines: any[] = [], name = vendorId) => ({
  vendorId, totalQuoteAmount: amount, quoteVersion, vendor: { id: vendorId, name }, lines,
});
const lastResolvedRfq = async () => {
  const results = db.rfq.findFirst.mock.results;
  return await results[results.length - 1]?.value;
};
const rfqRecord = (overrides: Record<string, any> = {}) => ({
  id: 'rfq-1', tenantId: 'tenant-1', rfqNumber: 'RFQ-001', title: 'Electrical package', projectId: 'project-1', status: 'APPROVED',
  project: { id: 'project-1', name: 'Campus' }, boqRevisionId: 'revision-1',
  boqRevision: { id: 'revision-1', boqId: 'boq-1', costCentreId: 'cc-revision' },
  estimatedBenchmarkValue: 100, deliveryRequirement: 'Site delivery', paymentTerms: 'Net 30', taxTerms: 'GST included',
  lines: [
    { id: 'rfq-line-1', lineNumber: '1', description: 'Cable', specification: 'Copper', category: 'Electrical', subcategory: 'Wire', uom: 'M', quantity: 2, benchmarkRate: 25, costCentreId: 'cc-line', boqLineId: 'boq-line-1', prLineId: 'pr-line-1' },
    { id: 'rfq-line-2', lineNumber: null, description: 'Panel', specification: null, category: null, subcategory: null, uom: 'EA', quantity: 1, benchmarkRate: 0, costCentreId: null, boqLineId: null, prLineId: null },
  ],
  quotes: [quote('vendor-1', 60, 1, [
    { rfqLineId: 'rfq-line-1', unitRate: 20, lineTotal: 40 },
    { rfqLineId: 'rfq-line-2', unitRate: 20, lineTotal: 20 },
  ], 'Acme')],
  awards: [{ id: 'award-approved', rfqId: 'rfq-1', recommendedVendorId: 'vendor-1', finalNegotiatedAmount: 60, status: 'APPROVED', justification: 'Approved quote' }],
  ...overrides,
});

describe('procurement PPO collection API', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    permission.mockImplementation((_role: string, key: string) => key === 'PPO_VIEW');
    projectAccessFilter.mockResolvedValue(null);
    projectAuthorized.mockResolvedValue(true);
    db.ppo.findMany.mockResolvedValue([]);
    db.ppo.findFirst.mockResolvedValue(null);
    db.ppo.count.mockResolvedValue(0);
    db.ppo.aggregate.mockResolvedValue({ _sum: { totalValue: 0 } });
    db.ppoVendorRating.groupBy.mockResolvedValue([]);
    db.rfq.findFirst.mockResolvedValue(rfqRecord());
    db.quote.findFirst.mockImplementation(async ({ where }: { where: { vendorId: string; quoteVersion: number } }) => {
      const record = await lastResolvedRfq();
      return record?.quotes?.find((item: { vendorId: string; quoteVersion: number }) =>
        item.vendorId === where.vendorId && item.quoteVersion === where.quoteVersion) || null;
    });
    db.$queryRaw.mockImplementation(async () => {
      const record = await lastResolvedRfq();
      const latestByVendor = new Map<string, { vendorId: string; quoteVersion: number; totalQuoteAmount: number }>();
      for (const item of record?.quotes || []) {
        const current = latestByVendor.get(item.vendorId);
        if (!current || item.quoteVersion > current.quoteVersion) {
          latestByVendor.set(item.vendorId, {
            vendorId: item.vendorId,
            quoteVersion: item.quoteVersion,
            totalQuoteAmount: item.totalQuoteAmount,
          });
        }
      }
      return [...latestByVendor.values()].sort((left, right) =>
        left.totalQuoteAmount - right.totalQuoteAmount || left.vendorId.localeCompare(right.vendorId));
    });
    db.awardRecommendation.findFirst.mockResolvedValue(null);
    db.vendor.findFirst.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve({ id: where.id, name: where.id === 'vendor-2' ? 'Beta' : 'Acme' }));
    db.rfqVendor.findFirst.mockResolvedValue({ id: 'invited-1' });
    writeBatch.mockReset().mockResolvedValue(Array.from({ length: 8 }, () => ({ meta: { changes: 1 } })));
    logHandled.mockReset();
    structuredLog.mockReset().mockResolvedValue({});
    audit.mockResolvedValue(undefined);
    notify.mockImplementation((input: Record<string, unknown>, options?: { prepareOnly?: boolean }) => options?.prepareOnly ? ({
      tenantId: input.tenantId, targetRole: 'FINANCE_USER', title: `PPO ${String(input.recordNumber)} generated`,
      message: 'A procurement order is ready for finance', type: 'SUCCESS', entityType: 'PPO',
      entityId: input.entityId, recordNumber: input.recordNumber, link: '/procurement/ppos',
    }) : undefined);
    dispatchPrepared.mockResolvedValue(undefined);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('checks read permissions, applies filters and project scope, and parses or hides vendor ratings', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(getRequest())).resolves.toBe(denied);

    permission.mockReturnValueOnce(false).mockReturnValueOnce(false);
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.forbiddenInsufficientPermissions, status: 403 });

    permission.mockImplementation((_role: string, key: string) => key === 'PPO_VIEW');
    const scopedProjectFilter = { OR: [{ team: { some: { userId: 'user-1', active: true } } }] };
    projectAccessFilter.mockResolvedValueOnce(scopedProjectFilter);
    db.ppo.findMany.mockResolvedValueOnce([
      { id: 'approved', vendorRating: { status: 'APPROVED', criteriaDetails: JSON.stringify({ qualityComments: 'Good', history: [{ action: 'APPROVED' }] }) } },
      { id: 'returned', vendorRating: { status: 'RETURNED_FOR_CORRECTION', criteriaDetails: '{broken' } },
      { id: 'object-details', vendorRating: { status: 'DRAFT', criteriaDetails: { returnReason: 'More detail' } } },
      { id: 'without-rating', vendorRating: null },
    ]);
    db.ppo.count.mockResolvedValueOnce(4);
    db.ppo.aggregate.mockResolvedValueOnce({ _sum: { totalValue: 5100 } });
    db.ppoVendorRating.groupBy.mockResolvedValueOnce([
      { status: 'APPROVED', _count: { _all: 1 } }, { status: 'RETURNED_FOR_CORRECTION', _count: { _all: 2 } },
    ]);
    const result = await GET(getRequest('?rfqId=rfq-1&projectId=project-query&page=2&pageSize=2'));
    expect(result).toMatchObject({ ok: true, data: {
      total: 4, totalCommittedValue: 5100, ratingCounts: { APPROVED: 1, RETURNED_FOR_CORRECTION: 2 },
      page: 2, pageSize: 2, totalPages: 2, currentUserRole: 'PROCUREMENT_USER', isProcurementUser: true,
      ppos: [
        { id: 'approved', vendorRating: { qualityComments: 'Good', decisionHistory: [{ action: 'APPROVED' }] } },
        { id: 'returned', vendorRating: null },
        { id: 'object-details', vendorRating: null },
        { id: 'without-rating', vendorRating: null },
      ],
    } });
    expect(db.ppo.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', rfqId: 'rfq-1', projectId: 'project-query', project: { is: scopedProjectFilter } },
      skip: 2,
      take: 2,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }));
    expect(logHandled).not.toHaveBeenCalled();
    const ppoListRelations = (prisma.ppo.findMany as jest.Mock).mock.calls[0][0].include;
    expect(ppoListRelations.rfq.select).not.toHaveProperty('lines');
    expect(ppoListRelations).not.toHaveProperty('costCentre');
    expect(ppoListRelations).not.toHaveProperty('awardRecommendation');
    expect(ppoListRelations.vendorRating.select).toEqual(expect.objectContaining({
      status: true,
      qualityScore: true,
      overallScore: true,
      criteriaDetails: true,
    }));

    auth.mockResolvedValueOnce({ ...context, role: 'PROJECT_USER' });
    permission.mockImplementation((_role: string, key: string) => key === 'VENDOR_RATE_PPO');
    projectAccessFilter.mockResolvedValueOnce(null);
    db.ppo.findMany.mockResolvedValueOnce([
      { id: 'draft-rating', vendorRating: {
        status: 'DRAFT', criteriaDetails: { qualityComments: 'Inspect', approvedBy: 'user-2', returnReason: 'Recheck' },
      } },
      { id: 'malformed-rating', vendorRating: { status: 'DRAFT', criteriaDetails: '{broken' } },
      { id: 'array-rating', vendorRating: { status: 'DRAFT', criteriaDetails: '[]' } },
      { id: 'empty-rating', vendorRating: { status: 'DRAFT', criteriaDetails: {} } },
      { id: 'null-rating', vendorRating: { status: 'DRAFT', criteriaDetails: null } },
    ]);
    await expect(GET(getRequest('?projectId=project-query'))).resolves.toMatchObject({ ok: true, data: {
      isProcurementUser: false,
      ppos: [
        { vendorRating: { qualityComments: 'Inspect', approvedBy: 'user-2', returnReason: 'Recheck', decisionHistory: [] } },
        { vendorRating: { criteriaDetailsParsed: {}, qualityComments: '', approvedBy: null, returnReason: null } },
        { vendorRating: { criteriaDetailsParsed: {}, qualityComments: '', approvedBy: null, returnReason: null } },
        { vendorRating: { criteriaDetailsParsed: {}, qualityComments: '', approvedBy: null, returnReason: null } },
        { vendorRating: { criteriaDetailsParsed: {}, qualityComments: '', approvedBy: null, returnReason: null } },
      ],
    } });
    expect(logHandled).toHaveBeenCalledWith('warn', 'procurement.ppo_rating_details_parse_failed', expect.objectContaining({
      operation: 'parse_vendor_rating_details', route: '/api/procurement/ppos',
      tenantId: 'tenant-1', userId: 'user-1', invalidCount: 2,
      samplePpoId: 'malformed-rating', ppoIds: ['malformed-rating', 'array-rating'],
      truncated: false, fallback: 'empty_object',
    }));
    expect(db.ppo.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', projectId: 'project-query' },
    }));

    const scopedFilterWithoutProject = { team: { some: { userId: 'user-1' } } };
    projectAccessFilter.mockResolvedValueOnce(scopedFilterWithoutProject);
    await expect(GET(getRequest())).resolves.toMatchObject({ ok: true });
    expect(db.ppo.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', project: { is: scopedFilterWithoutProject } },
    }));
  });

  it('captures GET provider errors and returns a safe fallback', async () => {
    projectAccessFilter.mockRejectedValueOnce(new Error('project scope unavailable'));
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchPpos, status: 500 });
    expect(structuredLog).toHaveBeenCalledWith('error', 'procurement.ppos_read_failed', expect.objectContaining({ operation: 'read_ppos' }));
    db.ppo.findMany.mockRejectedValueOnce({});
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchPpos, status: 500 });
  });

  it('validates PPO creation inputs, RFQ and award references, quote selection, and L2 justification', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(postRequest({}))).resolves.toBe(denied);
    await expect(POST(postRequest({}))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementPposRoute.rFQIDIsRequiredToGeneratePPO, status: 400 });

    db.rfq.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest({ rfqId: 'missing' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rFQNotFoundOrAccessDenied, status: 404 });
    const quoteSummaryCallsBeforeOverflow = db.$queryRaw.mock.calls.length;
    db.rfq.findFirst.mockResolvedValueOnce(rfqRecord({
      lines: Array.from({ length: MAX_PPO_CREATE_LINES + 1 }, (_, index) => ({
        id: `rfq-line-${index + 1}`, quantity: 1,
      })),
    }));
    await expect(POST(postRequest({ rfqId: 'rfq-1' }))).resolves.toEqual({
      ok: false,
      error: UI_STRINGS.appApiProcurementPposRoute.ppoHasTooManyLineItemsToCreateAtomically,
      status: 400,
    });
    expect(db.$queryRaw).toHaveBeenCalledTimes(quoteSummaryCallsBeforeOverflow);

    db.rfq.findFirst.mockResolvedValueOnce(rfqRecord({ quotes: [] }));
    await expect(POST(postRequest({ rfqId: 'rfq-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementPposRoute.cannotGeneratePPONoValidQuotationFoundForTheSelectedVendor, status: 400 });

    db.rfq.findFirst.mockResolvedValueOnce(rfqRecord({ awards: [] }));
    await expect(POST(postRequest({ rfqId: 'rfq-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementPposRoute.awardRecommendationMustBeApprovedBeforeCreatingPpo, status: 409 });
    await expect(POST(postRequest({ rfqId: 'rfq-1', action: 'APPROVE' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });

    db.awardRecommendation.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest({ rfqId: 'rfq-1', awardRecommendationId: 'missing-award' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.awardRecommendationNotFound, status: 404 });
    db.awardRecommendation.findFirst.mockResolvedValueOnce({ id: 'award-unmatched', rfqId: 'other-rfq', recommendedVendorId: 'unknown-vendor', status: 'APPROVED' });
    await expect(POST(postRequest({ rfqId: 'rfq-1', awardRecommendationId: 'award-unmatched' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.awardRecommendationNotFound, status: 404,
    });
    db.rfq.findFirst.mockResolvedValueOnce(rfqRecord({
      awards: [{ id: 'award-unmatched', rfqId: 'rfq-1', recommendedVendorId: 'unknown-vendor', finalNegotiatedAmount: 60, status: 'APPROVED' }],
    }));
    await expect(POST(postRequest({ rfqId: 'rfq-1' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementPposRoute.cannotGeneratePPONoValidQuotationFoundForTheSelectedVendor, status: 400,
    });

    const rankedRfq = rfqRecord({
      awards: [{ id: 'award-ranked', rfqId: 'rfq-1', recommendedVendorId: 'vendor-1', finalNegotiatedAmount: 60, status: 'APPROVED', justification: '' }],
      quotes: [quote('vendor-1', 60, 2, [], 'Acme'), quote('vendor-1', 80, 1, [], 'Acme old'), quote('vendor-2', 50, 1, [], 'Beta')],
    });
    db.rfq.findFirst.mockResolvedValueOnce(rankedRfq);
    await expect(POST(postRequest({ rfqId: 'rfq-1', targetVendorId: 'vendor-1' }))).resolves.toMatchObject({
      ok: false, status: 400, error: expect.stringContaining('mandatory commercial justification'),
    });

    db.rfq.findFirst.mockResolvedValueOnce(rfqRecord({
      awards: [{ id: 'award-tied', rfqId: 'rfq-1', recommendedVendorId: 'vendor-2', finalNegotiatedAmount: 60, status: 'APPROVED', justification: '' }],
      quotes: [quote('vendor-2', 60), quote('vendor-1', 60)],
    }));
    await expect(POST(postRequest({ rfqId: 'rfq-1', targetVendorId: 'vendor-2' }))).resolves.toMatchObject({
      ok: false, status: 400, error: expect.stringContaining('mandatory commercial justification'),
    });

    db.rfq.findFirst.mockResolvedValueOnce(rankedRfq);
    db.ppo.findFirst.mockResolvedValueOnce({ ppoNumber: 'PPO-EXISTING' });
    await expect(POST(postRequest({ rfqId: 'rfq-1', targetVendorId: 'vendor-1', justification: 'Technical advantage' }))).resolves.toEqual({
      ok: false, error: expect.stringContaining('PPO-EXISTING'), status: 409,
    });
  });

  it('rejects malformed PPO payloads, unauthorized projects, and inconsistent award references', async () => {
    const malformedJson = new NextRequest('http://localhost/api/procurement/ppos', { method: 'POST', body: '{' });
    await expect(POST(malformedJson)).resolves.toMatchObject({ ok: false, status: 400, error: UI_STRINGS.common.invalidRequestBody });
    await expect(POST(postRequest(null))).resolves.toMatchObject({ ok: false, status: 400, error: UI_STRINGS.common.invalidRequestBody });
    await expect(POST(postRequest({ rfqId: 'rfq-1', action: 5 }))).resolves.toMatchObject({ ok: false, status: 400, error: UI_STRINGS.common.invalidRequestBody });
    await expect(POST(postRequest({ rfqId: 'rfq-1', deliveryTerms: 5 }))).resolves.toMatchObject({ ok: false, status: 400, error: UI_STRINGS.common.invalidRequestBody });

    projectAuthorized.mockResolvedValueOnce(false);
    await expect(POST(postRequest({ rfqId: 'rfq-1' }))).resolves.toMatchObject({ ok: false, status: 403, error: UI_STRINGS.common.forbiddenInsufficientPermissions });
    db.rfq.findFirst.mockResolvedValueOnce(rfqRecord({ status: 'DRAFT' }));
    await expect(POST(postRequest({ rfqId: 'rfq-1' }))).resolves.toMatchObject({ ok: false, status: 409, error: UI_STRINGS.appApiProcurementPposRoute.rFQMustHaveAnApprovedAwardBeforePpoCreation });
    db.rfq.findFirst.mockResolvedValueOnce(rfqRecord({ awards: [
      { id: 'award-a', recommendedVendorId: 'vendor-1', finalNegotiatedAmount: 60, status: 'APPROVED' },
      { id: 'award-b', recommendedVendorId: 'vendor-2', finalNegotiatedAmount: 60, status: 'APPROVED' },
    ] }));
    await expect(POST(postRequest({ rfqId: 'rfq-1' }))).resolves.toMatchObject({
      ok: false, status: 400, error: UI_STRINGS.appApiProcurementPposRoute.awardRecommendationIdRequiredWhenMultipleApprovedAwardsExist,
    });
    db.rfq.findFirst.mockResolvedValueOnce(rfqRecord());
    await expect(POST(postRequest({ rfqId: 'rfq-1', targetVendorId: 'vendor-2' }))).resolves.toMatchObject({
      ok: false, status: 409, error: UI_STRINGS.appApiProcurementPposRoute.selectedVendorMustMatchApprovedAwardRecommendation,
    });
    db.awardRecommendation.findFirst.mockResolvedValueOnce({ id: 'award-pending', rfqId: 'rfq-1', status: 'PENDING_APPROVAL' });
    await expect(POST(postRequest({ rfqId: 'rfq-1', awardRecommendationId: 'award-pending' }))).resolves.toMatchObject({
      ok: false, status: 409, error: UI_STRINGS.appApiProcurementPposRoute.awardRecommendationMustBeApprovedBeforeCreatingPpo,
    });
    db.awardRecommendation.findFirst.mockResolvedValueOnce({ id: 'award-selected', rfqId: 'rfq-1', recommendedVendorId: 'vendor-1', status: 'APPROVED' });
    await expect(POST(postRequest({ rfqId: 'rfq-1', awardRecommendationId: 'award-selected', targetVendorId: 'vendor-2' }))).resolves.toMatchObject({
      ok: false, status: 409, error: UI_STRINGS.appApiProcurementPposRoute.selectedVendorMustMatchApprovedAwardRecommendation,
    });
    db.rfq.findFirst.mockResolvedValueOnce(rfqRecord({ awards: [{ id: 'award-empty-vendor', recommendedVendorId: '', status: 'APPROVED' }] }));
    await expect(POST(postRequest({ rfqId: 'rfq-1' }))).resolves.toMatchObject({ ok: false, status: 409, error: UI_STRINGS.common.invalidRequestBody });

    db.vendor.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest({ rfqId: 'rfq-1' }))).resolves.toMatchObject({ ok: false, status: 404, error: UI_STRINGS.common.vendorNotFoundOrAccessDenied });
    db.rfqVendor.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest({ rfqId: 'rfq-1' }))).resolves.toMatchObject({ ok: false, status: 409, error: UI_STRINGS.appApiProcurementAwardsRoute.recommendedVendorWasNotInvitedToThisRFQ });
  });

  it('issues an L1 PPO from an approved award with matched quote lines and atomic audit', async () => {
    const result = await POST(postRequest({ rfqId: 'rfq-1' }));
    expect(result).toMatchObject({ ok: true, status: 201, data: {
      ppo: { id: expect.any(String) }, ppoNumber: 'PPO-2026-000001', message: expect.stringContaining('Acme'),
    } });
    const statements = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(statements.some(({ sql }) => sql === AUDIT_LOG_INSERT_AFTER_CHANGE_SQL)).toBe(true);
    expect(statements.some(({ sql }) => sql.includes('INSERT INTO "award_recommendations"'))).toBe(false);
    const ppoInsert = statements.find(({ sql }) => sql === PPO_INSERT_IF_VALID_SQL);
    expect(ppoInsert?.values).toEqual(expect.arrayContaining([
      'tenant-1', 'project-1', 'cc-revision', 'boq-1', 'revision-1', 'rfq-1', 'vendor-1',
      null, 'REGULAR_RFQ', 'PPO-2026-000001', 'ISSUED', 'Site delivery', 'Net 30', 'GST included', 'user-1',
    ]));
    expect(ppoInsert?.values[19]).toEqual(expect.any(String));
    const lineStatements = statements.filter(({ sql }) => sql === PPO_LINE_INSERT_SQL);
    expect(lineStatements).toHaveLength(2);
    expect(lineStatements[0].values).toEqual(expect.arrayContaining([
      'project-1', 'cc-line', 'boq-1', 'revision-1', 'boq-line-1', 'pr-line-1', 'rfq-line-1', 'vendor-1',
      'PO-1', 'Cable', 'Copper', 'Electrical', 'Wire', 'M', 2, 20, 40, 0, 40, 'ISSUED',
    ]));
    expect(ppoInsert).toBeDefined();
    expect(ppoInsert!.sql.match(/\?/g)).toHaveLength(ppoInsert!.values.length);
    expect(statements.some(({ sql }) => sql === RFQ_MARK_AWARDED_AFTER_PPO_INSERT_SQL)).toBe(true);
    const outboxStatement = statements.find(({ sql }) => sql.includes('notification_outbox'));
    expect(outboxStatement).toBeDefined();
    expect(JSON.parse(String(outboxStatement?.values[2])).recordNumber).toBe('PPO-2026-000001');
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'PPO_CREATED', recordNumber: 'PPO-2026-000001' }), { prepareOnly: true });
    expect(dispatchPrepared).toHaveBeenCalledWith(outboxStatement?.values[0], expect.any(Date), expect.objectContaining({ entityId: expect.any(String) }));
    const rfqQuery = db.rfq.findFirst.mock.calls.at(-1)?.[0];
    expect(rfqQuery.include.lines).toEqual({
      orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
      take: MAX_PPO_CREATE_LINES + 1,
    });
    expect(rfqQuery.include).not.toHaveProperty('quotes');
    const latestQuoteSql = (db.$queryRaw.mock.calls.at(-1)?.[0] as TemplateStringsArray).join(' ');
    expect(latestQuoteSql).toContain('MAX(quote."quoteVersion")');
    expect(latestQuoteSql).toContain('GROUP BY quote."tenantId", quote."rfqId", quote."vendorId"');
    expect(db.quote.findFirst).toHaveBeenLastCalledWith({
      where: { tenantId: 'tenant-1', rfqId: 'rfq-1', vendorId: 'vendor-1', quoteVersion: 1 },
      select: {
        quoteVersion: true,
        totalQuoteAmount: true,
        lines: { select: { rfqLineId: true, unitRate: true, lineTotal: true } },
      },
    });
  });

  it('retries a concurrent PPO number collision with the next number', async () => {
    db.ppo.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ppoNumber: 'PPO-2026-000001' });
    writeBatch.mockReset()
      .mockRejectedValueOnce(new Error('UNIQUE constraint failed: ppos.tenantId, ppos.ppoNumber'))
      .mockResolvedValueOnce(Array.from({ length: 8 }, () => ({ meta: { changes: 1 } })));

    const result = await POST(postRequest({ rfqId: 'rfq-1' }));
    expect(result).toMatchObject({ ok: true, data: { ppoNumber: 'PPO-2026-000002' } });
    expect(writeBatch).toHaveBeenCalledTimes(2);
    const retryStatements = writeBatch.mock.calls[1][0] as Array<{ sql: string; values: unknown[] }>;
    expect(retryStatements.find(({ sql }) => sql === PPO_INSERT_IF_VALID_SQL)?.values[11]).toBe('PPO-2026-000002');
    const auditValues = retryStatements.find(({ sql }) => sql === AUDIT_LOG_INSERT_AFTER_CHANGE_SQL)?.values;
    expect(auditValues?.[9]).toContain('PPO-2026-000002');
    const outboxValues = retryStatements.find(({ sql }) => sql.includes('notification_outbox'))?.values;
    expect(JSON.parse(String(outboxValues?.[2])).recordNumber).toBe('PPO-2026-000002');
  });

  it('retries exhausted number collisions and handles optional notification outboxes', async () => {
    notify.mockResolvedValueOnce(undefined);
    const success = await POST(postRequest({ rfqId: 'rfq-1' }));
    expect(success).toMatchObject({ ok: true, status: 201 });
    expect(writeBatch.mock.calls[0][0]).toHaveLength(5);
    expect(dispatchPrepared).not.toHaveBeenCalled();

    db.ppo.findFirst.mockReset().mockResolvedValue(null);
    writeBatch.mockReset()
      .mockRejectedValueOnce(new Error('UNIQUE constraint failed: ppos.tenantId, ppos.ppoNumber'))
      .mockRejectedValueOnce(new Error('UNIQUE constraint failed: ppos.tenantId, ppos.ppoNumber'))
      .mockRejectedValueOnce(new Error('UNIQUE constraint failed: ppos.tenantId, ppos.ppoNumber'));
    await expect(POST(postRequest({ rfqId: 'rfq-1' }))).resolves.toMatchObject({
      ok: false, status: 409, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh,
    });

    db.ppo.findFirst.mockReset().mockResolvedValue(null);
    writeBatch.mockReset().mockRejectedValueOnce(new Error('UNIQUE constraint failed: ppos.tenantId, ppos.status'));
    await expect(POST(postRequest({ rfqId: 'rfq-1' }))).resolves.toMatchObject({
      ok: false, status: 409, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh,
    });
    expect(structuredLog).toHaveBeenCalledWith('warn', 'procurement.ppo_create_conflict', expect.objectContaining({ vendorId: 'vendor-1' }));
  });

  it('raises a draft PPO for an approved non-L1 award and reuses supplied commercial terms', async () => {
    const rankedRfq = rfqRecord({ estimatedBenchmarkValue: 0, awards: [{ id: 'award-existing', rfqId: 'rfq-1', recommendedVendorId: 'vendor-1', finalNegotiatedAmount: 60, status: 'APPROVED', justification: 'Compatibility' }],
      quotes: [quote('vendor-2', 50, 1, [], 'Beta'), quote('vendor-1', 60, 1, [
        { rfqLineId: 'rfq-line-1', unitRate: 20, lineTotal: 40 }, { rfqLineId: 'rfq-line-2', unitRate: 20, lineTotal: 20 },
      ], 'Acme')] });
    db.rfq.findFirst.mockResolvedValueOnce(rankedRfq);
    db.awardRecommendation.findFirst.mockResolvedValueOnce({ id: 'award-selected', rfqId: 'rfq-1', recommendedVendorId: 'vendor-1', finalNegotiatedAmount: 60, status: 'APPROVED', justification: 'Compatibility' });
    const result = await POST(postRequest({
      rfqId: 'rfq-1', awardRecommendationId: 'award-selected', justification: 'Technical compatibility',
      action: 'SAVE_DRAFT', deliveryTerms: 'Collect at warehouse', paymentTerms: 'Advance', taxDetails: 'GST extra',
    }));
    expect(result).toMatchObject({ ok: true, status: 201 });
    const statements = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(statements.some(({ sql }) => sql.includes('INSERT INTO "award_recommendations"'))).toBe(false);
    expect(statements.find(({ sql }) => sql === PPO_INSERT_IF_VALID_SQL)?.values).toEqual(expect.arrayContaining([
      'award-selected', 'DRAFT', 'Collect at warehouse', 'Advance', 'GST extra',
    ]));
    expect(statements.find(({ sql }) => sql === PPO_INSERT_IF_VALID_SQL)?.values[19]).toBeNull();
    const rfqTransition = statements.find(({ sql }) => sql === RFQ_MARK_AWARDED_AFTER_PPO_INSERT_SQL);
    expect(rfqTransition?.values[0]).toBe('DRAFT');
    expect(rfqTransition?.sql).toContain("CASE WHEN ? = 'ISSUED'");
    expect(statements.find(({ sql }) => sql === AUDIT_LOG_INSERT_AFTER_CHANGE_SQL)?.values).toEqual(expect.arrayContaining(['PPO_CREATED']));
  });

  it('uses an existing RFQ award and default terms when issuing a zero-value quote without a BOQ revision', async () => {
    db.rfq.findFirst.mockResolvedValueOnce(rfqRecord({
      estimatedBenchmarkValue: 0,
      deliveryRequirement: null,
      paymentTerms: null,
      taxTerms: null,
      boqRevisionId: null,
      boqRevision: null,
      awards: [{ id: 'award-existing', rfqId: 'rfq-1', recommendedVendorId: 'vendor-1', finalNegotiatedAmount: 0, status: 'APPROVED' }],
      quotes: [quote('vendor-1', 0, 1, [{ rfqLineId: 'rfq-line-1', unitRate: 0, lineTotal: 0 }], 'Acme')],
      lines: [
        { id: 'rfq-line-1', lineNumber: '1', description: 'Cable', quantity: 1, benchmarkRate: 0, costCentreId: null, boqLineId: null, prLineId: null },
      ],
    }));
    await expect(POST(postRequest({ rfqId: 'rfq-1' }))).resolves.toMatchObject({ ok: true, status: 201 });
    const statements = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(statements.find(({ sql }) => sql === PPO_INSERT_IF_VALID_SQL)?.values).toEqual(expect.arrayContaining([
      'award-existing', UI_STRINGS.appApiProcurementPposRoute.defaultPpoDeliveryTerms,
      UI_STRINGS.appApiProcurementPposRoute.defaultPpoPaymentTerms,
      UI_STRINGS.appApiProcurementPposRoute.defaultPpoTaxDetails, null,
    ]));
    expect(statements.find(({ sql }) => sql === PPO_LINE_INSERT_SQL)?.values).toEqual(expect.arrayContaining([
      'PO-1', 1, 0, 0, null, null, null, 'vendor-1',
    ]));
  });

  it('uses an approved non-L1 award and records the rank-based rationale', async () => {
    db.rfq.findFirst.mockResolvedValueOnce(rfqRecord({
      quotes: [quote('vendor-2', 40, 1, [], 'Beta'), quote('vendor-1', 60, 1, [
        { rfqLineId: 'rfq-line-1', unitRate: 20, lineTotal: 40 }, { rfqLineId: 'rfq-line-2', unitRate: 20, lineTotal: 20 },
      ], 'Acme')],
    }));
    await expect(POST(postRequest({ rfqId: 'rfq-1', targetVendorId: 'vendor-1', justification: 'Required compatibility' })))
      .resolves.toMatchObject({ ok: true, status: 201 });
    const statements = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(statements.some(({ sql }) => sql.includes('INSERT INTO "award_recommendations"'))).toBe(false);
    expect(statements.find(({ sql }) => sql === AUDIT_LOG_INSERT_AFTER_CHANGE_SQL)?.values).toEqual(expect.arrayContaining(['PPO_CREATED']));
  });

  it('handles a zero-value L1 quote when no benchmark or commercial defaults exist', async () => {
    db.rfq.findFirst.mockResolvedValueOnce(rfqRecord({
      estimatedBenchmarkValue: 0,
      deliveryRequirement: null,
      paymentTerms: null,
      taxTerms: null,
      awards: [{ id: 'award-zero', rfqId: 'rfq-1', recommendedVendorId: 'vendor-1', finalNegotiatedAmount: 0, status: 'APPROVED' }],
      quotes: [quote('vendor-1', 0, 1, [], 'Acme')],
      lines: [],
    }));
    await expect(POST(postRequest({ rfqId: 'rfq-1' }))).resolves.toMatchObject({ ok: true, status: 201 });
    const statements = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(statements.some(({ sql }) => sql.includes('INSERT INTO "award_recommendations"'))).toBe(false);
    expect(statements.find(({ sql }) => sql === PPO_INSERT_IF_VALID_SQL)?.values).toEqual(expect.arrayContaining([
      UI_STRINGS.appApiProcurementPposRoute.defaultPpoDeliveryTerms,
      UI_STRINGS.appApiProcurementPposRoute.defaultPpoPaymentTerms,
      UI_STRINGS.appApiProcurementPposRoute.defaultPpoTaxDetails,
    ]));
    expect(statements.filter(({ sql }) => sql === PPO_LINE_INSERT_SQL)).toHaveLength(0);
  });

  it('handles zero benchmark savings and POST failures', async () => {
    db.rfq.findFirst.mockResolvedValueOnce(rfqRecord({ estimatedBenchmarkValue: 0 }));
    await POST(postRequest({ rfqId: 'rfq-1' }));
    const statements = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(statements.some(({ sql }) => sql.includes('INSERT INTO "award_recommendations"'))).toBe(false);

    db.rfq.findFirst.mockRejectedValueOnce(new Error('PPO database unavailable'));
    await expect(POST(postRequest({ rfqId: 'rfq-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToGeneratePpo, status: 500 });
    db.rfq.findFirst.mockRejectedValueOnce({});
    await expect(POST(postRequest({ rfqId: 'rfq-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToGeneratePpo, status: 500 });
    expect(structuredLog).toHaveBeenCalledTimes(2);
  });

  it('returns a conflict for a conditional persistence race and keeps the notification in the PPO batch', async () => {
    db.rfq.findFirst.mockResolvedValueOnce(rfqRecord());
    writeBatch.mockResolvedValueOnce(Array.from({ length: 8 }, (_, index) => ({ meta: { changes: index === 0 ? 0 : 1 } })));
    await expect(POST(postRequest({ rfqId: 'rfq-1' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409,
    });

    db.rfq.findFirst.mockResolvedValueOnce(rfqRecord());
    await expect(POST(postRequest({ rfqId: 'rfq-1' }))).resolves.toMatchObject({ ok: true, status: 201 });
    expect(writeBatch.mock.calls.at(-1)?.[0].some(({ sql }: { sql: string }) => sql.includes('notification_outbox'))).toBe(true);
    expect(dispatchPrepared).toHaveBeenCalledTimes(1);
  });

  it('rejects award totals or quote lines that cannot safely produce complete PPO lines', async () => {
    db.rfq.findFirst.mockResolvedValueOnce(rfqRecord({
      awards: [{ id: 'award-mismatch', rfqId: 'rfq-1', recommendedVendorId: 'vendor-1', finalNegotiatedAmount: 70, status: 'APPROVED' }],
    }));
    await expect(POST(postRequest({ rfqId: 'rfq-1' }))).resolves.toEqual({
      ok: false,
      error: UI_STRINGS.appApiProcurementPposRoute.approvedAwardAmountMustMatchTheLatestQuoteForPpoCreation,
      status: 409,
    });

    db.rfq.findFirst.mockResolvedValueOnce(rfqRecord({
      quotes: [quote('vendor-1', 60, 1, [{ rfqLineId: 'rfq-line-1', unitRate: 20, lineTotal: 40 }], 'Acme')],
    }));
    await expect(POST(postRequest({ rfqId: 'rfq-1' }))).resolves.toEqual({
      ok: false,
      error: UI_STRINGS.appApiProcurementPposRoute.selectedQuotationDoesNotContainValidRatesForEveryRfqLine,
      status: 409,
    });
    expect(writeBatch).not.toHaveBeenCalled();
  });
});
