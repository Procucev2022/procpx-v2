import { NextRequest } from 'next/server';
import { GET, POST } from '../src/app/api/procurement/rate-cards/route';
import { prisma } from '../src/lib/prisma';
import { apiError, apiSuccess, isApiContext, requireAuth } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    vendorRateCard: { findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
    notification: { create: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
}));
jest.mock('../src/lib/audit', () => ({ createAuditLog: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const successResult = apiSuccess as jest.Mock;
const errorResult = apiError as jest.Mock;
const audit = createAuditLog as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'buyer-1', userName: '', userEmail: 'buyer@example.com', role: 'FINANCE' };

function getRequest(query = '') {
  return { url: `http://localhost/api/procurement/rate-cards${query}` } as NextRequest;
}

function postRequest(body: unknown) {
  return { json: jest.fn().mockResolvedValue(body) } as unknown as NextRequest;
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
    db.vendorRateCard.create.mockResolvedValue({ id: 'rate-card-1', vendor: { name: 'Northwind Electrical' }, items: [] });
    db.notification.create.mockResolvedValue({ id: 'notification-1' });
    audit.mockResolvedValue(undefined);
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
      ok: false, error: 'Vendor ID, Title, Category, Valid From, and Valid To are required', status: 400,
    });
    expect(db.vendorRateCard.count).not.toHaveBeenCalled();
  });

  it('filters and paginates tenant rate cards while formatting metadata, validity, and expiry', async () => {
    const cards = [
      {
        id: 'approved-1', status: 'APPROVED', validFrom: new Date('2020-01-01'), validTo: new Date('2099-01-01'),
        notes: JSON.stringify({ agreement: 'Signed framework' }),
        items: [{
          comparisonRef: JSON.stringify({ buyerOffer1: 80, vendorQuote1: 85, buyerOffer2: 78, vendorQuote2: 83, finalAgreedRate: 75, previousPpoRate: 70, referenceQty: 4, remarks: 'approved quote' }),
          rate: 90, proposedRate: 95, historicalRate: 72, minQuantity: 2, benchmarkRate: 100,
        }],
      },
      {
        id: 'expired-1', status: 'EXPIRED', validFrom: new Date('2020-01-01'), validTo: new Date('2020-02-01'),
        notes: '{invalid', items: [{ comparisonRef: '{invalid', rate: 50, proposedRate: 55, historicalRate: 45, minQuantity: 0, benchmarkRate: 0 }],
      },
      {
        id: 'draft-1', status: 'DRAFT', validFrom: new Date('2099-01-01'), validTo: new Date('2099-02-01'),
        notes: null, items: [],
      },
    ];
    db.vendorRateCard.findMany.mockResolvedValue(cards);
    db.vendorRateCard.count.mockResolvedValue(12);

    const result = await GET(getRequest('?vendorId=vendor-1&status=APPROVED&category=Electrical&search=panel&page=0&limit=3'));
    expect(result).toMatchObject({ ok: true, data: { total: 12, page: 1, totalPages: 4 } });
    expect(db.vendorRateCard.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tenantId: 'tenant-1', vendorId: 'vendor-1', status: 'APPROVED', category: 'Electrical',
        OR: [
          { rateCardNumber: { contains: 'panel' } }, { title: { contains: 'panel' } },
          { category: { contains: 'panel' } }, { vendor: { name: { contains: 'panel' } } },
        ],
      },
      skip: 0, take: 3, orderBy: { createdAt: 'desc' },
    }));
    const data = (result as any).data.rateCards;
    expect(data[0]).toMatchObject({ isValid: true, isExpired: false, itemCount: 1, agreement: 'Signed framework' });
    expect(data[0].items[0]).toMatchObject({ buyerOffer1: 80, vendorQuote1: 85, buyerOffer2: 78, vendorQuote2: 83, finalAgreedRate: 75, previousPpoRate: 70, referenceQty: 4, remarks: 'approved quote', variance: -10 });
    expect(data[1]).toMatchObject({ isValid: false, isExpired: true, agreement: null });
    expect(data[1].items[0]).toMatchObject({ buyerOffer1: 50, vendorQuote1: 55, buyerOffer2: null, vendorQuote2: null, finalAgreedRate: null, previousPpoRate: 45, referenceQty: 1, remarks: '', variance: 0 });
    expect(data[2]).toMatchObject({ isValid: false, isExpired: false, itemCount: 0, agreement: null });
    expect(successResult).toHaveBeenCalledWith(expect.objectContaining({ total: 12, page: 1, totalPages: 4 }));
  });

  it('handles empty filters, absent pagination, invalid query pagination, and list failures', async () => {
    await expect(GET(getRequest())).resolves.toMatchObject({ ok: true, data: { rateCards: [], page: 1, totalPages: 1 } });
    expect(db.vendorRateCard.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1' } }));

    await GET(getRequest('?page=bad&limit=bad'));
    expect(db.vendorRateCard.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1' } }));

    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    db.vendorRateCard.findMany.mockRejectedValueOnce(new Error('query failed'));
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: 'query failed', status: 500 });
    expect(errorResult).toHaveBeenCalledWith('query failed', 500);
  });

  it('creates draft cards with normalized defaults and all item comparison fallbacks', async () => {
    const items = [
      { itemCode: 'CBL-1', standardBoqItemId: 'standard-1', description: 'Copper cable', buyerOffer1: 100, rate: 90, vendorQuote1: '120', previousPpoRate: '80', referenceQty: '5', proposedRate: '110', benchmarkRate: '95', maxQuantity: '10', remarks: 'first' },
      { description: 'Connector', rate: 0, qty: '3', minQuantity: '7', vendorQuote1: 0, historicalRate: 0, maxQuantity: 0 },
      { description: 'Switch', referenceQty: 'bad', qty: '', minQuantity: 'bad', previousPpoRate: '9' },
    ];
    await expect(POST(postRequest({ ...requiredBody, items, version: 'v3.4' }))).resolves.toMatchObject({ ok: true, status: 201 });
    const create = db.vendorRateCard.create.mock.calls[0][0];
    expect(create.data).toMatchObject({
      tenantId: 'tenant-1', vendorId: 'vendor-1', rateCardNumber: `VRC-${new Date().getFullYear()}-000001`,
      subcategory: null, scope: null, location: 'All India', version: 34, status: 'DRAFT',
      approvalLevel: null, submittedBy: null, submittedAt: null, currency: 'INR', terms: null,
      justification: null, comparisonNotes: null, approvedBy: null, approvedAt: null,
    });
    expect(JSON.parse(create.data.notes)).toMatchObject({ currentRound: 1, round1: { buyerOffer1Actor: 'buyer@example.com' } });
    const mapped = create.data.items.create;
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
    expect(db.notification.create).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'RATE_CARD_CREATED' }));
    expect(successResult).toHaveBeenCalledWith(expect.objectContaining({ rateCard: expect.objectContaining({ id: 'rate-card-1' }) }), 201);
  });

  it('sets project approval fields and sends buyer offers to vendors with notifications', async () => {
    db.vendorRateCard.count.mockResolvedValue(8);
    await POST(postRequest({ ...requiredBody, status: 'PENDING_PROJECT_APPROVAL', version: 2 }));
    expect(db.vendorRateCard.create.mock.calls[0][0].data).toMatchObject({
      version: 2, status: 'PENDING_PROJECT_APPROVAL', approvalLevel: 'LEVEL_1_PROJECT',
      submittedBy: 'buyer@example.com', submittedAt: expect.any(Date),
    });
    expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'RATE_CARD_SUBMITTED' }));

    await POST(postRequest({ ...requiredBody, status: 'SENT_TO_VENDOR', location: 'Pune', notes: 'manual notes' }));
    const sent = db.vendorRateCard.create.mock.calls[1][0].data;
    expect(sent).toMatchObject({
      status: 'ROUND_1_BUYER_OFFER', location: 'Pune', approvalLevel: null,
      submittedBy: 'buyer@example.com', submittedAt: expect.any(Date), notes: 'manual notes',
    });
    expect(db.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      title: 'New Rate Card Offer Received', entityType: 'RATE_CARD', targetRole: 'VENDOR',
      recordNumber: sent.rateCardNumber, link: '/vendor-portal/rate-cards',
    }) });
    expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'RATE_CARD_OFFER_1_SENT' }));
  });

  it('marks approved cards with approver details and handles create failures', async () => {
    await POST(postRequest({ ...requiredBody, status: 'APPROVED', version: 'not-versioned' }));
    expect(db.vendorRateCard.create.mock.calls[0][0].data).toMatchObject({
      version: 1, status: 'APPROVED', approvedBy: 'FINANCE', approvedAt: expect.any(Date),
      submittedBy: null, submittedAt: null,
    });

    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    db.vendorRateCard.create.mockRejectedValueOnce(new Error('write failed'));
    await expect(POST(postRequest({ ...requiredBody, status: 'DRAFT' }))).resolves.toEqual({
      ok: false, error: 'write failed', status: 500,
    });
    expect(errorResult).toHaveBeenCalledWith('write failed', 500);
  });
});
