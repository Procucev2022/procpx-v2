import { NextRequest } from 'next/server';
import { GET, POST } from '../src/app/api/procurement/rate-cards/route';
import { prisma } from '../src/lib/prisma';
import { apiError, apiSuccess, isApiContext, requireAuth } from '../src/lib/api-utils';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { dispatchPreparedWorkflowNotification } from '../src/lib/notifications';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { RATE_CARD_AUDIT_INSERT_AFTER_CREATE_SQL, RATE_CARD_INSERT_IF_VENDOR_VALID_SQL, RATE_CARD_ITEMS_INSERT_JSON_AFTER_CARD_SQL } from '../src/lib/d1-batch.constants';
import { MAX_RATE_CARD_ITEMS } from '../src/lib/d1-batch.constants';
import { UI_STRINGS } from '../src/lib/ui-strings.constants';
import {
  MAX_RATE_CARD_NOTES_LENGTH,
  MAX_RATE_CARD_TERMS_LENGTH,
  MAX_RATE_CARD_TEXT_LENGTH,
} from '../src/app/api/procurement/rate-cards/route.constants';


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    vendorRateCard: { findMany: jest.fn(), count: jest.fn(), groupBy: jest.fn(), findFirst: jest.fn() },
    vendor: { findFirst: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
}));
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/notifications', () => ({ dispatchPreparedWorkflowNotification: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const rawQuery = (prisma as unknown as { $queryRaw: jest.Mock }).$queryRaw;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const successResult = apiSuccess as jest.Mock;
const errorResult = apiError as jest.Mock;
const batch = writeD1BatchAtomically as jest.Mock;
const dispatchPrepared = dispatchPreparedWorkflowNotification as jest.Mock;
const structuredLog = writeStructuredLog as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'buyer-1', userName: '', userEmail: 'buyer@example.com', role: 'FINANCE' };

function getRequest(query = '') {
  return { url: `http://localhost/api/procurement/rate-cards${query}`, headers: new Headers() } as unknown as NextRequest;
}

function postRequest(body: unknown) {
  return { json: jest.fn().mockResolvedValue(body), headers: new Headers() } as unknown as NextRequest;
}

const requiredBody = {
  vendorId: 'vendor-1', title: 'Electrical rate card', category: 'Electrical',
  validFrom: '2026-01-01', validTo: '2027-01-01',
};

describe('procurement rate cards route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.vendorRateCard.findMany.mockResolvedValue([]);
    db.vendorRateCard.count.mockResolvedValue(0);
    db.vendorRateCard.groupBy.mockResolvedValue([]);
    rawQuery.mockResolvedValue([]);
    db.vendorRateCard.findFirst.mockResolvedValue({
      id: 'rate-card-1', tenantId: 'tenant-1', vendorId: 'vendor-1', rateCardNumber: `VRC-${new Date().getFullYear()}-000001`,
      vendor: { id: 'vendor-1', code: 'V-1', name: 'Northwind Electrical' }, items: [], approvals: [],
    });
    db.vendor.findFirst.mockResolvedValue({ id: 'vendor-1', name: 'Northwind Electrical' });
    batch.mockReset().mockImplementation(async (statements: Array<{ sql: string; values: unknown[] }>) => statements.map((statement, index) => ({
      success: true, meta: { changes: index === 1 ? JSON.parse(String(statement.values[0])).length : 1 },
    })));
    dispatchPrepared.mockReset().mockResolvedValue(undefined);
    structuredLog.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('rejects unauthorized list and create requests and validates required create fields', async () => {
    const denied = { ok: false, status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(getRequest())).resolves.toBe(denied);

    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(postRequest(requiredBody))).resolves.toBe(denied);

    await expect(POST(postRequest({ ...requiredBody, validTo: '' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementRateCardsRoute.vendorIDTitleCategoryValidFromAndValidToAreRequired, status: 400,
    });
    expect(batch).not.toHaveBeenCalled();
  });

  it('filters and paginates tenant rate cards while formatting metadata, validity, and expiry', async () => {
    const cards = [
      {
        id: 'approved-1', status: 'APPROVED', validFrom: new Date('2020-01-01'), validTo: new Date('2099-01-01'),
        notes: JSON.stringify({ agreement: 'Signed framework' }),
      },
      {
        id: 'expired-1', status: 'EXPIRED', validFrom: new Date('2020-01-01'), validTo: new Date('2020-02-01'),
        notes: '{invalid',
      },
      {
        id: 'draft-1', status: 'DRAFT', validFrom: new Date('2099-01-01'), validTo: new Date('2099-02-01'),
        notes: null,
      },
    ];
    db.vendorRateCard.findMany.mockResolvedValue(cards);
    rawQuery.mockResolvedValueOnce([
      { rateCardId: 'approved-1', itemCount: 1, totalBuyerOffer: 312, totalVendorQuote: 332, invalidComparisonRefCount: 0 },
      { rateCardId: 'expired-1', itemCount: 1, totalBuyerOffer: 50, totalVendorQuote: 55, invalidComparisonRefCount: 1 },
      { rateCardId: 'draft-1', itemCount: 0, totalBuyerOffer: 0, totalVendorQuote: 0, invalidComparisonRefCount: 0 },
    ]);
    db.vendorRateCard.count.mockResolvedValue(12);
    db.vendorRateCard.groupBy.mockResolvedValue([
      { status: 'APPROVED', _count: { _all: 3 } },
      { status: 'PENDING_PROJECT_APPROVAL', _count: { _all: 4 } },
      { status: 'PENDING_FINANCE_APPROVAL', _count: { _all: 2 } },
      { status: 'DRAFT', _count: { _all: 3 } },
    ]);

    const result = await GET(getRequest('?vendorId=vendor-1&status=APPROVED&category=Electrical&search=panel&page=0&limit=3'));
    expect(result).toMatchObject({ ok: true, data: {
      total: 12, page: 1, pageSize: 3, totalPages: 4, hasMore: true,
      summary: { finalised: 3, inProgress: 9, level1Pending: 4, level2Pending: 2 },
    } });
    expect(db.vendorRateCard.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tenantId: 'tenant-1', vendorId: 'vendor-1', status: UI_STRINGS.common.aPPROVED, category: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical,
        OR: [
          { rateCardNumber: { contains: 'panel' } }, { title: { contains: 'panel' } },
          { category: { contains: 'panel' } }, { vendor: { name: { contains: 'panel' } } },
        ],
      },
      skip: 0, take: 3, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }));
    const listInclude = db.vendorRateCard.findMany.mock.calls.at(-1)?.[0]?.include;
    expect(listInclude).not.toHaveProperty('approvals');
    expect(listInclude).not.toHaveProperty('items');
    const data = (result as any).data.rateCards;
    expect(data[0]).toMatchObject({ isValid: true, isExpired: false, itemCount: 1, totalBuyerOffer: 312, totalVendorQuote: 332, agreement: 'Signed framework' });
    expect(data[0]).not.toHaveProperty('items');
    expect(data[1]).toMatchObject({ isValid: false, isExpired: true, itemCount: 1, totalBuyerOffer: 50, totalVendorQuote: 55, agreement: null });
    expect(data[2]).toMatchObject({ isValid: false, isExpired: false, itemCount: 0, agreement: null });
    const summaryQuery = rawQuery.mock.calls.at(-1)?.[0] as { sql: string; values: unknown[] };
    expect(summaryQuery.sql).toContain('COUNT("itemId") AS "itemCount"');
    expect(summaryQuery.sql).toContain('json_extract("metadata", \'$.buyerOffer2\')');
    expect(summaryQuery.values).toEqual(expect.arrayContaining(['tenant-1', 'approved-1', 'expired-1', 'draft-1']));
    expect(structuredLog).toHaveBeenCalledWith('warn', 'rate_card.stored_metadata_invalid', expect.objectContaining({
      invalidItemMetadataCount: 1,
      invalidFields: expect.arrayContaining([expect.objectContaining({ rateCardId: 'expired-1', field: 'comparisonRef', affectedRecordCount: 1 })]),
    }));
    expect(successResult).toHaveBeenCalledWith(expect.objectContaining({ total: 12, page: 1, totalPages: 4 }));
  });

  it('handles empty filters, absent pagination, invalid query pagination, and list failures', async () => {
    await expect(GET(getRequest())).resolves.toMatchObject({ ok: true, data: { rateCards: [], page: 1, totalPages: 1 } });
    expect(db.vendorRateCard.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1' }, skip: 0, take: 25 }));

    await GET(getRequest('?page=bad&limit=bad'));
    expect(db.vendorRateCard.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1' }, skip: 0, take: 25 }));

    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    db.vendorRateCard.findMany.mockRejectedValueOnce(new Error('query failed'));
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchRateCards, status: 500 });
    expect(errorResult).toHaveBeenCalledWith(UI_STRINGS.common.userMessages.failedToFetchRateCards, 500);

    db.vendorRateCard.findMany.mockResolvedValueOnce([{ id: 'rate-card-1' }]);
    rawQuery.mockRejectedValueOnce(new Error('item summary query failed'));
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchRateCards, status: 500 });
  });

  it('applies each approval queue, caps pagination, rejects oversized search, and logs non-Error failures', async () => {
    for (const [queue, expectedStatus] of [
      ['ALL_PENDING', { in: ['PENDING_PROJECT_APPROVAL', 'PENDING_FINANCE_APPROVAL'] }],
      ['LEVEL_1', 'PENDING_PROJECT_APPROVAL'],
      ['LEVEL_2', 'PENDING_FINANCE_APPROVAL'],
      ['CONCLUDED', { in: ['APPROVED', 'RETURNED_FOR_CORRECTION', 'REJECTED'] }],
    ] as const) {
      await GET(getRequest(`?queue=${queue}&page=20000&pageSize=100`));
      expect(db.vendorRateCard.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
        where: { tenantId: 'tenant-1', status: expectedStatus }, skip: 9_999 * 50, take: 50,
      }));
      expect(db.vendorRateCard.groupBy).toHaveBeenLastCalledWith(expect.objectContaining({
        where: { tenantId: 'tenant-1' },
      }));
    }

    await GET(getRequest('?queue=LEVEL_1&status=DRAFT&page=2&limit=3'));
    expect(db.vendorRateCard.groupBy).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', status: 'DRAFT' },
    }));
    await expect(GET(getRequest(`?search=${'x'.repeat(MAX_RATE_CARD_TEXT_LENGTH + 1)}`))).resolves.toMatchObject({ ok: false, status: 400 });

    db.vendorRateCard.count.mockRejectedValueOnce('database unavailable');
    await expect(GET(getRequest())).resolves.toMatchObject({ ok: false, status: 500 });
    expect(structuredLog).toHaveBeenCalledWith('error', 'rate_card.list_read_failed', expect.objectContaining({
      error: { type: 'string' },
    }));
  });

  it('creates draft cards with normalized defaults and all item comparison fallbacks', async () => {
    const items = [
      { itemCode: 'CBL-1', standardBoqItemId: 'standard-1', description: 'Copper cable', buyerOffer1: 100, rate: 90, vendorQuote1: '120', previousPpoRate: '80', referenceQty: '5', proposedRate: '110', benchmarkRate: '95', maxQuantity: '10', remarks: 'first' },
      { description: 'Connector', rate: 0, qty: '3', minQuantity: '7', vendorQuote1: 0, historicalRate: 0, maxQuantity: 0 },
      { description: 'Switch', referenceQty: 'bad', qty: '', minQuantity: 'bad', previousPpoRate: '9' },
    ];
    await expect(POST(postRequest({ ...requiredBody, items, version: 'v3.4' }))).resolves.toMatchObject({ ok: true, status: 201 });
    const statements = batch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(statements.map(({ sql }) => sql)).toEqual([
      RATE_CARD_INSERT_IF_VENDOR_VALID_SQL, RATE_CARD_ITEMS_INSERT_JSON_AFTER_CARD_SQL, RATE_CARD_AUDIT_INSERT_AFTER_CREATE_SQL,
    ]);
    for (const statement of statements) {
      expect(statement.sql.match(/\?/g) || []).toHaveLength(statement.values.length);
    }
    expect(statements[0].values).toEqual(expect.arrayContaining([
      'tenant-1', 'vendor-1', new Date().getFullYear(), 34, 'Electrical rate card', 'Electrical', 'DRAFT', 'All India',
    ]));
    expect(statements[0].values).toHaveLength(28);
    expect(JSON.parse(statements[0].values[21] as string)).toMatchObject({ currentRound: 1, round1: { buyerOffer1Actor: 'buyer@example.com' } });
    const mapped = JSON.parse(statements[1].values[0] as string);
    expect(mapped[0]).toMatchObject({
      tenantId: 'tenant-1', itemCode: 'CBL-1', standardBoqItemId: 'standard-1', category: 'Electrical',
      subcategory: null, uom: 'Nos', rate: 100, proposedRate: 110, historicalRate: 80, benchmarkRate: 95,
      minQuantity: 5, maxQuantity: 10, location: 'All India', isActive: true,
    });
    expect(JSON.parse(mapped[0].comparisonRef)).toEqual({ buyerOffer1: 100, vendorQuote1: 120, previousPpoRate: 80, referenceQty: 5, remarks: 'first' });
    expect(mapped[1]).toMatchObject({ rate: 0, proposedRate: 0, historicalRate: 0, minQuantity: 3, maxQuantity: null });
    expect(JSON.parse(mapped[1].comparisonRef)).toEqual({ buyerOffer1: 0, vendorQuote1: null, previousPpoRate: null, referenceQty: 3, remarks: '' });
    expect(mapped[2]).toMatchObject({ historicalRate: 9, minQuantity: null, maxQuantity: null });
    expect(JSON.parse(mapped[2].comparisonRef)).toEqual({ buyerOffer1: 0, vendorQuote1: null, previousPpoRate: 9, referenceQty: null, remarks: '' });
    expect(statements[2].values).toEqual(expect.arrayContaining(['RATE_CARD_CREATED']));
    expect(dispatchPrepared).not.toHaveBeenCalled();
    expect(successResult).toHaveBeenCalledWith(expect.objectContaining({ rateCard: expect.objectContaining({ id: 'rate-card-1' }) }), 201);
  });

  it('sets project approval fields and sends buyer offers to vendors with notifications', async () => {
    db.vendorRateCard.count.mockResolvedValue(8);
    await POST(postRequest({ ...requiredBody, status: 'PENDING_PROJECT_APPROVAL', version: 2 }));
    const approvalStatements = batch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(approvalStatements[0].values).toEqual(expect.arrayContaining(['PENDING_PROJECT_APPROVAL', 'LEVEL_1_PROJECT', 'buyer@example.com']));
    expect(approvalStatements[2].values).toContain('RATE_CARD_SUBMITTED');

    await POST(postRequest({ ...requiredBody, status: 'SENT_TO_VENDOR', location: 'Pune', notes: 'manual notes' }));
    const sentStatements = batch.mock.calls[1][0] as Array<{ sql: string; values: unknown[] }>;
    expect(sentStatements).toHaveLength(4);
    expect(sentStatements[0].values).toEqual(expect.arrayContaining(['ROUND_1_BUYER_OFFER', 'Pune', 'buyer@example.com', 'manual notes']));
    expect(sentStatements[2].values).toContain('RATE_CARD_OFFER_1_SENT');
    const outboxPayload = JSON.parse(sentStatements[3].values[2] as string);
    expect(outboxPayload).toMatchObject({ title: UI_STRINGS.appApiProcurementRateCardsRoute.newRateCardOfferReceived,
      entityType: 'RATE_CARD', targetRole: 'VENDOR', recordNumber: '__RATE_CARD_NUMBER__', link: '/vendor-portal/rate-cards' });
    expect(dispatchPrepared).toHaveBeenCalledTimes(1);
  });

  it('marks approved cards with approver details and handles create failures', async () => {
    await POST(postRequest({ ...requiredBody, status: 'APPROVED', version: 'not-versioned' }));
    const approvedValues = batch.mock.calls[0][0][0].values as unknown[];
    expect(approvedValues).toEqual(expect.arrayContaining([1, 'APPROVED', 'FINANCE']));
    expect(approvedValues[17]).toBeNull();
    expect(approvedValues[18]).toBeNull();

    batch.mockRejectedValueOnce(new Error('write failed'));
    await expect(POST(postRequest({ ...requiredBody, status: 'DRAFT' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToCreateRateCard, status: 500,
    });
    expect(structuredLog).toHaveBeenCalledWith('error', 'rate_card.creation_failed', expect.objectContaining({
      operation: 'create_rate_card', vendorId: 'vendor-1',
    }));
  });

  it('rejects invalid vendors, excess items, malformed item rates, dates, and unknown statuses', async () => {
    db.vendor.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest(requiredBody))).resolves.toMatchObject({ ok: false, status: 404 });
    await expect(POST(postRequest({ ...requiredBody, items: Array.from({ length: MAX_RATE_CARD_ITEMS + 1 }, () => ({})) }))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(POST(postRequest({ ...requiredBody, items: [{ description: 'Cable', rate: -1 }] }))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(POST(postRequest({ ...requiredBody, validFrom: 'bad-date' }))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(POST(postRequest({ ...requiredBody, status: 'UNRECOGNIZED' }))).resolves.toMatchObject({ ok: false, status: 400 });
    expect(batch).not.toHaveBeenCalled();
  });

  it('validates malformed bodies, text limits, optional field types, and valid Date objects', async () => {
    for (const body of [null, [], 'not-an-object']) {
      await expect(POST(postRequest(body))).resolves.toMatchObject({ ok: false, status: 400 });
    }
    await expect(POST(postRequest({ ...requiredBody, terms: 'x'.repeat(MAX_RATE_CARD_TERMS_LENGTH + 1) }))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(POST(postRequest({ ...requiredBody, notes: 'x'.repeat(MAX_RATE_CARD_NOTES_LENGTH + 1) }))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(POST(postRequest({ ...requiredBody, subcategory: 'x'.repeat(MAX_RATE_CARD_TEXT_LENGTH + 1) }))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(POST(postRequest({ ...requiredBody, title: 42 }))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(POST(postRequest({ ...requiredBody, items: {} }))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(POST(postRequest({ ...requiredBody, items: [null] }))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(POST(postRequest({ ...requiredBody, items: [{ description: 42 }] }))).resolves.toMatchObject({ ok: false, status: 400 });
    expect(batch).not.toHaveBeenCalled();

    await expect(POST(postRequest({
      ...requiredBody,
      validFrom: new Date('2026-01-01'), validTo: new Date('2027-01-01'),
      subcategory: 7, scope: false, location: null, version: 2.8,
      terms: 12, notes: false, justification: 5, comparisonNotes: {},
      items: [{
        description: 'Cable', rate: 10, specification: '4C x 25mm', category: 'Wire',
        subcategory: 'Power', uom: 'm', location: 'Pune', buyerOffer1: 10,
        proposedRate: 12, benchmarkRate: 'not-a-number', previousPpoRate: '',
        historicalRate: '', vendorQuote1: '', referenceQty: '2', maxQuantity: 'bad',
      }],
    }))).resolves.toMatchObject({ ok: true, status: 201 });
    const item = JSON.parse(batch.mock.calls[0][0][1].values[0] as string)[0];
    expect(item).toMatchObject({ specification: '4C x 25mm', category: 'Wire', subcategory: 'Power', uom: 'm', location: 'Pune', benchmarkRate: null, maxQuantity: null });
  });

  it('handles conditional write failures and non-Error creation exceptions', async () => {
    batch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 0 } }, { meta: { changes: 1 } }]);
    await expect(POST(postRequest({ ...requiredBody, items: [] }))).resolves.toMatchObject({ ok: false, status: 500 });

    db.vendorRateCard.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest(requiredBody))).resolves.toMatchObject({ ok: false, status: 500 });

    batch.mockRejectedValueOnce('write unavailable');
    await expect(POST(postRequest(requiredBody))).resolves.toMatchObject({ ok: false, status: 500 });
    expect(structuredLog).toHaveBeenLastCalledWith('error', 'rate_card.creation_failed', expect.objectContaining({
      error: { type: 'string' },
    }));
  });
});
