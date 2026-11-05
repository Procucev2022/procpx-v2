import { NextRequest } from 'next/server';
import { GET, POST } from '../src/app/api/vendor-portal/rate-cards/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { dispatchPreparedWorkflowNotification } from '../src/lib/notifications';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { UI_STRINGS } from '../src/lib/ui-strings.constants';


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    vendorRateCard: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  getListPageWindow: (searchParams: URLSearchParams) => {
    const candidatePage = Number(searchParams.get('page'));
    const candidateSize = Number(searchParams.get('pageSize'));
    const page = Number.isSafeInteger(candidatePage) && candidatePage > 0 ? Math.min(candidatePage, 1_000_000) : 1;
    const pageSize = Number.isSafeInteger(candidateSize) && candidateSize > 0 ? Math.min(candidateSize, 100) : 50;
    return { page, pageSize, skip: (page - 1) * pageSize };
  },
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/notifications', () => ({ dispatchPreparedWorkflowNotification: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const batch = writeD1BatchAtomically as jest.Mock;
const dispatchNotification = dispatchPreparedWorkflowNotification as jest.Mock;
const structuredLog = writeStructuredLog as jest.Mock;
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
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(baseContext);
    isContext.mockReturnValue(true);
    db.vendorRateCard.findMany.mockReset().mockResolvedValue([]);
    db.vendorRateCard.findFirst.mockReset().mockResolvedValue(card());
    db.vendorRateCard.count.mockReset().mockResolvedValue(0);
    batch.mockReset().mockImplementation(async (statements: Array<{ sql: string }>) => statements.map(() => ({
      success: true, meta: { changes: 1 },
    })));
    dispatchNotification.mockReset().mockResolvedValue(undefined);
    structuredLog.mockReset().mockResolvedValue(undefined);
  });

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
    db.vendorRateCard.count.mockResolvedValueOnce(2);
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
    expect(result).toMatchObject({ ok: true, data: { page: 1, pageSize: 50, hasMore: false } });
    expect(structuredLog).toHaveBeenCalledWith('warn', 'vendor_portal.rate_card_metadata_invalid', expect.objectContaining({
      tenantId: 'tenant-1', vendorId: 'vendor-1', invalidFieldCount: 2,
    }));
    expect(db.vendorRateCard.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', vendorId: 'vendor-1' },
      include: { items: { where: { isActive: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: 0, take: 50,
    });
    expect(db.vendorRateCard.count).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1', vendorId: 'vendor-1' } });
  });

  it('pushes bounded search and rate-card lookup filters into tenant-scoped D1 queries', async () => {
    const request = new NextRequest('http://localhost/api/vendor-portal/rate-cards?page=2&pageSize=75&search=scope&rateCardId=direct-id');
    await GET(request);
    expect(db.vendorRateCard.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', vendorId: 'vendor-1', id: 'direct-id' },
      skip: 0, take: 1,
    }));
    const searchRequest = new NextRequest(`http://localhost/api/vendor-portal/rate-cards?search=${'x'.repeat(220)}`);
    await GET(searchRequest);
    expect(db.vendorRateCard.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', vendorId: 'vendor-1', OR: [
        { rateCardNumber: { contains: 'x'.repeat(200) } },
        { category: { contains: 'x'.repeat(200) } },
        { scope: { contains: 'x'.repeat(200) } },
      ] },
      skip: 0, take: 50,
    }));
  });

  it('returns GET provider errors with a safe fallback message', async () => {
    db.vendorRateCard.findMany.mockRejectedValueOnce(new Error('rate cards offline'));
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchRateCards, status: 500 });
    db.vendorRateCard.findMany.mockRejectedValueOnce({});
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchRateCards, status: 500 });
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
    expect(result).toMatchObject({ ok: true, data: { message: expect.stringContaining('forwarded to Level 1'), rateCard: { status: 'PENDING_PROJECT_APPROVAL' } } });
    const statements = batch.mock.calls[0][0];
    const updateData = JSON.parse(statements[0].values[0] as string);
    expect(updateData).toMatchObject({ agreement: { required: true, status: 'VENDOR_ACCEPTED', signature: null },
      vendorAccepted: { actor: 'Vendor Reviewer', remarks: 'Vendor accepted final negotiated rate card agreement and commercial terms', hasSignature: false } });
    expect(statements.map((statement: { sql: string }) => statement.sql)).toEqual(expect.arrayContaining([
      expect.stringContaining('UPDATE "vendor_rate_cards"'),
      expect.stringContaining('INSERT INTO "rate_card_approvals"'),
      expect.stringContaining('INSERT INTO "audit_logs"'),
      expect.stringContaining('INSERT INTO "notification_outbox"'),
    ]));
    expect(statements[1].values).toEqual(expect.arrayContaining(['VENDOR_ACCEPTED', 'Vendor Reviewer']));
    const acceptOutboxPayload = JSON.parse(statements[3].values[2] as string);
    expect(acceptOutboxPayload).toMatchObject({ targetRole: 'PROJECT_APPROVER', recordNumber: 'RC-001', link: '/approvals/rate-cards' });
    expect(dispatchNotification).toHaveBeenCalledWith(expect.any(String), expect.any(Date), expect.objectContaining({ entityType: 'RATE_CARD' }));
  });

  it('records a verified digital signature with explicit signature metadata', async () => {
    auth.mockResolvedValueOnce({ ...baseContext, userName: '' });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({
      status: 'CATEGORY_MANAGER_ACCEPTED', notes: JSON.stringify({ priorNote: 'retain this history' }), vendor: { name: '' },
    }));
    await POST(postRequest({ rateCardId: 'rate-card-1', action: 'VENDOR_ACCEPT', remarks: 'Executed', signature: {
      verified: true, signedBy: 'Sam Buyer', designation: 'Director', signatureType: 'DSC', signatureEvidenceId: 'evidence-1',
    } }));
    const statements = batch.mock.calls[0][0];
    const notes = JSON.parse(statements[0].values[0] as string);
    expect(notes).toMatchObject({ priorNote: 'retain this history', vendorAccepted: { actor: 'Vendor User', remarks: 'Executed', hasSignature: true } });
    expect(notes.agreement).toBeUndefined();
    expect(statements[1].values).toEqual(expect.arrayContaining(['Vendor User', 'Vendor Vendor User accepted terms & executed digital signature (evidence-1)']));
    expect(statements[2].values).toEqual(expect.arrayContaining(['RATE_CARD_VENDOR_ACCEPTED', expect.stringContaining('terms')]));
  });

  it('submits first-round quotes and persists item, approval, audit, and notification writes atomically', async () => {
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({
      notes: JSON.stringify({ priorNote: 'preserve history' }), approvalLevel: null,
      items: [
        { id: 'item-1', rate: 50, proposedRate: 45, comparisonRef: '{"buyerOffer1":40}' },
        { id: 'item-2', rate: 70, proposedRate: null, comparisonRef: null },
      ],
    }));
    await POST(postRequest({ rateCardId: 'rate-card-1', action: 'SUBMIT_VENDOR_QUOTE_1', items: [
      { id: 'item-1', proposedRate: '43' }, { id: 'item-2', rate: '65' },
    ], remarks: '' }));
    const statements = batch.mock.calls[0][0];
    expect(statements).toHaveLength(6);
    expect(statements[1].values).toEqual(expect.arrayContaining([43, 'item-1', 'tenant-1', 'rate-card-1']));
    expect(statements[1].values[1]).toContain('"vendorQuote1":43');
    expect(statements[2].values).toEqual(expect.arrayContaining([65, 'item-2', 'tenant-1', 'rate-card-1']));
    expect(statements[2].values[1]).toContain('"vendorQuote1":65');
    const notes = JSON.parse(statements[0].values[1] as string);
    expect(notes).toMatchObject({ priorNote: 'preserve history', round1: { vendorQuote1Actor: 'Acme', vendorQuote1Remarks: '' } });
    expect(statements[3].values).toEqual(expect.arrayContaining(['VENDOR_QUOTE_1_SUBMITTED', 'Vendor submitted Vendor RC Quote-1 for commercial review']));
    expect(statements[4].values).toEqual(expect.arrayContaining(['RATE_CARD_VENDOR_QUOTE_1_SUBMITTED']));
    const quoteOutboxPayload = JSON.parse(statements[5].values[2] as string);
    expect(quoteOutboxPayload).toMatchObject({ targetRole: 'CATEGORY_MANAGER', link: '/procurement/rate-cards' });
    expect(dispatchNotification).toHaveBeenCalledTimes(1);
  });

  it('submits second-round quotes using status-derived round and preserves existing comparison details', async () => {
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({
      status: 'ROUND_2_BUYER_OFFER', notes: JSON.stringify({ round2: { buyerOffer2: 52 } }),
      items: [{ id: 'item-1', rate: 50, proposedRate: 45, comparisonRef: JSON.stringify({ buyerOffer2: 52 }) }],
    }));
    await POST(postRequest({ rateCardId: 'rate-card-1', items: [{ id: 'item-1', rate: 55 }], remarks: 'Final quote' }));
    const statements = batch.mock.calls[0][0];
    expect(statements[0].values[0]).toBe('ROUND_2_VENDOR_QUOTE');
    expect(statements[1].values[1]).toContain('"buyerOffer2":52');
    expect(statements[1].values[1]).toContain('"vendorQuote2":55');
    expect(statements[2].values).toEqual(expect.arrayContaining(['VENDOR_QUOTE_2_SUBMITTED', 'Final quote']));
  });

  it('does not overwrite malformed stored workflow metadata during a vendor action', async () => {
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'CATEGORY_MANAGER_ACCEPTED', notes: '{broken' }));
    await expect(POST(postRequest({ rateCardId: 'rate-card-1', action: 'VENDOR_ACCEPT' }))).resolves.toMatchObject({
      ok: false, error: UI_STRINGS.common.userMessages.failedToSubmitRateCardProposals, status: 500,
    });
    expect(batch).not.toHaveBeenCalled();
    expect(structuredLog).toHaveBeenCalledWith('error', 'rate_card.workflow_metadata_invalid', expect.objectContaining({
      rateCardId: 'rate-card-1', field: 'notes',
    }));

    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({
      notes: '{}', items: [{ id: 'item-1', rate: 50, proposedRate: 45, comparisonRef: '{broken' }],
    }));
    await expect(POST(postRequest({ rateCardId: 'rate-card-1', items: [{ id: 'item-1', rate: 42 }] }))).resolves.toMatchObject({
      ok: false, error: UI_STRINGS.common.userMessages.failedToSubmitRateCardProposals, status: 500,
    });
    expect(batch).not.toHaveBeenCalled();
    expect(structuredLog).toHaveBeenLastCalledWith('error', 'rate_card.workflow_metadata_invalid', expect.objectContaining({
      rateCardId: 'rate-card-1', itemId: 'item-1', field: 'comparisonRef',
    }));
  });

  it('converts POST provider and JSON failures into API errors', async () => {
    db.vendorRateCard.findFirst.mockRejectedValueOnce(new Error('rate-card database error'));
    await expect(POST(postRequest({ rateCardId: 'rate-card-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToSubmitRateCardProposals, status: 500 });
    db.vendorRateCard.findFirst.mockRejectedValueOnce({});
    await expect(POST(postRequest({ rateCardId: 'rate-card-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToSubmitRateCardProposals, status: 500 });
    const badJson = { json: jest.fn().mockRejectedValue(new Error('invalid JSON')), headers: new Headers() } as unknown as NextRequest;
    await expect(POST(badJson)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToSubmitRateCardProposals, status: 500 });
    expect(structuredLog).toHaveBeenCalledWith('error', 'vendor_portal.rate_card_submission_failed', expect.objectContaining({
      operation: 'submit_vendor_rate_card', tenantId: 'tenant-1', actorId: 'user-1',
    }));
  });

  it('rejects duplicate, unknown, and non-positive quote lines before writing', async () => {
    db.vendorRateCard.findFirst.mockResolvedValue(card({ items: [{ id: 'item-1', comparisonRef: null }] }));
    await expect(POST(postRequest({ rateCardId: 'rate-card-1', items: [
      { id: 'item-1', rate: 10 }, { id: 'item-1', rate: 11 },
    ] }))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(POST(postRequest({ rateCardId: 'rate-card-1', items: [{ id: 'missing', rate: 10 }] }))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(POST(postRequest({ rateCardId: 'rate-card-1', items: [{ id: 'item-1', rate: 0 }] }))).resolves.toMatchObject({ ok: false, status: 400 });
    expect(batch).not.toHaveBeenCalled();
  });
});
