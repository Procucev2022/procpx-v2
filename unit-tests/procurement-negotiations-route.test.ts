import { NextRequest } from 'next/server';
import { GET, POST } from '../src/app/api/procurement/negotiations/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { dispatchPreparedWorkflowNotification, notifyNextResponsibleParty } from '../src/lib/notifications';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { AUDIT_LOG_INSERT_AFTER_CHANGE_SQL, AUDIT_LOG_INSERT_SQL, NEGOTIATION_INSERT_IF_ABSENT_SQL, NEGOTIATION_ROUND_INSERT_SQL, NEGOTIATION_ROUND_SUPERSEDE_SQL, RFQ_MESSAGE_INSERT_SQL } from '../src/lib/d1-batch.constants';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { NOTIFICATION_OUTBOX_INSERT_AFTER_AUDIT_SQL } from '../src/lib/notification-outbox.constants';


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    negotiation: { findMany: jest.fn(), count: jest.fn(), groupBy: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    negotiationRound: { create: jest.fn(), update: jest.fn() },
    rfq: { findFirst: jest.fn(), update: jest.fn() },
    vendor: { findFirst: jest.fn() },
    rfqMessage: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  getListPageWindow: (params: URLSearchParams) => {
    const rawPage = Number(params.get('page'));
    const rawSize = Number(params.get('pageSize'));
    const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 1_000_000) : 1;
    const pageSize = Number.isSafeInteger(rawSize) && rawSize > 0 ? Math.min(rawSize, 100) : 50;
    return { page, pageSize, skip: (page - 1) * pageSize };
  },
}));
jest.mock('../src/lib/notifications', () => ({ notifyNextResponsibleParty: jest.fn(), dispatchPreparedWorkflowNotification: jest.fn() }));
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));

const db = prisma as unknown as Record<string, any>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const notify = notifyNextResponsibleParty as jest.Mock;
const dispatchPrepared = dispatchPreparedWorkflowNotification as jest.Mock;
const writeBatch = writeD1BatchAtomically as jest.Mock;
const structuredLog = writeStructuredLog as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'buyer-1', userName: 'Buyer', role: 'CATEGORY_MANAGER' };
const getRequest = (query = '') => new NextRequest(`http://localhost/api/procurement/negotiations${query}`);
const postRequest = (body: unknown) => new NextRequest('http://localhost/api/procurement/negotiations', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const rfq = (overrides: Record<string, any> = {}) => ({
  id: 'rfq-1', tenantId: 'tenant-1', rfqNumber: 'RFQ-1', status: 'RELEASED', projectId: 'project-1',
  lines: [{ id: 'line-1' }], invitedVendors: [{ vendorId: 'v1' }, { vendorId: 'v2' }],
  quotes: [{ vendorId: 'v1', quoteVersion: 1, totalQuoteAmount: 1000 }], ...overrides,
});
const negotiation = (overrides: Record<string, any> = {}) => ({ id: 'neg-1', status: 'ACTIVE', currentRound: 0, rounds: [], ...overrides });

describe('procurement negotiations API', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.negotiation.findMany.mockReset().mockResolvedValue([]);
    db.negotiation.count.mockReset().mockResolvedValue(0);
    db.negotiation.groupBy.mockReset().mockResolvedValue([]);
    db.negotiation.findFirst.mockReset().mockResolvedValue(negotiation());
    db.negotiation.create.mockReset().mockResolvedValue(negotiation());
    db.rfq.findFirst.mockReset().mockResolvedValue(rfq());
    db.vendor.findFirst.mockReset().mockImplementation(async ({ where }: any) => where.id === 'missing' ? null : ({ id: where.id, name: `Vendor ${where.id}` }));
    db.rfqMessage.create.mockReset().mockResolvedValue({ id: 'message-1' });
    writeBatch.mockReset().mockImplementation(async (statements: unknown[]) => statements.map(() => ({ meta: { changes: 1 } })));
    structuredLog.mockReset().mockResolvedValue({});
    notify.mockReset().mockResolvedValue(undefined);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('reads bounded negotiation summaries with aggregate status counts and maps read failures', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(getRequest())).resolves.toBe(denied);

    db.negotiation.findMany.mockResolvedValueOnce([{ id: 'neg-1' }]);
    db.negotiation.count.mockResolvedValueOnce(8);
    db.negotiation.groupBy.mockResolvedValueOnce([{ status: 'ACTIVE', _count: { _all: 5 } }, { status: 'CONCLUDED', _count: { _all: 3 } }]);
    await expect(GET(getRequest('?rfqId=rfq-1&page=2&pageSize=4'))).resolves.toEqual({ ok: true, data: {
      negotiations: [{ id: 'neg-1' }], total: 8, statusCounts: { ACTIVE: 5, CONCLUDED: 3 }, page: 2, pageSize: 4, totalPages: 2,
    }, status: 200 });
    expect(db.negotiation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1', rfqId: 'rfq-1' } }));
    await expect(GET(getRequest())).resolves.toEqual({ ok: true, data: {
      negotiations: [], total: 0, statusCounts: {}, page: 1, pageSize: 50, totalPages: 0,
    }, status: 200 });
    expect(db.negotiation.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1' } }));

    db.negotiation.findMany.mockRejectedValueOnce(new Error('negotiation list failed'));
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchNegotiations, status: 500 });
    db.negotiation.findMany.mockRejectedValueOnce({});
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: 'Failed to fetch negotiations', status: 500 });
  });

  it('rejects invalid requests, RFQ states, counteroffers, and locked negotiations', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(postRequest({}))).resolves.toBe(denied);
    await expect(POST(postRequest({}))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementNegotiationsRoute.rFQIDIsRequired, status: 400 });

    db.rfq.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest({ rfqId: 'missing' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rFQNotFoundOrAccessDenied, status: 404 });
    db.rfq.findFirst.mockResolvedValueOnce(rfq({ status: 'DRAFT' }));
    await expect(POST(postRequest({ rfqId: 'rfq-1' }))).resolves.toMatchObject({ ok: false, error: expect.stringContaining('does not permit'), status: 400 });
    for (const invalid of [0, -1, 'abc']) {
      await expect(POST(postRequest({ rfqId: 'rfq-1', counterOfferAmount: invalid }))).resolves.toEqual({
        ok: false, error: UI_STRINGS.appApiProcurementNegotiationsRoute.counterofferAmountMustBeAPositiveNumber, status: 400,
      });
    }
    db.negotiation.findFirst.mockResolvedValueOnce(negotiation({ status: 'CONCLUDED' }));
    await expect(POST(postRequest({ rfqId: 'rfq-1', vendorId: 'v1', counterOfferAmount: 800 }))).resolves.toMatchObject({
      ok: false, error: expect.stringContaining('already concluded'), status: 400,
    });
    db.negotiation.findFirst.mockResolvedValueOnce(negotiation({ status: 'CANCELLED' }));
    await expect(POST(postRequest({ rfqId: 'rfq-1', vendorId: 'v1' }))).resolves.toMatchObject({
      ok: false, error: expect.stringContaining('already cancelled'), status: 400,
    });
  });

  it('creates a negotiation and dispatches a mixed bulk counteroffer result', async () => {
    auth.mockResolvedValueOnce({ ...context, userName: '' });
    db.negotiation.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(negotiation({ id: 'neg-new', currentRound: 1 }));
    db.rfq.findFirst.mockResolvedValueOnce(rfq({ status: 'RELEASED', invitedVendors: [{ vendorId: 'v1' }, { vendorId: 'v2' }],
      quotes: [{ vendorId: 'v1', quoteVersion: 1, totalQuoteAmount: 1000 }] }));
    notify.mockResolvedValueOnce({ tenantId: 'tenant-1', title: 'Counteroffer', message: 'Review counteroffer',
      targetRole: 'PROCUREMENT_USER', entityType: 'NEGOTIATION', entityId: 'rfq-1', recordNumber: 'RFQ-1' });
    const result = await POST(postRequest({ rfqId: 'rfq-1', bulkAllEligible: true, counterOfferAmount: '800',
      targetPrice: 850, deadline: '2026-12-01', notes: 'Reduce the price', lineItemsJson: [{ id: 'line-1', counterRate: 80 }] }));
    expect(result).toMatchObject({ ok: true, status: 201, data: {
      summary: { totalSelected: 2, dispatchedCount: 1, failedCount: 1 },
      dispatched: [{ vendorId: 'v1', status: 'DISPATCHED', roundNumber: 1, counterOfferAmount: 800 }],
      failed: [{ vendorId: 'v2', status: 'FAILED', reason: expect.stringContaining('has not submitted') }],
    } });
    expect(db.negotiation.create).not.toHaveBeenCalled();
    const createStatements = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(createStatements.map(({ sql }) => sql)).toEqual([NEGOTIATION_INSERT_IF_ABSENT_SQL, AUDIT_LOG_INSERT_AFTER_CHANGE_SQL]);
    expect(createStatements[0].values).toEqual(expect.arrayContaining(['tenant-1', 'rfq-1']));
    expect(createStatements[1].values).toEqual(expect.arrayContaining(['NEGOTIATION_CREATED', expect.stringContaining('RFQ-1')]));
    const statements = writeBatch.mock.calls[1][0] as Array<{ sql: string; values: unknown[] }>;
    const insertedRound = statements.find(({ sql }) => sql === NEGOTIATION_ROUND_INSERT_SQL);
    expect(insertedRound?.values).toEqual(expect.arrayContaining([
      'tenant-1', 'neg-new', 'v1', 1, new Date('2026-12-01').toISOString(), 850, 1000, 800, null,
      'ROUND_ACTIVE', 'Reduce the price', 'VENDOR', JSON.stringify([{ id: 'line-1', counterRate: 80 }]),
    ]));
    expect(statements.some(({ sql }) => sql === RFQ_MESSAGE_INSERT_SQL)).toBe(true);
    expect(statements[statements.length - 1].sql).toBe(NOTIFICATION_OUTBOX_INSERT_AFTER_AUDIT_SQL);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'COUNTER_OFFER_SENT', details: { vendorName: 'Vendor v1', amount: 800, roundNumber: 1 } }), { prepareOnly: true });
    expect(dispatchPrepared).toHaveBeenCalledWith(expect.any(String), expect.any(Date), expect.objectContaining({ entityId: expect.any(String) }));
  });

  it('handles pending rounds, confirmation failures, recent duplicates, and capped vendors', async () => {
    db.negotiation.findFirst.mockResolvedValueOnce(negotiation({ rounds: [{ id: 'pending', vendorId: 'v1', status: 'ROUND_ACTIVE',
      counterOfferAmount: 800, revisedQuoteAmount: null, nextResponsibleParty: 'VENDOR', roundNumber: 2, notes: 'Waiting' }] }));
    const pending = await POST(postRequest({ rfqId: 'rfq-1', vendorId: 'v1', counterOfferAmount: 700 }));
    expect(pending.status).toBe(400);
    await expect(pending.json()).resolves.toMatchObject({ requiresSupersedeConfirm: true, pendingRoundNumber: 2, pendingAmount: 800 });
    expect(writeBatch).not.toHaveBeenCalled();

    db.negotiation.findFirst.mockResolvedValueOnce(negotiation({ rounds: [{ id: 'recent', vendorId: 'v1', status: 'ROUND_ACTIVE',
      counterOfferAmount: 700, revisedQuoteAmount: null, nextResponsibleParty: 'VENDOR', roundNumber: 1, createdAt: new Date() }] }));
    const duplicate = await POST(postRequest({ rfqId: 'rfq-1', vendorIds: ['v1'], counterOfferAmount: 700, allowSupersede: true }));
    expect(duplicate).toMatchObject({ ok: true, status: 201, data: { dispatched: [{ isDuplicate: true, roundNumber: 1 }] } });

    db.negotiation.findFirst.mockResolvedValueOnce(negotiation({ rounds: Array.from({ length: 4 }, (_, index) => ({
      vendorId: 'v1', status: 'ROUND_ACTIVE', counterOfferAmount: 500 + index, revisedQuoteAmount: null,
      nextResponsibleParty: 'BUYER', roundNumber: index + 1,
    })) }));
    const capped = await POST(postRequest({ rfqId: 'rfq-1', vendorIds: ['v1'], counterOfferAmount: 400 }));
    expect(capped).toMatchObject({ ok: true, status: 400, data: { failed: [{ reason: expect.stringContaining('Maximum limit of 4') }] } });

    db.negotiation.findFirst.mockResolvedValueOnce(negotiation({ rounds: [
      { vendorId: 'v1', status: 'SUPERSEDED', roundNumber: 1, counterOfferAmount: 900, revisedQuoteAmount: null },
      { vendorId: 'v1', status: 'ROUND_ACTIVE', roundNumber: 2, counterOfferAmount: 600, revisedQuoteAmount: 500, nextResponsibleParty: 'BUYER' },
    ] }));
    await POST(postRequest({ rfqId: 'rfq-1', vendorId: 'v1', counterOfferAmount: 450 }));
    const afterSupersede = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(afterSupersede.find(({ sql }) => sql === NEGOTIATION_ROUND_INSERT_SQL)?.values[4]).toBe(3);
  });

  it('supersedes an approved pending offer and accepts vendor revisions through single dispatch', async () => {
    db.negotiation.findFirst.mockResolvedValueOnce(negotiation({ rounds: [{ id: 'old-round', vendorId: 'v1', status: 'ROUND_ACTIVE',
      counterOfferAmount: 800, revisedQuoteAmount: null, nextResponsibleParty: 'VENDOR', roundNumber: 1, notes: 'Waiting' }] }));
    const superseded = await POST(postRequest({ rfqId: 'rfq-1', vendorId: 'v1', counterOfferAmount: 700, allowSupersede: true }));
    expect(superseded).toMatchObject({ ok: true, status: 201, data: { message: expect.stringContaining('Superseding Buyer Offer') } });
    const supersedeStatements = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(supersedeStatements[0]).toMatchObject({
      sql: NEGOTIATION_ROUND_SUPERSEDE_SQL,
      values: ['Waiting [Superseded by Buyer Offer Round 2]', expect.any(String), 'old-round', 'tenant-1'],
    });
    expect(supersedeStatements.some(({ sql }) => sql === AUDIT_LOG_INSERT_SQL)).toBe(true);

    db.negotiation.findFirst.mockResolvedValueOnce(negotiation({ currentRound: 1, rounds: [] }));
    const revision = await POST(postRequest({ rfqId: 'rfq-1', vendorId: 'v1', revisedQuoteAmount: 900, lineItemsJson: '[]' }));
    expect(revision).toMatchObject({ ok: true, status: 201, data: { message: expect.stringContaining('Vendor Revised Quote') } });
    const revisionStatements = writeBatch.mock.calls[1][0] as Array<{ sql: string; values: unknown[] }>;
    expect(revisionStatements.find(({ sql }) => sql === NEGOTIATION_ROUND_INSERT_SQL)?.values).toEqual(expect.arrayContaining([
      'tenant-1', 'neg-1', 'v1', 1, null, null, 1000, null, 900, 'REVISED_SUBMITTED', 'BUYER', '[]',
    ]));
    expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({ event: 'REVISED_QUOTE_RECEIVED' }), { prepareOnly: true });

    auth.mockResolvedValueOnce({ ...context, userName: '' });
    db.negotiation.findFirst.mockResolvedValueOnce(negotiation({ currentRound: 0, rounds: null }));
    const targetOnly = await POST(postRequest({ rfqId: 'rfq-1', vendorId: 'v1', targetPrice: 750 }));
    expect(targetOnly).toMatchObject({ ok: true, status: 201, data: { message: 'Buyer Offer Submitted Successfully (Round 1)' } });
    const targetOnlyStatements = writeBatch.mock.calls[2][0] as Array<{ sql: string; values: unknown[] }>;
    expect(targetOnlyStatements.find(({ sql }) => sql === NEGOTIATION_ROUND_INSERT_SQL)?.values).toEqual(expect.arrayContaining([
      'tenant-1', 'neg-1', 'v1', 1, null, 750, 1000, null, null, 0, 'ROUND_ACTIVE', 'VENDOR', null,
    ]));
    expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({ event: 'COUNTER_OFFER_SENT', details: { vendorName: 'Vendor v1', amount: undefined, roundNumber: 1 } }), { prepareOnly: true });
  });

  it('returns single-vendor failures and maps provider or request errors', async () => {
    await expect(POST(postRequest({ rfqId: 'rfq-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementNegotiationsRoute.vendorIDIsRequiredForSingleCounterofferDispatch, status: 400 });
    db.vendor.findFirst.mockResolvedValueOnce(null);
    const missing = await POST(postRequest({ rfqId: 'rfq-1', vendorId: 'missing' }));
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toMatchObject({ error: 'Vendor not found' });
    db.vendor.findFirst.mockResolvedValueOnce({ id: 'v3', name: 'Vendor v3' });
    const uninvited = await POST(postRequest({ rfqId: 'rfq-1', vendorId: 'v3' }));
    expect(uninvited.status).toBe(400);
    await expect(uninvited.json()).resolves.toMatchObject({ error: expect.stringContaining('is not invited') });
    db.rfq.findFirst.mockResolvedValueOnce(rfq({ quotes: [] }));
    const noQuote = await POST(postRequest({ rfqId: 'rfq-1', vendorIds: ['v1'] }));
    expect(noQuote).toMatchObject({ ok: true, status: 400, data: { failed: [{ reason: expect.stringContaining('has not submitted') }] } });
    db.rfq.findFirst.mockRejectedValueOnce(new Error('negotiation write failed'));
    await expect(POST(postRequest({ rfqId: 'rfq-1', vendorId: 'v1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToCreateNegotiationRound, status: 500 });
    db.rfq.findFirst.mockRejectedValueOnce({});
    await expect(POST(postRequest({ rfqId: 'rfq-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToCreateNegotiationRound, status: 500 });
    const badJson = { json: jest.fn().mockRejectedValue(new Error('invalid negotiation payload')) } as unknown as NextRequest;
    await expect(POST(badJson)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToCreateNegotiationRound, status: 500 });
    expect(structuredLog).toHaveBeenCalledTimes(3);
  });
});
