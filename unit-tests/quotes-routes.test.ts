import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '../src/lib/api-utils';
import { dispatchPreparedWorkflowNotification, notifyNextResponsibleParty } from '../src/lib/notifications';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { GET, POST } from '../src/app/api/procurement/quotes/route';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { QUOTE_AUDIT_INSERT_AFTER_INSERT_SQL, QUOTE_INSERT_WITH_NEXT_VERSION_SQL, QUOTE_LINE_INSERT_SQL, RFQ_MARK_RESPONSE_OPEN_SQL, RFQ_VENDOR_SUBMITTED_UPSERT_SQL } from '../src/lib/d1-batch.constants';
import { NOTIFICATION_OUTBOX_INSERT_AFTER_QUOTE_AUDIT_SQL } from '../src/lib/notification-outbox.constants';


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    quote: { findMany: jest.fn(), count: jest.fn() },
    rfq: { findFirst: jest.fn() },
    rfqVendor: { findFirst: jest.fn() },
    vendor: { findFirst: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  getListPageWindow: (params: URLSearchParams) => {
    const rawPage = Number(params.get('page'));
    const rawSize = Number(params.get('pageSize'));
    const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 1_000_000) : 1;
    const pageSize = Number.isSafeInteger(rawSize) && rawSize > 0 ? Math.min(rawSize, 100) : 50;
    return { page, pageSize, skip: (page - 1) * pageSize };
  },
}));
jest.mock('../src/lib/notifications', () => ({ notifyNextResponsibleParty: jest.fn(), dispatchPreparedWorkflowNotification: jest.fn() }));
jest.mock('../src/lib/d1-batch', () => ({ isD1BatchWithinLimits: (input: Array<{ values: unknown[] }>) => input.reduce((total, item) => total + item.values.length, 0) <= 4500 && input.every((item) => item.values.length <= 100), writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn().mockResolvedValue({}) }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const errorResponse = apiError as jest.Mock;
const successResponse = apiSuccess as jest.Mock;
const notify = notifyNextResponsibleParty as jest.Mock;
const dispatchPrepared = dispatchPreparedWorkflowNotification as jest.Mock;
const batch = writeD1BatchAtomically as jest.Mock;
const log = writeStructuredLog as jest.Mock;
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
  let persistedQuoteVersion: number;
  let persistedQuoteNumber: string;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    errorResponse.mockImplementation((error: string, status = 400) => ({ ok: false, error, status }));
    successResponse.mockImplementation((data: unknown, status = 200) => ({ ok: true, data, status }));
    db.quote.findMany.mockResolvedValue([]);
    db.quote.count.mockResolvedValue(1);
    persistedQuoteVersion = 1;
    persistedQuoteNumber = 'QTE-2026-000003';
    batch.mockImplementation(async (statements: Array<{ values: unknown[] }>) => statements.map((_, index) => ({
      ...(index === 0 ? { results: [{
        id: statements[0].values[0],
        tenantId: 'tenant-1',
        rfqId: 'rfq-1',
        vendorId: 'vendor-1',
        quoteNumber: persistedQuoteNumber,
        quoteVersion: persistedQuoteVersion,
        status: persistedQuoteVersion > 1 ? 'REVISED' : 'SUBMITTED',
      }] } : {}),
      meta: { changes: 1 },
    })));
    db.rfq.findFirst.mockResolvedValue({
      id: 'rfq-1', tenantId: 'tenant-1', projectId: 'project-1', rfqNumber: 'RFQ-001', status: 'RELEASED',
      lines: [{ id: 'line-1', quantity: 4 }, { id: 'line-2', quantity: 2 }],
    });
    db.rfqVendor.findFirst.mockResolvedValue({ id: 'invite-1' });
    db.vendor.findFirst.mockResolvedValue({ id: 'vendor-1', name: 'Supplier One' });
    notify.mockImplementation(async (input: Record<string, unknown>, options: { prepareOnly?: boolean } = {}) => options.prepareOnly
      ? { tenantId: input.tenantId, title: String(input.event), message: String(input.event),
        targetRole: 'PROCUREMENT_USER', entityType: 'QUOTE', entityId: input.entityId, recordNumber: input.recordNumber }
      : undefined);
    log.mockResolvedValue({});
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('lists bounded tenant quote summaries with optional RFQ and vendor filters', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(getRequest())).resolves.toBe(denied);

    db.quote.findMany.mockResolvedValueOnce([{ id: 'quote-1' }]);
    db.quote.count.mockResolvedValueOnce(11);
    await expect(GET(getRequest('?rfqId=rfq-1&vendorId=vendor-1&page=2&pageSize=5'))).resolves.toEqual({
      ok: true, data: { quotes: [{ id: 'quote-1' }], total: 11, page: 2, pageSize: 5, totalPages: 3 }, status: 200,
    });
    expect(db.quote.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', rfqId: 'rfq-1', vendorId: 'vendor-1' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: 5, take: 5,
      include: expect.objectContaining({ lines: { include: { rfqLine: true } } }),
    }));
    await GET(getRequest());
    expect(db.quote.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1' }, skip: 0, take: 50, include: expect.not.objectContaining({ lines: expect.anything() }),
    }));

    db.quote.findMany.mockRejectedValueOnce(new Error('quote query failed'));
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchQuotes, status: 500 });
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

  it('creates a first quote and advances a released RFQ in one atomic batch', async () => {
    await expect(POST(postRequest(quoteBody({
      lines: [
        { rfqLineId: 'line-1', unitRate: '10', taxPercent: 5, discountPercent: 10, remarks: 'Best rate' },
        { rfqLineId: 'line-2', unitRate: 0, taxPercent: 0, discountPercent: 0 },
      ],
      commercialTerms: 'Net 30', paymentTermsOffered: '30 days', validUntil: '2026-12-31', deliveryLeadTimeDays: '14',
    })))).resolves.toMatchObject({ ok: true, status: 201, data: { quote: { quoteNumber: 'QTE-2026-000003', quoteVersion: 1 }, message: 'Quote v1 submitted successfully' } });

    const statements = batch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(statements.map(({ sql }) => sql)).toEqual([
      QUOTE_INSERT_WITH_NEXT_VERSION_SQL,
      QUOTE_LINE_INSERT_SQL,
      QUOTE_LINE_INSERT_SQL,
      RFQ_VENDOR_SUBMITTED_UPSERT_SQL,
      RFQ_MARK_RESPONSE_OPEN_SQL,
      QUOTE_AUDIT_INSERT_AFTER_INSERT_SQL,
      NOTIFICATION_OUTBOX_INSERT_AFTER_QUOTE_AUDIT_SQL,
    ]);
    expect(statements[0].values).toHaveLength(QUOTE_INSERT_WITH_NEXT_VERSION_SQL.split('?').length - 1);
    expect(statements[0].values).toEqual(expect.arrayContaining([40, 1.8, 4, 37.8, 'Net 30', '30 days', 14, 'user-1']));
    expect(statements[1].values).toEqual([expect.any(String), 'tenant-1', expect.any(String), 'line-1', 10, 5, 10, 37.8, 'Best rate']);
    expect(statements[2].values).toEqual([expect.any(String), 'tenant-1', expect.any(String), 'line-2', 0, 0, 0, 0, null]);
    expect(String(statements[5].values[4])).toContain('__QUOTE_NUMBER__');
    expect(String(statements[5].values[4])).toContain('__QUOTE_VERSION__');
    expect(JSON.parse(String(statements[5].values[5]))).toEqual(expect.objectContaining({ quoteNumber: '__QUOTE_NUMBER__', version: '__QUOTE_VERSION__' }));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'QUOTE_SUBMITTED', recordNumber: 'RFQ-001' }), { prepareOnly: true });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'REVISED_QUOTE_RECEIVED', recordNumber: 'RFQ-001' }), { prepareOnly: true });
    expect(dispatchPrepared).toHaveBeenCalledWith(expect.any(String), expect.any(Date), expect.objectContaining({ entityId: expect.any(String) }));
  });

  it('creates revised quotes without reopening an RFQ and maps malformed requests or database errors', async () => {
    persistedQuoteVersion = 3;
    db.rfq.findFirst.mockResolvedValueOnce({
      id: 'rfq-1', tenantId: 'tenant-1', projectId: 'project-1', rfqNumber: 'RFQ-001', status: 'NEGOTIATION', lines: [{ id: 'line-x', quantity: 1 }],
    });
    await expect(POST(postRequest(quoteBody({ lines: [{ rfqLineId: 'line-x', unitRate: '25' }], status: 'REVISED' })))).resolves.toMatchObject({
      ok: true, status: 201, data: { message: 'Quote v3 submitted successfully' },
    });
    expect(batch.mock.calls[0][0]).toHaveLength(5);
    expect(batch.mock.calls[0][0][3].sql).toBe(QUOTE_AUDIT_INSERT_AFTER_INSERT_SQL);
    expect(batch.mock.calls[0][0][4].sql).toBe(NOTIFICATION_OUTBOX_INSERT_AFTER_QUOTE_AUDIT_SQL);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'REVISED_QUOTE_RECEIVED' }), { prepareOnly: true });

    const malformed = { headers: new Headers({ 'content-type': 'application/json' }), json: jest.fn().mockRejectedValue(new Error('invalid quote body')) } as unknown as NextRequest;
    await expect(POST(malformed)).resolves.toEqual({ ok: false, error: 'Failed to submit quote', status: 500 });
    expect(log).toHaveBeenCalledWith('error', 'procurement.quote_submission_failed', expect.objectContaining({ operation: 'submit_quote', route: '/api/procurement/quotes' }));
    const generic = { headers: new Headers({ 'content-type': 'application/json' }), json: jest.fn().mockRejectedValue({}) } as unknown as NextRequest;
    await expect(POST(generic)).resolves.toEqual({ ok: false, error: 'Failed to submit quote', status: 500 });
  });

  it('rejects cross-RFQ, duplicate, and invalid price inputs before writing', async () => {
    await expect(POST(postRequest(quoteBody({ lines: [{ rfqLineId: 'other-rfq-line', unitRate: 10 }] })))).resolves.toMatchObject({
      ok: false, status: 400, error: UI_STRINGS.appApiVendorPortalRfqsIdRoute.lineItemsMustReferenceEachRFQLineExactlyOnce,
    });
    await expect(POST(postRequest(quoteBody({ lines: [
      { rfqLineId: 'line-1', unitRate: 10 }, { rfqLineId: 'line-1', unitRate: 12 },
    ] })))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(POST(postRequest(quoteBody({ lines: [{ rfqLineId: 'line-1', unitRate: 10, taxPercent: 101 }] })))).resolves.toMatchObject({
      ok: false, status: 400,
      error: UI_STRINGS.appApiProcurementQuotesRoute.linePricingValuesMustBeFiniteWithNonNegativeRatesAndTaxAndDiscountUpToOneHundredPercent,
    });
    expect(batch).not.toHaveBeenCalled();
  });

  it('rejects invalid optional terms and date inputs before persisting a quote', async () => {
    await expect(POST(postRequest(quoteBody({ commercialTerms: 12 })))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(POST(postRequest(quoteBody({ paymentTermsOffered: [] })))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(POST(postRequest(quoteBody({ deliveryLeadTimeDays: -1 })))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(POST(postRequest(quoteBody({ validUntil: 'not-a-date' })))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(POST(postRequest(quoteBody({ lines: [{ rfqLineId: 'line-1', unitRate: Number.MAX_VALUE }] })))).resolves.toMatchObject({
      ok: false, status: 400,
    });
    expect(batch).not.toHaveBeenCalled();
  });

  it('logs D1 batch failures and returns a stable response', async () => {
    batch.mockRejectedValueOnce(new Error('D1 is temporarily unavailable'));
    await expect(POST(postRequest(quoteBody()))).resolves.toEqual({
      ok: false, error: 'Failed to submit quote', status: 500,
    });
    expect(log).toHaveBeenCalledWith('error', 'procurement.quote_submission_failed', expect.objectContaining({
      tenantId: 'tenant-1', rfqId: 'rfq-1', vendorId: 'vendor-1',
      error: expect.objectContaining({ message: 'D1 is temporarily unavailable' }),
    }));
  });
});
