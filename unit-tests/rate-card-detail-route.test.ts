import { NextRequest } from 'next/server';
import { DELETE, GET, PUT } from '../src/app/api/procurement/rate-cards/[id]/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { MAX_RATE_CARD_ITEMS } from '../src/lib/d1-batch.constants';
import { MAX_RATE_CARD_NOTES_LENGTH, MAX_RATE_CARD_TEXT_LENGTH } from '../src/app/api/procurement/rate-cards/route.constants';


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    vendorRateCard: { findFirst: jest.fn(), update: jest.fn(), delete: jest.fn() },
    vendorRateCardItem: { update: jest.fn(), deleteMany: jest.fn() },
    rateCardApproval: { deleteMany: jest.fn() },
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
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn().mockResolvedValue(undefined) }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
const writeBatch = writeD1BatchAtomically as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1', userName: 'Manager', userEmail: 'manager@example.test' };
const params = (id = 'rc-1') => ({ params: Promise.resolve({ id }) });
const request = (body: unknown) => new NextRequest('http://localhost/api/procurement/rate-cards/rc-1', {
  method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const card = (overrides: Record<string, any> = {}) => ({
  id: 'rc-1', tenantId: 'tenant-1', vendorId: 'vendor-1', rateCardNumber: 'RC-001', title: 'Cable rates', status: 'DRAFT',
  category: 'Electrical', subcategory: 'Wire', scope: 'Supply', location: 'North', version: 1,
  validFrom: new Date('2026-01-01'), validTo: new Date('2026-12-31'), terms: 'Net 30', notes: null,
  justification: 'Annual sourcing', comparisonNotes: 'Benchmark review', items: [], approvals: [],
  vendor: { id: 'vendor-1', name: 'Acme', code: 'AC', email: 'acme@example.test' }, ...overrides,
});

describe('rate card detail API', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.vendorRateCard.findFirst.mockReset().mockResolvedValue(card());
    db.vendorRateCard.update.mockReset().mockImplementation(async ({ data }: any) => ({ ...card(), ...data }));
    db.vendorRateCard.delete.mockReset().mockResolvedValue({ id: 'rc-1' });
    db.vendorRateCardItem.update.mockReset().mockResolvedValue({});
    db.vendorRateCardItem.deleteMany.mockReset().mockResolvedValue({ count: 2 });
    db.rateCardApproval.deleteMany.mockReset().mockResolvedValue({ count: 1 });
    writeBatch.mockReset().mockImplementation(async (statements: Array<{ sql: string; values: unknown[] }>) => statements.map((statement) => {
      if (statement.sql.includes('DELETE FROM "vendor_rate_card_items"')) return { meta: { changes: 0 } };
      if (statement.sql.includes('UPDATE "vendor_rate_card_items"')
        || statement.sql.includes('INSERT INTO "vendor_rate_card_items"')) {
        return { meta: { changes: JSON.parse(String(statement.values[0])).length } };
      }
      return { meta: { changes: 1 } };
    }));
    db.notification.create.mockReset().mockResolvedValue({ id: 'notification-1' });
    audit.mockReset().mockResolvedValue(undefined);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('saves buyer offer two drafts with a guarded D1 batch and preserves item metadata', async () => {
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'ROUND_1_VENDOR_QUOTE', items: [
      { id: 'i1', comparisonRef: JSON.stringify({ buyerOffer1: 70, vendorQuote1: 90 }) },
      { id: 'i2', comparisonRef: JSON.stringify({ legacyNote: 'preserve this context' }) },
    ] }));
    await expect(PUT(request({ action: 'SAVE_BUYER_OFFER_2_DRAFT', remarks: 'Reviewing final rates', items: [
      { id: 'i1', buyerOffer2: '80', remarks: 'Within target' }, { id: 'i2', buyerOffer2: 75 },
    ] }), params())).resolves.toMatchObject({ ok: true, data: { rateCard: { status: 'ROUND_1_VENDOR_QUOTE' } } });

    const draftBatch = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(draftBatch).toHaveLength(3);
    expect(draftBatch[0].sql).toContain("'ROUND_1_VENDOR_QUOTE'");
    expect(draftBatch[1].sql).toContain('UPDATE "vendor_rate_card_items"');
    expect(draftBatch[2].sql).toContain('INSERT INTO "audit_logs"');
    expect(JSON.parse(String(draftBatch[1].values[0]))).toEqual([
      { id: 'i1', comparisonRef: JSON.stringify({ buyerOffer1: 70, vendorQuote1: 90, buyerOffer2: 80, remarks: 'Within target' }) },
      { id: 'i2', comparisonRef: JSON.stringify({ legacyNote: 'preserve this context', buyerOffer2: 75 }) },
    ]);
    expect(db.vendorRateCardItem.update).not.toHaveBeenCalled();
    expect(db.vendorRateCard.update).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();

    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'DRAFT', items: [{ id: 'i1' }] }));
    await expect(PUT(request({ action: 'SAVE_BUYER_OFFER_2_DRAFT', items: [{ id: 'i1', buyerOffer2: 80 }] }), params()))
      .resolves.toMatchObject({ ok: false, status: 400 });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'ROUND_1_VENDOR_QUOTE', items: [{ id: 'i1' }] }));
    await expect(PUT(request({ action: 'SAVE_BUYER_OFFER_2_DRAFT', items: [{ id: 'unknown', buyerOffer2: 80 }] }), params()))
      .resolves.toMatchObject({ ok: false, status: 400 });
    expect(writeBatch).toHaveBeenCalledTimes(1);
  });

  it('returns enriched detail with parsed comparison metadata and safe defaults', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(new NextRequest('http://localhost/api/procurement/rate-cards/rc-1'), params())).resolves.toBe(denied);

    db.vendorRateCard.findFirst.mockResolvedValueOnce(null);
    await expect(GET(new NextRequest('http://localhost/api/procurement/rate-cards/rc-1'), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rateCardNotFound, status: 404 });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(null);
    await expect(GET(new NextRequest('http://localhost/api/procurement/rate-cards/rc-1'), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rateCardNotFound, status: 404 });

    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'APPROVED', notes: JSON.stringify({ agreement: { signature: 'signed.pdf' } }), items: [
      { id: 'i1', rate: 80, proposedRate: 90, historicalRate: 70, benchmarkRate: 100, minQuantity: 5,
        comparisonRef: JSON.stringify({ buyerOffer1: 75, vendorQuote1: 85, buyerOffer2: 78, vendorQuote2: 82,
          finalAgreedRate: 80, previousPpoRate: 65, referenceQty: 10, remarks: 'Matched' }) },
      { id: 'i2', rate: 40, proposedRate: 45, historicalRate: null, benchmarkRate: 0, minQuantity: 0, comparisonRef: '{bad json' },
      { id: 'i3', rate: 20, proposedRate: 25, comparisonRef: null },
    ] }));
    await expect(GET(new NextRequest('http://localhost/api/procurement/rate-cards/rc-1'), params())).resolves.toMatchObject({ ok: true, data: {
      rateCard: { agreement: { signature: 'signed.pdf' }, items: [
        { id: 'i1', buyerOffer1: 75, vendorQuote1: 85, buyerOffer2: 78, vendorQuote2: 82, finalAgreedRate: 80,
          previousPpoRate: 65, referenceQty: 10, remarks: 'Matched', variance: -20 },
        { id: 'i2', buyerOffer1: 40, vendorQuote1: 45, buyerOffer2: null, vendorQuote2: null,
          finalAgreedRate: 40, referenceQty: 1, remarks: '', variance: 0 },
        { id: 'i3', finalAgreedRate: 20, referenceQty: 1, remarks: '' },
      ] },
    } });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'DRAFT', notes: '{bad json', items: [
      { id: 'fallback-item', rate: 30, proposedRate: 0, comparisonRef: null },
    ] }));
    await expect(GET(new NextRequest('http://localhost/api/procurement/rate-cards/rc-1'), params())).resolves.toMatchObject({ ok: true, data: {
      rateCard: { agreement: null, items: [{ id: 'fallback-item', buyerOffer1: 30, vendorQuote1: 0, finalAgreedRate: null, remarks: '' }] },
    } });
    expect(writeStructuredLog).toHaveBeenCalledWith('warn', 'rate_card.stored_metadata_invalid', expect.objectContaining({
      rateCardId: 'rc-1', invalidFieldCount: 1, invalidFields: [{ recordId: 'i2', field: 'comparisonRef' }],
    }));
    expect(writeStructuredLog).toHaveBeenCalledWith('warn', 'rate_card.stored_metadata_invalid', expect.objectContaining({
      rateCardId: 'rc-1', invalidFieldCount: 1, invalidFields: [{ recordId: 'rc-1', field: 'notes' }],
    }));
    db.vendorRateCard.findFirst.mockRejectedValueOnce(new Error('read detail failed'));
    await expect(GET(new NextRequest('http://localhost/api/procurement/rate-cards/rc-1'), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchRateCard, status: 500 });
    db.vendorRateCard.findFirst.mockRejectedValueOnce({});
    await expect(GET(new NextRequest('http://localhost/api/procurement/rate-cards/rc-1'), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchRateCard, status: 500 });
  });

  it('bounds approval history in detail and exposes the stable older-page cursor', async () => {
    const approvals = Array.from({ length: 26 }, (_, index) => {
      const sequence = 25 - index;
      return {
        id: `approval-${sequence}`,
        level: 'LEVEL_1_PROJECT',
        approverName: `Approver ${sequence}`,
        action: 'APPROVED',
        remarks: `Decision ${sequence}`,
        timestamp: new Date(Date.UTC(2026, 3, 2, 10, 0, sequence)),
      };
    });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ approvals }));

    const result = await GET(new NextRequest('http://localhost/api/procurement/rate-cards/rc-1'), params());
    expect(result).toMatchObject({
      ok: true,
      data: { rateCard: {
        approvals: approvals.slice(0, 25),
        approvalHistory: { hasMore: true, nextCursor: '2026-04-02T10:00:01.000Z~approval-1', pageSize: 25 },
      } },
    });
    const resultData = result as { data?: { rateCard?: { approvals?: unknown[] } } };
    expect(resultData.data?.rateCard?.approvals).toHaveLength(25);
    expect(db.vendorRateCard.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: 'rc-1', tenantId: 'tenant-1' },
      include: expect.objectContaining({ approvals: expect.objectContaining({
        orderBy: [{ timestamp: 'desc' }, { id: 'desc' }], take: 26,
        select: { id: true, level: true, approverName: true, action: true, remarks: true, timestamp: true },
      }) }),
    }));
  });

  it('submits buyer offer two atomically, rejects unknown rows, and clears signed evidence', async () => {
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({
      status: 'ROUND_1_VENDOR_QUOTE',
      notes: JSON.stringify({ agreement: { signature: 'old-signature', status: 'SIGNED' }, round2: { preserved: true } }),
      items: [{ id: 'i1', comparisonRef: JSON.stringify({ existing: 'keep' }) }, { id: 'i2', comparisonRef: JSON.stringify({ legacyNote: 'keep' }) }],
    }));
    const result = await PUT(request({ action: 'SUBMIT_BUYER_OFFER_2', remarks: 'Best and final', items: [
      { id: 'i1', buyerOffer2: '80', remarks: 'Reduced' }, { id: 'i2', buyerOffer2: 70 },
    ] }), params());
    expect(result).toMatchObject({ ok: true, data: { message: 'Buyer RC Offer-2 successfully submitted to vendor!' } });
    const buyerOfferBatch = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(buyerOfferBatch).toHaveLength(4);
    expect(buyerOfferBatch[0].sql).toContain("'ROUND_2_BUYER_OFFER'");
    const itemUpdates = JSON.parse(String(buyerOfferBatch[1].values[0]));
    expect(itemUpdates).toEqual([
      { id: 'i1', comparisonRef: JSON.stringify({ existing: 'keep', buyerOffer2: 80, remarks: 'Reduced' }) },
      { id: 'i2', comparisonRef: JSON.stringify({ legacyNote: 'keep', buyerOffer2: 70 }) },
    ]);
    expect(buyerOfferBatch[2].sql).toContain('INSERT INTO "audit_logs"');
    expect(buyerOfferBatch[3].sql).toContain('notification_outbox');
    const savedNotes = JSON.parse(String(buyerOfferBatch[0].values[0]));
    expect(savedNotes).toMatchObject({ currentRound: 2, agreement: { signature: null, status: 'DRAFT' },
      round2: { preserved: true, buyerOffer2Actor: 'Manager', buyerOffer2Remarks: 'Best and final' } });
    expect(db.vendorRateCardItem.update).not.toHaveBeenCalled();
    expect(db.vendorRateCard.update).not.toHaveBeenCalled();
    expect(db.notification.create).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();

    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'ROUND_1_VENDOR_QUOTE', items: [{ id: 'i1' }] }));
    await expect(PUT(request({ action: 'SUBMIT_BUYER_OFFER_2', items: [{ id: 'missing', buyerOffer2: 60 }] }), params()))
      .resolves.toMatchObject({ ok: false, status: 400 });

    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'ROUND_1_VENDOR_QUOTE', notes: '{bad json', items: [{ id: 'i1', comparisonRef: null }] }));
    await expect(PUT(request({ action: 'SUBMIT_BUYER_OFFER_2', items: [{ id: 'i1', buyerOffer2: 50 }] }), params()))
      .resolves.toMatchObject({ ok: false, error: UI_STRINGS.common.userMessages.failedToUpdateRateCard, status: 500 });
    expect(writeBatch).toHaveBeenCalledTimes(1);
    expect(writeStructuredLog).toHaveBeenCalledWith('error', 'rate_card.workflow_metadata_invalid', expect.objectContaining({
      rateCardId: 'rc-1', field: 'notes', action: 'SUBMIT_BUYER_OFFER_2',
    }));
  });

  it('accepts final vendor rates from the newest quote, prior quote, or existing rate', async () => {
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'ROUND_2_VENDOR_QUOTE', terms: 'Accepted terms', items: [
      { id: 'i2', rate: 50, proposedRate: 40, comparisonRef: JSON.stringify({ vendorQuote2: '35' }) },
      { id: 'i1', rate: 60, proposedRate: 45, comparisonRef: JSON.stringify({ vendorQuote1: 42 }) },
      { id: 'i3', rate: 70, proposedRate: 55, comparisonRef: null },
    ] }));
    await expect(PUT(request({ action: 'ACCEPT_FINAL_VENDOR_OFFER', totalAgreedValue: 1000, remarks: 'Approved' }), params())).resolves.toMatchObject({
      ok: true, data: { message: expect.stringContaining('accepted successfully') },
    });
    const acceptBatch = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(acceptBatch).toHaveLength(4);
    expect(acceptBatch[0].sql).toContain('FINAL_VENDOR_OFFER_ACCEPTED');
    expect(JSON.parse(String(acceptBatch[1].values[0]))).toEqual([
      { id: 'i2', rate: 35, comparisonRef: JSON.stringify({ vendorQuote2: '35', finalAgreedRate: 35 }) },
      { id: 'i1', rate: 42, comparisonRef: JSON.stringify({ vendorQuote1: 42, finalAgreedRate: 42 }) },
      { id: 'i3', rate: 55, comparisonRef: JSON.stringify({ finalAgreedRate: 55 }) },
    ]);
    expect(acceptBatch[2].values).toContain('RATE_CARD_FINAL_VENDOR_OFFER_ACCEPTED');
    expect(acceptBatch[3].sql).toContain('notification_outbox');
    expect(db.vendorRateCardItem.update).not.toHaveBeenCalled();
    expect(db.vendorRateCard.update).not.toHaveBeenCalled();
    expect(db.notification.create).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('accepts valid category manager statuses, signs off vendor acceptance, and rejects invalid transitions', async () => {
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'DRAFT' }));
    await expect(PUT(request({ action: 'CATEGORY_MANAGER_ACCEPT' }), params())).resolves.toEqual({ ok: false, error: 'Cannot perform Category Manager Acceptance from status: DRAFT', status: 400 });

    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'ROUND_2_VENDOR_QUOTE', notes: JSON.stringify({ priorNote: 'preserve' }) }));
    await expect(PUT(request({ action: 'CATEGORY_MANAGER_ACCEPT', agreement: { required: true, file: 'terms.pdf' }, remarks: 'Reviewed' }), params())).resolves.toMatchObject({
      ok: true, data: { message: expect.stringContaining('Vendor final acceptance is now required') },
    });
    const acceptBatch = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(acceptBatch).toHaveLength(3);
    expect(acceptBatch[0].sql).toContain('CATEGORY_MANAGER_ACCEPTED');
    expect(JSON.parse(String(acceptBatch[0].values[0]))).toMatchObject({
      agreement: { required: true, file: 'terms.pdf' }, categoryManagerAccepted: { actor: 'Manager', remarks: 'Reviewed', hasAgreement: true },
    });
    expect(acceptBatch[1].values).toContain('RATE_CARD_CATEGORY_MANAGER_ACCEPTED');
    expect(acceptBatch[2].sql).toContain('notification_outbox');

    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'CATEGORY_MANAGER_ACCEPTED' }));
    await expect(PUT(request({ action: 'CATEGORY_MANAGER_SIGNOFF' }), params())).resolves.toMatchObject({ ok: false, error: expect.stringContaining('requires prior Vendor Acceptance') });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'VENDOR_ACCEPTED', notes: null }));
    await expect(PUT(request({ action: 'CATEGORY_MANAGER_SIGNOFF' }), params())).resolves.toMatchObject({ ok: true });
    const signoffBatch = writeBatch.mock.calls[1][0] as Array<{ sql: string; values: unknown[] }>;
    expect(signoffBatch).toHaveLength(3);
    expect(signoffBatch[0].sql).toContain('PENDING_PROJECT_APPROVAL');
    expect(signoffBatch[0].values).toEqual(expect.arrayContaining(['Manager', 'tenant-1', 'rc-1']));
    expect(signoffBatch[1].values).toContain('RATE_CARD_CM_SIGNED_OFF');
    expect(signoffBatch[2].sql).toContain('notification_outbox');
    expect(db.notification.create).not.toHaveBeenCalled();
  });

  it('updates editable rate cards atomically and retains IDs for existing items', async () => {
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ items: [
      { id: 'keep-id', createdAt: new Date('2026-01-01') },
    ] }));
    await expect(PUT(request({ title: 'Updated schedule', category: 'Power', subcategory: null, scope: 'Supply & install',
      location: 'South', version: 'v7', validFrom: '2026-02-01', validTo: '2026-10-01', terms: 'COD', notes: 'Buyer note',
      justification: 'Urgent', comparisonNotes: 'Checked', status: 'DRAFT', items: [
        { id: 'keep-id', description: 'Cable', rate: '50', proposedRate: '45', historicalRate: '40', benchmarkRate: '60', minQuantity: 2,
          maxQuantity: 10, itemCode: 'CBL', specification: '4 core', category: '', subcategory: '', uom: '', comparisonRef: '{}' },
        { description: 'Panel', rate: 0 },
      ] }), params())).resolves.toMatchObject({ ok: true, data: { rateCard: { title: 'Updated schedule', status: 'DRAFT' } } });
    const detailsBatch = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(detailsBatch).toHaveLength(4);
    expect(detailsBatch[0].sql).toContain('updatedAt" IS ?');
    expect(detailsBatch[0].values).toContain('DRAFT');
    expect(detailsBatch[1].sql).toContain('DELETE FROM "vendor_rate_card_items"');
    expect(detailsBatch[2].sql).toContain('ON CONFLICT ("id") DO UPDATE');
    const rows = JSON.parse(String(detailsBatch[2].values[0]));
    expect(rows[0]).toMatchObject({ id: 'keep-id', itemCode: 'CBL', uom: 'Nos', rate: 50, proposedRate: 45,
      historicalRate: 40, benchmarkRate: 60, minQuantity: 2, maxQuantity: 10, location: 'South', isActive: true });
    expect(rows[1]).toMatchObject({ itemCode: null, rate: 0, proposedRate: 0, historicalRate: null,
      benchmarkRate: null, minQuantity: 1, maxQuantity: null });
    expect(detailsBatch[3].sql).toContain('INSERT INTO "audit_logs"');
    expect(db.vendorRateCardItem.deleteMany).not.toHaveBeenCalled();
    expect(db.vendorRateCard.update).not.toHaveBeenCalled();

    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'RETURNED_FOR_CORRECTION' }));
    await expect(PUT(request({ title: '', validFrom: '', terms: undefined }), params())).resolves.toMatchObject({ ok: true });
    const unchangedBatch = writeBatch.mock.calls[1][0] as Array<{ sql: string; values: unknown[] }>;
    expect(unchangedBatch[0].values).toContain('Cable rates');

    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'NEGOTIATION' }));
    await expect(PUT(request({ version: 5, items: [{ description: 'No category', rate: '', proposedRate: undefined }] }), params())).resolves.toMatchObject({ ok: true });
    const addItemBatch = writeBatch.mock.calls[2][0] as Array<{ sql: string; values: unknown[] }>;
    expect(JSON.parse(String(addItemBatch[2].values[0]))[0]).toMatchObject({
      category: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical, subcategory: 'Wire', rate: 0, proposedRate: 0,
    });

    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'APPROVED' }));
    await expect(PUT(request({ title: 'blocked' }), params())).resolves.toEqual({ ok: false, error: 'Rate Card cannot be edited in status: APPROVED', status: 400 });

    db.vendorRateCard.findFirst.mockResolvedValueOnce(card());
    await expect(PUT(request({ status: 'APPROVED' }), params())).resolves.toMatchObject({ ok: false, status: 400 });
  });

  it('deletes draft cards only and maps PUT/DELETE failures to API errors', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(DELETE(new NextRequest('http://localhost/api/procurement/rate-cards/rc-1'), params())).resolves.toBe(denied);

    db.vendorRateCard.findFirst.mockResolvedValueOnce(null);
    await expect(DELETE(new NextRequest('http://localhost/api/procurement/rate-cards/rc-1'), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rateCardNotFound, status: 404 });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'APPROVED' }));
    await expect(DELETE(new NextRequest('http://localhost/api/procurement/rate-cards/rc-1'), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementRateCardsIdRoute.onlyDraftRateCardsCanBeDeleted, status: 400 });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card());
    await expect(DELETE(new NextRequest('http://localhost/api/procurement/rate-cards/rc-1'), params())).resolves.toEqual({ ok: true, data: { message: UI_STRINGS.appApiProcurementRateCardsIdRoute.rateCardDeletedSuccessfully }, status: 200 });
    const deleteBatch = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(deleteBatch).toHaveLength(2);
    expect(deleteBatch[0].sql).toContain('RATE_CARD_DRAFT_DELETED');
    expect(deleteBatch[1].sql).toContain('DELETE FROM "vendor_rate_cards"');
    expect(deleteBatch[0].values).toContain('tenant-1');

    db.vendorRateCard.findFirst.mockRejectedValueOnce(new Error('delete failure'));
    await expect(DELETE(new NextRequest('http://localhost/api/procurement/rate-cards/rc-1'), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToDeleteRateCard, status: 500 });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'ROUND_2_VENDOR_QUOTE' }));
    writeBatch.mockRejectedValueOnce(new Error('update failure'));
    await expect(PUT(request({ action: 'CATEGORY_MANAGER_ACCEPT' }), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToUpdateRateCard, status: 500 });
    const badJson = { json: jest.fn().mockRejectedValue(new Error('bad request')), headers: new Headers() } as unknown as NextRequest;
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card());
    await expect(PUT(badJson, params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToUpdateRateCard, status: 500 });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('rejects unauthorized and inaccessible PUT requests before reading their bodies', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(PUT(request({}), params())).resolves.toBe(denied);
    db.vendorRateCard.findFirst.mockResolvedValueOnce(null);
    await expect(PUT(request({}), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rateCardNotFound, status: 404 });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(null);
    await expect(PUT(request({}), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rateCardNotFound, status: 404 });
  });

  it('covers malformed bodies, workflow validation and guarded batch conflicts', async () => {
    await expect(PUT(request(null), params())).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(PUT(request({ payload: 'x'.repeat(MAX_RATE_CARD_NOTES_LENGTH) }), params())).resolves.toMatchObject({ ok: false, status: 400 });

    await expect(PUT(request({ action: 'SAVE_BUYER_OFFER_2_DRAFT', items: [{ id: 'i1', buyerOffer2: 5 }] }), params()))
      .resolves.toMatchObject({ ok: false, status: 400 });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'ROUND_1_VENDOR_QUOTE', items: [{ id: 'i1', comparisonRef: '{}' }] }));
    await expect(PUT(request({ action: 'SAVE_BUYER_OFFER_2_DRAFT', items: [] }), params())).resolves.toMatchObject({ ok: false, status: 400 });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'ROUND_1_VENDOR_QUOTE', items: [{ id: 'i1', comparisonRef: '{}' }] }));
    await expect(PUT(request({ action: 'SAVE_BUYER_OFFER_2_DRAFT', items: [{ id: '', buyerOffer2: 5 }] }), params())).resolves.toMatchObject({ ok: false, status: 400 });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'ROUND_1_VENDOR_QUOTE', items: [{ id: 'i1', comparisonRef: '{}' }] }));
    await expect(PUT(request({ action: 'SAVE_BUYER_OFFER_2_DRAFT', items: [
      { id: 'i1', buyerOffer2: 5 }, { id: 'i1', buyerOffer2: 6 },
    ] }), params())).resolves.toMatchObject({ ok: false, status: 400 });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'ROUND_1_VENDOR_QUOTE', items: [{ id: 'i1', comparisonRef: '{bad' }] }));
    await expect(PUT(request({ action: 'SAVE_BUYER_OFFER_2_DRAFT', items: [{ id: 'i1', buyerOffer2: 5 }] }), params()))
      .resolves.toMatchObject({ ok: false, status: 500 });

    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'ROUND_1_VENDOR_QUOTE', items: [{ id: 'i1', comparisonRef: '{}' }] }));
    writeBatch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    await expect(PUT(request({ action: 'SAVE_BUYER_OFFER_2_DRAFT', items: [{ id: 'i1', buyerOffer2: 5 }] }), params()))
      .resolves.toMatchObject({ ok: false, status: 409 });

    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'ROUND_1_VENDOR_QUOTE', items: [{ id: 'i1', comparisonRef: '{}' }] }));
    await expect(PUT(request({ action: 'SUBMIT_BUYER_OFFER_2', items: [{ id: 'i1', buyerOffer2: -1 }] }), params()))
      .resolves.toMatchObject({ ok: false, status: 400 });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'ROUND_1_VENDOR_QUOTE', items: [{ id: 'i1', comparisonRef: '{}' }] }));
    writeBatch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    await expect(PUT(request({ action: 'SUBMIT_BUYER_OFFER_2', items: [{ id: 'i1', buyerOffer2: 5 }] }), params()))
      .resolves.toMatchObject({ ok: false, status: 409 });

    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'ROUND_1_VENDOR_QUOTE', items: [{ id: 'i1', comparisonRef: '{}' }] }));
    await expect(PUT(request({ action: 'SUBMIT_BUYER_OFFER_2', items: [] }), params())).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(PUT(request({ action: 'SUBMIT_BUYER_OFFER_2', items: [{ id: 'i1', buyerOffer2: 5 }] }), params())).resolves.toMatchObject({ ok: false, status: 400 });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'ROUND_1_VENDOR_QUOTE', items: [{ id: 'i1', comparisonRef: '{}' }] }));
    await expect(PUT(request({ action: 'SUBMIT_BUYER_OFFER_2', items: [{ id: '', buyerOffer2: 5 }] }), params())).resolves.toMatchObject({ ok: false, status: 400 });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'ROUND_1_VENDOR_QUOTE', items: [{ id: 'i1', comparisonRef: '{bad' }] }));
    await expect(PUT(request({ action: 'SUBMIT_BUYER_OFFER_2', items: [{ id: 'i1', buyerOffer2: 5 }] }), params()))
      .resolves.toMatchObject({ ok: false, status: 500 });

    await expect(PUT(request({ action: 'ACCEPT_FINAL_VENDOR_OFFER', roundNumber: 3 }), params()))
      .resolves.toMatchObject({ ok: false, status: 400 });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'ROUND_2_VENDOR_QUOTE', items: [] }));
    await expect(PUT(request({ action: 'ACCEPT_FINAL_VENDOR_OFFER' }), params())).resolves.toMatchObject({ ok: false, status: 400 });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'ROUND_2_VENDOR_QUOTE', items: [{ id: 'i1', comparisonRef: '{bad' }] }));
    await expect(PUT(request({ action: 'ACCEPT_FINAL_VENDOR_OFFER' }), params())).resolves.toMatchObject({ ok: false, status: 500 });
  });

  it('covers agreement, signoff and standard detail update input guards', async () => {
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'ROUND_2_VENDOR_QUOTE' }));
    await expect(PUT(request({ action: 'CATEGORY_MANAGER_ACCEPT', remarks: 4 }), params())).resolves.toMatchObject({ ok: false, status: 400 });
    auth.mockResolvedValueOnce({ ...context, userName: '', userEmail: '' });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'ROUND_2_VENDOR_QUOTE' }));
    await expect(PUT(request({ action: 'CATEGORY_MANAGER_ACCEPT' }), params())).resolves.toMatchObject({ ok: true });
    expect(JSON.parse(String(writeBatch.mock.calls[0][0][0].values[0])).categoryManagerAccepted.actor).toBe('Category Manager');
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'VENDOR_ACCEPTED' }));
    await expect(PUT(request({ action: 'CATEGORY_MANAGER_SIGNOFF', remarks: false }), params())).resolves.toMatchObject({ ok: false, status: 400 });

    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'APPROVED' }));
    await expect(PUT(request({}), params())).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(PUT(request({ title: 'Changed', status: 'APPROVED' }), params())).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(PUT(request({ title: 42 }), params())).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(PUT(request({ version: 'invalid' }), params())).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(PUT(request({ validFrom: 123 }), params())).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(PUT(request({ validFrom: '2027-01-01', validTo: '2026-01-01' }), params())).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(PUT(request({ items: {} }), params())).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(PUT(request({ items: Array.from({ length: MAX_RATE_CARD_ITEMS + 1 }, (_, index) => ({ description: `Line ${index}` })) }), params()))
      .resolves.toMatchObject({ ok: false, status: 400 });
    await expect(PUT(request({ items: [null] }), params())).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(PUT(request({ items: [{ description: 'Cable', id: 'not-existing' }] }), params())).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(PUT(request({ items: [{ description: 'Cable', rate: -1 }] }), params())).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(PUT(request({ items: [{ description: 'Cable', specification: 'x'.repeat(MAX_RATE_CARD_TEXT_LENGTH + 1) }] }), params()))
      .resolves.toMatchObject({ ok: false, status: 400 });
  });

  it('returns a conflict when a guarded draft delete no longer matches', async () => {
    writeBatch.mockResolvedValueOnce([{ meta: { changes: 1 } }, { meta: { changes: 0 } }]);
    await expect(DELETE(new NextRequest('http://localhost/api/procurement/rate-cards/rc-1'), params()))
      .resolves.toMatchObject({ ok: false, status: 409 });
  });
});
