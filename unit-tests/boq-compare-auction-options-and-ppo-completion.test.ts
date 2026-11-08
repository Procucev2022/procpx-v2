import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { GET as compareBoq } from '../src/app/api/boq/[revisionId]/compare/route';
import { GET as getAuctionRfqOptions } from '../src/app/api/procurement/auctions/rfq-options/route';
import { POST as completePpo } from '../src/app/api/procurement/ppos/[id]/complete/route';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { MAX_PPO_COMPLETION_LINES, MAX_PPO_CREATE_LINES } from '../src/lib/d1-batch.constants';


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    boqRevision: { findFirst: jest.fn() },
    rfq: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
    ppo: { findFirst: jest.fn(), update: jest.fn() },
    ppoLine: { update: jest.fn(), findMany: jest.fn() },
    actualCostTransaction: { count: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  getListPageWindow: (searchParams: URLSearchParams) => {
    const rawPage = Number(searchParams.get('page'));
    const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 1_000_000) : 1;
    const rawPageSize = Number(searchParams.get('pageSize'));
    const pageSize = Number.isSafeInteger(rawPageSize) && rawPageSize > 0 ? Math.min(rawPageSize, 100) : 50;
    return { page, pageSize, skip: (page - 1) * pageSize };
  },
}));
jest.mock('../src/lib/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1', userName: 'Reviewer', role: 'CLIENT_ADMIN' };
const request = (url: string, body?: unknown, idempotencyKey = 'completion-request-1') => new NextRequest(url, {
  method: body === undefined ? 'GET' : 'POST',
  ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(body) }),
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
    await expect(getAuctionRfqOptions(request('http://localhost/api/procurement/auctions/rfq-options?rfqId=rfq-1'))).resolves.toMatchObject({
      ok: true,
      data: {
        projectUsers: [],
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
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it('lists up to fifty RFQs without filter and handles optional empty associations and errors', async () => {
    const rfq = {
      id: 'rfq-summary', rfqNumber: 'RFQ-0', title: 'Lighting package', packageName: 'Lighting',
      projectId: 'project-1', prId: 'pr-1',
      project: { id: 'project-1', name: 'Plant', projectCode: 'P-1' },
      pr: { id: 'pr-1', prNumber: 'PR-1', title: 'Electrical', costCentre: { id: 'cc-1', name: 'Ground', code: 'CC-1' }, boq: { id: 'boq-1', boqCode: 'BOQ-1', title: 'BOQ' } },
      _count: { invitedVendors: 2 },
    };
    db.rfq.findMany.mockResolvedValueOnce([rfq]);
    db.user.findMany.mockResolvedValueOnce([]);
    await expect(getAuctionRfqOptions(request('http://localhost/api/procurement/auctions/rfq-options'))).resolves.toMatchObject({
      ok: true,
      data: {
        rfqs: [expect.objectContaining({
          id: 'rfq-summary',
          projectName: 'Plant', projectCode: 'P-1', prNumber: 'PR-1', prTitle: 'Electrical',
          costCentre: 'Ground', boqId: 'boq-1', boqNumber: 'BOQ-1', quotedVendorCount: 2,
        })],
        rfqPage: 1, rfqPageSize: 50, rfqHasMore: false,
        projectUsers: [], projectUsersPage: 1, projectUsersPageSize: 50, projectUsersHasMore: false,
      },
    });
    expect(db.rfq.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1' },
      skip: 0,
      take: 51,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: expect.objectContaining({ id: true, _count: { select: { invitedVendors: true } } }),
    }));
    expect(db.user.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: 0, take: 51,
    }));
    db.rfq.findMany.mockRejectedValueOnce(new Error('RFQ options unavailable'));
    await expect(getAuctionRfqOptions(request('http://localhost/api/procurement/auctions/rfq-options'))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchRfqOptions, status: 500 });
    db.rfq.findMany.mockRejectedValueOnce({});
    await expect(getAuctionRfqOptions(request('http://localhost/api/procurement/auctions/rfq-options'))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchRfqOptions, status: 500 });
  });

  it('returns only a bounded tenant-scoped observer page when requested', async () => {
    const observers = Array.from({ length: 3 }, (_, index) => ({ id: `observer-${index + 1}`, name: `Observer ${index + 1}` }));
    db.user.findMany.mockResolvedValueOnce(observers);
    await expect(getAuctionRfqOptions(request('http://localhost/api/procurement/auctions/rfq-options?usersOnly=true&page=2&pageSize=2'))).resolves.toEqual({
      ok: true,
      data: {
        projectUsers: observers.slice(0, 2),
        projectUsersPage: 2,
        projectUsersPageSize: 2,
        projectUsersHasMore: true,
      },
      status: 200,
    });
    expect(db.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', role: { in: ['PROJECT_USER', 'PROJECT_APPROVER'] }, status: 'ACTIVE' },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: 2,
      take: 3,
    }));
    expect(db.rfq.findMany).not.toHaveBeenCalled();
  });

  it('keeps the RFQ summary page bounded and reports when another page exists', async () => {
    db.rfq.findMany.mockResolvedValueOnce([
      { id: 'rfq-page-2', rfqNumber: 'RFQ-2', _count: { invitedVendors: 0 } },
      { id: 'rfq-page-2-extra', rfqNumber: 'RFQ-3', _count: { invitedVendors: 0 } },
    ]);
    await expect(getAuctionRfqOptions(request('http://localhost/api/procurement/auctions/rfq-options?rfqPage=2&rfqPageSize=1&includeObservers=false'))).resolves.toMatchObject({
      ok: true,
      data: {
        rfqs: [expect.objectContaining({ id: 'rfq-page-2' })],
        rfqPage: 2, rfqPageSize: 1, rfqHasMore: true,
        projectUsers: [], projectUsersHasMore: false,
      },
    });
    expect(db.rfq.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 1, take: 2 }));
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it('covers empty selected-RFQ associations and rejects callers without auction access', async () => {
    db.rfq.findMany.mockResolvedValueOnce([{ id: 'rfq-empty-detail', lines: null, invitedVendors: null, quotes: null }]);
    await expect(getAuctionRfqOptions(request('http://localhost/api/procurement/auctions/rfq-options?rfqId=rfq-empty-detail&includeObservers=false'))).resolves.toMatchObject({
      ok: true,
      data: {
        rfqs: [expect.objectContaining({ lowestQuotedAmount: null, lines: [], quotedVendors: [], quotedVendorCount: 0 })],
        projectUsers: [],
      },
    });
    expect(db.user.findMany).not.toHaveBeenCalled();

    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(getAuctionRfqOptions(request('http://localhost/api/procurement/auctions/rfq-options'))).resolves.toBe(denied);
  });
});

describe('PPO completion and actual-cost lineage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.actualCostTransaction.findMany.mockReset().mockResolvedValue([]);
    (writeD1BatchAtomically as jest.Mock).mockReset().mockResolvedValue(Array.from({ length: 8 }, () => ({ meta: { changes: 1 } })));
  });

  it('checks access, missing PPO, and cancelled PPO state', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(completePpo(request('http://localhost/api/ppos/ppo-1', {}), ppoParams)).resolves.toBe(denied);
    db.ppo.findFirst.mockResolvedValueOnce(null);
    await expect(completePpo(request('http://localhost/api/ppos/ppo-1', {}), ppoParams)).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementPposIdCompleteRoute.pPOPONotFound, status: 404 });
    db.ppo.findFirst.mockResolvedValueOnce({ id: 'ppo-1', status: 'CANCELLED' });
    await expect(completePpo(request('http://localhost/api/ppos/ppo-1', {}), ppoParams)).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementPposIdCompleteRoute.cannotCompleteACancelledOrder, status: 400 });
    await expect(completePpo(request('http://localhost/api/ppos/ppo-1', {}, 'bad'), ppoParams)).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementPposIdCompleteRoute.completionRequestIdempotencyKeyRequired, status: 400,
    });
  });

  it('records explicit line completions with source lineage in one idempotent D1 batch', async () => {
    const ppo = {
      id: 'ppo-1', ppoNumber: 'PPO-1', status: 'ISSUED', projectId: 'project-1', costCentreId: 'cc-ppo', boqId: 'boq-ppo', boqRevisionId: 'revision-ppo', rfqId: 'rfq-1', vendorId: 'vendor-1',
      lines: [{ id: 'ppo-line-1', status: 'ISSUED', uom: 'EA', orderedQuantity: 3, completedQuantity: 1, orderedUnitRate: 25, completedAmount: 25, costCentreId: null, category: null, subcategory: null, boqId: null, boqRevisionId: null, boqLineId: null, prLineId: null, rfqLineId: null }],
    };
    db.ppo.findFirst.mockResolvedValueOnce(ppo);
    const updatedPpo = { id: 'ppo-1', status: 'COMPLETED' };
    const actualTx = { id: 'actual-1' };
    db.actualCostTransaction.findMany.mockResolvedValueOnce([]).mockImplementationOnce(async () => {
      const batch = (writeD1BatchAtomically as jest.Mock).mock.calls[0][0] as Array<{ values: unknown[] }>;
      return [{ ...actualTx, completionFingerprint: batch[1].values.at(-1) }];
    });
    db.ppo.findFirst.mockResolvedValueOnce(updatedPpo);
    const body = {
      completionDate: '2025-08-01T00:00:00.000Z', completionReference: 'WCC-1', documents: [{ name: 'signoff.pdf' }], remarks: 'Verified',
      lineCompletions: [{ ppoLineId: 'ppo-line-1', completedQuantity: 2, finalRate: 0, actualAmount: 0, taxAmount: 0 }],
    };
    await expect(completePpo(request('http://localhost/api/ppos/ppo-1', body), ppoParams)).resolves.toEqual({
      ok: true, data: { message: 'PPO completion recorded successfully. Generated 1 Actual Cost transaction(s).', ppo: updatedPpo, actualTransactions: [expect.objectContaining({ id: 'actual-1' })] }, status: 200,
    });
    const batch = (writeD1BatchAtomically as jest.Mock).mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(batch).toHaveLength(4);
    for (const statement of batch) expect(statement.sql.match(/\?/g)?.length || 0).toBe(statement.values.length);
    expect(batch[0].sql).toContain('"completedQuantity" = ?');
    expect(batch[0].values).toEqual(expect.arrayContaining([3, 25, 'COMPLETED', 'ppo-line-1', 'tenant-1', 'ppo-1', 1, 25, 2]));
    expect(batch[1].sql).toContain('MAX(CAST(substr("transactionCode", -6) AS INTEGER))');
    expect(batch[1].values).toEqual(expect.arrayContaining(['project-1', 'cc-ppo', 'General', 'boq-ppo', 'revision-ppo', 'ppo-1', 'ppo-line-1', 'vendor-1', 'EA', 2, 0, 0, 0, 'WCC-1', JSON.stringify([{ name: 'signoff.pdf' }]), 'Verified', 'user-1', 'Reviewer', 'completion-request-1']));
    expect(batch[3].sql).toContain('WHERE changes() = 1');
    expect(db.ppoLine.update).not.toHaveBeenCalled();
    expect(db.ppo.update).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    expect(db.actualCostTransaction.findMany).toHaveBeenNthCalledWith(1, {
      where: { tenantId: 'tenant-1', ppoId: 'ppo-1', completionRequestId: 'completion-request-1' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: MAX_PPO_COMPLETION_LINES + 1,
    });
    expect(db.ppo.findFirst).toHaveBeenNthCalledWith(2, {
      where: { id: 'ppo-1', tenantId: 'tenant-1' },
      include: { lines: { orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }], take: MAX_PPO_CREATE_LINES + 1 } },
    });
  });

  it('uses full-line defaults, fallback lineage, and partial completion status', async () => {
    const ppo = {
      id: 'ppo-2', ppoNumber: 'PPO-2', status: 'ISSUED', completedAt: null, projectId: 'project-2', costCentreId: null, boqId: null, boqRevisionId: null, rfqId: 'rfq-2', vendorId: 'vendor-2',
      rfq: { prId: 'pr-2', boqRevisionId: 'revision-rfq', boqRevision: { boqId: 'boq-rfq' } },
      lines: [{ id: 'ppo-line-2', status: 'PARTIALLY_COMPLETED', uom: 'M2', orderedQuantity: 5, completedQuantity: 2, orderedUnitRate: 10, completedAmount: 20, costCentreId: null, category: 'Civil', subcategory: 'Floor', boqId: null, boqRevisionId: null, boqLineId: 'boq-line-2', prLineId: 'pr-line-2', rfqLineId: 'rfq-line-2' }],
    };
    db.ppo.findFirst.mockResolvedValueOnce(ppo);
    db.actualCostTransaction.findMany.mockResolvedValueOnce([]).mockImplementationOnce(async () => {
      const batch = (writeD1BatchAtomically as jest.Mock).mock.calls[0][0] as Array<{ values: unknown[] }>;
      return [{ id: 'actual-2', completionFingerprint: batch[1].values.at(-1) }];
    });
    db.ppo.findFirst.mockResolvedValueOnce({ id: 'ppo-2', status: 'PARTIALLY_COMPLETED' });
    await completePpo(request('http://localhost/api/ppos/ppo-2', {}), ppoParams);
    const batch = (writeD1BatchAtomically as jest.Mock).mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(batch[0].values).toContain(5);
    expect(batch[1].values).toEqual(expect.arrayContaining(['Civil', 'Floor', 'boq-rfq', 'revision-rfq', 'boq-line-2', 'pr-2', 'pr-line-2', 'rfq-2', 'rfq-line-2', 'M2', 3, 10, 30, 'WCC-PPO-2', 'Full order line completion']));
    expect(batch[2].sql).toContain("'PARTIALLY_COMPLETED'");
  });

  it('replays an idempotent request and rejects duplicate, unknown, and over-completed lines', async () => {
    const ppo = { id: 'ppo-5', ppoNumber: 'PPO-5', status: 'ISSUED', projectId: 'project-5', rfqId: 'rfq-5', vendorId: 'vendor-5', lines: [
      { id: 'line-5', status: 'ISSUED', uom: 'EA', orderedQuantity: 5, completedQuantity: 0, orderedUnitRate: 10, completedAmount: 0 },
    ] };
    const body = { lineCompletions: [{ ppoLineId: 'line-5', completedQuantity: 2 }] };
    const actualTx = { id: 'actual-5' };
    const updatedPpo = { id: 'ppo-5', status: 'PARTIALLY_COMPLETED' };
    db.ppo.findFirst.mockResolvedValueOnce(ppo).mockResolvedValue(updatedPpo);
    db.actualCostTransaction.findMany.mockResolvedValueOnce([]).mockImplementationOnce(async () => {
      const batch = (writeD1BatchAtomically as jest.Mock).mock.calls[0][0] as Array<{ values: unknown[] }>;
      return [{ ...actualTx, completionFingerprint: batch[1].values.at(-1) }];
    }).mockImplementationOnce(async () => {
      const batch = (writeD1BatchAtomically as jest.Mock).mock.calls[0][0] as Array<{ values: unknown[] }>;
      return [{ ...actualTx, completionFingerprint: batch[1].values.at(-1) }];
    }).mockResolvedValueOnce([{ ...actualTx, completionFingerprint: 'different-fingerprint' }]);
    await completePpo(request('http://localhost/api/ppos/ppo-5', body), ppoParams);
    await expect(completePpo(request('http://localhost/api/ppos/ppo-5', body), ppoParams)).resolves.toMatchObject({ ok: true, data: { ppo: updatedPpo } });
    expect(writeD1BatchAtomically).toHaveBeenCalledTimes(1);
    await expect(completePpo(request('http://localhost/api/ppos/ppo-5', { ...body, remarks: 'different payload' }), ppoParams)).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementPposIdCompleteRoute.completionRequestKeyReusedWithDifferentData, status: 409,
    });

    db.ppo.findFirst.mockResolvedValueOnce(ppo);
    await expect(completePpo(request('http://localhost/api/ppos/ppo-5', { lineCompletions: [
      { ppoLineId: 'line-5', completedQuantity: 1 }, { ppoLineId: 'line-5', completedQuantity: 1 },
    ] }, 'duplicate-line-key'), ppoParams)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
    db.ppo.findFirst.mockResolvedValueOnce(ppo);
    await expect(completePpo(request('http://localhost/api/ppos/ppo-5', { lineCompletions: [{ ppoLineId: 'missing-line', completedQuantity: 1 }] }, 'unknown-line-key'), ppoParams)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
    db.ppo.findFirst.mockResolvedValueOnce(ppo);
    await expect(completePpo(request('http://localhost/api/ppos/ppo-5', { lineCompletions: [{ ppoLineId: 'line-5', completedQuantity: 6 }] }, 'over-complete-key'), ppoParams)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
  });

  it('bounds replay reads and logs unexpected duplicate completion rows', async () => {
    db.ppo.findFirst.mockResolvedValueOnce({
      id: 'ppo-replay-overflow', ppoNumber: 'PPO-OVERFLOW', status: 'ISSUED', lines: [],
    });
    db.actualCostTransaction.findMany.mockResolvedValueOnce(Array.from(
      { length: MAX_PPO_COMPLETION_LINES + 1 },
      (_, index) => ({ id: `actual-${index}` }),
    ));

    const overflowParams = { params: Promise.resolve({ id: 'ppo-replay-overflow' }) };
    await expect(completePpo(request('http://localhost/api/ppos/ppo-replay-overflow', {}), overflowParams)).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToCompletePpo, status: 500,
    });
    expect(db.actualCostTransaction.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', ppoId: 'ppo-replay-overflow', completionRequestId: 'completion-request-1' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: MAX_PPO_COMPLETION_LINES + 1,
    });
    expect(writeStructuredLog).toHaveBeenCalledWith('error', 'procurement.ppo_completion_replay_limit_exceeded', expect.objectContaining({
      operation: 'replay_completion', tenantId: 'tenant-1', ppoId: 'ppo-replay-overflow',
      transactionCount: MAX_PPO_COMPLETION_LINES + 1, maximumTransactions: MAX_PPO_COMPLETION_LINES,
    }), 'next');
    expect(writeD1BatchAtomically).not.toHaveBeenCalled();
  });

  it('fails closed and logs when an existing PPO exceeds the safe completion line bound', async () => {
    const ppoId = 'ppo-line-overflow';
    db.ppo.findFirst.mockResolvedValueOnce({
      id: ppoId,
      status: 'ISSUED',
      lines: Array.from({ length: MAX_PPO_CREATE_LINES + 1 }, (_, index) => ({ id: `line-${index + 1}` })),
    });

    await expect(completePpo(request(`http://localhost/api/ppos/${ppoId}`, {}), {
      params: Promise.resolve({ id: ppoId }),
    })).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToCompletePpo, status: 500,
    });
    expect(db.ppo.findFirst).toHaveBeenCalledWith({
      where: { id: ppoId, tenantId: 'tenant-1' },
      include: {
        lines: { orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }], take: MAX_PPO_CREATE_LINES + 1 },
        project: true,
        rfq: { include: { pr: true, boqRevision: true } },
      },
    });
    expect(writeStructuredLog).toHaveBeenCalledWith('error', 'procurement.ppo_line_limit_exceeded', expect.objectContaining({
      operation: 'complete_ppo', tenantId: 'tenant-1', userId: 'user-1', ppoId,
      observedLineCountAtLeast: MAX_PPO_CREATE_LINES + 1, maximumLines: MAX_PPO_CREATE_LINES,
    }), 'application');
    expect(db.actualCostTransaction.findMany).not.toHaveBeenCalled();
    expect(writeD1BatchAtomically).not.toHaveBeenCalled();
  });

  it('fails closed if a PPO exceeds its line bound between completion and replay reads', async () => {
    const ppoId = 'ppo-replay-line-growth';
    const ppo = {
      id: ppoId, ppoNumber: 'PPO-REPLAY-GROWTH', status: 'ISSUED', projectId: 'project-1',
      costCentreId: null, boqId: null, boqRevisionId: null, rfqId: null, vendorId: 'vendor-1',
      lines: [{ id: 'line-1', status: 'ISSUED', uom: 'EA', orderedQuantity: 1, completedQuantity: 0, orderedUnitRate: 10, completedAmount: 0 }],
    };
    const lineCompletions = { lineCompletions: [{ ppoLineId: 'line-1', completedQuantity: 1 }] };
    db.ppo.findFirst
      .mockResolvedValueOnce(ppo)
      .mockResolvedValueOnce({ id: ppoId, status: 'COMPLETED' })
      .mockResolvedValueOnce(ppo)
      .mockResolvedValueOnce({ ...ppo, lines: Array.from({ length: MAX_PPO_CREATE_LINES + 1 }, (_, index) => ({ id: `line-${index + 1}` })) });
    db.actualCostTransaction.findMany.mockResolvedValueOnce([]).mockImplementationOnce(async () => {
      const batch = (writeD1BatchAtomically as jest.Mock).mock.calls[0][0] as Array<{ values: unknown[] }>;
      return [{ id: 'actual-replay-growth', completionFingerprint: batch[1].values.at(-1) }];
    }).mockImplementationOnce(async () => {
      const batch = (writeD1BatchAtomically as jest.Mock).mock.calls[0][0] as Array<{ values: unknown[] }>;
      return [{ id: 'actual-replay-growth', completionFingerprint: batch[1].values.at(-1) }];
    });

    await expect(completePpo(request(`http://localhost/api/ppos/${ppoId}`, lineCompletions), {
      params: Promise.resolve({ id: ppoId }),
    })).resolves.toMatchObject({ ok: true });
    await expect(completePpo(request(`http://localhost/api/ppos/${ppoId}`, lineCompletions), {
      params: Promise.resolve({ id: ppoId }),
    })).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToCompletePpo, status: 500,
    });
    expect(db.ppo.findFirst).toHaveBeenLastCalledWith({
      where: { id: ppoId, tenantId: 'tenant-1' },
      include: { lines: { orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }], take: MAX_PPO_CREATE_LINES + 1 } },
    });
    expect(writeStructuredLog).toHaveBeenCalledWith('error', 'procurement.ppo_line_limit_exceeded', expect.objectContaining({
      operation: 'replay_completion', tenantId: 'tenant-1', ppoId,
      observedLineCountAtLeast: MAX_PPO_CREATE_LINES + 1, maximumLines: MAX_PPO_CREATE_LINES,
    }), 'application');
    expect(writeD1BatchAtomically).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid completion envelopes, statuses, dates, and line collections', async () => {
    await expect(completePpo(request('http://localhost/api/ppos/ppo-1', []), ppoParams)).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400,
    });

    db.ppo.findFirst.mockResolvedValueOnce({ id: 'ppo-1', status: 'DRAFT', lines: [] });
    await expect(completePpo(request('http://localhost/api/ppos/ppo-1', {}), ppoParams)).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementPposIdCompleteRoute.completionCannotBeRecordedInCurrentStatus, status: 409,
    });

    const ppo = { id: 'ppo-1', status: 'ISSUED', lines: [] };
    db.ppo.findFirst.mockResolvedValueOnce(ppo);
    await expect(completePpo(request('http://localhost/api/ppos/ppo-1', { completionDate: 123 }), ppoParams)).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.invalidDate, status: 400,
    });
    db.ppo.findFirst.mockResolvedValueOnce(ppo);
    await expect(completePpo(request('http://localhost/api/ppos/ppo-1', { lineCompletions: 'invalid' }), ppoParams)).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400,
    });
    db.ppo.findFirst.mockResolvedValueOnce(ppo);
    await expect(completePpo(request('http://localhost/api/ppos/ppo-1', {
      lineCompletions: Array.from({ length: MAX_PPO_COMPLETION_LINES + 1 }, () => ({})),
    }), ppoParams)).resolves.toMatchObject({ ok: false, status: 400 });
    db.ppo.findFirst.mockResolvedValueOnce(ppo);
    await expect(completePpo(request('http://localhost/api/ppos/ppo-1', { lineCompletions: [null] }), ppoParams)).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400,
    });
  });

  it('accepts a body idempotency key and string documents when the authenticated display name is absent', async () => {
    const ppo = {
      id: 'ppo-body-key', ppoNumber: 'PPO-BODY-KEY', status: 'ISSUED', projectId: 'project-1', rfqId: null, vendorId: 'vendor-1',
      lines: [{ id: 'line-body-key', status: 'ISSUED', uom: 'EA', orderedQuantity: 2, completedQuantity: 0,
        orderedUnitRate: 10, completedAmount: 0 }],
    };
    const body = { idempotencyKey: 'body-key-001', documents: 'signed-documents', lineCompletions: [
      { ppoLineId: 'line-body-key', completedQuantity: 1 },
    ] };
    auth.mockResolvedValueOnce({ ...context, userName: '' });
    db.ppo.findFirst.mockResolvedValueOnce(ppo).mockResolvedValueOnce({ id: ppo.id, status: 'PARTIALLY_COMPLETED' });
    db.actualCostTransaction.findMany.mockResolvedValueOnce([]).mockImplementationOnce(async () => {
      const batch = (writeD1BatchAtomically as jest.Mock).mock.calls[0][0] as Array<{ values: unknown[] }>;
      return [{ id: 'actual-body-key', completionFingerprint: batch[1].values.at(-1) }];
    });
    const bodyRequest = new NextRequest('http://localhost/api/ppos/ppo-body-key', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });

    await expect(completePpo(bodyRequest, { params: Promise.resolve({ id: ppo.id }) })).resolves.toMatchObject({ ok: true });
    const batch = (writeD1BatchAtomically as jest.Mock).mock.calls[0][0] as Array<{ values: unknown[] }>;
    expect(batch[1].values).toContain('System User');
    expect(batch[1].values).toContain('signed-documents');
    expect(db.actualCostTransaction.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', ppoId: ppo.id, completionRequestId: body.idempotencyKey },
    }));
  });

  it('returns a refresh conflict when the completion batch cannot be confirmed', async () => {
    const ppo = {
      id: 'ppo-unconfirmed', ppoNumber: 'PPO-UNCONFIRMED', status: 'ISSUED', projectId: 'project-1', rfqId: null, vendorId: 'vendor-1',
      lines: [{ id: 'line-unconfirmed', status: 'ISSUED', uom: 'EA', orderedQuantity: 2, completedQuantity: 0,
        orderedUnitRate: 10, completedAmount: 0 }],
    };
    db.ppo.findFirst.mockResolvedValueOnce(ppo);
    db.actualCostTransaction.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(completePpo(request('http://localhost/api/ppos/ppo-unconfirmed', {
      lineCompletions: [{ ppoLineId: 'line-unconfirmed', completedQuantity: 1 }],
    }), { params: Promise.resolve({ id: ppo.id }) })).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409,
    });
  });

  it('returns not found if an idempotent replay loses its PPO after a matching completion record', async () => {
    const ppo = {
      id: 'ppo-replay-missing', ppoNumber: 'PPO-REPLAY-MISSING', status: 'ISSUED', projectId: 'project-1', rfqId: null, vendorId: 'vendor-1',
      lines: [{ id: 'line-replay-missing', status: 'ISSUED', uom: 'EA', orderedQuantity: 2, completedQuantity: 0,
        orderedUnitRate: 10, completedAmount: 0 }],
    };
    const body = { lineCompletions: [{ ppoLineId: 'line-replay-missing', completedQuantity: 1 }] };
    db.ppo.findFirst.mockResolvedValueOnce(ppo).mockResolvedValueOnce({ id: ppo.id, status: 'PARTIALLY_COMPLETED' })
      .mockResolvedValueOnce(ppo).mockResolvedValueOnce(null);
    db.actualCostTransaction.findMany.mockResolvedValueOnce([]).mockImplementationOnce(async () => {
      const batch = (writeD1BatchAtomically as jest.Mock).mock.calls[0][0] as Array<{ values: unknown[] }>;
      return [{ id: 'actual-replay', completionFingerprint: batch[1].values.at(-1) }];
    }).mockImplementationOnce(async () => {
      const batch = (writeD1BatchAtomically as jest.Mock).mock.calls[0][0] as Array<{ values: unknown[] }>;
      return [{ id: 'actual-replay', completionFingerprint: batch[1].values.at(-1) }];
    });

    const routeParams = { params: Promise.resolve({ id: ppo.id }) };
    await completePpo(request('http://localhost/api/ppos/ppo-replay-missing', body), routeParams);
    await expect(completePpo(request('http://localhost/api/ppos/ppo-replay-missing', body), routeParams)).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementPposIdCompleteRoute.pPOPONotFound, status: 404,
    });
  });

  it('preserves the original completion error if replay diagnostics also fail', async () => {
    db.ppo.findFirst.mockResolvedValueOnce({ id: 'ppo-replay-failure', status: 'ISSUED', lines: [] });
    db.actualCostTransaction.findMany.mockRejectedValueOnce(new Error('initial replay read failed'))
      .mockRejectedValueOnce(new Error('diagnostic replay read failed'));

    await expect(completePpo(request('http://localhost/api/ppos/ppo-replay-failure', {}), {
      params: Promise.resolve({ id: 'ppo-replay-failure' }),
    })).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToCompletePpo, status: 500 });
    expect(writeStructuredLog).toHaveBeenCalledWith('error', 'procurement.ppo_completion_failed', expect.objectContaining({
      tenantId: 'tenant-1', ppoId: 'ppo-replay-failure',
    }));
  });

  it('validates empty and malformed completions and returns safe logged provider failures', async () => {
    const malformedRequest = new NextRequest('http://localhost/api/ppos/ppo-1', { method: 'POST', body: 'not-json' });
    await expect(completePpo(malformedRequest, ppoParams)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
    const ppo = { id: 'ppo-3', ppoNumber: 'PPO-3', status: 'ISSUED', completedAt: null, projectId: 'project-3', rfqId: null, vendorId: 'vendor-3', lines: [] };
    db.ppo.findFirst.mockResolvedValueOnce(ppo);
    await expect(completePpo(request('http://localhost/api/ppos/ppo-3', { lineCompletions: [] }), ppoParams)).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementPposIdCompleteRoute.noValidPpoLinesToComplete, status: 400,
    });
    db.ppo.findFirst.mockRejectedValueOnce(new Error('completion failed'));
    await expect(completePpo(request('http://localhost/api/ppos/ppo-1', {}), ppoParams)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToCompletePpo, status: 500 });
    db.ppo.findFirst.mockRejectedValueOnce({});
    await expect(completePpo(request('http://localhost/api/ppos/ppo-1', {}), ppoParams)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToCompletePpo, status: 500 });
  });
});
