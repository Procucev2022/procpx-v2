import { NextRequest } from 'next/server';
import { GET, POST } from '../src/app/api/procurement/rfqs/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { dispatchPreparedWorkflowNotification, notifyNextResponsibleParty } from '../src/lib/notifications';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { isUserAuthorizedForProject } from '../src/lib/project-auth';
import { logEvent, writeStructuredLog } from '../src/lib/observability/server-logger';
import { MAX_D1_BATCH_STATEMENTS } from '../src/lib/d1-batch.constants';


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    rfq: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn(), create: jest.fn() },
    quote: { groupBy: jest.fn() },
    procurementRequest: { findFirst: jest.fn() },
    boqRevision: { findFirst: jest.fn() },
    rfqVendor: { createMany: jest.fn() },
    vendor: { findMany: jest.fn() },
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
jest.mock('../src/lib/notifications', () => ({ notifyNextResponsibleParty: jest.fn(), dispatchPreparedWorkflowNotification: jest.fn() }));
jest.mock('../src/lib/d1-batch', () => ({ isD1BatchWithinLimits: (input: Array<{ values: unknown[] }>) => input.reduce((total, item) => total + item.values.length, 0) <= 4500 && input.every((item) => item.values.length <= 100), writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/project-auth', () => ({ isUserAuthorizedForProject: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({
  logEvent: jest.fn(),
  writeStructuredLog: jest.fn().mockResolvedValue(undefined),
}));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
const notify = notifyNextResponsibleParty as jest.Mock;
const dispatchPrepared = dispatchPreparedWorkflowNotification as jest.Mock;
const batchWrite = writeD1BatchAtomically as jest.Mock;
const projectAuthorized = isUserAuthorizedForProject as jest.Mock;
const structuredLog = writeStructuredLog as jest.Mock;
const backgroundLog = logEvent as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'buyer-1', userName: 'Buyer' };
const getRequest = (query = '') => new NextRequest(`http://localhost/api/procurement/rfqs${query}`);
const postRequest = (body: unknown) => new NextRequest('http://localhost/api/procurement/rfqs', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const prFixture = (overrides: Record<string, any> = {}) => ({
  id: 'pr-1', prNumber: 'PR-1', status: 'PR_APPROVED', projectId: 'project-1', costCentreId: 'cc-1', boqId: 'boq-1',
  boqRevisionId: 'rev-1', boqRevision: { revisionCode: 'R3' }, project: { id: 'project-1' }, costCentre: { id: 'cc-1' },
  lines: [
    { id: 'pr-line-1', lineNumber: null, itemDescription: 'Cable', specification: '', category: '', subcategory: null, uom: 'M',
      quantity: 3, estimatedRate: 0, estimatedValue: 0, boqLineId: null, boqLine: { aiUnitCost: 40, specification: '4 core' } },
    { id: 'pr-line-2', lineNumber: '2', itemDescription: 'Panel', specification: 'Panel spec', category: 'Electrical', subcategory: 'Switchgear',
      uom: 'EA', quantity: 0, estimatedRate: 25, estimatedValue: 100, boqLineId: 'boq-line-2', boqLine: null },
  ],
  ...overrides,
});
const boqFixture = (overrides: Record<string, any> = {}) => ({
  id: 'rev-1', boqId: 'boq-1', costCentreId: null, revisionCode: 'R7', boq: { id: 'boq-1', projectId: 'project-1' }, lines: [
    { id: 'boq-line-1', lineNumber: null, itemCode: 'C-1', standardDescription: '', originalDescription: 'Copper cable',
      specification: '', category: { name: 'Electrical' }, subcategoryId: 'sub-1', uom: null, uomRaw: 'M', quantity: 2,
      aiUnitCost: 0, benchmarkRate: 30 },
    { id: 'boq-line-2', lineNumber: 'L-2', itemCode: 'P-2', standardDescription: 'Panel', originalDescription: 'Panel original',
      specification: 'Panel spec', category: { name: 'Mechanical' }, subcategoryId: null, uom: { code: 'EA' }, quantity: 0,
      aiUnitCost: 60, benchmarkRate: 50 },
  ],
  ...overrides,
});

describe('RFQ collection API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.rfq.findMany.mockReset().mockResolvedValue([]);
    db.rfq.findFirst.mockReset().mockResolvedValue(null);
    db.rfq.count.mockReset().mockResolvedValue(0);
    db.rfq.groupBy = jest.fn().mockResolvedValue([]);
    db.quote.groupBy.mockReset().mockResolvedValue([]);
    db.rfq.create.mockReset().mockResolvedValue({ id: 'rfq-new', rfqNumber: 'RFQ-2026-000001' });
    db.procurementRequest.findFirst.mockReset().mockResolvedValue(prFixture());
    db.boqRevision.findFirst.mockReset().mockResolvedValue(boqFixture());
    db.rfqVendor.createMany.mockReset().mockResolvedValue({ count: 1 });
    db.vendor.findMany.mockReset().mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map((id) => ({ id })));
    projectAuthorized.mockReset().mockResolvedValue(true);
    structuredLog.mockReset().mockResolvedValue(undefined);
    batchWrite.mockReset().mockImplementation(async (statements: Array<{ values: unknown[] }>) => [
      { results: [{ id: statements[0].values[0], rfqNumber: `RFQ-${statements[0].values[4]}-000001` }], meta: { changes: 1 } },
      ...statements.slice(1).map(() => ({ meta: { changes: 1 } })),
    ]);
    audit.mockReset().mockResolvedValue(undefined);
    notify.mockReset().mockImplementation(async (input: Record<string, unknown>, options: { prepareOnly?: boolean } = {}) => options.prepareOnly
      ? { tenantId: input.tenantId, targetRole: 'PROCUREMENT_USER', title: 'RFQ __RFQ_NUMBER__ released',
        message: 'Review RFQ __RFQ_NUMBER__', entityType: 'RFQ', entityId: input.entityId,
        recordNumber: input.recordNumber, link: '/procurement/rfqs' }
      : undefined);
    structuredLog.mockReset().mockResolvedValue(undefined);
  });

  it('filters active RFQs and maps sourcing, procurement, and award summaries', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(getRequest())).resolves.toBe(denied);

    db.rfq.count.mockResolvedValueOnce(21);
    db.rfq.groupBy.mockResolvedValueOnce([{ status: 'RELEASED', _count: { _all: 3 } }]);
    db.rfq.findMany.mockResolvedValueOnce([{
      id: 'rfq-1', rfqNumber: 'RFQ-1', title: 'Cable package', scopeOfWork: 'Supply', packageType: 'CATEGORY', packageName: 'Cable',
      status: 'RELEASED', submissionDeadline: new Date('2026-11-01'), clarificationDeadline: null, commercialValidityDays: 60,
      estimatedBenchmarkValue: 500, totalLines: 0, _count: { lines: 2 },
      project: { id: 'p1', name: 'North', projectCode: 'N1', location: 'Site', city: 'City' },
      boqRevision: { id: 'rev-1', revisionCode: 'R2', approvedAt: new Date('2026-01-01'), boq: { id: 'b1', boqCode: 'BOQ-1' } },
      pr: { id: 'pr1', prNumber: 'PR-1', costCentre: { id: 'cc1', code: 'CC-1', name: 'Electrical' }, boq: { id: 'b1', boqCode: 'BOQ-PR' } },
      invitedVendors: [{ id: 'iv1', vendorId: 'v1', invitationStatus: 'INVITED', submissionStatus: 'PENDING', vendor: { name: 'Acme', performanceScore: 88 } }],
      quotes: [{ id: 'q1', quoteNumber: 'QT-1', quoteVersion: 1, vendorId: 'v1', totalQuoteAmount: 1000 },
        { id: 'q2', quoteNumber: 'QT-2', quoteVersion: 2, vendorId: 'v2', totalQuoteAmount: 0 }],
      negotiations: [{ id: 'n1' }], auctions: [{ id: 'a1' }], awards: [{ id: 'aw1' }], ppos: [{ id: 'ppo1' }],
      createdAt: new Date('2026-10-01'), releasedAt: new Date('2026-10-02'),
    }]);
    db.quote.groupBy.mockResolvedValueOnce([{ rfqId: 'rfq-1', _count: { _all: 2 }, _min: { totalQuoteAmount: 0 } }]);
    await expect(GET(getRequest('?status=active&projectId=p1&search=cable%20%26%20panel&page=2&pageSize=10'))).resolves.toMatchObject({ ok: true, data: {
      total: 21, page: 2, pageSize: 10, totalPages: 3, statusCounts: { RELEASED: 3 },
      rfqs: [{ id: 'rfq-1', totalLines: 2, boqCode: 'BOQ-1', costCentre: 'CC-1 - Electrical', location: 'Site',
        totalBoqValue: 500, invitedVendorsCount: 1, invitedVendors: [{ vendorName: 'Acme', performanceScore: 88 }],
        quotesCount: 2, hasQuotes: true, lowestQuoteAmount: 0, negotiation: { id: 'n1' }, auction: { id: 'a1' },
        award: { id: 'aw1' }, ppo: { id: 'ppo1' } }],
    } });
    expect(db.rfq.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', status: { in: ['RELEASED', 'VENDOR_RESPONSE_OPEN', 'RESPONSE_CLOSED', 'COMPARISON', 'NEGOTIATION'] },
        projectId: 'p1', OR: [
          { rfqNumber: { contains: 'cable & panel' } }, { title: { contains: 'cable & panel' } },
          { packageName: { contains: 'cable & panel' } }, { project: { name: { contains: 'cable & panel' } } },
          { project: { projectCode: { contains: 'cable & panel' } } },
        ] },
      skip: 10,
      take: 10,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }));
    const listQuery = db.rfq.findMany.mock.calls.at(-1)?.[0];
    expect(listQuery.include.invitedVendors).toMatchObject({
      orderBy: [{ invitedAt: 'asc' }, { id: 'asc' }],
      take: 5,
    });
    expect(db.quote.groupBy).toHaveBeenCalledWith({
      by: ['rfqId'],
      where: { tenantId: 'tenant-1', rfqId: { in: ['rfq-1'] } },
      _count: { _all: true },
      _min: { totalQuoteAmount: true },
    });

    db.rfq.findMany.mockResolvedValueOnce([{
      id: 'rfq-fallback', rfqNumber: 'RFQ-2', totalLines: null, _count: { lines: 4 }, status: 'DRAFT',
      project: { projectCode: 'P2', city: 'South' },
      boqRevision: { revisionCode: 'R2', costCentre: null, boq: { boqCode: 'BOQ-2' } },
      pr: null, invitedVendors: [], quotes: [],
      negotiations: [], auctions: [], awards: [], ppos: [], estimatedBenchmarkValue: 0,
    }, {
      id: 'rfq-pr-fallback', rfqNumber: 'RFQ-3', totalLines: 1, _count: { lines: 1 }, status: 'DRAFT',
      project: { location: 'Pune' }, boqRevision: null,
      pr: { boq: { boqCode: 'BOQ-PR' }, costCentre: { code: 'CC-3', name: 'Costs' } }, invitedVendors: [], quotes: undefined,
      negotiations: [], auctions: [], awards: [], ppos: [],
    }, {
      id: 'rfq-generic-fallback', rfqNumber: 'RFQ-4', totalLines: 1, _count: { lines: 1 }, status: 'DRAFT',
      project: null, boqRevision: null, pr: null, invitedVendors: [], quotes: [], negotiations: [], auctions: [], awards: [], ppos: [],
    }]);
    await expect(GET(getRequest('?status=DRAFT'))).resolves.toMatchObject({ ok: true, data: { rfqs: [
      { totalLines: 4, boqCode: 'BOQ-2', costCentre: null, location: 'South', totalBoqValue: 0,
        invitedVendorsCount: 0, quotesCount: 0, hasQuotes: false, lowestQuoteAmount: null,
        negotiation: null, auction: null, award: null, ppo: null },
      { boqCode: 'BOQ-PR', costCentre: 'CC-3 - Costs', location: 'Pune', quotesCount: 0, lowestQuoteAmount: null },
      { boqCode: null, costCentre: null, location: null },
    ] } });
    expect(structuredLog).toHaveBeenCalledWith('warn', 'procurement.rfq_register_relationships_missing', expect.objectContaining({
      operation: 'list_rfqs', route: '/api/procurement/rfqs', tenantId: 'tenant-1',
      affectedRecordCount: 2,
      records: expect.arrayContaining([
        expect.objectContaining({ rfqId: 'rfq-pr-fallback', missingRelations: ['boqRevision'] }),
        expect.objectContaining({ rfqId: 'rfq-generic-fallback', missingRelations: ['project', 'boqRevision'] }),
      ]),
    }), 'application');
    db.rfq.findMany.mockRejectedValueOnce(new Error('RFQ list failed'));
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchRfqs, status: 500 });
    db.rfq.findMany.mockRejectedValueOnce({});
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchRfqs, status: 500 });
    expect(structuredLog).toHaveBeenCalledTimes(3);
    expect(structuredLog).toHaveBeenCalledWith('error', 'procurement.rfq_register_read_failed', expect.objectContaining({
      operation: 'list_rfqs', tenantId: 'tenant-1', pageSize: 50,
    }), 'application');
  });

  it('validates RFQ creation access, approved PR state, duplicate sourcing, and PR line scope', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(postRequest({}))).resolves.toBe(denied);
    await expect(POST(postRequest({ projectId: 'p1', title: 'Missing BOQ' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementRfqsRoute.projectApprovedBOQRevisionAndTitleAreRequired, status: 400,
    });
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest({ projectId: 'p1', boqRevisionId: 'missing', title: 'Missing revision' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementRfqsRoute.approvedOrReleasedBOQRevisionNotFound, status: 404,
    });

    db.procurementRequest.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest({ prId: 'missing' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementRfqsRoute.procurementRequestNotFoundOrAccessDenied, status: 404 });
    db.procurementRequest.findFirst.mockResolvedValueOnce(prFixture({ status: 'PR_SUBMITTED' }));
    await expect(POST(postRequest({ prId: 'pr-1' }))).resolves.toMatchObject({ ok: false, error: expect.stringContaining('Sourcing is only permitted'), status: 400 });
    db.rfq.findFirst.mockResolvedValueOnce({ rfqNumber: 'RFQ-EXISTING' });
    await expect(POST(postRequest({ prId: 'pr-1' }))).resolves.toMatchObject({ ok: false, error: expect.stringContaining('RFQ-EXISTING'), status: 409 });

    db.procurementRequest.findFirst.mockResolvedValueOnce(prFixture());
    await expect(POST(postRequest({ prId: 'pr-1', selectedLineIds: ['pr-line-1', 'pr-line-1'] }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementRfqsRoute.duplicateLineItemIDsFoundInRFQLineSelection, status: 400,
    });
    db.procurementRequest.findFirst.mockResolvedValueOnce(prFixture());
    await expect(POST(postRequest({ prId: 'pr-1', selectedLineIds: ['outside'] }))).resolves.toMatchObject({
      ok: false, error: expect.stringContaining('do not belong'), status: 400,
    });
    db.procurementRequest.findFirst.mockReset().mockResolvedValueOnce(prFixture({ lines: [] }));
    db.rfq.findFirst.mockReset().mockResolvedValue(null);
    await expect(POST(postRequest({ prId: 'pr-1', title: 'Empty PR sourcing' }))).resolves.toMatchObject({ ok: false, error: expect.stringContaining('At least one approved PR line'), status: 400 });
  });

  it('creates and releases an RFQ from an approved PR with selected vendor invitations', async () => {
    const result = await POST(postRequest({ prId: 'pr-1', projectId: 'project-1', title: 'Electrical sourcing',
      action: 'RELEASE_RFQ', vendorIds: ['v1', 'v2'], packageName: 'Switchgear package', submissionDeadline: '2026-11-01',
      clarificationDeadline: '2026-10-25', commercialValidityDays: 0, requiredDocuments: ['Drawing'],
      deliveryRequirement: 'At site', paymentTerms: 'Net 30', taxTerms: 'GST extra',
    }));
    expect(result).toMatchObject({ ok: true, status: 201, data: { message: expect.stringContaining('successfully created') } });
    const statements = batchWrite.mock.calls[0][0];
    expect(statements).toHaveLength(8);
    expect(statements[0].sql).toContain('ON CONFLICT ("tenantId", "rfqNumber") DO NOTHING');
    expect(statements[0].values).toEqual(expect.arrayContaining(['tenant-1', 'project-1', 'rev-1', 'pr-1', 'Electrical sourcing', 'RELEASED', 60]));
    expect(statements[0].values[16]).toBe('["Drawing"]');
    expect(statements[0].values[19]).toBe(220);
    expect(statements[1].values).toEqual(expect.arrayContaining(['pr-line-1', 'L-1', 'Cable', '4 core', 3, 40, 120]));
    expect(statements[2].values).toEqual(expect.arrayContaining(['pr-line-2', '2', 'Panel', 'Panel spec', 1, 25, 100]));
    expect(statements[3].values).toEqual(expect.arrayContaining(['v1', UI_STRINGS.appAppProcurementRfqsNewPage.iNVITED]));
    expect(statements[4].values).toEqual(expect.arrayContaining(['v2', UI_STRINGS.appAppProcurementRfqsNewPage.iNVITED]));
    expect(statements[5].values).toEqual(expect.arrayContaining(['RFQ', 'RFQ_CREATED']));
    expect(statements[6].values).toEqual(expect.arrayContaining(['RFQ', 'RFQ_RELEASED']));
    expect(statements[7].sql).toContain('INSERT INTO "notification_outbox"');
    expect(statements[7].sql).toContain('REPLACE(?, \'__RFQ_NUMBER__\', r."rfqNumber")');
    expect(db.rfq.create).not.toHaveBeenCalled();
    expect(db.rfqVendor.createMany).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'RFQ_RELEASED', recordNumber: '__RFQ_NUMBER__' }), { prepareOnly: true });
    expect(dispatchPreparedWorkflowNotification).toHaveBeenCalledWith(expect.any(String), expect.any(Date), expect.objectContaining({ entityType: 'RFQ' }));

    db.procurementRequest.findFirst.mockResolvedValueOnce(prFixture({ boqRevision: null, lines: [{
      id: 'selected-line', lineNumber: null, itemDescription: 'Fallback item', specification: '', category: '', subcategory: null,
      uom: 'EA', quantity: 2, estimatedRate: 30, estimatedValue: 0, boqLine: { aiUnitCost: 0 },
    }] }));
    const selected = await POST(postRequest({ prId: 'pr-1', selectedLineIds: ['selected-line'], title: 'Selected PR line' }));
    expect(selected).toMatchObject({ ok: true, status: 201 });
    expect(batchWrite.mock.calls[1][0][1].values).toEqual(expect.arrayContaining([
      'selected-line', 'L-1', 'Fallback item', 'Standard technical specification', 'General', 2, 30, 60,
    ]));
  });

  it('creates category RFQs from BOQ baselines and validates selected BOQ lines', async () => {
    const result = await POST(postRequest({ projectId: 'project-1', boqRevisionId: 'rev-1', title: 'Electrical package',
      packageType: 'CATEGORY', categoryName: 'Electrical', action: 'SAVE_DRAFT', vendorIds: ['v1'],
      scopeOfWork: 'Electrical scope', technicalRequirements: 'IEC', commercialRequirements: 'Net 30',
    }));
    expect(result).toMatchObject({ ok: true, status: 201 });
    expect(batchWrite.mock.calls[0][0][0].values).toEqual(expect.arrayContaining(['project-1', 'rev-1', null, 'CATEGORY Package', 'DRAFT', 60]));
    expect(batchWrite.mock.calls[0][0][1].values).toEqual(expect.arrayContaining([
      'boq-line-1', 'C-1', 'Copper cable', 'Commercial standard specification', 'Electrical', 'sub-1', 'M', 2, 30, 60,
    ]));
    expect(batchWrite.mock.calls[0][0][2].values).toEqual(expect.arrayContaining(['v1', UI_STRINGS.common.pENDING]));
    expect(db.rfqVendor.createMany).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();

    db.boqRevision.findFirst.mockResolvedValueOnce(boqFixture({ lines: [{ id: 'selected-boq-line', quantity: null, aiUnitCost: 0,
      benchmarkRate: 0, lineNumber: null, standardDescription: '', originalDescription: '', specification: '',
      category: null, subcategoryId: null, uom: null, uomRaw: null }] }));
    await expect(POST(postRequest({ projectId: 'project-1', boqRevisionId: 'rev-1', title: 'Selected BOQ line',
      selectedLineIds: ['selected-boq-line'] }))).resolves.toMatchObject({ ok: true, status: 201 });
    expect(batchWrite.mock.calls[1][0][1].values).toEqual(expect.arrayContaining([
      'selected-boq-line', 'L-1', UI_STRINGS.common.lineItem, 'Commercial standard specification', 'General', null, 'NOS', 1, 100, 100,
    ]));

    db.boqRevision.findFirst.mockResolvedValueOnce(boqFixture({ lines: [{ id: 'general-line', category: null, aiUnitCost: 0, benchmarkRate: 0 }] }));
    await expect(POST(postRequest({ projectId: 'project-1', boqRevisionId: 'rev-1', title: 'General category',
      packageType: 'CATEGORY', categoryName: 'General' }))).resolves.toMatchObject({ ok: true, status: 201 });

    await expect(POST(postRequest({ projectId: 'project-1', boqRevisionId: 'rev-1', title: 'Duplicate', selectedLineIds: ['boq-line-1', 'boq-line-1'] }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementRfqsRoute.duplicateLineItemIDsFoundInRFQLineSelection, status: 400,
    });
    db.boqRevision.findFirst.mockResolvedValueOnce(boqFixture());
    await expect(POST(postRequest({ projectId: 'project-1', boqRevisionId: 'rev-1', title: 'Foreign', selectedLineIds: ['foreign'] }))).resolves.toMatchObject({
      ok: false, error: expect.stringContaining('do not belong to the selected BOQ'), status: 400,
    });
    db.boqRevision.findFirst.mockResolvedValueOnce(boqFixture({ lines: [] }));
    await expect(POST(postRequest({ projectId: 'project-1', boqRevisionId: 'rev-1', title: 'Empty' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementRfqsRoute.atLeastOneBOQLineMustBeSelectedForTheRFQScope, status: 400,
    });
  });

  it('maps creation and request failures to API errors', async () => {
    db.rfq.findFirst.mockRejectedValueOnce(new Error('duplicate lookup failed'));
    await expect(POST(postRequest({ prId: 'pr-1', title: 'New RFQ' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToCreateRfq, status: 500 });
    batchWrite.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(POST(postRequest({ prId: 'pr-1', title: 'New RFQ' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToCreateRfq, status: 500 });
    const badJson = { json: jest.fn().mockRejectedValue(new Error('invalid RFQ body')) } as unknown as NextRequest;
    await expect(POST(badJson)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });

    const validBoqRequest = { projectId: 'project-1', boqRevisionId: 'rev-1', title: 'Validated inputs' };
    for (const invalidDates of [
      { submissionDeadline: 123 },
      { submissionDeadline: 'not-a-date' },
      { clarificationDeadline: {} },
      { clarificationDeadline: 'not-a-date' },
    ]) {
      await expect(POST(postRequest({ ...validBoqRequest, ...invalidDates }))).resolves.toEqual({
        ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400,
      });
    }
    await expect(POST(postRequest({ ...validBoqRequest, packageType: 'CATEGORY' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementRfqsRoute.categoryNameIsRequiredForCategoryRFQ, status: 400,
    });
    await expect(POST(postRequest({ ...validBoqRequest, selectedLineIds: Array.from({ length: MAX_D1_BATCH_STATEMENTS }, (_, index) => `line-${index}`) }))).resolves.toMatchObject({
      ok: false, status: 400, error: expect.stringContaining('atomic'),
    });

    db.rfq.findFirst.mockRejectedValueOnce(new Error('bounded request identifier failure'));
    const oversizedRequestId = new NextRequest('http://localhost/api/procurement/rfqs', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-request-id': 'r'.repeat(129) },
      body: JSON.stringify({ prId: 'pr-1', title: 'Bounded request id' }),
    });
    await expect(POST(oversizedRequestId)).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToCreateRfq, status: 500,
    });
    expect(backgroundLog).toHaveBeenLastCalledWith('error', 'rfq.create_failed', expect.objectContaining({ requestId: undefined }), 'next');
  });

  it('enforces project and vendor tenant scope and keeps a committed RFQ when outbox dispatch fails', async () => {
    projectAuthorized.mockResolvedValueOnce(false);
    await expect(POST(postRequest({ prId: 'pr-1', title: 'Scope denied' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.forbiddenInsufficientPermissions, status: 403,
    });

    db.vendor.findMany.mockResolvedValueOnce([]);
    await expect(POST(postRequest({ prId: 'pr-1', title: 'Unknown vendor', vendorIds: ['foreign-vendor'] }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementRfqsRoute.oneOrMoreVendorsNotFoundInThisTenant, status: 400,
    });

    dispatchPrepared.mockRejectedValueOnce(new Error('notification unavailable'));
    await expect(POST(postRequest({ prId: 'pr-1', title: 'Released with alert fallback', action: 'RELEASE_RFQ' }))).resolves.toMatchObject({
      ok: true, status: 201,
    });
    expect(structuredLog).toHaveBeenCalledWith('warn', 'rfq.release_notification_dispatch_failed', expect.objectContaining({
      tenantId: 'tenant-1', projectId: 'project-1', rfqNumber: expect.stringMatching(/^RFQ-/),
    }), 'next');
  });

  it('reports a concurrent active-RFQ creation after the batch guard rejects the insert', async () => {
    batchWrite.mockResolvedValueOnce([
      { results: [], meta: { changes: 0 } },
      ...Array.from({ length: 3 }, () => ({ meta: { changes: 0 } })),
    ]);
    db.rfq.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ rfqNumber: 'RFQ-CONCURRENT' });
    await expect(POST(postRequest({ prId: 'pr-1', title: 'Concurrent sourcing' }))).resolves.toMatchObject({
      ok: false, status: 409, error: expect.stringContaining('RFQ-CONCURRENT'),
    });
  });
});
