import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/procurement/negotiations/submit-offer/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { hasPermission } from '../src/lib/permissions';
import { dispatchPreparedWorkflowNotification, notifyNextResponsibleParty } from '../src/lib/notifications';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { NOTIFICATION_OUTBOX_INSERT_AFTER_AUDIT_SQL } from '../src/lib/notification-outbox.constants';
import {
  NEGOTIATION_ENSURE_ACTIVE_FOR_RFQ_SQL,
  NEGOTIATION_OFFER_AUDIT_INSERT_SQL,
  NEGOTIATION_OFFER_MESSAGE_INSERT_SQL,
  NEGOTIATION_OFFER_PARENT_UPDATE_SQL,
  NEGOTIATION_OFFER_QUOTE_INSERT_SQL,
  NEGOTIATION_OFFER_QUOTE_LINE_INSERT_AFTER_QUOTE_SQL,
  NEGOTIATION_OFFER_RFQ_UPDATE_SQL,
  NEGOTIATION_OFFER_ROUND_INSERT_SQL,
  NEGOTIATION_OFFER_ROUND_UPDATE_SQL,
} from '../src/lib/d1-batch.constants';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    rfq: { findFirst: jest.fn() },
    rfqVendor: { findFirst: jest.fn() },
    vendor: { findFirst: jest.fn() },
    negotiation: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    negotiationRound: { create: jest.fn(), update: jest.fn() },
    quote: { findMany: jest.fn(), create: jest.fn() },
    rfqLine: { findMany: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));
jest.mock('../src/lib/permissions', () => ({ hasPermission: jest.fn() }));
jest.mock('../src/lib/notifications', () => ({ notifyNextResponsibleParty: jest.fn(), dispatchPreparedWorkflowNotification: jest.fn() }));
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const permission = hasPermission as jest.Mock;
const notify = notifyNextResponsibleParty as jest.Mock;
const dispatchPrepared = dispatchPreparedWorkflowNotification as jest.Mock;
const writeBatch = writeD1BatchAtomically as jest.Mock;
const structuredLog = writeStructuredLog as jest.Mock;
const buyerContext = { tenantId: 'tenant-1', userId: 'buyer-1', userName: 'Buyer', role: 'CATEGORY_MANAGER' };
const vendorContext = { tenantId: 'tenant-1', userId: 'vendor-user-1', userName: 'Vendor Rep', role: 'VENDOR', vendorId: 'vendor-1' };
const request = (body: unknown) => new NextRequest('http://localhost/api/procurement/negotiations/submit-offer', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const rfq = (overrides: Record<string, any> = {}) => ({
  id: 'rfq-1', tenantId: 'tenant-1', rfqNumber: 'RFQ-001', status: 'COMPARISON', projectId: 'project-1',
  quotes: [{ vendorId: 'vendor-1', totalQuoteAmount: 1000 }], ...overrides,
});
const negotiation = (overrides: Record<string, any> = {}) => ({ id: 'neg-1', currentRound: 1, status: 'ACTIVE', rounds: [], ...overrides });

describe('negotiation offer submission API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(buyerContext);
    isContext.mockReturnValue(true);
    permission.mockReturnValue(true);
    db.rfq.findFirst.mockReset().mockResolvedValue(rfq());
    db.rfqVendor.findFirst.mockReset().mockResolvedValue({ vendorId: 'vendor-1' });
    db.vendor.findFirst.mockReset().mockResolvedValue({ id: 'vendor-1', name: 'Acme' });
    db.negotiation.findFirst.mockReset().mockResolvedValue(negotiation());
    db.quote.findMany.mockReset().mockResolvedValue([]);
    db.rfqLine.findMany.mockReset().mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
      Promise.resolve(where.id.in.map((id) => ({ id }))),
    );
    notify.mockReset().mockResolvedValue(undefined);
    writeBatch.mockReset().mockImplementation((statements: Array<{ sql: string }>) => Promise.resolve(statements.map(({ sql }) => ({
      ...(sql === NEGOTIATION_ENSURE_ACTIVE_FOR_RFQ_SQL ? { results: [{ id: 'neg-1' }] } : {}),
      ...(sql === NEGOTIATION_OFFER_ROUND_INSERT_SQL || sql === NEGOTIATION_OFFER_ROUND_UPDATE_SQL ? { results: [{ id: 'round-new' }] } : {}),
      meta: { changes: 1 },
    }))));
    structuredLog.mockReset().mockResolvedValue(undefined);
  });

  it('checks authentication, role permissions, vendor identity, required IDs, RFQ, vendor, and invitation', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(request({ rfqId: 'rfq-1', vendorId: 'vendor-1' }))).resolves.toBe(denied);

    auth.mockResolvedValueOnce({ ...vendorContext });
    permission.mockReturnValueOnce(false);
    await expect(POST(request({ rfqId: 'rfq-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementNegotiationsSubmitOfferRoute.forbiddenInsufficientVendorNegotiationPermissions, status: 403 });
    auth.mockResolvedValueOnce(buyerContext);
    permission.mockReturnValueOnce(false);
    await expect(POST(request({ rfqId: 'rfq-1', vendorId: 'vendor-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.forbiddenInsufficientPermissions, status: 403 });

    await expect(POST(request([]))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400,
    });

    auth.mockResolvedValueOnce({ ...vendorContext, vendorId: undefined });
    await expect(POST(request({ rfqId: 'rfq-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.forbiddenVendorRecordNotAssociatedWithThisUserAccount, status: 403 });
    auth.mockResolvedValueOnce(vendorContext);
    await expect(POST(request({ rfqId: 'rfq-1', vendorId: 'vendor-2' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementNegotiationsSubmitOfferRoute.forbiddenYouCanOnlySubmitOffersForYourOwnVendorAccount, status: 403 });
    await expect(POST(request({ rfqId: 'rfq-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementNegotiationsSubmitOfferRoute.rFQIDAndVendorIDAreRequired, status: 400 });

    db.rfq.findFirst.mockResolvedValueOnce(null);
    await expect(POST(request({ rfqId: 'missing', vendorId: 'vendor-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rFQNotFoundOrAccessDenied, status: 404 });
    db.rfq.findFirst.mockResolvedValueOnce(rfq({ status: 'DRAFT' }));
    await expect(POST(request({ rfqId: 'rfq-1', vendorId: 'vendor-1' }))).resolves.toMatchObject({ ok: false, error: expect.stringContaining('does not permit'), status: 400 });
    db.vendor.findFirst.mockResolvedValueOnce(null);
    await expect(POST(request({ rfqId: 'rfq-1', vendorId: 'vendor-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.vendorNotFound, status: 404 });

    auth.mockResolvedValueOnce(vendorContext);
    db.rfqVendor.findFirst.mockResolvedValueOnce(null);
    await expect(POST(request({ rfqId: 'rfq-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.forbiddenVendorIsNotInvitedToThisRFQ, status: 403 });
  });

  it('sends a buyer counteroffer, creates a negotiation, and updates RFQ messaging and notifications', async () => {
    db.negotiation.findFirst.mockResolvedValueOnce(null);
    notify.mockResolvedValueOnce({ tenantId: 'tenant-1', title: 'Counteroffer', message: 'Review counteroffer',
      targetRole: 'PROCUREMENT_USER', entityType: 'NEGOTIATION', entityId: 'rfq-1', recordNumber: 'RFQ-001' });
    const result = await POST(request({ rfqId: 'rfq-1', vendorId: 'vendor-1', counterOfferAmount: '800', notes: 'Reduce price', deadline: '2026-12-01' }));
    expect(result).toMatchObject({ ok: true, status: 201, data: { round: { id: expect.any(String), roundNumber: 1 }, message: expect.stringContaining('800') } });
    const statements = writeBatch.mock.calls[0][0];
    expect(statements.map((statement: { sql: string }) => statement.sql)).toEqual([
      NEGOTIATION_ENSURE_ACTIVE_FOR_RFQ_SQL,
      NEGOTIATION_OFFER_ROUND_INSERT_SQL,
      NEGOTIATION_OFFER_PARENT_UPDATE_SQL,
      NEGOTIATION_OFFER_RFQ_UPDATE_SQL,
      NEGOTIATION_OFFER_MESSAGE_INSERT_SQL,
      NEGOTIATION_OFFER_AUDIT_INSERT_SQL,
      NOTIFICATION_OUTBOX_INSERT_AFTER_AUDIT_SQL,
    ]);
    for (const statement of statements) {
      expect(statement.values).toHaveLength((statement.sql.match(/\?/g) || []).length);
    }
    expect(statements[1].values).toEqual(expect.arrayContaining([
      'tenant-1', 'rfq-1', 'vendor-1', 1, new Date('2026-12-01').toISOString(), 1000, 800, 'ROUND_ACTIVE', 'Reduce price',
    ]));
    expect(statements[4].values[4]).toBe(UI_STRINGS.appLoginPageConstants.buyer);
    expect(statements[4].values[5]).toBe('CATEGORY_MANAGER');
    expect(statements[4].values[6]).toEqual(expect.stringContaining('Buyer submitted counteroffer'));
    expect(statements[5].values[5]).toBe('BUYER_COUNTEROFFER_SUBMITTED');
    expect(JSON.parse(statements[5].values[7])).toMatchObject({ counterOfferAmount: 800 });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'COUNTER_OFFER_SENT', details: expect.objectContaining({ vendorName: 'Acme', amount: 800, roundNumber: 1 }) }), { prepareOnly: true });
    expect(dispatchPrepared).toHaveBeenCalledWith(expect.any(String), expect.any(Date), expect.objectContaining({ entityId: expect.any(String) }));
  });

  it('enforces buyer counteroffer caps and deduplicates recent identical offers', async () => {
    db.negotiation.findFirst.mockResolvedValueOnce(negotiation({ rounds: Array.from({ length: 20 }, (_, i) => ({
      vendorId: 'vendor-1', counterOfferAmount: 700 + i, revisedQuoteAmount: null, nextResponsibleParty: 'VENDOR', roundNumber: i + 1,
    })) }));
    await expect(POST(request({ rfqId: 'rfq-1', vendorId: 'vendor-1', counterOfferAmount: 500 }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementNegotiationsSubmitOfferRoute.maximumLimitOf20BuyerCounteroffersReachedForThisVendor, status: 400,
    });

    db.negotiation.findFirst.mockResolvedValueOnce(negotiation({ rounds: [{
      id: 'round-recent', vendorId: 'vendor-1', counterOfferAmount: 500, revisedQuoteAmount: null,
      createdAt: new Date(), roundNumber: 1,
    }] }));
    await expect(POST(request({ rfqId: 'rfq-1', vendorId: 'vendor-1', counterOfferAmount: 500 }))).resolves.toEqual({
      ok: true, data: { round: expect.objectContaining({ id: 'round-recent' }), message: UI_STRINGS.appApiProcurementNegotiationsSubmitOfferRoute.offerAlreadyRecorded }, status: 200,
    });
    expect(writeBatch).not.toHaveBeenCalled();
  });

  it('uses zero-value buyer fallbacks and never copies another vendor deadline or target price', async () => {
    auth.mockResolvedValueOnce({ ...buyerContext, userName: '' });
    db.rfq.findFirst.mockResolvedValueOnce(rfq({ status: 'NEGOTIATION', quotes: [] }));
    db.negotiation.findFirst.mockResolvedValueOnce(negotiation({ currentRound: 0, rounds: [{
      vendorId: 'vendor-other', roundNumber: 4, counterOfferAmount: 400, revisedQuoteAmount: 100,
      deadline: new Date('2026-12-01'), targetPrice: 750,
    }] }));
    const result = await POST(request({ rfqId: 'rfq-1', vendorId: 'vendor-1', counterOfferAmount: 0, revisedQuoteAmount: 0 }));
    expect(result).toMatchObject({ ok: true, data: { message: expect.stringContaining('0 dispatched') } });
    const statements = writeBatch.mock.calls[0][0];
    expect(statements[1].sql).toBe(NEGOTIATION_OFFER_ROUND_INSERT_SQL);
    expect(statements[1].values).toEqual(expect.arrayContaining([
      1, 0, 0, 'Buyer commercial counteroffer dispatched',
    ]));
    expect(statements[1].values[6]).toBeNull();
    expect(statements[1].values[7]).toBeNull();
    expect(statements[4].values[4]).toBe(UI_STRINGS.common.categoryManager);
    expect(statements[4].values[6]).toEqual(expect.stringContaining(UI_STRINGS.appAppProcurementVendorsIdPage.copy15km32b));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ details: expect.objectContaining({ amount: undefined }) }), { prepareOnly: true });
  });

  it('carries the vendor own round deadline and target price into its next offer', async () => {
    auth.mockResolvedValueOnce(vendorContext);
    db.rfq.findFirst.mockResolvedValueOnce(rfq({ status: 'NEGOTIATION', quotes: [] }));
    db.negotiation.findFirst.mockResolvedValueOnce(negotiation({ rounds: [{
      vendorId: 'vendor-1', roundNumber: 2, counterOfferAmount: 700, revisedQuoteAmount: 680,
      nextResponsibleParty: 'BUYER', deadline: new Date('2026-12-20'), targetPrice: 650, lineItemsJson: null,
      status: 'REVISED_SUBMITTED', createdAt: new Date('2026-11-01'),
    }] }));
    db.quote.findMany.mockResolvedValueOnce([]);
    await expect(POST(request({ rfqId: 'rfq-1', revisedQuoteAmount: 690, lineItems: [] })))
      .resolves.toMatchObject({ ok: true });
    expect(JSON.stringify(writeBatch.mock.calls[0][0])).toContain(new Date('2026-12-20').toISOString());
  });
  it('creates a revised vendor quote without a matching previous round and tolerates no line details', async () => {
    auth.mockResolvedValueOnce(vendorContext);
    db.rfq.findFirst.mockResolvedValueOnce(rfq({ status: 'NEGOTIATION', quotes: [] }));
    db.negotiation.findFirst.mockResolvedValueOnce(negotiation({ rounds: [{
      vendorId: 'vendor-other', roundNumber: 4, counterOfferAmount: 0, revisedQuoteAmount: 200,
      nextResponsibleParty: 'BUYER', deadline: new Date('2026-12-10'), targetPrice: 600,
    }] }));
    db.quote.findMany.mockResolvedValueOnce([]);
    await expect(POST(request({ rfqId: 'rfq-1', revisedQuoteAmount: 600, lineItems: [] })))
      .resolves.toMatchObject({ ok: true, status: 201, data: { message: expect.stringContaining('Revised offer of') } });
    const firstBatch = writeBatch.mock.calls[0][0];
    for (const statement of firstBatch) {
      expect(statement.values).toHaveLength((statement.sql.match(/\?/g) || []).length);
    }
    expect(firstBatch.map((statement: { sql: string }) => statement.sql)).toEqual([
      NEGOTIATION_ENSURE_ACTIVE_FOR_RFQ_SQL,
      NEGOTIATION_OFFER_ROUND_INSERT_SQL,
      NEGOTIATION_OFFER_QUOTE_INSERT_SQL,
      NEGOTIATION_OFFER_PARENT_UPDATE_SQL,
      NEGOTIATION_OFFER_RFQ_UPDATE_SQL,
      NEGOTIATION_OFFER_MESSAGE_INSERT_SQL,
      NEGOTIATION_OFFER_AUDIT_INSERT_SQL,
    ]);
    // The other bidder's round (round 4, its deadline and target price) must not be copied into this vendor's round.
    expect(firstBatch[1].values).not.toContain(4);
    expect(firstBatch[1].values).not.toContain(new Date('2026-12-10').toISOString());
    expect(firstBatch[1].values).toEqual(expect.arrayContaining([1, 'REVISED_SUBMITTED']));
    expect(firstBatch[2].values[4]).toBe('RFQ-001');
    expect(firstBatch[2].values.slice(11, 16)).toEqual([
      600 / 1.18, 600 - (600 / 1.18), 600, expect.any(String), 'Acme',
    ]);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      event: 'REVISED_QUOTE_RECEIVED', details: expect.objectContaining({ amount: 600, roundNumber: 1, isFinalOffer: false }),
    }), { prepareOnly: true });

    auth.mockResolvedValueOnce(vendorContext);
    db.rfq.findFirst.mockResolvedValueOnce(rfq({ quotes: [] }));
    db.negotiation.findFirst.mockResolvedValueOnce(negotiation({ rounds: [] }));
    db.quote.findMany.mockResolvedValueOnce([]);
    await POST(request({ rfqId: 'rfq-1', revisedQuoteAmount: 0 }));
    expect(writeBatch).toHaveBeenCalledTimes(2);
    expect(writeBatch.mock.calls[1][0].some((statement: { sql: string }) => statement.sql === NEGOTIATION_OFFER_QUOTE_INSERT_SQL)).toBe(false);
    expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({ details: expect.objectContaining({ amount: 0 }) }), { prepareOnly: true });
  });

  it('merges vendor revisions with object-form prior line details and preserves buyer rates', async () => {
    auth.mockResolvedValueOnce(vendorContext);
    db.rfq.findFirst.mockResolvedValueOnce(rfq({
      status: 'NEGOTIATION', quotes: [{ totalQuoteAmount: 1000 }],
    }));
    db.negotiation.findFirst.mockResolvedValueOnce(negotiation({ rounds: [{
      id: 'round-object', vendorId: 'vendor-1', roundNumber: 3, counterOfferAmount: 800, revisedQuoteAmount: null,
      nextResponsibleParty: 'VENDOR', lineItemsJson: [
        { id: 'line-1', description: 'Buyer cable', uom: 'M', quantity: 4, counterRate: 0 },
        { rfqLineId: 'line-2', description: 'Buyer panel', uom: 'EA', quantity: 5, counterRate: 20 },
      ],
    }] }));
    db.quote.findMany.mockResolvedValueOnce([{ quoteVersion: 2 }]);
    await POST(request({ rfqId: 'rfq-1', revisedQuoteAmount: 700, lineItems: [
      { id: 'line-1', revisedRate: 50 }, { rfqLineId: 'line-2', unitRate: 30, quantity: 0, lineTotal: 0 },
    ] }));
    const statements = writeBatch.mock.calls[0][0];
    const roundUpdate = statements.find((statement: { sql: string }) => statement.sql === NEGOTIATION_OFFER_ROUND_UPDATE_SQL);
    const merged = JSON.parse(roundUpdate.values[8] as string);
    expect(merged).toEqual([
      { rfqLineId: 'line-1', description: 'Buyer cable', uom: 'M', quantity: 4, counterRate: 0, revisedRate: 50, lineTotal: 200 },
      { rfqLineId: 'line-2', description: 'Buyer panel', uom: 'EA', quantity: 5, counterRate: 20, revisedRate: 30, lineTotal: 150 },
    ]);
    expect(roundUpdate.values).toEqual(expect.arrayContaining(['Vendor revised offer submitted', 'REVISED_SUBMITTED', 'Acme']));
    expect(statements.map((statement: { sql: string }) => statement.sql)).toContain(NEGOTIATION_OFFER_QUOTE_INSERT_SQL);
    const quoteLineStatements = statements.filter((statement: { sql: string }) => statement.sql === NEGOTIATION_OFFER_QUOTE_LINE_INSERT_AFTER_QUOTE_SQL);
    expect(quoteLineStatements).toHaveLength(2);
    expect(quoteLineStatements[0].values).toEqual(expect.arrayContaining(['line-1', 50, 50]));
    expect(quoteLineStatements[1].values).toEqual(expect.arrayContaining(['line-2', 30, 30]));
    const messageStatement = statements.find((statement: { sql: string }) => statement.sql === NEGOTIATION_OFFER_MESSAGE_INSERT_SQL);
    expect(messageStatement.values[6]).toContain('[REVISED OFFER]');
  });

  it('submits a vendor final revision against an active counteroffer and persists merged quote lines', async () => {
    auth.mockResolvedValueOnce({ ...vendorContext, userName: '' });
    db.rfq.findFirst.mockResolvedValueOnce(rfq({
      status: 'NEGOTIATION', quotes: [{ totalQuoteAmount: 1000 }],
    }));
    db.quote.findMany.mockResolvedValueOnce([{ quoteVersion: 1 }]);
    db.negotiation.findFirst.mockResolvedValueOnce(negotiation({ rounds: [{
      id: 'round-2', vendorId: 'vendor-1', roundNumber: 2, counterOfferAmount: 800, revisedQuoteAmount: null,
      nextResponsibleParty: 'VENDOR', createdAt: new Date('2026-01-01'), deadline: new Date('2026-12-01'), targetPrice: 750,
      lineItemsJson: '{bad json',
    }] }));
    const result = await POST(request({
      rfqId: 'rfq-1', revisedQuoteAmount: 700, isFinalOffer: true, submittedByVendor: 'Authorized Signatory',
      notes: '', lineItems: [
        { rfqLineId: 'line-1', description: 'Cable', uom: 'M', quantity: 2, revisedRate: 0, unitRate: 50, lineTotal: 0, remarks: '' },
        { id: 'line-2', unitRate: 30, quantity: 3, lineTotal: 90, remarks: 'Panel' },
      ],
    }));
    expect(result).toMatchObject({ ok: true, status: 201, data: { message: expect.stringContaining('Final offer of') } });
    expect(db.rfqVendor.findFirst).toHaveBeenCalledWith({ where: { rfqId: 'rfq-1', vendorId: 'vendor-1', tenantId: 'tenant-1' } });
    const statements = writeBatch.mock.calls[0][0];
    const roundUpdate = statements.find((statement: { sql: string }) => statement.sql === NEGOTIATION_OFFER_ROUND_UPDATE_SQL);
    expect(roundUpdate.values).toEqual(expect.arrayContaining([
      700, 300, 30, 'FINAL_OFFER_SUBMITTED', 'Submitted by vendor as binding final offer',
      'PENDING_BUYER_DECISION', 'BUYER', 'Authorized Signatory',
    ]));
    const merged = JSON.parse(roundUpdate.values[8] as string);
    expect(merged).toEqual([
      { rfqLineId: 'line-1', description: 'Cable', uom: 'M', quantity: 2, counterRate: null, revisedRate: 0, lineTotal: 0 },
      { rfqLineId: 'line-2', quantity: 3, counterRate: null, revisedRate: 30, lineTotal: 90 },
    ]);
    const quoteStatement = statements.find((statement: { sql: string }) => statement.sql === NEGOTIATION_OFFER_QUOTE_INSERT_SQL);
    expect(quoteStatement.values).toEqual(expect.arrayContaining(['RFQ-001', 700 / 1.18, 700 - (700 / 1.18), 700, 'Authorized Signatory']));
    const quoteLineStatements = statements.filter((statement: { sql: string }) => statement.sql === NEGOTIATION_OFFER_QUOTE_LINE_INSERT_AFTER_QUOTE_SQL);
    expect(quoteLineStatements[0].values).toEqual(expect.arrayContaining(['line-1', 50, 100, null]));
    expect(quoteLineStatements[1].values).toEqual(expect.arrayContaining(['line-2', 30, 90, 'Panel']));
    const messageStatement = statements.find((statement: { sql: string }) => statement.sql === NEGOTIATION_OFFER_MESSAGE_INSERT_SQL);
    expect(messageStatement.values.slice(4, 6)).toEqual(['Authorized Signatory', UI_STRINGS.common.vENDOR]);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'REVISED_QUOTE_RECEIVED', details: expect.objectContaining({ isFinalOffer: true, amount: 700, roundNumber: 2 }) }), { prepareOnly: true });
    expect(structuredLog).toHaveBeenCalledWith('warn', 'procurement.negotiation_line_items_invalid', expect.objectContaining({
      rfqId: 'rfq-1', vendorId: 'vendor-1', negotiationRoundId: 'round-2',
    }));
  });

  it('creates a vendor offer without a counteroffer, honors quote limits, and supports a normal revised offer', async () => {
    auth.mockResolvedValueOnce(vendorContext);
    db.negotiation.findFirst.mockResolvedValueOnce(negotiation({ rounds: [] }));
    db.quote.findMany.mockResolvedValueOnce([]);
    await expect(POST(request({ rfqId: 'rfq-1', revisedQuoteAmount: 900, lineItems: [{ id: 'line-1', unitRate: 20 }] })))
      .resolves.toMatchObject({ ok: true, status: 201, data: { message: expect.stringContaining('Revised offer of') } });
    const statements = writeBatch.mock.calls[0][0];
    expect(statements[1].sql).toBe(NEGOTIATION_OFFER_ROUND_INSERT_SQL);
    expect(statements[1].values).toEqual(expect.arrayContaining([1, 900, 'REVISED_SUBMITTED', 'BUYER', 'Acme']));
    expect(statements.some((statement: { sql: string }) => statement.sql === NEGOTIATION_OFFER_QUOTE_INSERT_SQL)).toBe(true);
    expect(statements.some((statement: { sql: string }) => statement.sql === NEGOTIATION_OFFER_QUOTE_LINE_INSERT_AFTER_QUOTE_SQL)).toBe(true);

    auth.mockResolvedValueOnce(vendorContext);
    db.quote.findMany.mockResolvedValueOnce([{ quoteVersion: 20 }]);
    await expect(POST(request({ rfqId: 'rfq-1', revisedQuoteAmount: 850 }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.maximumLimitOf20QuoteVersionsReachedPerVendorForThisRFQ, status: 400,
    });
  });

  it('maps provider errors into a safe API error and structured diagnostic', async () => {
    db.rfq.findFirst.mockRejectedValueOnce(new Error('negotiation database error'));
    await expect(POST(request({ rfqId: 'rfq-1', vendorId: 'vendor-1' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToSubmitNegotiationOffer, status: 500,
    });
    expect(structuredLog).toHaveBeenCalledWith('error', 'procurement.negotiation_offer_submission_failed', expect.objectContaining({
      operation: 'submit_offer', route: '/api/procurement/negotiations/submit-offer', tenantId: 'tenant-1',
      rfqId: 'rfq-1', vendorId: 'vendor-1', error: { name: 'Error', message: 'negotiation database error' },
    }), 'application');
    db.rfq.findFirst.mockRejectedValueOnce({});
    await expect(POST(request({ rfqId: 'rfq-1', vendorId: 'vendor-1' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToSubmitNegotiationOffer, status: 500,
    });
    const badJson = { json: jest.fn().mockRejectedValue(new Error('invalid offer body')) } as unknown as NextRequest;
    await expect(POST(badJson)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
  });
});
