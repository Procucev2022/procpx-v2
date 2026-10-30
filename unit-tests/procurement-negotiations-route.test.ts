import { NextRequest } from 'next/server';
import { GET, POST } from '../src/app/api/procurement/negotiations/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { notifyNextResponsibleParty } from '../src/lib/notifications';

const transaction = {
  negotiationRound: { create: jest.fn(), update: jest.fn() },
  negotiation: { update: jest.fn() },
  rfq: { update: jest.fn() },
};

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    negotiation: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
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
}));
jest.mock('../src/lib/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('../src/lib/notifications', () => ({ notifyNextResponsibleParty: jest.fn() }));

const db = prisma as unknown as Record<string, any>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
const notify = notifyNextResponsibleParty as jest.Mock;
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
    db.negotiation.findFirst.mockReset().mockResolvedValue(negotiation());
    db.negotiation.create.mockReset().mockResolvedValue(negotiation());
    db.rfq.findFirst.mockReset().mockResolvedValue(rfq());
    db.vendor.findFirst.mockReset().mockImplementation(async ({ where }: any) => where.id === 'missing' ? null : ({ id: where.id, name: `Vendor ${where.id}` }));
    db.rfqMessage.create.mockReset().mockResolvedValue({ id: 'message-1' });
    db.$transaction.mockReset().mockImplementation((callback: (tx: typeof transaction) => unknown) => callback(transaction));
    transaction.negotiationRound.create.mockReset().mockResolvedValue({ id: 'round-new', roundNumber: 1 });
    transaction.negotiationRound.update.mockReset().mockResolvedValue({ id: 'round-old' });
    transaction.negotiation.update.mockReset().mockResolvedValue({});
    transaction.rfq.update.mockReset().mockResolvedValue({});
    audit.mockReset().mockResolvedValue(undefined);
    notify.mockReset().mockResolvedValue(undefined);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('reads negotiation history with optional RFQ scope and maps read failures', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(getRequest())).resolves.toBe(denied);

    db.negotiation.findMany.mockResolvedValueOnce([{ id: 'neg-1' }]);
    await expect(GET(getRequest('?rfqId=rfq-1'))).resolves.toEqual({ ok: true, data: { negotiations: [{ id: 'neg-1' }], total: 1 }, status: 200 });
    expect(db.negotiation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1', rfqId: 'rfq-1' } }));
    await expect(GET(getRequest())).resolves.toEqual({ ok: true, data: { negotiations: [], total: 0 }, status: 200 });
    expect(db.negotiation.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1' } }));

    db.negotiation.findMany.mockRejectedValueOnce(new Error('negotiation list failed'));
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: 'negotiation list failed', status: 500 });
    db.negotiation.findMany.mockRejectedValueOnce({});
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: 'Failed to fetch negotiations', status: 500 });
  });

  it('rejects invalid requests, RFQ states, counteroffers, and locked negotiations', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(postRequest({}))).resolves.toBe(denied);
    await expect(POST(postRequest({}))).resolves.toEqual({ ok: false, error: 'RFQ ID is required', status: 400 });

    db.rfq.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest({ rfqId: 'missing' }))).resolves.toEqual({ ok: false, error: 'RFQ not found or access denied', status: 404 });
    db.rfq.findFirst.mockResolvedValueOnce(rfq({ status: 'DRAFT' }));
    await expect(POST(postRequest({ rfqId: 'rfq-1' }))).resolves.toMatchObject({ ok: false, error: expect.stringContaining('does not permit'), status: 400 });
    for (const invalid of [0, -1, 'abc']) {
      await expect(POST(postRequest({ rfqId: 'rfq-1', counterOfferAmount: invalid }))).resolves.toEqual({
        ok: false, error: 'Counteroffer amount must be a positive number', status: 400,
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
    db.negotiation.findFirst.mockResolvedValueOnce(null);
    db.negotiation.create.mockResolvedValueOnce(negotiation({ id: 'neg-new', currentRound: 1 }));
    db.rfq.findFirst.mockResolvedValueOnce(rfq({ status: 'RELEASED', invitedVendors: [{ vendorId: 'v1' }, { vendorId: 'v2' }],
      quotes: [{ vendorId: 'v1', quoteVersion: 1, totalQuoteAmount: 1000 }] }));
    const result = await POST(postRequest({ rfqId: 'rfq-1', bulkAllEligible: true, counterOfferAmount: '800',
      targetPrice: 850, deadline: '2026-12-01', notes: 'Reduce the price', lineItemsJson: [{ id: 'line-1', counterRate: 80 }] }));
    expect(result).toMatchObject({ ok: true, status: 201, data: {
      summary: { totalSelected: 2, dispatchedCount: 1, failedCount: 1 },
      dispatched: [{ vendorId: 'v1', status: 'DISPATCHED', roundNumber: 1, counterOfferAmount: 800 }],
      failed: [{ vendorId: 'v2', status: 'FAILED', reason: expect.stringContaining('has not submitted') }],
    } });
    expect(db.negotiation.create).toHaveBeenCalledWith(expect.objectContaining({ data: { tenantId: 'tenant-1', rfqId: 'rfq-1', currentRound: 1, status: 'ACTIVE' } }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'NEGOTIATION_CREATED' }));
    expect(transaction.negotiationRound.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      vendorId: 'v1', roundNumber: 1, deadline: new Date('2026-12-01'), targetPrice: 850, previousQuoteAmount: 1000,
      counterOfferAmount: 800, revisedQuoteAmount: null, status: 'ROUND_ACTIVE', notes: 'Reduce the price',
      lineItemsJson: JSON.stringify([{ id: 'line-1', counterRate: 80 }]), nextResponsibleParty: 'VENDOR',
    }), include: { vendor: true } });
    expect(transaction.rfq.update).toHaveBeenCalledWith({ where: { id: 'rfq-1' }, data: { status: 'NEGOTIATION' } });
    expect(db.rfqMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({ senderName: 'Category Manager', isVendorSent: false }) });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'COUNTER_OFFER_SENT', details: { vendorName: 'Vendor v1', amount: 800, roundNumber: 1 } }));
  });

  it('handles pending rounds, confirmation failures, recent duplicates, and capped vendors', async () => {
    db.negotiation.findFirst.mockResolvedValueOnce(negotiation({ rounds: [{ id: 'pending', vendorId: 'v1', status: 'ROUND_ACTIVE',
      counterOfferAmount: 800, revisedQuoteAmount: null, nextResponsibleParty: 'VENDOR', roundNumber: 2, notes: 'Waiting' }] }));
    const pending = await POST(postRequest({ rfqId: 'rfq-1', vendorId: 'v1', counterOfferAmount: 700 }));
    expect(pending.status).toBe(400);
    await expect(pending.json()).resolves.toMatchObject({ requiresSupersedeConfirm: true, pendingRoundNumber: 2, pendingAmount: 800 });
    expect(transaction.negotiationRound.create).not.toHaveBeenCalled();

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
  });

  it('supersedes an approved pending offer and accepts vendor revisions through single dispatch', async () => {
    db.negotiation.findFirst.mockResolvedValueOnce(negotiation({ rounds: [{ id: 'old-round', vendorId: 'v1', status: 'ROUND_ACTIVE',
      counterOfferAmount: 800, revisedQuoteAmount: null, nextResponsibleParty: 'VENDOR', roundNumber: 1, notes: 'Waiting' }] }));
    const superseded = await POST(postRequest({ rfqId: 'rfq-1', vendorId: 'v1', counterOfferAmount: 700, allowSupersede: true }));
    expect(superseded).toMatchObject({ ok: true, status: 201, data: { message: expect.stringContaining('Superseding Buyer Offer') } });
    expect(transaction.negotiationRound.update).toHaveBeenCalledWith({ where: { id: 'old-round' }, data: {
      status: 'SUPERSEDED', notes: 'Waiting [Superseded by Buyer Offer Round 2]',
    } });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'SUPERSEDING_COUNTEROFFER_ISSUED' }));

    db.negotiation.findFirst.mockResolvedValueOnce(negotiation({ currentRound: 1, rounds: [] }));
    const revision = await POST(postRequest({ rfqId: 'rfq-1', vendorId: 'v1', revisedQuoteAmount: 900, lineItemsJson: '[]' }));
    expect(revision).toMatchObject({ ok: true, status: 201, data: { message: expect.stringContaining('Vendor Revised Quote') } });
    expect(transaction.negotiationRound.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({
      revisedQuoteAmount: 900, counterOfferAmount: null, status: 'REVISED_SUBMITTED', nextResponsibleParty: 'BUYER', lineItemsJson: '[]',
    }), include: { vendor: true } });
    expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({ event: 'REVISED_QUOTE_RECEIVED' }));

    auth.mockResolvedValueOnce({ ...context, userName: '' });
    db.negotiation.findFirst.mockResolvedValueOnce(negotiation({ currentRound: 0, rounds: null }));
    const targetOnly = await POST(postRequest({ rfqId: 'rfq-1', vendorId: 'v1', targetPrice: 750 }));
    expect(targetOnly).toMatchObject({ ok: true, status: 201, data: { message: 'Buyer Offer Submitted Successfully (Round 1)' } });
    expect(transaction.negotiationRound.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({
      targetPrice: 750, counterOfferAmount: null, savingsAmount: 0, notes: null, nextResponsibleParty: 'VENDOR', lineItemsJson: null,
    }), include: { vendor: true } });
    expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({ event: 'COUNTER_OFFER_SENT', details: { vendorName: 'Vendor v1', amount: undefined, roundNumber: 1 } }));
  });

  it('returns single-vendor failures and maps provider or request errors', async () => {
    await expect(POST(postRequest({ rfqId: 'rfq-1' }))).resolves.toEqual({ ok: false, error: 'Vendor ID is required for single counteroffer dispatch', status: 400 });
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
    await expect(POST(postRequest({ rfqId: 'rfq-1', vendorId: 'v1' }))).resolves.toEqual({ ok: false, error: 'negotiation write failed', status: 500 });
    db.rfq.findFirst.mockRejectedValueOnce({});
    await expect(POST(postRequest({ rfqId: 'rfq-1' }))).resolves.toEqual({ ok: false, error: 'Failed to create negotiation round', status: 500 });
    const badJson = { json: jest.fn().mockRejectedValue(new Error('invalid negotiation payload')) } as unknown as NextRequest;
    await expect(POST(badJson)).resolves.toEqual({ ok: false, error: 'invalid negotiation payload', status: 500 });
    expect(consoleError).toHaveBeenCalledTimes(3);
  });
});
