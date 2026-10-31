import { NextRequest } from 'next/server';
import { GET, POST } from '../src/app/api/vendor-portal/rate-cards/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    vendorRateCard: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    vendorRateCardItem: { update: jest.fn() },
    rateCardApproval: { create: jest.fn() },
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
const baseContext = { tenantId: 'tenant-1', userId: 'user-1', userName: 'Vendor Reviewer', userEmail: 'user@example.test', role: 'VENDOR', vendorId: 'vendor-1' };
const getRequest = () => new NextRequest('http://localhost/api/vendor-portal/rate-cards');
const postRequest = (body: unknown) => new NextRequest('http://localhost/api/vendor-portal/rate-cards', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const card = (overrides: Record<string, any> = {}) => ({
  id: 'rate-card-1', tenantId: 'tenant-1', vendorId: 'vendor-1', rateCardNumber: 'RC-001',
  status: 'ROUND_1_BUYER_OFFER', approvalLevel: 'LEVEL_1_PROJECT', notes: null,
  vendor: { id: 'vendor-1', name: 'Acme' }, items: [], ...overrides,
});

describe('vendor portal rate cards API', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(baseContext);
    isContext.mockReturnValue(true);
    db.vendorRateCard.findMany.mockReset().mockResolvedValue([]);
    db.vendorRateCard.findFirst.mockReset().mockResolvedValue(card());
    db.vendorRateCard.update.mockReset().mockResolvedValue({ id: 'rate-card-1', status: 'UPDATED' });
    db.vendorRateCardItem.update.mockReset().mockResolvedValue({ id: 'item-1' });
    db.rateCardApproval.create.mockReset().mockResolvedValue({ id: 'approval-1' });
    db.notification.create.mockReset().mockResolvedValue({ id: 'notification-1' });
    audit.mockReset().mockResolvedValue(undefined);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('enforces mapped vendor access for GET and POST', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(getRequest())).resolves.toBe(denied);
    auth.mockResolvedValueOnce({ ...baseContext, role: 'PROJECT_USER', vendorId: undefined });
    await expect(POST(postRequest({ rateCardId: 'rate-card-1' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.forbiddenVendorPortalIsAccessibleOnlyToMappedVendorAccounts, status: 403,
    });

    auth.mockResolvedValueOnce({ ...baseContext, role: 'VENDOR', vendorId: undefined });
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.vendorRecordNotAssociatedWithThisUserAccount, status: 404 });
    auth.mockResolvedValueOnce({ ...baseContext, role: 'PROJECT_USER', vendorId: undefined });
    await expect(POST(postRequest({ rateCardId: 'rate-card-1' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.forbiddenVendorPortalIsAccessibleOnlyToMappedVendorAccounts, status: 403,
    });
    auth.mockResolvedValueOnce({ ...baseContext, role: 'VENDOR', vendorId: undefined });
    await expect(POST(postRequest({ rateCardId: 'rate-card-1' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.vendorRecordNotAssociatedWithThisUserAccount, status: 404,
    });
  });

  it('lists only the current vendor rate cards and derives values from metadata or legacy fields', async () => {
    db.vendorRateCard.findMany.mockResolvedValueOnce([
      card({ status: 'APPROVED', notes: JSON.stringify({ agreement: { required: true, status: 'SIGNED' } }), items: [
        { id: 'meta-item', rate: 100, proposedRate: 95, historicalRate: 80, minQuantity: 5, benchmarkRate: 50,
          comparisonRef: JSON.stringify({ buyerOffer1: 0, vendorQuote1: 0, buyerOffer2: 0, vendorQuote2: 0, finalAgreedRate: 0, previousPpoRate: 0, referenceQty: 0, remarks: '' }) },
        { id: 'legacy-item', rate: 10, proposedRate: 8, historicalRate: 7, minQuantity: 0, benchmarkRate: 0, comparisonRef: '{bad json' },
      ] }),
      card({ status: 'FINAL_VENDOR_OFFER_ACCEPTED', notes: 'not-json', items: [
        { id: 'final-item', rate: 12, proposedRate: null, historicalRate: 9, minQuantity: 3, benchmarkRate: 4, comparisonRef: null },
      ] }),
    ]);
    const result = await GET(getRequest());
    expect(result).toMatchObject({ ok: true, data: { total: 2, rateCards: [
      { agreement: { required: true, status: 'SIGNED' }, itemCount: 2, items: [
        { buyerOffer1: 0, vendorQuote1: 0, buyerOffer2: 0, vendorQuote2: 0, finalAgreedRate: 0, previousPpoRate: 0, referenceQty: 0, remarks: '', variance: 100 },
        { buyerOffer1: 10, vendorQuote1: 8, buyerOffer2: null, vendorQuote2: null, finalAgreedRate: 10, previousPpoRate: 7, referenceQty: 1, remarks: '', variance: 0 },
      ] },
      { agreement: null, itemCount: 1, items: [
        { buyerOffer1: 12, vendorQuote1: null, finalAgreedRate: 12, previousPpoRate: 9, referenceQty: 3, variance: 200 },
      ] },
    ] } });
    expect(db.vendorRateCard.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', vendorId: 'vendor-1' },
      include: { vendor: true, items: { where: { isActive: true } }, approvals: { orderBy: { timestamp: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('returns GET provider errors with a safe fallback message', async () => {
    db.vendorRateCard.findMany.mockRejectedValueOnce(new Error('rate cards offline'));
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: 'rate cards offline', status: 500 });
    db.vendorRateCard.findMany.mockRejectedValueOnce({});
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: 'Failed to fetch rate cards', status: 500 });
  });

  it('validates rate-card submission and vendor acceptance status', async () => {
    await expect(POST(postRequest({}))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiVendorPortalRateCardsRoute.rateCardIDIsRequired, status: 400 });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest({ rateCardId: 'missing' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiVendorPortalRateCardsRoute.rateCardNotFoundOrAccessDenied, status: 404 });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'ROUND_1_BUYER_OFFER' }));
    await expect(POST(postRequest({ rateCardId: 'rate-card-1', action: 'VENDOR_ACCEPT' }))).resolves.toEqual({
      ok: false, error: 'Vendor Acceptance requires prior Category Manager Acceptance (Current status: ROUND_1_BUYER_OFFER)', status: 400,
    });
  });

  it('accepts unsigned agreement terms and routes the card to project approval', async () => {
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({
      status: 'CATEGORY_MANAGER_ACCEPTED', notes: JSON.stringify({ agreement: { required: true, status: 'READY' } }),
      vendor: { name: null },
    }));
    const result = await POST(postRequest({ rateCardId: 'rate-card-1', action: 'VENDOR_ACCEPT' }));
    expect(result).toMatchObject({ ok: true, data: { message: expect.stringContaining('forwarded to Level 1'), rateCard: { status: 'UPDATED' } } });
    const updateData = JSON.parse(db.vendorRateCard.update.mock.calls[0][0].data.notes);
    expect(updateData).toMatchObject({ agreement: { required: true, status: 'VENDOR_ACCEPTED', signature: null },
      vendorAccepted: { actor: 'Vendor Reviewer', remarks: 'Vendor accepted final negotiated rate card agreement and commercial terms', hasSignature: false } });
    expect(db.vendorRateCard.update).toHaveBeenCalledWith({ where: { id: 'rate-card-1' }, data: {
      status: 'PENDING_PROJECT_APPROVAL', approvalLevel: UI_STRINGS.componentsVendorNegotiationWorkspace.lEVEL1PROJECT, notes: expect.any(String),
    } });
    expect(db.rateCardApproval.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: 'VENDOR_ACCEPTED', level: UI_STRINGS.componentsVendorNegotiationWorkspace.lEVEL1PROJECT, approverName: 'Vendor Reviewer',
      approverEmail: 'user@example.test', remarks: 'Vendor accepted final negotiated rate card agreement', timestamp: expect.any(Date),
    }) });
    expect(db.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      targetRole: 'PROJECT_APPROVER', recordNumber: 'RC-001', link: '/approvals/rate-cards',
    }) });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'RATE_CARD_VENDOR_ACCEPTED', entityId: 'vendor-1', newValue: expect.objectContaining({ isSigned: false }) }));
  });

  it('records a verified digital signature with explicit signature metadata', async () => {
    auth.mockResolvedValueOnce({ ...baseContext, userName: '' });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({
      status: 'CATEGORY_MANAGER_ACCEPTED', notes: 'not-json', vendor: { name: '' },
    }));
    await POST(postRequest({ rateCardId: 'rate-card-1', action: 'VENDOR_ACCEPT', remarks: 'Executed', signature: {
      verified: true, signedBy: 'Sam Buyer', designation: 'Director', signatureType: 'DSC', signatureEvidenceId: 'evidence-1',
    } }));
    const notes = JSON.parse(db.vendorRateCard.update.mock.calls[0][0].data.notes);
    expect(notes).toMatchObject({ vendorAccepted: { actor: 'Vendor User', remarks: 'Executed', hasSignature: true } });
    expect(notes.agreement).toBeUndefined();
    expect(db.rateCardApproval.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      approverName: 'Vendor User', remarks: 'Vendor Vendor User accepted terms & executed digital signature (evidence-1)',
    }) });
    expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ newValue: expect.objectContaining({ isSigned: true }) }));
  });

  it('submits first-round quotes, updates matching items, and skips missing item references', async () => {
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({
      notes: '{bad json', approvalLevel: null,
      items: [
        { id: 'item-1', rate: 50, proposedRate: 45, comparisonRef: '{"buyerOffer1":40}' },
        { id: 'item-2', rate: 70, proposedRate: null, comparisonRef: '{bad json' },
      ],
    }));
    await POST(postRequest({ rateCardId: 'rate-card-1', action: 'SUBMIT_VENDOR_QUOTE_1', items: [
      { id: 'item-1', proposedRate: '43' }, { id: 'item-2', rate: '65' }, { id: 'missing-item', rate: 1 }, { rate: 9 },
    ], remarks: '' }));
    expect(db.vendorRateCardItem.update).toHaveBeenNthCalledWith(1, { where: { id: 'item-1' }, data: {
      proposedRate: 43, comparisonRef: expect.stringContaining('"vendorQuote1":43'),
    } });
    expect(db.vendorRateCardItem.update).toHaveBeenNthCalledWith(2, { where: { id: 'item-2' }, data: {
      proposedRate: 65, comparisonRef: expect.stringContaining('"vendorQuote1":65'),
    } });
    const notes = JSON.parse(db.vendorRateCard.update.mock.calls[0][0].data.notes);
    expect(notes).toMatchObject({ round1: { vendorQuote1Actor: 'Acme', vendorQuote1Remarks: '' } });
    expect(db.vendorRateCard.update).toHaveBeenCalledWith({ where: { id: 'rate-card-1' }, data: {
      status: 'ROUND_1_VENDOR_QUOTE', notes: expect.any(String),
    } });
    expect(db.rateCardApproval.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: 'VENDOR_QUOTE_1_SUBMITTED', level: UI_STRINGS.componentsVendorNegotiationWorkspace.lEVEL1PROJECT, remarks: 'Vendor submitted Vendor RC Quote-1 for commercial review',
    }) });
    expect(db.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ targetRole: 'CATEGORY_MANAGER', link: '/procurement/rate-cards' }) });
    expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'RATE_CARD_VENDOR_QUOTE_1_SUBMITTED' }));
  });

  it('submits second-round quotes using status-derived round and preserves existing comparison details', async () => {
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({
      status: 'ROUND_2_BUYER_OFFER', notes: JSON.stringify({ round2: { buyerOffer2: 52 } }),
      items: [{ id: 'item-1', rate: 50, proposedRate: 45, comparisonRef: JSON.stringify({ buyerOffer2: 52 }) }],
    }));
    await POST(postRequest({ rateCardId: 'rate-card-1', items: [{ id: 'item-1', rate: 55 }], remarks: 'Final quote' }));
    expect(db.vendorRateCardItem.update).toHaveBeenCalledWith({ where: { id: 'item-1' }, data: {
      proposedRate: 55, comparisonRef: expect.stringContaining('"vendorQuote2":55'),
    } });
    expect(db.vendorRateCard.update).toHaveBeenCalledWith({ where: { id: 'rate-card-1' }, data: {
      status: 'ROUND_2_VENDOR_QUOTE', notes: expect.any(String),
    } });
    expect(db.rateCardApproval.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: 'VENDOR_QUOTE_2_SUBMITTED', remarks: 'Final quote',
    }) });
  });

  it('converts POST provider and JSON failures into API errors', async () => {
    db.vendorRateCard.findFirst.mockRejectedValueOnce(new Error('rate-card database error'));
    await expect(POST(postRequest({ rateCardId: 'rate-card-1' }))).resolves.toEqual({ ok: false, error: 'rate-card database error', status: 500 });
    db.vendorRateCard.findFirst.mockRejectedValueOnce({});
    await expect(POST(postRequest({ rateCardId: 'rate-card-1' }))).resolves.toEqual({ ok: false, error: 'Failed to submit rate card proposals', status: 500 });
    const badJson = { json: jest.fn().mockRejectedValue(new Error('invalid JSON')) } as unknown as NextRequest;
    await expect(POST(badJson)).resolves.toEqual({ ok: false, error: 'invalid JSON', status: 500 });
  });
});
