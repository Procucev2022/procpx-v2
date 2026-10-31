import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { GET as compareBoq } from '../src/app/api/boq/[revisionId]/compare/route';
import { GET as getAuctionRfqOptions } from '../src/app/api/procurement/auctions/rfq-options/route';
import { POST as completePpo } from '../src/app/api/procurement/ppos/[id]/complete/route';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    boqRevision: { findFirst: jest.fn() },
    rfq: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
    ppo: { findFirst: jest.fn(), update: jest.fn() },
    ppoLine: { update: jest.fn(), findMany: jest.fn() },
    actualCostTransaction: { count: jest.fn(), create: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));
jest.mock('../src/lib/audit', () => ({ createAuditLog: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1', userName: 'Reviewer', role: 'CLIENT_ADMIN' };
const request = (url: string, body?: unknown) => new NextRequest(url, {
  method: body === undefined ? 'GET' : 'POST',
  ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
});
const params = { params: Promise.resolve({ revisionId: 'revision-current' }) };
const ppoParams = { params: Promise.resolve({ id: 'ppo-1' }) };

describe('BOQ revision comparison', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
  });

  it('checks access and reports missing current and comparison revisions', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(compareBoq(request('http://localhost/api/boq/compare'), params)).resolves.toBe(denied);
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    await expect(compareBoq(request('http://localhost/api/boq/compare'), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRevisionIdCompareRoute.currentRevisionNotFound, status: 404 });
    db.boqRevision.findFirst.mockResolvedValueOnce({ id: 'revision-current', revisionNumber: 2, boq: { revisions: [] }, lines: [] });
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    await expect(compareBoq(request('http://localhost/api/boq/compare'), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRevisionIdCompareRoute.compareTargetRevisionNotFound, status: 404 });
    expect(db.boqRevision.findFirst.mock.calls[2][0].where.id).toBe('revision-current');
  });

  it('compares added, removed, changed, and unchanged lines against an explicit revision', async () => {
    const current = {
      id: 'revision-current', revisionCode: 'R2', revisionNumber: 2, status: 'DRAFT', qualityScore: 85, totalLines: 4,
      boq: { revisions: [{ id: 'revision-old', revisionNumber: 1, revisionCode: 'R1' }, { id: 'revision-current', revisionNumber: 2, revisionCode: 'R2' }] },
      lines: [
        { lineNumber: '1', standardDescription: 'Changed cable', originalDescription: 'Cable old', quantity: 5, uomId: 'uom-2', uomRaw: 'M', uom: { code: 'MTR' }, categoryId: 'cat-2', category: { name: 'Electrical' } },
        { lineNumber: '2', standardDescription: 'Same item', quantity: 1, uomId: 'uom-1', uomRaw: 'EA', uom: { code: 'EA' }, categoryId: 'cat-1', category: { name: 'Civil' } },
        { lineNumber: '3', standardDescription: '', originalDescription: 'New item', quantity: 2, uomId: null, uomRaw: 'BOX', uom: null, categoryId: null, category: null },
        { lineNumber: '5', standardDescription: 'New lamp', quantity: 1, uomId: 'uom-3', uomRaw: 'EA', uom: { code: 'EA' }, categoryId: 'cat-3', category: { name: 'Lighting' } },
      ],
    };
    const previous = {
      id: 'revision-old', revisionCode: 'R1', status: 'APPROVED', qualityScore: 70, totalLines: 3,
      lines: [
        { lineNumber: '1', standardDescription: 'Old cable', originalDescription: 'Cable old', quantity: 3, uomId: 'uom-1', uomRaw: 'M', uom: null, categoryId: 'cat-1', category: { name: 'Civil' } },
        { lineNumber: '2', standardDescription: 'Same item', quantity: 1, uomId: 'uom-1', uomRaw: 'EA', uom: { code: 'EA' }, categoryId: 'cat-1', category: { name: 'Civil' } },
        { lineNumber: '4', standardDescription: '', originalDescription: 'Removed item', quantity: 9, uom: null, uomRaw: 'PACK' },
        { lineNumber: '6', standardDescription: 'Removed cable', quantity: 1, uom: { code: 'MTR' }, uomRaw: 'MTR' },
      ],
    };
    db.boqRevision.findFirst.mockResolvedValueOnce(current).mockResolvedValueOnce(previous);
    await expect(compareBoq(request('http://localhost/api/boq/compare?targetRevisionId=revision-old'), params)).resolves.toEqual({
      ok: true,
      data: {
        currentRevision: { id: 'revision-current', revisionCode: 'R2', status: 'DRAFT', qualityScore: 85, totalLines: 4 },
        compareRevision: { id: 'revision-old', revisionCode: 'R1', status: UI_STRINGS.common.aPPROVED, qualityScore: 70, totalLines: 3 },
        availableRevisions: current.boq.revisions,
        summary: { addedCount: 2, removedCount: 2, modifiedCount: 1, unchangedCount: 1 },
        added: [
          { lineNumber: UI_STRINGS.common.copyezvv42, description: 'New item', quantity: 2, uom: 'BOX', category: undefined },
          { lineNumber: UI_STRINGS.common.copydby8y8, description: 'New lamp', quantity: 1, uom: 'EA', category: 'Lighting' },
        ],
        removed: [
          { lineNumber: UI_STRINGS.common.copydlxun7, description: 'Removed item', quantity: 9, uom: 'PACK' },
          { lineNumber: UI_STRINGS.componentsRateCardsSection6ApproverView.copye5x215, description: 'Removed cable', quantity: 1, uom: 'MTR' },
        ],
        modified: [{ lineNumber: UI_STRINGS.common.copyefwnq4, description: 'Changed cable', diffs: [
          { field: 'standardDescription', oldVal: 'Old cable', newVal: 'Changed cable' },
          { field: 'quantity', oldVal: 3, newVal: 5 },
          { field: 'uom', oldVal: 'M', newVal: 'MTR' },
          { field: 'category', oldVal: 'Civil', newVal: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical },
        ] }],
      },
      status: 200,
    });
    expect(db.boqRevision.findFirst).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { id: 'revision-old', tenantId: 'tenant-1' } }));
  });

  it('defaults comparison to the previous revision or itself if there is none', async () => {
    const current = { id: 'revision-current', revisionCode: 'R3', revisionNumber: 3, boq: { revisions: [{ id: 'revision-previous', revisionNumber: 2 }] }, lines: [] };
    const previous = { id: 'revision-previous', revisionCode: 'R2', lines: [] };
    db.boqRevision.findFirst.mockResolvedValueOnce(current).mockResolvedValueOnce(previous);
    await compareBoq(request('http://localhost/api/boq/compare'), params);
    expect(db.boqRevision.findFirst.mock.calls[1][0].where.id).toBe('revision-previous');
    db.boqRevision.findFirst.mockResolvedValueOnce({ ...current, boq: { revisions: [] } }).mockResolvedValueOnce({ id: 'revision-current', lines: [] });
    await compareBoq(request('http://localhost/api/boq/compare'), params);
    expect(db.boqRevision.findFirst.mock.calls[3][0].where.id).toBe('revision-current');
  });
});

describe('RFQ options for auction creation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
  });

  it('returns a filtered RFQ with normalized scope, quotes, and observer candidates', async () => {
    const rfq = {
      id: 'rfq-1', rfqNumber: 'RFQ-1', title: 'Lighting', packageName: 'Lights', status: 'EVALUATED', projectId: 'project-1',
      project: { name: 'Retail Store', projectCode: 'P-1' }, prId: 'pr-1', pr: { prNumber: 'PR-1', title: 'Fitout', costCentre: { name: 'Ground', code: 'CC-1' }, boq: { id: 'boq-1', boqCode: 'BOQ-1' } },
      lines: [
        { id: 'line-1', lineNumber: 1, itemCode: null, description: '', specification: '', category: '', subcategory: '', uom: '', quantity: '2', benchmarkRate: 0, boqLine: null, prLine: { itemDescription: 'Cable', estimatedRate: '15', quantity: 2 } },
        { id: 'line-2', lineNumber: 2, itemCode: 'DIRECT', description: 'Explicit', specification: 'Spec', category: 'Civil', subcategory: 'Floor', uom: 'SQFT', quantity: 1, benchmarkRate: '20', boqLine: { itemCode: 'BOQ-ITEM' }, prLine: null },
        { id: 'line-3', lineNumber: 3, description: '', specification: '', category: '', subcategory: '', uom: '', quantity: 1, benchmarkRate: 0, boqLine: null, prLine: { estimatedRate: 0 } },
      ],
      invitedVendors: [
        { vendorId: 'vendor-1', vendor: { code: 'V1', name: 'Vendor One', email: 'v1@example.test', phone: '111' } },
        { vendorId: 'vendor-2', vendor: { code: 'V2', name: 'Vendor Two', email: 'v2@example.test', phone: '222' } },
        { vendorId: 'vendor-3', vendor: { code: 'V3', name: 'Vendor Three', email: 'v3@example.test', phone: '333' } },
      ],
      quotes: [{ vendorId: 'vendor-1', totalQuoteAmount: '500', quoteNumber: 'Q-1' }, { vendorId: 'vendor-2', totalQuoteAmount: 0, quoteNumber: null }],
    };
    db.rfq.findMany.mockResolvedValueOnce([rfq]);
    const users = [{ id: 'user-2', name: 'Observer' }];
    db.user.findMany.mockResolvedValueOnce(users);
    await expect(getAuctionRfqOptions(request('http://localhost/api/procurement/auctions/rfq-options?rfqId=rfq-1'))).resolves.toMatchObject({
      ok: true,
      data: {
        projectUsers: users,
        rfqs: expect.arrayContaining([expect.objectContaining({
          id: 'rfq-1', projectName: 'Retail Store', prNumber: 'PR-1', costCentre: 'Ground', boqNumber: 'BOQ-1', lowestQuotedAmount: 500,
          lines: expect.arrayContaining([
            expect.objectContaining({ id: 'line-1', lineNumber: 1, itemCode: 'ITEM-1', description: 'Cable', boqDescription: 'Cable', category: 'General', subCategory: '', uom: 'EA', quantity: 2, estimatedRate: 15 }),
            expect.objectContaining({ id: 'line-2', lineNumber: 2, itemCode: 'BOQ-ITEM', description: 'Explicit', boqDescription: 'Spec', category: 'Civil', subCategory: 'Floor', uom: 'SQFT', quantity: 1, estimatedRate: 20 }),
            expect.objectContaining({ id: 'line-3', itemCode: 'ITEM-3', description: 'Scope Line Item', boqDescription: '', category: 'General', subCategory: '', uom: 'EA', estimatedRate: null }),
          ]),
          quotedVendors: expect.arrayContaining([
            expect.objectContaining({ vendorId: 'vendor-1', hasSubmittedQuote: true, quoteAmount: 500, quoteNumber: 'Q-1' }),
            expect.objectContaining({ vendorId: 'vendor-2', hasSubmittedQuote: true, quoteAmount: 0, quoteNumber: null }),
            expect.objectContaining({ vendorId: 'vendor-3', hasSubmittedQuote: false, quoteAmount: null, quoteNumber: null }),
          ]),
        })]),
      },
    });
    expect(db.rfq.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1', id: 'rfq-1' }, take: 1, orderBy: { createdAt: 'desc' } }));
  });

  it('lists up to fifty RFQs without filter and handles optional empty associations and errors', async () => {
    const rfq = { id: 'rfq-empty', rfqNumber: 'RFQ-0', lines: null, invitedVendors: null, quotes: null };
    db.rfq.findMany.mockResolvedValueOnce([rfq]);
    db.user.findMany.mockResolvedValueOnce([]);
    await expect(getAuctionRfqOptions(request('http://localhost/api/procurement/auctions/rfq-options'))).resolves.toMatchObject({ ok: true, data: { rfqs: [expect.objectContaining({ lowestQuotedAmount: null, lines: [], quotedVendors: [] })], projectUsers: [] } });
    expect(db.rfq.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1' }, take: 50 }));
    db.rfq.findMany.mockRejectedValueOnce(new Error('RFQ options unavailable'));
    await expect(getAuctionRfqOptions(request('http://localhost/api/procurement/auctions/rfq-options'))).resolves.toEqual({ ok: false, error: 'RFQ options unavailable', status: 500 });
    db.rfq.findMany.mockRejectedValueOnce({});
    await expect(getAuctionRfqOptions(request('http://localhost/api/procurement/auctions/rfq-options'))).resolves.toEqual({ ok: false, error: 'Failed to fetch RFQ options', status: 500 });
  });
});

describe('PPO completion and actual-cost lineage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
  });

  it('checks access, missing PPO, and cancelled PPO state', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(completePpo(request('http://localhost/api/ppos/ppo-1', {}), ppoParams)).resolves.toBe(denied);
    db.ppo.findFirst.mockResolvedValueOnce(null);
    await expect(completePpo(request('http://localhost/api/ppos/ppo-1', {}), ppoParams)).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementPposIdCompleteRoute.pPOPONotFound, status: 404 });
    db.ppo.findFirst.mockResolvedValueOnce({ status: 'CANCELLED' });
    await expect(completePpo(request('http://localhost/api/ppos/ppo-1', {}), ppoParams)).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementPposIdCompleteRoute.cannotCompleteACancelledOrder, status: 400 });
  });

  it('records explicit line completions, updates line and PPO statuses, and preserves source IDs', async () => {
    const ppo = {
      id: 'ppo-1', ppoNumber: 'PPO-1', status: 'ISSUED', projectId: 'project-1', costCentreId: 'cc-ppo', boqId: 'boq-ppo', boqRevisionId: 'revision-ppo', rfqId: 'rfq-1', vendorId: 'vendor-1',
      lines: [{ id: 'ppo-line-1', orderedQuantity: 3, completedQuantity: 1, orderedUnitRate: 25, completedAmount: 25, costCentreId: null, category: null, subcategory: null, boqId: null, boqRevisionId: null, boqLineId: null, prLineId: null, rfqLineId: null }],
    };
    db.ppo.findFirst.mockResolvedValueOnce(ppo);
    db.actualCostTransaction.count.mockResolvedValueOnce(8);
    const actualTx = { id: 'actual-1' };
    db.actualCostTransaction.create.mockResolvedValueOnce(actualTx);
    db.ppoLine.update.mockResolvedValueOnce({ id: 'ppo-line-1', completedQuantity: 3, status: 'COMPLETED' });
    db.ppoLine.findMany.mockResolvedValueOnce([{ id: 'ppo-line-1', status: 'COMPLETED', completedQuantity: 3 }]);
    const updatedPpo = { id: 'ppo-1', status: 'COMPLETED' };
    db.ppo.update.mockResolvedValueOnce(updatedPpo);
    const body = {
      completionDate: '2025-08-01T00:00:00.000Z', completionReference: 'WCC-1', documents: [{ name: 'signoff.pdf' }], remarks: 'Verified',
      lineCompletions: [{ ppoLineId: 'unknown', completedQuantity: 1 }, { ppoLineId: 'ppo-line-1', completedQuantity: 0 }, { ppoLineId: 'ppo-line-1', completedQuantity: 2, finalRate: 0, actualAmount: 0, taxAmount: 0 }],
    };
    await expect(completePpo(request('http://localhost/api/ppos/ppo-1', body), ppoParams)).resolves.toEqual({
      ok: true, data: { message: 'PPO completion recorded successfully. Generated 1 Actual Cost transaction(s).', ppo: updatedPpo, actualTransactions: [actualTx] }, status: 200,
    });
    expect(db.actualCostTransaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      transactionCode: expect.stringMatching(/^ACT-\d{4}-000009$/), projectId: 'project-1', costCentreId: 'cc-ppo', category: UI_STRINGS.common.general,
      boqId: 'boq-ppo', boqRevisionId: 'revision-ppo', boqLineId: null, prId: null, prLineId: null, rfqId: 'rfq-1', rfqLineId: null,
      ppoId: 'ppo-1', ppoLineId: 'ppo-line-1', vendorId: 'vendor-1', actualQuantity: 2, actualUnitRate: 25, actualAmount: 50,
      taxAmount: 0, totalActualAmount: 50, actualDate: new Date('2025-08-01T00:00:00.000Z'), source: 'PPO_COMPLETION', status: UI_STRINGS.common.aPPROVED,
      completionReference: 'WCC-1', documents: JSON.stringify([{ name: 'signoff.pdf' }]), remarks: UI_STRINGS.common.verified, createdBy: 'Reviewer',
    }) });
    expect(db.ppoLine.update).toHaveBeenCalledWith({ where: { id: 'ppo-line-1' }, data: { completedQuantity: 3, completedAmount: 75, status: 'COMPLETED' } });
    expect(db.ppo.update).toHaveBeenCalledWith({ where: { id: 'ppo-1' }, data: expect.objectContaining({ status: 'COMPLETED', completedAt: expect.any(Date) }), include: { lines: true, actualCosts: true } });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'PPO_COMPLETED', entityId: 'ppo-1', newValue: expect.objectContaining({ status: 'COMPLETED', actualTransactionsCount: 1 }) }));
  });

  it('uses full-line defaults, fallback lineage, and partial completion status', async () => {
    const ppo = {
      id: 'ppo-2', ppoNumber: 'PPO-2', status: 'ISSUED', completedAt: null, projectId: 'project-2', costCentreId: null, boqId: null, boqRevisionId: null, rfqId: 'rfq-2', vendorId: 'vendor-2',
      rfq: { prId: 'pr-2', boqRevisionId: 'revision-rfq', boqRevision: { boqId: 'boq-rfq' } },
      lines: [{ id: 'ppo-line-2', orderedQuantity: 5, completedQuantity: 2, orderedUnitRate: 10, completedAmount: 20, costCentreId: null, category: 'Civil', subcategory: 'Floor', boqId: null, boqRevisionId: null, boqLineId: 'boq-line-2', prLineId: 'pr-line-2', rfqLineId: 'rfq-line-2' }],
    };
    db.ppo.findFirst.mockResolvedValueOnce(ppo);
    db.actualCostTransaction.count.mockResolvedValueOnce(0);
    db.actualCostTransaction.create.mockResolvedValueOnce({ id: 'actual-2' });
    db.ppoLine.update.mockResolvedValueOnce({ id: 'ppo-line-2', status: 'PARTIALLY_COMPLETED' });
    db.ppoLine.findMany.mockResolvedValueOnce([{ id: 'ppo-line-2', status: 'PARTIALLY_COMPLETED', completedQuantity: 3 }]);
    db.ppo.update.mockResolvedValueOnce({ id: 'ppo-2', status: 'PARTIALLY_COMPLETED' });
    await completePpo(request('http://localhost/api/ppos/ppo-2', { lineCompletions: [] }), ppoParams);
    expect(db.actualCostTransaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      costCentreId: null, category: 'Civil', subcategory: 'Floor', boqId: 'boq-rfq', boqRevisionId: 'revision-rfq', boqLineId: 'boq-line-2',
      prId: 'pr-2', prLineId: 'pr-line-2', rfqLineId: 'rfq-line-2', actualQuantity: 3, actualUnitRate: 10, actualAmount: 30,
      completionReference: 'WCC-PPO-2', documents: null, remarks: 'Full order line completion',
    }) });
    expect(db.ppoLine.update).toHaveBeenCalledWith({ where: { id: 'ppo-line-2' }, data: { completedQuantity: 5, completedAmount: 50, status: 'COMPLETED' } });
    expect(db.ppo.update).toHaveBeenCalledWith({ where: { id: 'ppo-2' }, data: { status: 'PARTIALLY_COMPLETED', completedAt: null }, include: { lines: true, actualCosts: true } });
  });

  it('uses explicit line lineage, string documents, and default identity and completion metadata', async () => {
    auth.mockResolvedValueOnce({ tenantId: 'tenant-1', userId: 'user-2', role: 'CLIENT_ADMIN' });
    const ppo = {
      id: 'ppo-4', ppoNumber: 'PPO-4', status: 'ISSUED', projectId: 'project-4', rfqId: 'rfq-4', vendorId: 'vendor-4',
      lines: [{
        id: 'line-4', orderedQuantity: 10, completedQuantity: 0, orderedUnitRate: 9, completedAmount: 0, costCentreId: 'line-cc', category: 'Electrical',
        subcategory: 'Cable', boqId: 'line-boq', boqRevisionId: 'line-revision', boqLineId: 'line-boq-line', prLineId: 'line-pr-line', rfqLineId: 'line-rfq-line',
      }],
    };
    db.ppo.findFirst.mockResolvedValueOnce(ppo);
    db.actualCostTransaction.count.mockResolvedValueOnce(1);
    db.actualCostTransaction.create.mockResolvedValueOnce({ id: 'actual-4' });
    db.ppoLine.update.mockResolvedValueOnce({ id: 'line-4', status: 'PARTIALLY_COMPLETED' });
    db.ppoLine.findMany.mockResolvedValueOnce([{ id: 'line-4', status: 'PARTIALLY_COMPLETED', completedQuantity: 2 }]);
    db.ppo.update.mockResolvedValueOnce({ id: 'ppo-4', status: 'PARTIALLY_COMPLETED' });
    await completePpo(request('http://localhost/api/ppos/ppo-4', {
      completionDate: '', documents: 'signed.pdf', lineCompletions: [{ ppoLineId: 'line-4', completedQuantity: 2, finalRate: 5, actualAmount: 4 }],
    }), ppoParams);
    expect(db.actualCostTransaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      costCentreId: 'line-cc', boqId: 'line-boq', boqRevisionId: 'line-revision', boqLineId: 'line-boq-line', prLineId: 'line-pr-line', rfqLineId: 'line-rfq-line',
      actualQuantity: 2, actualUnitRate: 5, actualAmount: 4, totalActualAmount: 4, actualDate: expect.any(Date), documents: 'signed.pdf',
      completionReference: 'WCC-PPO-4', remarks: 'PPO milestone completion verified', createdBy: 'System User',
    }) });
    expect(db.ppoLine.update).toHaveBeenCalledWith({ where: { id: 'line-4' }, data: { completedQuantity: 2, completedAmount: 4, status: 'PARTIALLY_COMPLETED' } });
  });

  it('handles malformed JSON and empty completion lists without changing an untouched PPO', async () => {
    const malformedRequest = new NextRequest('http://localhost/api/ppos/ppo-1', { method: 'POST', body: 'not-json' });
    const ppo = { id: 'ppo-3', ppoNumber: 'PPO-3', status: 'ISSUED', completedAt: null, projectId: 'project-3', rfqId: null, vendorId: 'vendor-3', lines: [] };
    db.ppo.findFirst.mockResolvedValueOnce(ppo);
    db.ppoLine.findMany.mockResolvedValueOnce([]);
    db.ppo.update.mockResolvedValueOnce(ppo);
    await expect(completePpo(malformedRequest, ppoParams)).resolves.toMatchObject({ ok: true, data: { actualTransactions: [] } });
    expect(db.ppo.update).toHaveBeenCalledWith({ where: { id: 'ppo-3' }, data: { status: 'ISSUED', completedAt: null }, include: { lines: true, actualCosts: true } });
    db.ppo.findFirst.mockRejectedValueOnce(new Error('completion failed'));
    await expect(completePpo(request('http://localhost/api/ppos/ppo-1', {}), ppoParams)).resolves.toEqual({ ok: false, error: 'completion failed', status: 500 });
    db.ppo.findFirst.mockRejectedValueOnce({});
    await expect(completePpo(request('http://localhost/api/ppos/ppo-1', {}), ppoParams)).resolves.toEqual({ ok: false, error: 'Failed to complete PPO', status: 500 });
  });
});
