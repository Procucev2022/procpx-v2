import { existingCodes, currentYear } from './test-helpers/existing-codes';
import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { notifyNextResponsibleParty } from '../src/lib/notifications';
import { GET, POST } from '../src/app/api/procurement/quotes/route';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    quote: { findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
    rfq: { findFirst: jest.fn(), update: jest.fn() },
    rfqVendor: { findFirst: jest.fn(), upsert: jest.fn() },
    vendor: { findFirst: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
}));
jest.mock('../src/lib/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('../src/lib/notifications', () => ({ notifyNextResponsibleParty: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const errorResponse = apiError as jest.Mock;
const successResponse = apiSuccess as jest.Mock;
const audit = createAuditLog as jest.Mock;
const notify = notifyNextResponsibleParty as jest.Mock;
const context = {
  tenantId: 'tenant-1', userId: 'user-1', userName: 'Buyer One', userEmail: 'buyer@example.test', role: 'BUYER',
};
const getRequest = (query = '') => new NextRequest(`http://localhost/api/procurement/quotes${query}`);
const postRequest = (body: unknown) => new NextRequest('http://localhost/api/procurement/quotes', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const quoteBody = (overrides: Record<string, unknown> = {}) => ({
  rfqId: 'rfq-1', vendorId: 'vendor-1', lines: [{ rfqLineId: 'line-1', unitRate: 10 }], ...overrides,
});

describe('procurement quote routes', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    errorResponse.mockImplementation((error: string, status = 400) => ({ ok: false, error, status }));
    successResponse.mockImplementation((data: unknown, status = 200) => ({ ok: true, data, status }));
    // Version lookups see no earlier quotes; the quote-number lookup sees QTE-<year>-000002.
    db.quote.findMany.mockImplementation(async (args?: { select?: Record<string, unknown> }) =>
      (args?.select?.quoteNumber ? existingCodes('quoteNumber', `QTE-${currentYear}-`, 6, 2) : []));
    db.quote.create.mockResolvedValue({ id: 'quote-1', quoteNumber: 'QTE-2026-000003' });
    db.rfq.findFirst.mockResolvedValue({
      id: 'rfq-1', tenantId: 'tenant-1', projectId: 'project-1', rfqNumber: 'RFQ-001', status: 'RELEASED',
      lines: [{ id: 'line-1', quantity: 4 }, { id: 'line-2', quantity: 2 }],
    });
    db.rfq.update.mockResolvedValue({});
    db.rfqVendor.findFirst.mockResolvedValue({ id: 'invite-1' });
    db.rfqVendor.upsert.mockResolvedValue({});
    db.vendor.findFirst.mockResolvedValue({ id: 'vendor-1', name: 'Supplier One' });
    audit.mockResolvedValue(undefined);
    notify.mockResolvedValue(undefined);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('lists tenant quotes with optional RFQ and vendor filters', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(getRequest())).resolves.toBe(denied);

    db.quote.findMany.mockResolvedValueOnce([{ id: 'quote-1' }]);
    await expect(GET(getRequest('?rfqId=rfq-1&vendorId=vendor-1'))).resolves.toEqual({
      ok: true, data: { quotes: [{ id: 'quote-1' }], total: 1 }, status: 200,
    });
    expect(db.quote.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', rfqId: 'rfq-1', vendorId: 'vendor-1' },
      orderBy: [{ createdAt: 'desc' }],
    }));
    await GET(getRequest());
    expect(db.quote.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1' } }));

    db.quote.findMany.mockRejectedValueOnce(new Error('quote query failed'));
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: 'quote query failed', status: 500 });
    db.quote.findMany.mockRejectedValueOnce({});
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: 'Failed to fetch quotes', status: 500 });
  });

  it('validates quote fields, vendor ownership, RFQ access, invitation, status, and vendor access', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(postRequest(quoteBody()))).resolves.toBe(denied);
    await expect(POST(postRequest({ rfqId: 'rfq-1', vendorId: 'vendor-1', lines: [] }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementQuotesRoute.rFQIDVendorIDAndLinePricingAreRequired, status: 400,
    });

    auth.mockResolvedValueOnce({ ...context, role: 'VENDOR', vendorId: null });
    await expect(POST(postRequest(quoteBody()))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.forbiddenVendorRecordNotAssociatedWithThisUserAccount, status: 403,
    });
    auth.mockResolvedValueOnce({ ...context, role: 'VENDOR', vendorId: 'vendor-2' });
    await expect(POST(postRequest(quoteBody()))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementQuotesRoute.forbiddenYouCanOnlySubmitQuotesForYourOwnVendorAccount, status: 403,
    });

    db.rfq.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest(quoteBody()))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rFQNotFoundOrAccessDenied, status: 404 });
    auth.mockResolvedValueOnce({ ...context, role: 'VENDOR', vendorId: 'vendor-1' });
    db.rfqVendor.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest(quoteBody()))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.forbiddenVendorIsNotInvitedToThisRFQ, status: 403,
    });
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', status: 'DRAFT', lines: [] });
    await expect(POST(postRequest(quoteBody()))).resolves.toMatchObject({ ok: false, status: 400, error: expect.stringContaining('does not permit') });
    db.vendor.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest(quoteBody()))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.vendorNotFoundOrAccessDenied, status: 404 });
  });

  it('creates a first quote, calculates line amounts, and advances a released RFQ', async () => {
    await expect(POST(postRequest(quoteBody({
      lines: [
        { rfqLineId: 'line-1', unitRate: '10', taxPercent: 5, discountPercent: 10, remarks: 'Best rate' },
        { rfqLineId: 'missing-line', unitRate: 0, taxPercent: 0, discountPercent: 0 },
      ],
      commercialTerms: 'Net 30', paymentTermsOffered: '30 days', validUntil: '2026-12-31', deliveryLeadTimeDays: '14',
    })))).resolves.toMatchObject({ ok: true, status: 201, data: { quote: { id: 'quote-1' }, message: 'Quote v1 submitted successfully' } });

    expect(db.quote.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        quoteNumber: expect.stringMatching(/^QTE-\d{4}-000003$/), quoteVersion: 1, status: UI_STRINGS.common.sUBMITTED,
        totalBaseAmount: 40, discountAmount: 4, taxAmount: 1.8, totalQuoteAmount: 37.8,
        commercialTerms: 'Net 30', paymentTermsOffered: '30 days', deliveryLeadTimeDays: 14,
        validUntil: new Date('2026-12-31'), submittedBy: 'user-1',
        lines: { create: [
          expect.objectContaining({ rfqLineId: 'line-1', unitRate: 10, taxPercent: 5, discountPercent: 10, lineTotal: 37.8, remarks: 'Best rate' }),
          expect.objectContaining({ rfqLineId: 'missing-line', unitRate: 0, lineTotal: 0, remarks: null }),
        ] },
      }),
    }));
    expect(db.rfqVendor.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { rfqId_vendorId: { rfqId: 'rfq-1', vendorId: 'vendor-1' } },
      update: { submissionStatus: UI_STRINGS.common.sUBMITTED, invitationStatus: UI_STRINGS.common.sUBMITTED },
    }));
    expect(db.rfq.update).toHaveBeenCalledWith({ where: { id: 'rfq-1' }, data: { status: 'VENDOR_RESPONSE_OPEN' } });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'QUOTE_SUBMITTED', entityType: 'QUOTE', entityId: 'quote-1' }));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'QUOTE_SUBMITTED', recordNumber: 'RFQ-001' }));
  });

  it('creates revised quotes without reopening an RFQ and maps malformed requests or database errors', async () => {
    db.rfq.findFirst.mockResolvedValueOnce({
      id: 'rfq-1', tenantId: 'tenant-1', projectId: 'project-1', rfqNumber: 'RFQ-001', status: 'NEGOTIATION', lines: [],
    });
    db.quote.findMany.mockResolvedValueOnce([{ quoteVersion: 2 }]);
    await expect(POST(postRequest(quoteBody({ lines: [{ rfqLineId: 'line-x', unitRate: '25' }], status: 'REVISED' })))).resolves.toMatchObject({
      ok: true, status: 201, data: { message: 'Quote v3 submitted successfully' },
    });
    expect(db.quote.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ quoteVersion: 3, totalBaseAmount: 25 }) }));
    expect(db.rfq.update).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'QUOTE_REVISED' }));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'REVISED_QUOTE_RECEIVED' }));

    const malformed = { headers: new Headers({ 'content-type': 'application/json' }), json: jest.fn().mockRejectedValue(new Error('invalid quote body')) } as unknown as NextRequest;
    await expect(POST(malformed)).resolves.toEqual({ ok: false, error: 'invalid quote body', status: 500 });
    const generic = { headers: new Headers({ 'content-type': 'application/json' }), json: jest.fn().mockRejectedValue({}) } as unknown as NextRequest;
    await expect(POST(generic)).resolves.toEqual({ ok: false, error: 'Failed to submit quote', status: 500 });
  });
});
