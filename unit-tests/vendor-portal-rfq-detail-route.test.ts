import { NextRequest } from 'next/server';
import { GET, POST } from '../src/app/api/vendor-portal/rfqs/[id]/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { notifyNextResponsibleParty } from '../src/lib/notifications';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    rfq: { findFirst: jest.fn() },
    quote: { findMany: jest.fn(), findFirst: jest.fn() },
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

const db = prisma as unknown as Record<string, any>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
const notify = notifyNextResponsibleParty as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1', userName: 'Vendor Rep', role: 'VENDOR', vendorId: 'vendor-1' };
const params = (id = 'rfq-1') => ({ params: Promise.resolve({ id }) });
const getRequest = () => new NextRequest('http://localhost/api/vendor-portal/rfqs/rfq-1');
const postRequest = (body: unknown) => new NextRequest('http://localhost/api/vendor-portal/rfqs/rfq-1', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const rfq = (overrides: Record<string, any> = {}) => ({
  id: 'rfq-1', tenantId: 'tenant-1', rfqNumber: 'RFQ-001', status: 'RELEASED', title: 'Electrical Works',
  lines: [
    { id: 'line-1', lineNumber: '1', description: 'Cable', quantity: 2, uom: 'M' },
    { id: 'line-2', lineNumber: '2', description: 'Panel', quantity: 4, uom: 'EA' },
  ], ...overrides,
});
const transaction = () => ({
  quote: { create: jest.fn().mockResolvedValue({ id: 'quote-new', quoteNumber: 'QT-RFQ-001-01' }) },
  rfqVendor: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  rfq: { update: jest.fn().mockResolvedValue({ id: 'rfq-1', status: 'VENDOR_RESPONSE_OPEN' }) },
  negotiation: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue({}) },
  negotiationRound: { update: jest.fn().mockResolvedValue({ id: 'round-1', status: 'REVISED_SUBMITTED' }) },
  rfqMessage: { create: jest.fn().mockResolvedValue({ id: 'message-1' }) },
});

describe('vendor portal RFQ detail and quote API', () => {
  let consoleError: jest.SpyInstance;
  let tx: ReturnType<typeof transaction>;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.rfq.findFirst.mockReset().mockResolvedValue(rfq());
    db.quote.findMany.mockReset().mockResolvedValue([]);
    db.quote.findFirst.mockReset().mockResolvedValue(null);
    tx = transaction();
    db.$transaction.mockImplementation((callback: (value: typeof tx) => unknown) => callback(tx));
    audit.mockReset().mockResolvedValue(undefined);
    notify.mockReset().mockResolvedValue(undefined);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('requires a mapped vendor for both RFQ detail and quote submission', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(getRequest(), params())).resolves.toBe(denied);
    auth.mockResolvedValueOnce({ ...context, role: 'PROJECT_USER', vendorId: undefined });
    await expect(GET(getRequest(), params())).resolves.toEqual({
      ok: false, error: 'Forbidden: Vendor Portal is accessible only to mapped vendor accounts', status: 403,
    });
    auth.mockResolvedValueOnce({ ...context, role: 'VENDOR', vendorId: undefined });
    await expect(POST(postRequest({ lines: [] }), params())).resolves.toEqual({
      ok: false, error: 'Vendor record not associated with this user account', status: 404,
    });
    auth.mockResolvedValueOnce({ ...context, role: 'PROJECT_USER', vendorId: undefined });
    await expect(POST(postRequest({ lines: [] }), params())).resolves.toEqual({
      ok: false, error: 'Forbidden: Vendor Portal is accessible only to mapped vendor accounts', status: 403,
    });
  });

  it('fetches the invited vendor RFQ detail with quote, negotiation, and project data', async () => {
    const detail = rfq({
      tenant: { id: 'tenant-1', name: 'Client' }, project: { id: 'project-1', name: 'Campus', projectCode: 'P-1' },
      boqRevision: { id: 'rev-1', revisionNumber: 2 }, invitedVendors: [{ vendorId: 'vendor-1' }],
      quotes: [{ id: 'quote-1', quoteVersion: 2, lines: [{ id: 'quote-line-1' }] }], negotiations: [{ rounds: [{ id: 'round-1' }] }],
    });
    db.rfq.findFirst.mockResolvedValueOnce(detail);
    await expect(GET(getRequest(), params('rfq-custom'))).resolves.toEqual({ ok: true, data: { rfq: detail }, status: 200 });
    expect(db.rfq.findFirst).toHaveBeenCalledWith({
      where: { id: 'rfq-custom', tenantId: 'tenant-1', invitedVendors: { some: { vendorId: 'vendor-1' } } },
      include: expect.objectContaining({
        project: { select: { id: true, name: true, projectCode: true } },
        lines: { orderBy: { lineNumber: 'asc' } },
        invitedVendors: { where: { vendorId: 'vendor-1' } },
        quotes: { where: { vendorId: 'vendor-1' }, orderBy: { quoteVersion: 'desc' }, include: { lines: true } },
        negotiations: { include: { rounds: { where: { vendorId: 'vendor-1' }, orderBy: { roundNumber: 'desc' } } } },
      }),
    });
  });

  it('returns RFQ detail not-found and lookup errors', async () => {
    db.rfq.findFirst.mockResolvedValueOnce(null);
    await expect(GET(getRequest(), params())).resolves.toEqual({ ok: false, error: 'RFQ not found or access denied', status: 404 });
    db.rfq.findFirst.mockRejectedValueOnce(new Error('RFQ store offline'));
    await expect(GET(getRequest(), params())).resolves.toEqual({ ok: false, error: 'RFQ store offline', status: 500 });
    db.rfq.findFirst.mockRejectedValueOnce({});
    await expect(GET(getRequest(), params())).resolves.toEqual({ ok: false, error: 'Failed to fetch RFQ detail', status: 500 });
  });

  it('validates RFQ access, status, quote version limit, and required positive line rates', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(postRequest({ lines: [] }), params())).resolves.toBe(denied);
    db.rfq.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest({ lines: [{ rfqLineId: 'line-1', unitRate: 10 }] }), params())).resolves.toEqual({
      ok: false, error: 'RFQ not found or vendor not invited', status: 404,
    });
    db.rfq.findFirst.mockResolvedValueOnce(rfq({ status: 'DRAFT' }));
    await expect(POST(postRequest({ lines: [{ rfqLineId: 'line-1', unitRate: 10 }] }), params())).resolves.toEqual({
      ok: false, error: 'RFQ status (DRAFT) does not permit vendor quotation submissions', status: 400,
    });
    db.quote.findMany.mockResolvedValueOnce([{ quoteVersion: 20 }]);
    await expect(POST(postRequest({ lines: [{ rfqLineId: 'line-1', unitRate: 10 }] }), params())).resolves.toEqual({
      ok: false, error: 'Maximum limit of 20 quote versions reached per vendor for this RFQ.', status: 400,
    });

    db.quote.findMany.mockResolvedValueOnce([]);
    await expect(POST(postRequest({ lines: [] }), params())).resolves.toEqual({
      ok: false, error: 'Line-item quotation rates are mandatory before submitting.', status: 400,
    });
    db.quote.findMany.mockResolvedValueOnce([]);
    await expect(POST(postRequest({ lines: 'bad' }), params())).resolves.toEqual({
      ok: false, error: 'Line-item quotation rates are mandatory before submitting.', status: 400,
    });
    db.quote.findMany.mockResolvedValueOnce([]);
    await expect(POST(postRequest({ lines: [{ rfqLineId: 'line-1', unitRate: 10 }] }), params())).resolves.toEqual({
      ok: false, error: 'Line item 2 ("Panel") must have a valid positive unit rate before submission.', status: 400,
    });
    db.quote.findMany.mockResolvedValueOnce([]);
    await expect(POST(postRequest({ lines: [{ rfqLineId: 'line-1', unitRate: 10 }, { rfqLineId: 'line-2', unitRate: 0 }] }), params())).resolves.toMatchObject({
      ok: false, error: expect.stringContaining('must have a valid positive unit rate'), status: 400,
    });
  });

  it('returns an already-created quote on retry and identifies its version', async () => {
    db.quote.findMany.mockResolvedValueOnce([{ quoteVersion: 1 }]);
    const existing = { id: 'quote-existing', quoteVersion: 2 };
    db.quote.findFirst.mockResolvedValueOnce(existing);
    await expect(POST(postRequest({ lines: [{ rfqLineId: 'line-1', unitRate: 10 }, { rfqLineId: 'line-2', unitRate: 20 }] }), params()))
      .resolves.toEqual({ ok: true, data: { quote: existing, message: 'Quote Version 2 Submitted Successfully', version: 2 }, status: 200 });
    expect(db.$transaction).not.toHaveBeenCalled();

    db.quote.findMany.mockResolvedValueOnce([]);
    db.quote.findFirst.mockResolvedValueOnce({ id: 'quote-first', quoteVersion: 1 });
    await expect(POST(postRequest({ lines: [{ rfqLineId: 'line-1', unitRate: 10 }, { rfqLineId: 'line-2', unitRate: 20 }] }), params()))
      .resolves.toMatchObject({ ok: true, data: { message: '1st Quote Submitted Successfully', version: 1 } });
  });

  it('creates the initial quote, opens vendor response, updates invitation status, and notifies procurement', async () => {
    const result = await POST(postRequest({
      lines: [
        { rfqLineId: 'line-1', unitRate: 10, gstPercent: 18, remarks: 'Copper grade' },
        { rfqLineId: 'line-2', unitRate: 25 },
      ],
      commercialNotes: 'Valid for 30 days', validUntil: '2027-01-01', deliveryLeadTimeDays: '12',
    }), params());
    expect(result).toMatchObject({ ok: true, status: 201, data: { quote: { id: 'quote-new' }, message: '1st Quote Submitted Successfully', version: 1 } });
    expect(tx.quote.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      quoteNumber: 'QT-RFQ-001-01', quoteVersion: 1, totalBaseAmount: 120, taxAmount: expect.any(Number), totalQuoteAmount: 123.6,
      status: 'SUBMITTED', validUntil: new Date('2027-01-01'), commercialTerms: 'Valid for 30 days',
      deliveryLeadTimeDays: 12, submittedBy: 'Vendor Rep', lines: { create: [
        expect.objectContaining({ rfqLineId: 'line-1', unitRate: 10, taxPercent: 18, lineTotal: 23.6, remarks: 'Copper grade' }),
        expect.objectContaining({ rfqLineId: 'line-2', unitRate: 25, taxPercent: 0, lineTotal: 100, remarks: null }),
      ] },
    }), include: { lines: true } });
    expect(tx.quote.create.mock.calls[0][0].data.taxAmount).toBeCloseTo(3.6);
    expect(tx.rfqVendor.updateMany).toHaveBeenCalledWith({ where: { rfqId: 'rfq-1', vendorId: 'vendor-1' }, data: {
      invitationStatus: 'SUBMITTED', submissionStatus: 'SUBMITTED',
    } });
    expect(tx.rfq.update).toHaveBeenCalledWith({ where: { id: 'rfq-1' }, data: { status: 'VENDOR_RESPONSE_OPEN' } });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'VENDOR_QUOTE_SUBMITTED', entityId: 'quote-new' }));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'QUOTE_SUBMITTED', recordNumber: 'RFQ-001', actorName: 'Vendor Rep' }));
  });

  it('merges revised prices into an active buyer counteroffer round', async () => {
    db.rfq.findFirst.mockResolvedValueOnce(rfq({ status: 'COMPARISON', lines: [
      { id: 'line-1', lineNumber: '1', description: 'Cable', quantity: 2, uom: 'M' },
      { id: 'line-2', lineNumber: '2', description: '', quantity: 0, uom: '' },
    ] }));
    db.quote.findMany.mockResolvedValueOnce([{ quoteVersion: 1 }]);
    tx.negotiation.findFirst.mockResolvedValueOnce({ id: 'neg-1', rounds: [{
      id: 'round-1', roundNumber: 2, revisedQuoteAmount: null, nextResponsibleParty: 'VENDOR', status: 'ROUND_ACTIVE',
      lineItemsJson: JSON.stringify([
        { rfqLineId: 'line-1', description: 'Old cable', uom: 'M', quantity: 3, counterRate: 8 },
        { id: 'line-2', description: '', uom: '', quantity: 5, counterRate: 0 },
      ]),
    }] });
    const result = await POST(postRequest({ lines: [
      { rfqLineId: 'line-1', unitRate: 11, gstPercent: 10 }, { rfqLineId: 'line-2', id: 'line-2', unitRate: 22 }, { id: 'extra', unitRate: 3 },
    ] }), params());
    expect(result).toMatchObject({ ok: true, status: 201, data: { version: 2, message: 'Quote Version 2 Submitted Successfully' } });
    expect(tx.rfq.update).not.toHaveBeenCalled();
    expect(tx.negotiationRound.update).toHaveBeenCalledWith({ where: { id: 'round-1' }, data: expect.objectContaining({
      status: 'REVISED_SUBMITTED', nextResponsibleParty: 'BUYER', lineItemsJson: JSON.stringify([
        { rfqLineId: 'line-1', description: 'Cable', uom: 'M', quantity: 2, counterRate: 8, revisedRate: 11, lineTotal: 22 },
        { rfqLineId: 'line-2', description: 'Item', uom: 'Unit', quantity: 5, counterRate: 0, revisedRate: 22, lineTotal: 110 },
        { rfqLineId: 'extra', description: 'Item', uom: 'Unit', quantity: 1, counterRate: null, revisedRate: 3, lineTotal: 3 },
      ]),
    }) });
    expect(tx.negotiation.update).toHaveBeenCalledWith({ where: { id: 'neg-1' }, data: { bestQuoteAmount: expect.any(Number) } });
    expect(tx.rfqMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      senderName: 'Vendor Rep', senderRole: 'VENDOR', isVendorSent: true, message: expect.stringContaining('Quote v2'),
    }) });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'REVISED_QUOTE_RECEIVED', details: expect.objectContaining({ roundNumber: 2 }) }));
  });

  it('skips negotiation updates for a buyer-owned counteroffer with an existing revision', async () => {
    db.quote.findMany.mockResolvedValueOnce([{ quoteVersion: 1 }]);
    tx.negotiation.findFirst.mockResolvedValueOnce({ id: 'neg-1', rounds: [{
      id: 'round-1', revisedQuoteAmount: 300, nextResponsibleParty: 'BUYER', lineItemsJson: [{ id: 'line-1' }],
    }] });
    await POST(postRequest({ lines: [{ rfqLineId: 'line-1', unitRate: 10 }, { rfqLineId: 'line-2', unitRate: 20 }] }), params());
    expect(tx.negotiationRound.update).not.toHaveBeenCalled();
    expect(tx.negotiation.update).not.toHaveBeenCalled();
    expect(tx.rfqMessage.create).not.toHaveBeenCalled();
  });

  it('returns quote submission database and JSON errors', async () => {
    db.rfq.findFirst.mockRejectedValueOnce(new Error('quote store offline'));
    await expect(POST(postRequest({ lines: [{ rfqLineId: 'line-1', unitRate: 10 }] }), params())).resolves.toEqual({
      ok: false, error: 'quote store offline', status: 500,
    });
    db.rfq.findFirst.mockRejectedValueOnce({});
    await expect(POST(postRequest({ lines: [{ rfqLineId: 'line-1', unitRate: 10 }] }), params())).resolves.toEqual({
      ok: false, error: 'Failed to submit quotation', status: 500,
    });
    const badJson = { json: jest.fn().mockRejectedValue(new Error('malformed quote request')) } as unknown as NextRequest;
    await expect(POST(badJson, params())).resolves.toEqual({ ok: false, error: 'malformed quote request', status: 500 });
  });
});
