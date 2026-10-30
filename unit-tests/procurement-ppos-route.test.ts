import { NextRequest } from 'next/server';
import { GET, POST } from '../src/app/api/procurement/ppos/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { notifyNextResponsibleParty } from '../src/lib/notifications';
import { hasPermission } from '../src/lib/permissions';
import { getUserAuthorizedProjectIds } from '../src/lib/project-auth';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    ppo: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
    rfq: { findFirst: jest.fn() },
    awardRecommendation: { findFirst: jest.fn() },
    $transaction: jest.fn(),
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
jest.mock('../src/lib/permissions', () => ({ hasPermission: jest.fn() }));
jest.mock('../src/lib/project-auth', () => ({ getUserAuthorizedProjectIds: jest.fn() }));

const db = prisma as unknown as Record<string, any>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
const notify = notifyNextResponsibleParty as jest.Mock;
const permission = hasPermission as jest.Mock;
const authorizedProjects = getUserAuthorizedProjectIds as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1', userName: 'Buyer', role: 'PROCUREMENT_USER' };
const getRequest = (query = '') => new NextRequest(`http://localhost/api/procurement/ppos${query}`);
const postRequest = (body: unknown) => new NextRequest('http://localhost/api/procurement/ppos', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const quote = (vendorId: string, amount: number, quoteVersion = 1, lines: any[] = [], name = vendorId) => ({
  vendorId, totalQuoteAmount: amount, quoteVersion, vendor: { id: vendorId, name }, lines,
});
const rfqRecord = (overrides: Record<string, any> = {}) => ({
  id: 'rfq-1', tenantId: 'tenant-1', rfqNumber: 'RFQ-001', title: 'Electrical package', projectId: 'project-1',
  project: { id: 'project-1', name: 'Campus' }, boqRevisionId: 'revision-1',
  boqRevision: { id: 'revision-1', boqId: 'boq-1', costCentreId: 'cc-revision' },
  estimatedBenchmarkValue: 100, deliveryRequirement: 'Site delivery', paymentTerms: 'Net 30', taxTerms: 'GST included',
  lines: [
    { id: 'rfq-line-1', lineNumber: '1', description: 'Cable', specification: 'Copper', category: 'Electrical', subcategory: 'Wire', uom: 'M', quantity: 2, benchmarkRate: 25, costCentreId: 'cc-line', boqLineId: 'boq-line-1', prLineId: 'pr-line-1' },
    { id: 'rfq-line-2', lineNumber: null, description: 'Panel', specification: null, category: null, subcategory: null, uom: 'EA', quantity: 1, benchmarkRate: 0, costCentreId: null, boqLineId: null, prLineId: null },
  ],
  quotes: [quote('vendor-1', 60, 1, [{ rfqLineId: 'rfq-line-1', unitRate: 20, lineTotal: 40 }], 'Acme')],
  awards: [],
  ...overrides,
});

describe('procurement PPO collection API', () => {
  let consoleError: jest.SpyInstance;
  let tx: Record<string, any>;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    permission.mockImplementation((_role: string, key: string) => key === 'PPO_VIEW');
    authorizedProjects.mockResolvedValue(null);
    db.ppo.findMany.mockResolvedValue([]);
    db.ppo.findFirst.mockResolvedValue(null);
    db.ppo.count.mockResolvedValue(0);
    db.rfq.findFirst.mockResolvedValue(rfqRecord());
    db.awardRecommendation.findFirst.mockResolvedValue(null);
    tx = {
      awardRecommendation: { create: jest.fn().mockResolvedValue({ id: 'award-new' }) },
      ppo: { create: jest.fn().mockResolvedValue({ id: 'ppo-new', ppoNumber: 'PPO-2026-000001' }) },
      rfq: { update: jest.fn().mockResolvedValue({ id: 'rfq-1', status: 'AWARDED' }) },
    };
    db.$transaction.mockImplementation((callback: (transaction: typeof tx) => unknown) => callback(tx));
    audit.mockResolvedValue(undefined);
    notify.mockResolvedValue(undefined);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('checks read permissions, applies filters and project scope, and parses or hides vendor ratings', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(getRequest())).resolves.toBe(denied);

    permission.mockReturnValueOnce(false).mockReturnValueOnce(false);
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: 'Forbidden: insufficient permissions', status: 403 });

    permission.mockImplementation((_role: string, key: string) => key === 'PPO_VIEW');
    authorizedProjects.mockResolvedValueOnce(['project-1', 'project-2']);
    db.ppo.findMany.mockResolvedValueOnce([
      { id: 'approved', vendorRating: { status: 'APPROVED', criteriaDetails: JSON.stringify({ qualityComments: 'Good', history: [{ action: 'APPROVED' }] }) } },
      { id: 'returned', vendorRating: { status: 'RETURNED_FOR_CORRECTION', criteriaDetails: '{broken' } },
      { id: 'object-details', vendorRating: { status: 'DRAFT', criteriaDetails: { returnReason: 'More detail' } } },
      { id: 'without-rating', vendorRating: null },
    ]);
    const result = await GET(getRequest('?rfqId=rfq-1&projectId=project-query'));
    expect(result).toMatchObject({ ok: true, data: {
      total: 4, currentUserRole: 'PROCUREMENT_USER', isProcurementUser: true,
      ppos: [
        { id: 'approved', vendorRating: { qualityComments: 'Good', decisionHistory: [{ action: 'APPROVED' }] } },
        { id: 'returned', vendorRating: null },
        { id: 'object-details', vendorRating: null },
        { id: 'without-rating', vendorRating: null },
      ],
    } });
    expect(db.ppo.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', rfqId: 'rfq-1', projectId: { in: ['project-1', 'project-2'] } },
    }));

    auth.mockResolvedValueOnce({ ...context, role: 'PROJECT_USER' });
    permission.mockImplementation((_role: string, key: string) => key === 'VENDOR_RATE_PPO');
    authorizedProjects.mockResolvedValueOnce(null);
    db.ppo.findMany.mockResolvedValueOnce([
      { id: 'draft-rating', vendorRating: {
        status: 'DRAFT', criteriaDetails: { qualityComments: 'Inspect', approvedBy: 'user-2', returnReason: 'Recheck' },
      } },
      { id: 'malformed-rating', vendorRating: { status: 'DRAFT', criteriaDetails: '{broken' } },
      { id: 'empty-rating', vendorRating: { status: 'DRAFT', criteriaDetails: {} } },
    ]);
    await expect(GET(getRequest('?projectId=project-query'))).resolves.toMatchObject({ ok: true, data: {
      isProcurementUser: false,
      ppos: [
        { vendorRating: { qualityComments: 'Inspect', approvedBy: 'user-2', returnReason: 'Recheck', decisionHistory: [] } },
        { vendorRating: { criteriaDetailsParsed: {}, qualityComments: '', approvedBy: null, returnReason: null } },
        { vendorRating: { criteriaDetailsParsed: {}, qualityComments: '', approvedBy: null, returnReason: null } },
      ],
    } });
    expect(db.ppo.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', projectId: 'project-query' },
    }));
  });

  it('returns GET errors with provider messages or a safe fallback', async () => {
    authorizedProjects.mockRejectedValueOnce(new Error('project scope unavailable'));
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: 'project scope unavailable', status: 500 });
    db.ppo.findMany.mockRejectedValueOnce({});
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: 'Failed to fetch PPOs', status: 500 });
  });

  it('validates PPO creation inputs, RFQ and award references, quote selection, and L2 justification', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(postRequest({}))).resolves.toBe(denied);
    await expect(POST(postRequest({}))).resolves.toEqual({ ok: false, error: 'RFQ ID is required to generate PPO', status: 400 });

    db.rfq.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest({ rfqId: 'missing' }))).resolves.toEqual({ ok: false, error: 'RFQ not found or access denied', status: 404 });
    db.rfq.findFirst.mockResolvedValueOnce(rfqRecord({ quotes: [] }));
    await expect(POST(postRequest({ rfqId: 'rfq-1' }))).resolves.toEqual({ ok: false, error: 'Cannot generate PPO: No valid quotation found for the selected vendor', status: 400 });

    db.awardRecommendation.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest({ rfqId: 'rfq-1', awardRecommendationId: 'missing-award' }))).resolves.toEqual({ ok: false, error: 'Award recommendation not found', status: 404 });
    db.awardRecommendation.findFirst.mockResolvedValueOnce({ id: 'award-unmatched', recommendedVendorId: 'unknown-vendor' });
    await expect(POST(postRequest({ rfqId: 'rfq-1', awardRecommendationId: 'award-unmatched' }))).resolves.toEqual({
      ok: false, error: 'Cannot generate PPO: No valid quotation found for the selected vendor', status: 400,
    });
    db.rfq.findFirst.mockResolvedValueOnce(rfqRecord({
      awards: [{ id: 'award-unmatched', recommendedVendorId: 'unknown-vendor' }],
    }));
    await expect(POST(postRequest({ rfqId: 'rfq-1' }))).resolves.toEqual({
      ok: false, error: 'Cannot generate PPO: No valid quotation found for the selected vendor', status: 400,
    });

    const rankedRfq = rfqRecord({ quotes: [quote('vendor-1', 60, 2, [], 'Acme'), quote('vendor-1', 80, 1, [], 'Acme old'), quote('vendor-2', 50, 1, [], 'Beta')] });
    db.rfq.findFirst.mockResolvedValueOnce(rankedRfq);
    await expect(POST(postRequest({ rfqId: 'rfq-1', targetVendorId: 'vendor-1' }))).resolves.toMatchObject({
      ok: false, status: 400, error: expect.stringContaining('mandatory commercial justification'),
    });

    db.rfq.findFirst.mockResolvedValueOnce(rankedRfq);
    db.ppo.findFirst.mockResolvedValueOnce({ ppoNumber: 'PPO-EXISTING' });
    await expect(POST(postRequest({ rfqId: 'rfq-1', targetVendorId: 'vendor-2', justification: 'Technical advantage' }))).resolves.toEqual({
      ok: false, error: expect.stringContaining('PPO-EXISTING'), status: 409,
    });
  });

  it('issues an L1 PPO using quote rates and creates an award, lines, audit, and notification', async () => {
    const result = await POST(postRequest({ rfqId: 'rfq-1' }));
    expect(result).toMatchObject({ ok: true, status: 201, data: {
      ppo: { id: 'ppo-new' }, ppoNumber: 'PPO-2026-000001', message: expect.stringContaining('Acme'),
    } });
    expect(tx.awardRecommendation.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      recommendedVendorId: 'vendor-1', originalQuoteAmount: 60, benchmarkAmount: 100, totalSavingsAmount: 40,
      savingsPercent: 40, status: 'APPROVED', commercialStatus: 'L1_LOWEST_BIDDER',
    }) });
    const ppoCreate = tx.ppo.create.mock.calls[0][0];
    expect(ppoCreate.data).toMatchObject({
      status: 'ISSUED', deliveryTerms: 'Site delivery', paymentTerms: 'Net 30', taxDetails: 'GST included',
      issuedAt: expect.any(Date), lines: { create: [
        expect.objectContaining({ lineNumber: 'PO-1', orderedUnitRate: 20, orderedAmount: 40, costCentreId: 'cc-line', boqId: 'boq-1' }),
        expect.objectContaining({ lineNumber: 'PO-2', orderedUnitRate: 100, orderedAmount: 100, costCentreId: 'cc-revision', orderedQuantity: 1 }),
      ] },
    });
    expect(tx.rfq.update).toHaveBeenCalledWith({ where: { id: 'rfq-1' }, data: { status: 'AWARDED' } });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'PPO_CREATED', entityId: 'ppo-new' }));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'PPO_CREATED', recordNumber: 'PPO-2026-000001' }));
  });

  it('raises a draft PPO for an approved non-L1 award and reuses supplied commercial terms', async () => {
    const rankedRfq = rfqRecord({ estimatedBenchmarkValue: 0, awards: [{ id: 'award-existing', recommendedVendorId: 'vendor-1' }],
      quotes: [quote('vendor-2', 50, 1, [], 'Beta'), quote('vendor-1', 60, 1, [], 'Acme')] });
    db.rfq.findFirst.mockResolvedValueOnce(rankedRfq);
    db.awardRecommendation.findFirst.mockResolvedValueOnce({ id: 'award-selected', recommendedVendorId: 'vendor-1' });
    const result = await POST(postRequest({
      rfqId: 'rfq-1', awardRecommendationId: 'award-selected', justification: 'Technical compatibility',
      action: 'SAVE_DRAFT', deliveryTerms: 'Collect at warehouse', paymentTerms: 'Advance', taxDetails: 'GST extra',
    }));
    expect(result).toMatchObject({ ok: true, status: 201 });
    expect(tx.awardRecommendation.create).not.toHaveBeenCalled();
    expect(tx.ppo.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      awardRecommendationId: 'award-selected', status: 'DRAFT', issuedAt: null,
      deliveryTerms: 'Collect at warehouse', paymentTerms: 'Advance', taxDetails: 'GST extra',
    }) }));
    expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ newValue: expect.objectContaining({
      rankAtAward: 2, justification: 'Technical compatibility',
    }) }));
  });

  it('uses an existing RFQ award and default terms when issuing a zero-value quote without a BOQ revision', async () => {
    db.rfq.findFirst.mockResolvedValueOnce(rfqRecord({
      estimatedBenchmarkValue: 0,
      deliveryRequirement: null,
      paymentTerms: null,
      taxTerms: null,
      boqRevisionId: null,
      boqRevision: null,
      awards: [{ id: 'award-existing', recommendedVendorId: 'vendor-1' }],
      quotes: [quote('vendor-1', 0, 1, [], 'Acme')],
      lines: [
        { id: 'rfq-line-1', lineNumber: '1', description: 'Cable', quantity: 0, benchmarkRate: 0, costCentreId: null, boqLineId: null, prLineId: null },
      ],
    }));
    await expect(POST(postRequest({ rfqId: 'rfq-1' }))).resolves.toMatchObject({ ok: true, status: 201 });
    expect(tx.awardRecommendation.create).not.toHaveBeenCalled();
    const data = tx.ppo.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      awardRecommendationId: 'award-existing',
      deliveryTerms: 'Ex-site delivery within 30 days',
      paymentTerms: '30 days upon delivery and inspection',
      taxDetails: 'GST 18% as applicable',
      costCentreId: null,
      boqId: null,
      boqRevisionId: null,
      lines: { create: [expect.objectContaining({
        lineNumber: 'PO-1', orderedUnitRate: 100, orderedAmount: 100, orderedQuantity: 0,
        costCentreId: null, boqId: null, boqRevisionId: null, boqLineId: null, prLineId: null,
      })] },
    });
  });

  it('creates an award for a justified non-L1 vendor and records the rank-based rationale', async () => {
    db.rfq.findFirst.mockResolvedValueOnce(rfqRecord({
      quotes: [quote('vendor-2', 40, 1, [], 'Beta'), quote('vendor-1', 60, 1, [], 'Acme')],
    }));
    await expect(POST(postRequest({ rfqId: 'rfq-1', targetVendorId: 'vendor-1', justification: 'Required compatibility' })))
      .resolves.toMatchObject({ ok: true, status: 201 });
    expect(tx.awardRecommendation.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      recommendedVendorId: 'vendor-1', commercialStatus: 'L2_JUSTIFIED', justification: 'Required compatibility',
    }) });
    expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ newValue: expect.objectContaining({
      rankAtAward: 2, justification: 'Required compatibility',
    }) }));
  });

  it('handles a zero-value L1 quote when no benchmark or commercial defaults exist', async () => {
    db.rfq.findFirst.mockResolvedValueOnce(rfqRecord({
      estimatedBenchmarkValue: 0,
      deliveryRequirement: null,
      paymentTerms: null,
      taxTerms: null,
      quotes: [quote('vendor-1', 0, 1, [], 'Acme')],
      lines: [],
    }));
    await expect(POST(postRequest({ rfqId: 'rfq-1' }))).resolves.toMatchObject({ ok: true, status: 201 });
    expect(tx.awardRecommendation.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      benchmarkAmount: 0, totalSavingsAmount: 0, savingsPercent: 0,
      justification: 'Awarded to L1 Lowest Compliant Bidder',
    }) });
    expect(tx.ppo.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      deliveryTerms: 'Ex-site delivery within 30 days',
      paymentTerms: '30 days upon delivery and inspection',
      taxDetails: 'GST 18% as applicable',
      lines: { create: [] },
    }) }));
  });

  it('handles zero benchmark savings and POST failures', async () => {
    db.rfq.findFirst.mockResolvedValueOnce(rfqRecord({ estimatedBenchmarkValue: 0 }));
    await POST(postRequest({ rfqId: 'rfq-1' }));
    expect(tx.awardRecommendation.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      benchmarkAmount: 60, savingsPercent: 0, totalSavingsAmount: 0,
    }) });

    db.rfq.findFirst.mockRejectedValueOnce(new Error('PPO database unavailable'));
    await expect(POST(postRequest({ rfqId: 'rfq-1' }))).resolves.toEqual({ ok: false, error: 'PPO database unavailable', status: 500 });
    db.rfq.findFirst.mockRejectedValueOnce({});
    await expect(POST(postRequest({ rfqId: 'rfq-1' }))).resolves.toEqual({ ok: false, error: 'Failed to generate PPO', status: 500 });
  });
});
