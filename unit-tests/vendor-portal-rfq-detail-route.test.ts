import { NextRequest } from 'next/server';
import { GET, POST } from '../src/app/api/vendor-portal/rfqs/[id]/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { dispatchPreparedWorkflowNotification, notifyNextResponsibleParty } from '../src/lib/notifications';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import {
  NEGOTIATION_BEST_QUOTE_UPDATE_SQL,
  NEGOTIATION_ROUND_MARK_REVISED_SQL,
  AUDIT_LOG_INSERT_SQL,
  QUOTE_INSERT_SQL,
  QUOTE_LINE_INSERT_SQL,
  RFQ_MARK_RESPONSE_OPEN_SQL,
  RFQ_MESSAGE_INSERT_SQL,
  RFQ_VENDOR_MARK_SUBMITTED_SQL,
} from '../src/lib/d1-batch.constants';
import { NOTIFICATION_OUTBOX_INSERT_AFTER_AUDIT_SQL } from '../src/lib/notification-outbox.constants';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { NEGOTIATION_HISTORY_PAGE_SIZE } from '../src/lib/negotiation-history.constants';
import { encodeNegotiationHistoryCursor } from '../src/lib/negotiation-history';


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    rfq: { findFirst: jest.fn() },
    quote: { findMany: jest.fn(), findFirst: jest.fn() },
    negotiation: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));
jest.mock('../src/lib/notifications', () => ({ notifyNextResponsibleParty: jest.fn(), dispatchPreparedWorkflowNotification: jest.fn() }));
jest.mock('../src/lib/d1-batch', () => ({ isD1BatchWithinLimits: (input: Array<{ values: unknown[] }>) => input.reduce((total, item) => total + item.values.length, 0) <= 4500 && input.every((item) => item.values.length <= 100), writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));

const db = prisma as unknown as Record<string, any>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const notify = notifyNextResponsibleParty as jest.Mock;
const dispatchNotification = dispatchPreparedWorkflowNotification as jest.Mock;
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
describe('vendor portal RFQ detail and quote API', () => {
  let consoleError: jest.SpyInstance;
  const writeBatch = writeD1BatchAtomically as jest.Mock;
  const structuredLog = writeStructuredLog as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.rfq.findFirst.mockReset().mockResolvedValue(rfq());
    db.quote.findMany.mockReset().mockResolvedValue([]);
    db.quote.findFirst.mockReset().mockResolvedValue(null);
    db.negotiation.findFirst.mockReset().mockResolvedValue(null);
    writeBatch.mockReset().mockResolvedValue([]);
    structuredLog.mockReset().mockResolvedValue({});
    notify.mockReset().mockImplementation(async (_input: unknown, options?: { prepareOnly?: boolean }) => options?.prepareOnly ? {
      tenantId: 'tenant-1', targetRole: 'PROCUREMENT_USER', title: 'Quote submitted', message: 'A quote was submitted',
      type: 'INFO', entityType: 'QUOTE', entityId: 'rfq-1', recordNumber: 'RFQ-001',
    } : undefined);
    dispatchNotification.mockReset().mockResolvedValue(undefined);
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
      ok: false, error: UI_STRINGS.common.forbiddenVendorPortalIsAccessibleOnlyToMappedVendorAccounts, status: 403,
    });
    auth.mockResolvedValueOnce({ ...context, role: 'VENDOR', vendorId: undefined });
    await expect(GET(getRequest(), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.vendorRecordNotAssociatedWithThisUserAccount, status: 404,
    });
    auth.mockResolvedValueOnce({ ...context, role: 'VENDOR', vendorId: undefined });
    await expect(POST(postRequest({ lines: [] }), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.vendorRecordNotAssociatedWithThisUserAccount, status: 404,
    });
    auth.mockResolvedValueOnce({ ...context, role: 'PROJECT_USER', vendorId: undefined });
    await expect(POST(postRequest({ lines: [] }), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.forbiddenVendorPortalIsAccessibleOnlyToMappedVendorAccounts, status: 403,
    });
  });

  it('fetches the invited vendor RFQ detail with quote, negotiation, and project data', async () => {
    const detail = rfq({
      tenant: { id: 'tenant-1', name: 'Client' }, project: { id: 'project-1', name: 'Campus', projectCode: 'P-1' },
      boqRevision: { id: 'rev-1', revisionNumber: 2 }, invitedVendors: [{ vendorId: 'vendor-1' }],
      quotes: [{ id: 'quote-1', quoteVersion: 2, lines: [{ id: 'quote-line-1' }] }], negotiations: [{ rounds: [{ id: 'round-1' }] }],
    });
    db.rfq.findFirst.mockResolvedValueOnce(detail);
    await expect(GET(getRequest(), params('rfq-custom'))).resolves.toEqual({
      ok: true,
      data: {
        rfq: detail,
        negotiationHistory: { nextCursor: null, hasMore: false, pageSize: NEGOTIATION_HISTORY_PAGE_SIZE },
      },
      status: 200,
    });
    expect(db.rfq.findFirst).toHaveBeenCalledWith({
      where: { id: 'rfq-custom', tenantId: 'tenant-1', invitedVendors: { some: { vendorId: 'vendor-1' } } },
      include: expect.objectContaining({
        project: { select: { id: true, name: true, projectCode: true } },
        lines: { orderBy: { lineNumber: 'asc' } },
        invitedVendors: { where: { vendorId: 'vendor-1' } },
        quotes: { where: { vendorId: 'vendor-1' }, orderBy: { quoteVersion: 'desc' }, include: { lines: true } },
        negotiations: {
          take: 1,
          orderBy: { updatedAt: 'desc' },
          include: {
            rounds: {
              where: { vendorId: 'vendor-1' },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: NEGOTIATION_HISTORY_PAGE_SIZE + 1,
            },
          },
        },
      }),
    });
  });

  it('bounds vendor negotiation history and reports an older-page cursor', async () => {
    const rounds = Array.from({ length: NEGOTIATION_HISTORY_PAGE_SIZE + 1 }, (_, index) => ({
      id: `round-${index + 1}`,
      vendorId: 'vendor-1',
      roundNumber: index + 1,
      createdAt: new Date(Date.UTC(2026, 10, 5, 0, 0, index)),
    }));
    db.rfq.findFirst.mockResolvedValueOnce(rfq({ negotiations: [{ id: 'neg-1', rounds }] }));

    const response = await GET(getRequest(), params());

    expect(response).toMatchObject({
      ok: true,
      data: {
        rfq: { negotiations: [{ rounds: rounds.slice(0, NEGOTIATION_HISTORY_PAGE_SIZE) }] },
        negotiationHistory: {
          nextCursor: encodeNegotiationHistoryCursor(rounds[NEGOTIATION_HISTORY_PAGE_SIZE - 1]),
          hasMore: true,
          pageSize: NEGOTIATION_HISTORY_PAGE_SIZE,
        },
      },
    });
  });

  it('returns RFQ detail not-found and lookup errors', async () => {
    db.rfq.findFirst.mockResolvedValueOnce(null);
    await expect(GET(getRequest(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rFQNotFoundOrAccessDenied, status: 404 });
    db.rfq.findFirst.mockRejectedValueOnce(new Error('RFQ store offline'));
    await expect(GET(getRequest(), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToFetchRfqDetail, status: 500,
    });
    expect(structuredLog).toHaveBeenCalledWith('error', 'vendor_portal.rfq_detail_failed', expect.objectContaining({
      operation: 'read_vendor_rfq_detail', route: '/api/vendor-portal/rfqs/rfq-1', tenantId: 'tenant-1',
      userId: 'user-1', vendorId: 'vendor-1', rfqId: 'rfq-1', durationMs: expect.any(Number),
      error: { name: 'Error', message: 'RFQ store offline' },
    }), 'application');
    db.rfq.findFirst.mockRejectedValueOnce({});
    await expect(GET(getRequest(), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToFetchRfqDetail, status: 500,
    });
    expect(structuredLog).toHaveBeenLastCalledWith('error', 'vendor_portal.rfq_detail_failed', expect.objectContaining({
      error: { type: 'object' },
    }), 'application');
    expect(consoleError).not.toHaveBeenCalled();

    structuredLog.mockRejectedValueOnce(new Error('log store offline'));
    db.rfq.findFirst.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(GET(getRequest(), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToFetchRfqDetail, status: 500,
    });
    expect(consoleError).toHaveBeenCalledWith('vendor_portal.rfq_detail_log_failed', expect.objectContaining({
      tenantId: 'tenant-1', rfqId: 'rfq-1', error: { name: 'Error', message: 'database unavailable' },
      loggingError: { name: 'Error' },
    }));
  });

  it('validates RFQ access, status, quote version limit, and required positive line rates', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(postRequest({ lines: [] }), params())).resolves.toBe(denied);
    db.rfq.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest({ lines: [{ rfqLineId: 'line-1', unitRate: 10 }] }), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiVendorPortalRfqsIdRoute.rFQNotFoundOrVendorNotInvited, status: 404,
    });
    db.rfq.findFirst.mockResolvedValueOnce(rfq({ status: 'DRAFT' }));
    await expect(POST(postRequest({ lines: [{ rfqLineId: 'line-1', unitRate: 10 }] }), params())).resolves.toEqual({
      ok: false, error: 'RFQ status (DRAFT) does not permit vendor quotation submissions', status: 400,
    });
    db.quote.findMany.mockResolvedValueOnce([{ quoteVersion: 20 }]);
    await expect(POST(postRequest({ lines: [{ rfqLineId: 'line-1', unitRate: 10 }] }), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.maximumLimitOf20QuoteVersionsReachedPerVendorForThisRFQ, status: 400,
    });

    db.quote.findMany.mockResolvedValueOnce([]);
    await expect(POST(postRequest({ lines: [] }), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiVendorPortalRfqsIdRoute.lineItemQuotationRatesAreMandatoryBeforeSubmitting, status: 400,
    });
    db.quote.findMany.mockResolvedValueOnce([]);
    await expect(POST(postRequest({ lines: 'bad' }), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiVendorPortalRfqsIdRoute.lineItemQuotationRatesAreMandatoryBeforeSubmitting, status: 400,
    });
    db.quote.findMany.mockResolvedValueOnce([]);
    await expect(POST(postRequest({ lines: [{ rfqLineId: 'line-1', unitRate: 10 }] }), params())).resolves.toEqual({
      ok: false, error: 'Line item 2 ("Panel") must have a valid positive unit rate before submission.', status: 400,
    });
    db.quote.findMany.mockResolvedValueOnce([]);
    await expect(POST(postRequest({ lines: [{ rfqLineId: 'line-1', unitRate: 10 }, { rfqLineId: 'line-2', unitRate: 0 }] }), params())).resolves.toMatchObject({
      ok: false, error: expect.stringContaining('must have a valid positive unit rate'), status: 400,
    });
    await expect(POST(postRequest({ lines: [
      { rfqLineId: 'line-1', unitRate: 10 }, { rfqLineId: 'line-2', unitRate: 20 }, { rfqLineId: 'other-rfq-line', unitRate: 30 },
    ] }), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiVendorPortalRfqsIdRoute.lineItemsMustReferenceEachRFQLineExactlyOnce, status: 400,
    });
    db.quote.findMany.mockResolvedValueOnce([]);
    await expect(POST(postRequest({ lines: [
      { rfqLineId: 'line-1', unitRate: 'not-a-number' }, { rfqLineId: 'line-2', unitRate: 20 },
    ] }), params())).resolves.toMatchObject({
      ok: false, error: expect.stringContaining('must have a valid positive unit rate'), status: 400,
    });
    await expect(POST(postRequest({ lines: [
      { rfqLineId: 'line-1', unitRate: 10 }, { rfqLineId: 'line-1', unitRate: 15 }, { rfqLineId: 'line-2', unitRate: 20 },
    ] }), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiVendorPortalRfqsIdRoute.lineItemsMustReferenceEachRFQLineExactlyOnce, status: 400,
    });
    await expect(POST(postRequest({ lines: [
      { rfqLineId: 'line-1', unitRate: 10, gstPercent: 'invalid' }, { rfqLineId: 'line-2', unitRate: 20 },
    ] }), params())).resolves.toMatchObject({
      ok: false, error: expect.stringContaining('must have a valid tax rate'), status: 400,
    });
    db.rfq.findFirst.mockResolvedValueOnce(rfq({ lines: [
      { id: 'line-1', lineNumber: null, description: '', quantity: 2, uom: 'M' },
      { id: 'line-2', lineNumber: '2', description: 'Panel', quantity: 4, uom: 'EA' },
    ] }));
    db.quote.findMany.mockResolvedValueOnce([]);
    await expect(POST(postRequest({ lines: [
      { rfqLineId: 'line-1', unitRate: 10, gstPercent: 101 }, { rfqLineId: 'line-2', unitRate: 20 },
    ] }), params())).resolves.toMatchObject({
      ok: false, error: expect.stringContaining('must have a valid tax rate'), status: 400,
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
    auth.mockResolvedValueOnce({ ...context, userName: '' });
    const result = await POST(postRequest({
      lines: [
        { rfqLineId: 'line-1', unitRate: 10, gstPercent: 18, remarks: 'Copper grade' },
        { rfqLineId: 'line-2', unitRate: 25 },
      ],
      commercialNotes: 'Valid for 30 days', validUntil: '2027-01-01', deliveryLeadTimeDays: '12',
    }), params());
    expect(result).toMatchObject({ ok: true, status: 201, data: { quote: {
      quoteNumber: 'QT-RFQ-001-01', quoteVersion: 1, totalBaseAmount: 120, totalQuoteAmount: 123.6,
      status: UI_STRINGS.common.sUBMITTED, validUntil: new Date('2027-01-01'), commercialTerms: 'Valid for 30 days',
      deliveryLeadTimeDays: 12, submittedBy: UI_STRINGS.common.vendorRepresentative, lines: [
        expect.objectContaining({ rfqLineId: 'line-1', unitRate: 10, taxPercent: 18, lineTotal: 23.6, remarks: 'Copper grade' }),
        expect.objectContaining({ rfqLineId: 'line-2', unitRate: 25, taxPercent: 0, lineTotal: 100, remarks: null }),
      ],
    }, message: '1st Quote Submitted Successfully', version: 1 } });
    const statements = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    const quoteInsert = statements.find(({ sql }) => sql === QUOTE_INSERT_SQL);
    expect(quoteInsert?.values).toEqual(expect.arrayContaining([
      'tenant-1', 'rfq-1', 'vendor-1', 'QT-RFQ-001-01', 1, 'SUBMITTED', 120, expect.any(Number), 0, 123.6,
      'Valid for 30 days', null, 12, new Date('2027-01-01').toISOString(), expect.any(String), UI_STRINGS.common.vendorRepresentative,
    ]));
    expect(quoteInsert?.values[8]).toBeCloseTo(3.6);
    expect(statements.filter(({ sql }) => sql === QUOTE_LINE_INSERT_SQL)).toHaveLength(2);
    expect(statements.some(({ sql }) => sql === RFQ_VENDOR_MARK_SUBMITTED_SQL)).toBe(true);
    expect(statements.some(({ sql }) => sql === RFQ_MARK_RESPONSE_OPEN_SQL)).toBe(true);
    const auditInsert = statements.find(({ sql }) => sql === AUDIT_LOG_INSERT_SQL);
    expect(auditInsert?.values).toEqual(expect.arrayContaining([
      'tenant-1', 'user-1', null, 'QUOTE', expect.any(String), 'VENDOR_QUOTE_SUBMITTED',
    ]));
    expect(statements.some(({ sql }) => sql === NOTIFICATION_OUTBOX_INSERT_AFTER_AUDIT_SQL)).toBe(true);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      event: 'QUOTE_SUBMITTED', recordNumber: 'RFQ-001', actorName: UI_STRINGS.common.vendorRepresentative,
      details: expect.objectContaining({ vendorName: UI_STRINGS.common.vendor }),
    }), { prepareOnly: true });
    expect(dispatchNotification).toHaveBeenCalledWith(expect.any(String), expect.any(Date), expect.objectContaining({ entityType: 'QUOTE' }));
  });

  it('merges revised prices into an active buyer counteroffer round', async () => {
    db.rfq.findFirst.mockResolvedValueOnce(rfq({ status: 'COMPARISON', lines: [
      { id: 'line-1', lineNumber: '1', description: 'Cable', quantity: 2, uom: 'M' },
      { id: 'line-2', lineNumber: '2', description: '', quantity: 0, uom: '' },
      { id: 'line-3', lineNumber: '3', description: 'Spare', quantity: 0, uom: 'EA' },
    ] }));
    db.quote.findMany.mockResolvedValueOnce([{ quoteVersion: 1 }]);
    db.negotiation.findFirst.mockResolvedValueOnce({ id: 'neg-1', rounds: [{
      id: 'round-1', roundNumber: 2, revisedQuoteAmount: null, nextResponsibleParty: 'VENDOR', status: 'ROUND_ACTIVE',
      lineItemsJson: [null,
        { rfqLineId: 'line-1', description: 'Old cable', uom: 'M', quantity: 3, counterRate: 8 },
        { id: 'line-2', description: '', uom: '', quantity: 5, counterRate: 0 },
      ],
    }] });
    const result = await POST(postRequest({ lines: [
      { rfqLineId: 'line-1', unitRate: 11, gstPercent: 10 },
      { rfqLineId: 'line-2', id: 'line-2', unitRate: 22 },
      { rfqLineId: 'line-3', unitRate: 3 },
    ] }), params());
    expect(result).toMatchObject({ ok: true, status: 201, data: { version: 2, message: 'Quote Version 2 Submitted Successfully' } });
    const statements = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(statements.some(({ sql }) => sql === RFQ_MARK_RESPONSE_OPEN_SQL)).toBe(false);
    expect(statements.find(({ sql }) => sql === NEGOTIATION_ROUND_MARK_REVISED_SQL)?.values).toEqual(expect.arrayContaining([
      expect.any(Number), JSON.stringify([
        { rfqLineId: 'line-1', description: 'Cable', uom: 'M', quantity: 2, counterRate: 8, revisedRate: 11, lineTotal: 22 },
        { rfqLineId: 'line-2', description: UI_STRINGS.appAppBoqStudioPage.item, uom: UI_STRINGS.common.unit, quantity: 5, counterRate: 0, revisedRate: 22, lineTotal: 110 },
        { rfqLineId: 'line-3', description: 'Spare', uom: 'EA', quantity: 1, counterRate: null, revisedRate: 3, lineTotal: 3 },
      ]), expect.any(String), 'round-1', 'tenant-1',
    ]));
    expect(statements.find(({ sql }) => sql === NEGOTIATION_BEST_QUOTE_UPDATE_SQL)?.values).toEqual([
      expect.any(Number), expect.any(String), 'neg-1', 'tenant-1',
    ]);
    expect(statements.find(({ sql }) => sql === RFQ_MESSAGE_INSERT_SQL)?.values).toEqual(expect.arrayContaining([
      'tenant-1', 'rfq-1', 'user-1', 'Vendor Rep', 'VENDOR', expect.stringContaining('Quote v2'), null, true, 'vendor-1',
    ]));
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'REVISED_QUOTE_RECEIVED', details: expect.objectContaining({ roundNumber: 2 }) }),
      { prepareOnly: true },
    );
  });

  it('skips negotiation updates for a buyer-owned counteroffer with an existing revision', async () => {
    db.quote.findMany.mockResolvedValueOnce([{ quoteVersion: 1 }]);
    db.negotiation.findFirst.mockResolvedValueOnce({ id: 'neg-1', rounds: [{
      id: 'round-1', revisedQuoteAmount: 300, nextResponsibleParty: 'BUYER', lineItemsJson: [{ id: 'line-1' }],
    }] });
    await POST(postRequest({ lines: [{ rfqLineId: 'line-1', unitRate: 10 }, { rfqLineId: 'line-2', unitRate: 20 }] }), params());
    const statements = writeBatch.mock.calls[0][0] as Array<{ sql: string }>;
    expect(statements.some(({ sql }) => sql === NEGOTIATION_ROUND_MARK_REVISED_SQL)).toBe(false);
    expect(statements.some(({ sql }) => sql === NEGOTIATION_BEST_QUOTE_UPDATE_SQL)).toBe(false);
    expect(statements.some(({ sql }) => sql === RFQ_MESSAGE_INSERT_SQL)).toBe(false);
  });

  it('recovers from malformed negotiation line snapshots and rejects oversized atomic submissions', async () => {
    db.negotiation.findFirst.mockResolvedValueOnce({ id: 'neg-1', rounds: [{
      id: 'round-malformed', roundNumber: 1, revisedQuoteAmount: null, nextResponsibleParty: 'VENDOR',
      lineItemsJson: '{malformed',
    }] });
    await POST(postRequest({ lines: [
      { rfqLineId: 'line-1', unitRate: 10 }, { rfqLineId: 'line-2', unitRate: 20 },
    ] }), params());
    const statements = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(statements.find(({ sql }) => sql === NEGOTIATION_ROUND_MARK_REVISED_SQL)?.values[1]).toContain('"counterRate":null');

    writeBatch.mockClear();
    const largeLines = Array.from({ length: 498 }, (_, index) => ({
      id: `large-line-${index}`, lineNumber: String(index + 1), description: `Item ${index + 1}`, quantity: 1, uom: 'EA',
    }));
    db.rfq.findFirst.mockResolvedValueOnce(rfq({ lines: largeLines }));
    db.quote.findMany.mockResolvedValueOnce([]);
    const tooLarge = await POST(postRequest({ lines: largeLines.map(({ id }) => ({ rfqLineId: id, unitRate: 1 })) }), params());
    expect(tooLarge).toEqual({
      ok: false, error: UI_STRINGS.appApiVendorPortalRfqsIdRoute.quotationHasTooManyLineItemsToSubmitAtomically, status: 400,
    });
    expect(writeBatch).not.toHaveBeenCalled();
  });

  it('returns quote submission database and JSON errors', async () => {
    db.rfq.findFirst.mockRejectedValueOnce(new Error('quote store offline'));
    await expect(POST(postRequest({ lines: [{ rfqLineId: 'line-1', unitRate: 10 }] }), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToSubmitQuotation, status: 500,
    });
    db.rfq.findFirst.mockRejectedValueOnce({});
    await expect(POST(postRequest({ lines: [{ rfqLineId: 'line-1', unitRate: 10 }] }), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToSubmitQuotation, status: 500,
    });
    const badJson = { json: jest.fn().mockRejectedValue(new Error('malformed quote request')) } as unknown as NextRequest;
    await expect(POST(badJson, params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToSubmitQuotation, status: 500 });
    expect(structuredLog).toHaveBeenCalledTimes(3);
  });
});
