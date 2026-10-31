import { NextRequest } from 'next/server';
import { DELETE, GET, PUT } from '../src/app/api/procurement/rate-cards/[id]/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    vendorRateCard: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
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

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
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
    db.vendorRateCard.findUnique.mockReset().mockResolvedValue(card());
    db.vendorRateCard.update.mockReset().mockImplementation(async ({ data }: any) => ({ ...card(), ...data }));
    db.vendorRateCard.delete.mockReset().mockResolvedValue({ id: 'rc-1' });
    db.vendorRateCardItem.update.mockReset().mockResolvedValue({});
    db.vendorRateCardItem.deleteMany.mockReset().mockResolvedValue({ count: 2 });
    db.rateCardApproval.deleteMany.mockReset().mockResolvedValue({ count: 1 });
    db.notification.create.mockReset().mockResolvedValue({ id: 'notification-1' });
    audit.mockReset().mockResolvedValue(undefined);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('returns enriched detail with parsed comparison metadata and safe defaults', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(new NextRequest('http://localhost/api/procurement/rate-cards/rc-1'), params())).resolves.toBe(denied);

    db.vendorRateCard.findUnique.mockResolvedValueOnce(null);
    await expect(GET(new NextRequest('http://localhost/api/procurement/rate-cards/rc-1'), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rateCardNotFound, status: 404 });
    db.vendorRateCard.findUnique.mockResolvedValueOnce(card({ tenantId: 'other-tenant' }));
    await expect(GET(new NextRequest('http://localhost/api/procurement/rate-cards/rc-1'), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rateCardNotFound, status: 404 });

    db.vendorRateCard.findUnique.mockResolvedValueOnce(card({ status: 'APPROVED', notes: JSON.stringify({ agreement: { signature: 'signed.pdf' } }), items: [
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
    db.vendorRateCard.findUnique.mockResolvedValueOnce(card({ status: 'DRAFT', notes: '{bad json', items: [
      { id: 'fallback-item', rate: 30, proposedRate: 0, comparisonRef: null },
    ] }));
    await expect(GET(new NextRequest('http://localhost/api/procurement/rate-cards/rc-1'), params())).resolves.toMatchObject({ ok: true, data: {
      rateCard: { agreement: null, items: [{ id: 'fallback-item', buyerOffer1: 30, vendorQuote1: 0, finalAgreedRate: null, remarks: '' }] },
    } });
    db.vendorRateCard.findUnique.mockRejectedValueOnce(new Error('read detail failed'));
    await expect(GET(new NextRequest('http://localhost/api/procurement/rate-cards/rc-1'), params())).resolves.toEqual({ ok: false, error: 'read detail failed', status: 500 });
    db.vendorRateCard.findUnique.mockRejectedValueOnce({});
    await expect(GET(new NextRequest('http://localhost/api/procurement/rate-cards/rc-1'), params())).resolves.toEqual({ ok: false, error: 'Failed to fetch rate card', status: 500 });
  });

  it('submits buyer offer two, skips unknown rows, clears signed evidence, and handles malformed prior notes', async () => {
    db.vendorRateCard.findUnique.mockResolvedValueOnce(card({
      notes: JSON.stringify({ agreement: { signature: 'old-signature', status: 'SIGNED' }, round2: { preserved: true } }),
      items: [{ id: 'i1', comparisonRef: JSON.stringify({ existing: 'keep' }) }, { id: 'i2', comparisonRef: '{bad json' }],
    }));
    const result = await PUT(request({ action: 'SUBMIT_BUYER_OFFER_2', remarks: 'Best and final', items: [
      { id: 'i1', buyerOffer2: '80', remarks: 'Reduced' }, { id: 'i2', buyerOffer2: 70 }, { id: 'missing', buyerOffer2: 60 }, { buyerOffer2: 50 },
    ] }), params());
    expect(result).toMatchObject({ ok: true, data: { message: 'Buyer RC Offer-2 successfully submitted to vendor!' } });
    expect(db.vendorRateCardItem.update).toHaveBeenNthCalledWith(1, { where: { id: 'i1' }, data: { comparisonRef: JSON.stringify({ existing: 'keep', buyerOffer2: 80, remarks: 'Reduced' }) } });
    expect(db.vendorRateCardItem.update).toHaveBeenNthCalledWith(2, { where: { id: 'i2' }, data: { comparisonRef: JSON.stringify({ buyerOffer2: 70 }) } });
    const savedNotes = JSON.parse(db.vendorRateCard.update.mock.calls[0][0].data.notes);
    expect(savedNotes).toMatchObject({ currentRound: 2, agreement: { signature: null, status: 'DRAFT' },
      round2: { preserved: true, buyerOffer2Actor: 'Manager', buyerOffer2Remarks: 'Best and final' } });
    expect(db.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ targetRole: UI_STRINGS.common.vENDOR, entityId: 'rc-1' }) });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'RATE_CARD_BUYER_OFFER_2_SUBMITTED' }));

    db.vendorRateCard.findUnique.mockResolvedValueOnce(card({ notes: '{bad json', items: [] }));
    await expect(PUT(request({ action: 'SUBMIT_BUYER_OFFER_2' }), params())).resolves.toMatchObject({ ok: true });
    expect(JSON.parse(db.vendorRateCard.update.mock.calls[1][0].data.notes)).toMatchObject({ currentRound: 2 });
  });

  it('accepts final vendor rates from the newest quote, prior quote, or existing rate', async () => {
    db.vendorRateCard.findUnique.mockResolvedValueOnce(card({ terms: 'Accepted terms', items: [
      { id: 'i2', rate: 50, proposedRate: 40, comparisonRef: JSON.stringify({ vendorQuote2: '35' }) },
      { id: 'i1', rate: 60, proposedRate: 45, comparisonRef: JSON.stringify({ vendorQuote1: 42 }) },
      { id: 'i3', rate: 70, proposedRate: 55, comparisonRef: '{bad json' },
    ] }));
    await expect(PUT(request({ action: 'ACCEPT_FINAL_VENDOR_OFFER', totalAgreedValue: 1000, remarks: 'Approved' }), params())).resolves.toMatchObject({
      ok: true, data: { message: expect.stringContaining('accepted successfully') },
    });
    expect(db.vendorRateCardItem.update).toHaveBeenNthCalledWith(1, { where: { id: 'i2' }, data: { rate: 35,
      comparisonRef: JSON.stringify({ vendorQuote2: '35', finalAgreedRate: 35 }) } });
    expect(db.vendorRateCardItem.update).toHaveBeenNthCalledWith(2, { where: { id: 'i1' }, data: { rate: 42,
      comparisonRef: JSON.stringify({ vendorQuote1: 42, finalAgreedRate: 42 }) } });
    expect(db.vendorRateCardItem.update).toHaveBeenNthCalledWith(3, { where: { id: 'i3' }, data: { rate: 55,
      comparisonRef: JSON.stringify({ finalAgreedRate: 55 }) } });
    expect(db.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ targetRole: 'CATEGORY_MANAGER' }) });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'RATE_CARD_FINAL_VENDOR_OFFER_ACCEPTED' }));
  });

  it('accepts valid category manager statuses, signs off vendor acceptance, and rejects invalid transitions', async () => {
    db.vendorRateCard.findUnique.mockResolvedValueOnce(card({ status: 'DRAFT' }));
    await expect(PUT(request({ action: 'CATEGORY_MANAGER_ACCEPT' }), params())).resolves.toEqual({ ok: false, error: 'Cannot perform Category Manager Acceptance from status: DRAFT', status: 400 });

    db.vendorRateCard.findUnique.mockResolvedValueOnce(card({ status: 'ROUND_2_VENDOR_QUOTE', notes: '{bad json' }));
    await expect(PUT(request({ action: 'CATEGORY_MANAGER_ACCEPT', agreement: { required: true, file: 'terms.pdf' }, remarks: 'Reviewed' }), params())).resolves.toMatchObject({
      ok: true, data: { message: expect.stringContaining('Vendor final acceptance is now required') },
    });
    expect(JSON.parse(db.vendorRateCard.update.mock.calls[0][0].data.notes)).toMatchObject({
      agreement: { required: true, file: 'terms.pdf' }, categoryManagerAccepted: { actor: 'Manager', remarks: 'Reviewed', hasAgreement: true },
    });

    db.vendorRateCard.findUnique.mockResolvedValueOnce(card({ status: 'CATEGORY_MANAGER_ACCEPTED' }));
    await expect(PUT(request({ action: 'CATEGORY_MANAGER_SIGNOFF' }), params())).resolves.toMatchObject({ ok: false, error: expect.stringContaining('requires prior Vendor Acceptance') });
    db.vendorRateCard.findUnique.mockResolvedValueOnce(card({ status: 'VENDOR_ACCEPTED', notes: null }));
    await expect(PUT(request({ action: 'CATEGORY_MANAGER_SIGNOFF' }), params())).resolves.toMatchObject({ ok: true });
    expect(db.vendorRateCard.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({
      status: 'PENDING_PROJECT_APPROVAL', approvalLevel: UI_STRINGS.componentsVendorNegotiationWorkspace.lEVEL1PROJECT, submittedBy: 'Manager', submittedAt: expect.any(Date),
    }) }));
    expect(db.notification.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ targetRole: 'PROJECT_APPROVER' }) });
  });

  it('updates editable rate cards and recreates item defaults only when items are supplied', async () => {
    const updated = { ...card(), title: 'Updated schedule', status: 'UNDER_REVIEW', version: 7 };
    db.vendorRateCard.update.mockResolvedValueOnce(updated);
    await expect(PUT(request({ title: 'Updated schedule', category: 'Power', subcategory: null, scope: 'Supply & install',
      location: 'South', version: 'v7', validFrom: '2026-02-01', validTo: '2026-10-01', terms: 'COD', notes: 'Buyer note',
      justification: 'Urgent', comparisonNotes: 'Checked', status: 'UNDER_REVIEW', items: [
        { description: 'Cable', rate: '50', proposedRate: '45', historicalRate: '40', benchmarkRate: '60', minQuantity: 2,
          maxQuantity: 10, itemCode: 'CBL', specification: '4 core', category: '', subcategory: '', uom: '', comparisonRef: '{}' },
        { description: 'Panel', rate: 0 },
      ] }), params())).resolves.toMatchObject({ ok: true, data: { rateCard: updated } });
    expect(db.vendorRateCardItem.deleteMany).toHaveBeenCalledWith({ where: { rateCardId: 'rc-1' } });
    expect(db.vendorRateCard.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      title: 'Updated schedule', category: 'Power', version: 7, status: 'UNDER_REVIEW',
      items: { create: [
        expect.objectContaining({ itemCode: 'CBL', uom: 'Nos', rate: 50, proposedRate: 45, historicalRate: 40, benchmarkRate: 60,
          minQuantity: 2, maxQuantity: 10, location: 'South', isActive: true }),
        expect.objectContaining({ rate: 0, proposedRate: 0, historicalRate: null, benchmarkRate: null, minQuantity: 1, maxQuantity: null }),
      ] },
    }) }));

    db.vendorRateCard.findUnique.mockResolvedValueOnce(card({ status: 'RETURNED_FOR_CORRECTION' }));
    db.vendorRateCard.update.mockResolvedValueOnce({ ...card(), title: 'Cable rates', version: 1 });
    await expect(PUT(request({ title: '', version: 0, validFrom: '', terms: undefined }), params())).resolves.toMatchObject({ ok: true });
    expect(db.vendorRateCardItem.deleteMany).toHaveBeenCalledTimes(1);
    expect(db.vendorRateCard.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({
      title: 'Cable rates', version: 1, validFrom: new Date('2026-01-01'),
    }) }));

    db.vendorRateCard.findUnique.mockResolvedValueOnce(card({ status: 'NEGOTIATION' }));
    db.vendorRateCard.update.mockResolvedValueOnce({ ...card(), version: 5 });
    await expect(PUT(request({ version: 5, items: [{ description: 'No category', rate: '', proposedRate: undefined }] }), params())).resolves.toMatchObject({ ok: true });
    expect(db.vendorRateCard.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({
      version: 5, items: { create: [expect.objectContaining({ category: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical, subcategory: 'Wire', rate: 0, proposedRate: 0 })] },
    }) }));

    db.vendorRateCard.findUnique.mockResolvedValueOnce(card({ status: 'APPROVED' }));
    await expect(PUT(request({ title: 'blocked' }), params())).resolves.toEqual({ ok: false, error: 'Rate Card cannot be edited in status: APPROVED', status: 400 });
  });

  it('deletes draft cards only and maps PUT/DELETE failures to API errors', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(DELETE(new NextRequest('http://localhost/api/procurement/rate-cards/rc-1'), params())).resolves.toBe(denied);

    db.vendorRateCard.findUnique.mockResolvedValueOnce(null);
    await expect(DELETE(new NextRequest('http://localhost/api/procurement/rate-cards/rc-1'), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rateCardNotFound, status: 404 });
    db.vendorRateCard.findUnique.mockResolvedValueOnce(card({ status: 'APPROVED' }));
    await expect(DELETE(new NextRequest('http://localhost/api/procurement/rate-cards/rc-1'), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementRateCardsIdRoute.onlyDraftRateCardsCanBeDeleted, status: 400 });
    db.vendorRateCard.findUnique.mockResolvedValueOnce(card());
    await expect(DELETE(new NextRequest('http://localhost/api/procurement/rate-cards/rc-1'), params())).resolves.toEqual({ ok: true, data: { message: UI_STRINGS.appApiProcurementRateCardsIdRoute.rateCardDeletedSuccessfully }, status: 200 });
    expect(db.vendorRateCardItem.deleteMany).toHaveBeenCalledWith({ where: { rateCardId: 'rc-1' } });
    expect(db.rateCardApproval.deleteMany).toHaveBeenCalledWith({ where: { rateCardId: 'rc-1' } });

    db.vendorRateCard.findUnique.mockRejectedValueOnce(new Error('delete failure'));
    await expect(DELETE(new NextRequest('http://localhost/api/procurement/rate-cards/rc-1'), params())).resolves.toEqual({ ok: false, error: 'delete failure', status: 500 });
    db.vendorRateCard.findUnique.mockResolvedValueOnce(card({ status: 'ROUND_2_VENDOR_QUOTE' }));
    db.vendorRateCard.update.mockRejectedValueOnce(new Error('update failure'));
    await expect(PUT(request({ action: 'CATEGORY_MANAGER_ACCEPT' }), params())).resolves.toEqual({ ok: false, error: 'update failure', status: 500 });
    const badJson = { json: jest.fn().mockRejectedValue(new Error('bad request')) } as unknown as NextRequest;
    db.vendorRateCard.findUnique.mockResolvedValueOnce(card());
    await expect(PUT(badJson, params())).resolves.toEqual({ ok: false, error: 'bad request', status: 500 });
    expect(consoleError).toHaveBeenCalledTimes(3);
  });

  it('rejects unauthorized and inaccessible PUT requests before reading their bodies', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(PUT(request({}), params())).resolves.toBe(denied);
    db.vendorRateCard.findUnique.mockResolvedValueOnce(null);
    await expect(PUT(request({}), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rateCardNotFound, status: 404 });
    db.vendorRateCard.findUnique.mockResolvedValueOnce(card({ tenantId: 'other-tenant' }));
    await expect(PUT(request({}), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rateCardNotFound, status: 404 });
  });
});
