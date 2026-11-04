import { NextRequest } from 'next/server';
import { GET, POST } from '../src/app/api/procurement/rfqs/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { notifyNextResponsibleParty } from '../src/lib/notifications';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    rfq: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn(), create: jest.fn() },
    procurementRequest: { findFirst: jest.fn() },
    boqRevision: { findFirst: jest.fn() },
    rfqVendor: { createMany: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));
jest.mock('../src/lib/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('../src/lib/notifications', () => ({ notifyNextResponsibleParty: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
const notify = notifyNextResponsibleParty as jest.Mock;
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
  id: 'rev-1', revisionCode: 'R7', lines: [
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
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.rfq.findMany.mockReset().mockResolvedValue([]);
    db.rfq.findFirst.mockReset().mockResolvedValue(null);
    db.rfq.count.mockReset().mockResolvedValue(0);
    db.rfq.create.mockReset().mockResolvedValue({ id: 'rfq-new', rfqNumber: 'RFQ-2026-000001' });
    db.procurementRequest.findFirst.mockReset().mockResolvedValue(prFixture());
    db.boqRevision.findFirst.mockReset().mockResolvedValue(boqFixture());
    db.rfqVendor.createMany.mockReset().mockResolvedValue({ count: 1 });
    audit.mockReset().mockResolvedValue(undefined);
    notify.mockReset().mockResolvedValue(undefined);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('filters active RFQs and maps sourcing, procurement, and award summaries', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(getRequest())).resolves.toBe(denied);

    db.rfq.findMany.mockResolvedValueOnce([{
      id: 'rfq-1', rfqNumber: 'RFQ-1', title: 'Cable package', scopeOfWork: 'Supply', packageType: 'CATEGORY', packageName: 'Cable',
      status: 'RELEASED', submissionDeadline: new Date('2026-11-01'), clarificationDeadline: null, commercialValidityDays: 60,
      estimatedBenchmarkValue: 500, totalLines: 0, _count: { lines: 2 },
      project: { id: 'p1', name: 'North', projectCode: 'N1', location: 'Site', city: 'City' },
      boqRevision: { id: 'rev-1', revisionCode: 'R2', approvedAt: new Date('2026-01-01'), boq: { id: 'b1', boqCode: 'BOQ-1', totalBenchmarkAmount: 600 } },
      pr: { id: 'pr1', prNumber: 'PR-1', costCentre: { id: 'cc1', code: 'CC-1', name: 'Electrical' }, boq: { id: 'b1', boqCode: 'BOQ-PR' } },
      invitedVendors: [{ id: 'iv1', vendorId: 'v1', invitationStatus: 'INVITED', submissionStatus: 'PENDING', vendor: { name: 'Acme', performanceScore: 88 } }],
      quotes: [{ id: 'q1', quoteNumber: 'QT-1', quoteVersion: 1, vendorId: 'v1', totalQuoteAmount: 1000 },
        { id: 'q2', quoteNumber: 'QT-2', quoteVersion: 2, vendorId: 'v2', totalQuoteAmount: 0 }],
      negotiations: [{ id: 'n1' }], auctions: [{ id: 'a1' }], awards: [{ id: 'aw1' }], ppos: [{ id: 'ppo1' }],
      createdAt: new Date('2026-10-01'), releasedAt: new Date('2026-10-02'),
    }]);
    await expect(GET(getRequest('?status=active&projectId=p1&search=cable%20%26%20panel'))).resolves.toMatchObject({ ok: true, data: {
      total: 1, rfqs: [{ id: 'rfq-1', totalLines: 2, boqCode: 'BOQ-1', costCentre: 'CC-1 - Electrical', location: 'Site',
        totalBoqValue: 600, invitedVendorsCount: 1, invitedVendors: [{ vendorName: 'Acme', performanceScore: 88 }],
        quotesCount: 2, hasQuotes: true, lowestQuoteAmount: 1000, negotiation: { id: 'n1' }, auction: { id: 'a1' },
        award: { id: 'aw1' }, ppo: { id: 'ppo1' } }],
    } });
    expect(db.rfq.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', status: { in: ['RELEASED', 'VENDOR_RESPONSE_OPEN', 'RESPONSE_CLOSED', 'COMPARISON', 'NEGOTIATION'] },
        projectId: 'p1', OR: [
          { rfqNumber: { contains: 'cable & panel' } }, { title: { contains: 'cable & panel' } },
          { packageName: { contains: 'cable & panel' } }, { project: { name: { contains: 'cable & panel' } } },
          { project: { projectCode: { contains: 'cable & panel' } } },
        ] },
    }));

    db.rfq.findMany.mockResolvedValueOnce([{
      id: 'rfq-fallback', rfqNumber: 'RFQ-2', totalLines: null, _count: { lines: 4 }, status: 'DRAFT',
      project: { projectCode: 'P2', city: 'South' }, boqRevision: null, pr: null, invitedVendors: [], quotes: [],
      negotiations: [], auctions: [], awards: [], ppos: [], estimatedBenchmarkValue: 0,
    }, {
      id: 'rfq-pr-fallback', rfqNumber: 'RFQ-3', totalLines: 1, _count: { lines: 1 }, status: 'DRAFT',
      project: {}, boqRevision: null, pr: { boq: { boqCode: 'BOQ-PR' } }, invitedVendors: [], quotes: undefined,
      negotiations: [], auctions: [], awards: [], ppos: [],
    }, {
      id: 'rfq-generic-fallback', rfqNumber: 'RFQ-4', totalLines: 1, _count: { lines: 1 }, status: 'DRAFT',
      project: {}, boqRevision: null, pr: null, invitedVendors: [], quotes: [], negotiations: [], auctions: [], awards: [], ppos: [],
    }]);
    await expect(GET(getRequest('?status=DRAFT'))).resolves.toMatchObject({ ok: true, data: { rfqs: [
      { totalLines: 4, boqCode: 'BOQ-P2', costCentre: 'CC45 - Fitout', location: 'South', totalBoqValue: 0,
        invitedVendorsCount: 0, quotesCount: 0, hasQuotes: false, lowestQuoteAmount: null,
        negotiation: null, auction: null, award: null, ppo: null },
      { boqCode: 'BOQ-PR', costCentre: 'CC45 - Fitout', location: 'India', quotesCount: 0, lowestQuoteAmount: null },
      { boqCode: 'BOQ-R1', costCentre: 'CC45 - Fitout', location: 'India' },
    ] } });
    db.rfq.findMany.mockRejectedValueOnce(new Error('RFQ list failed'));
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: 'RFQ list failed', status: 500 });
    db.rfq.findMany.mockRejectedValueOnce({});
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: 'Failed to fetch RFQs', status: 500 });
    expect(consoleError).toHaveBeenCalledTimes(2);
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
    db.procurementRequest.findFirst.mockResolvedValueOnce(prFixture({ lines: [] }));
    await expect(POST(postRequest({ prId: 'pr-1' }))).resolves.toMatchObject({ ok: false, error: expect.stringContaining('At least one approved PR line'), status: 400 });
  });

  it('creates and releases an RFQ from an approved PR with selected vendor invitations', async () => {
    const result = await POST(postRequest({ prId: 'pr-1', projectId: 'project-1', title: 'Electrical sourcing',
      action: 'RELEASE_RFQ', vendorIds: ['v1', 'v2'], packageName: 'Switchgear package', submissionDeadline: '2026-11-01',
      clarificationDeadline: '2026-10-25', commercialValidityDays: 0, requiredDocuments: ['Drawing'],
      deliveryRequirement: 'At site', paymentTerms: 'Net 30', taxTerms: 'GST extra',
    }));
    expect(result).toMatchObject({ ok: true, status: 201, data: { message: expect.stringContaining('successfully created') } });
    expect(db.rfq.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      tenantId: 'tenant-1', projectId: 'project-1', boqRevisionId: 'rev-1', prId: 'pr-1', status: 'RELEASED',
      packageType: 'SELECTED_LINES', packageName: 'Switchgear package', commercialValidityDays: 60,
      requiredDocuments: '["Drawing"]', estimatedBenchmarkValue: 220, totalLines: 2,
      releasedAt: expect.any(Date), lines: { create: [
        expect.objectContaining({ prLineId: 'pr-line-1', benchmarkRate: 40, benchmarkAmount: 120, quantity: 3,
          lineNumber: 'L-1', specification: '4 core', category: UI_STRINGS.common.general, boqLineId: null }),
        expect.objectContaining({ prLineId: 'pr-line-2', benchmarkRate: 25, benchmarkAmount: 100, quantity: 1,
          lineNumber: UI_STRINGS.common.copyf9vgt1, specification: 'Panel spec', category: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical, subcategory: 'Switchgear', boqLineId: 'boq-line-2' }),
      ] },
    }) });
    expect(db.rfqVendor.createMany).toHaveBeenCalledWith({ data: [
      { tenantId: 'tenant-1', rfqId: 'rfq-new', vendorId: 'v1', invitationStatus: UI_STRINGS.appAppProcurementRfqsNewPage.iNVITED, submissionStatus: UI_STRINGS.common.pENDING },
      { tenantId: 'tenant-1', rfqId: 'rfq-new', vendorId: 'v2', invitationStatus: UI_STRINGS.appAppProcurementRfqsNewPage.iNVITED, submissionStatus: UI_STRINGS.common.pENDING },
    ] });
    expect(audit).toHaveBeenCalledTimes(2);
    expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'RFQ_RELEASED', projectId: 'project-1' }));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'RFQ_RELEASED', recordNumber: expect.stringMatching(/^RFQ-/) }));

    db.procurementRequest.findFirst.mockResolvedValueOnce(prFixture({ boqRevision: null, lines: [{
      id: 'selected-line', lineNumber: null, itemDescription: 'Fallback item', specification: '', category: '', subcategory: null,
      uom: 'EA', quantity: 2, estimatedRate: 30, estimatedValue: 0, boqLine: { aiUnitCost: 0 },
    }] }));
    const selected = await POST(postRequest({ prId: 'pr-1', selectedLineIds: ['selected-line'], title: 'Selected PR line' }));
    expect(selected).toMatchObject({ ok: true, status: 201 });
    expect(db.rfq.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({
      lines: { create: [expect.objectContaining({ lineNumber: 'L-1', specification: 'Standard technical specification',
        category: UI_STRINGS.common.general, benchmarkRate: 30, benchmarkAmount: 60, quantity: 2 })] },
    }) });
  });

  it('creates category RFQs from BOQ baselines and validates selected BOQ lines', async () => {
    const result = await POST(postRequest({ projectId: 'project-1', boqRevisionId: 'rev-1', title: 'Electrical package',
      packageType: 'CATEGORY', categoryName: 'Electrical', action: 'SAVE_DRAFT', vendorIds: ['v1'],
      scopeOfWork: 'Electrical scope', technicalRequirements: 'IEC', commercialRequirements: 'Net 30',
    }));
    expect(result).toMatchObject({ ok: true, status: 201 });
    expect(db.rfq.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      projectId: 'project-1', boqRevisionId: 'rev-1', prId: null, status: 'DRAFT', packageName: 'CATEGORY Package',
      estimatedBenchmarkValue: 60, totalLines: 1, releasedAt: null, lines: { create: [expect.objectContaining({
        boqLineId: 'boq-line-1', lineNumber: 'C-1', description: 'Copper cable', benchmarkRate: 30, benchmarkAmount: 60,
        category: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical, subcategory: 'sub-1', uom: 'M', quantity: 2, specification: 'Commercial standard specification',
      })] },
    }) });
    expect(db.rfqVendor.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ invitationStatus: UI_STRINGS.common.pENDING, vendorId: 'v1' })] });
    expect(notify).not.toHaveBeenCalled();

    db.boqRevision.findFirst.mockResolvedValueOnce(boqFixture({ lines: [{ id: 'selected-boq-line', quantity: null, aiUnitCost: 0,
      benchmarkRate: 0, lineNumber: null, standardDescription: '', originalDescription: '', specification: '',
      category: null, subcategoryId: null, uom: null, uomRaw: null }] }));
    await expect(POST(postRequest({ projectId: 'project-1', boqRevisionId: 'rev-1', title: 'Selected BOQ line',
      selectedLineIds: ['selected-boq-line'] }))).resolves.toMatchObject({ ok: true, status: 201 });
    expect(db.rfq.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({
      estimatedBenchmarkValue: 100, lines: { create: [expect.objectContaining({ lineNumber: 'L-1', description: 'Line item',
        specification: 'Commercial standard specification', category: UI_STRINGS.common.general, subcategory: '', uom: UI_STRINGS.common.nOS, quantity: 1,
        benchmarkRate: 100, benchmarkAmount: 100 })] },
    }) });

    db.boqRevision.findFirst.mockResolvedValueOnce(boqFixture({ lines: [{ id: 'general-line', category: null, aiUnitCost: 0, benchmarkRate: 0 }] }));
    await expect(POST(postRequest({ projectId: 'project-1', boqRevisionId: 'rev-1', title: 'General category',
      packageType: 'CATEGORY', categoryName: 'General' }))).resolves.toMatchObject({ ok: true, status: 201 });

    db.boqRevision.findFirst.mockResolvedValueOnce(boqFixture());
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
    await expect(POST(postRequest({ prId: 'pr-1' }))).resolves.toEqual({ ok: false, error: 'duplicate lookup failed', status: 500 });
    db.rfq.findMany.mockRejectedValueOnce({});
    await expect(POST(postRequest({ prId: 'pr-1' }))).resolves.toEqual({ ok: false, error: 'Failed to create RFQ', status: 500 });
    const badJson = { json: jest.fn().mockRejectedValue(new Error('invalid RFQ body')) } as unknown as NextRequest;
    await expect(POST(badJson)).resolves.toEqual({ ok: false, error: 'invalid RFQ body', status: 500 });
    expect(consoleError).toHaveBeenCalledTimes(3);
  });
});
