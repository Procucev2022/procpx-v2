import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/procurement/auctions/[id]/bid/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    vendor: { findFirst: jest.fn() },
    auction: { findFirst: jest.fn(), update: jest.fn() },
    auctionBid: { count: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const d1Batch = writeD1BatchAtomically as jest.Mock;
const structuredLog = writeStructuredLog as jest.Mock;
const context = {
  tenantId: 'tenant-1', userId: 'user-1', userName: 'Acme bidder', userEmail: 'bidder@example.test',
  role: 'VENDOR', vendorId: 'vendor-1',
};
const params = (id = 'auction-1') => ({ params: Promise.resolve({ id }) });
const request = (body: unknown = { bidAmount: 90 }, headers: Record<string, string> = {}) => new NextRequest(
  'http://localhost/api/procurement/auctions/auction-1/bid',
  { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) },
);

function auction(overrides: Record<string, any> = {}) {
  const now = Date.now();
  const existingBids = overrides.bids || [];
  return {
    id: 'auction-1', auctionNumber: 'AUC-001', tenantId: 'tenant-1', status: 'LIVE',
    startTime: new Date(now - 60_000), endTime: new Date(now + 60 * 60_000),
    auctionType: 'REVERSE_AUCTION', auctionCategory: 'TOTAL_COST', currency: 'INR',
    hasStartPrice: false, startingPrice: 100, currentLowestBid: 100, currentLeadingBid: 100,
    hasMinBidReduction: false, minDecrement: 5, hasBidLimit: false, maxBidsPerParticipant: null,
    hasAutoExtension: false, autoExtensionMinutes: 0, extensionCount: 0,
    rfq: { projectId: 'project-1' }, vendors: [{ id: 'participant-1', tenantId: 'tenant-1',
      auctionId: 'auction-1', vendorId: 'vendor-1', isEligible: true, bidsCount: 0, termsAcceptedAt: new Date() }],
    items: [], bids: existingBids, _count: { bids: existingBids.length }, ...overrides,
  };
}

describe('auction bid API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.vendor.findFirst.mockResolvedValue({ id: 'vendor-1', name: 'Acme' });
    db.auction.findFirst.mockResolvedValue(auction());
    db.auctionBid.count.mockResolvedValue(0);
    db.auction.update.mockResolvedValue({ id: 'auction-1' });
    d1Batch.mockImplementation(async (statements: unknown[]) => statements.map(() => ({ meta: { changes: 1 } })));
    structuredLog.mockResolvedValue(undefined);
  });

  it('enforces authentication, observer access, vendor mapping, and positive numeric amounts', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(request(), params())).resolves.toBe(denied);

    auth.mockResolvedValueOnce({ ...context, role: 'PROJECT_USER' });
    await expect(POST(request(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdBidRoute.projectUsersHaveReadOnlyObserverAccessAndCannotSubmitBids, status: 403 });
    auth.mockResolvedValueOnce({ ...context, role: 'PROJECT_APPROVER' });
    await expect(POST(request(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdBidRoute.projectUsersHaveReadOnlyObserverAccessAndCannotSubmitBids, status: 403 });

    db.vendor.findFirst.mockResolvedValueOnce(null);
    await expect(POST(request(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdBidRoute.vendorProfileNotFoundForThisAccount, status: 403 });
    auth.mockResolvedValueOnce({ ...context, role: 'PROCUREMENT_MANAGER', vendorId: undefined });
    await expect(POST(request(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdBidRoute.vendorIDIsRequired, status: 400 });
    await expect(POST(request({ vendorId: 'vendor-1', bidAmount: 'invalid' }), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdBidRoute.pleaseEnterAValidPositiveBidAmount, status: 400 });
    await expect(POST(request({ vendorId: 'vendor-1', bidAmount: 0 }), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdBidRoute.pleaseEnterAValidPositiveBidAmount, status: 400 });
  });

  it('rejects unavailable auctions, closed states, expired times, and unqualified participants', async () => {
    db.auction.findFirst.mockResolvedValueOnce(null);
    await expect(POST(request(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdBidRoute.auctionNotFoundOrAccessDenied, status: 404 });
    for (const [status, message] of [
      ['PAUSED', 'Bidding is temporarily paused by the auction administrator.'],
      ['CLOSED', 'This auction has concluded. Further bids cannot be accepted.'],
      ['COMPLETED', 'This auction has concluded. Further bids cannot be accepted.'],
      ['CANCELLED', 'This auction has been cancelled.'],
    ]) {
      db.auction.findFirst.mockResolvedValueOnce(auction({ status }));
      await expect(POST(request(), params())).resolves.toEqual({ ok: false, error: message, status: 400 });
    }

    db.auction.findFirst.mockResolvedValueOnce(auction({ status: 'SCHEDULED', startTime: new Date(Date.now() + 60_000) }));
    await expect(POST(request(), params())).resolves.toMatchObject({ ok: false, error: expect.stringContaining('Auction has not started yet.'), status: 400 });
    db.auction.findFirst.mockResolvedValueOnce(auction({ endTime: new Date(Date.now() - 1) }));
    await expect(POST(request(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdBidRoute.auctionTimeHasExpiredNoFurtherBidsAreAccepted, status: 400 });
    expect(d1Batch).toHaveBeenLastCalledWith([expect.objectContaining({ sql: expect.stringContaining("SET \"status\" = 'CLOSED'") })]);

    db.auction.findFirst.mockResolvedValueOnce(auction({ vendors: [] }));
    await expect(POST(request(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdBidRoute.vendorIsNotInvitedToParticipateInThisAuction, status: 403 });
    db.auction.findFirst.mockResolvedValueOnce(auction({ vendors: [{ ...auction().vendors[0], termsAcceptedAt: null }] }));
    await expect(POST(request(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdBidRoute.youMustReviewAndAcceptTheAuctionTermsConditionsBeforePlacingYourFirstBid, status: 400 });
    db.auction.findFirst.mockResolvedValueOnce(auction({ status: 'DRAFT' }));
    await expect(POST(request(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdBidRoute.thisAuctionHasConcludedFurtherBidsCannotBeAccepted, status: 400 });
    db.auction.findFirst.mockResolvedValueOnce(auction({ vendors: [{ ...auction().vendors[0], isEligible: false }] }));
    await expect(POST(request(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdBidRoute.vendorIsNotInvitedToParticipateInThisAuction, status: 403 });
  });

  it('enforces sealed-bid and participant limits and item-wise auction requirements', async () => {
    db.auctionBid.count.mockResolvedValueOnce(1);
    db.auction.findFirst.mockResolvedValueOnce(auction({ auctionType: 'SEALED_BID', bids: [{ vendorId: 'vendor-1' }] }));
    await expect(POST(request(), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdBidRoute.sealedBidProtocolYouHaveAlreadySubmittedYourSinglePermittedSealedBidForThisAuction, status: 400,
    });
    db.auctionBid.count.mockResolvedValueOnce(2);
    db.auction.findFirst.mockResolvedValueOnce(auction({ hasBidLimit: true, maxBidsPerParticipant: 2, bids: [
      { vendorId: 'vendor-1' }, { vendorId: 'vendor-1' }, { vendorId: 'other-vendor' },
    ] }));
    await expect(POST(request(), params())).resolves.toMatchObject({ ok: false, error: expect.stringContaining('Bid limit reached.'), status: 400 });

    db.auction.findFirst.mockResolvedValueOnce(auction({ auctionCategory: 'ITEM_WISE' }));
    await expect(POST(request(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdBidRoute.itemIDIsRequiredForAnItemWiseAuctionBid, status: 400 });
    db.auction.findFirst.mockResolvedValueOnce(auction({ auctionCategory: 'ITEM_WISE', items: [] }));
    await expect(POST(request({ bidAmount: 90, auctionItemId: 'missing' }), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdBidRoute.selectedAuctionItemWasNotFound, status: 404 });
  });

  it('validates reverse and forward first bids and required bid reductions or increments', async () => {
    db.auction.findFirst.mockResolvedValueOnce(auction({ hasStartPrice: true, startingPrice: 100, currentLowestBid: null, bids: [] }));
    await expect(POST(request({ bidAmount: 101 }), params())).resolves.toMatchObject({ ok: false, error: expect.stringContaining('First bid cannot exceed'), status: 400 });
    db.auction.findFirst.mockResolvedValueOnce(auction({ bids: [{ vendorId: 'other' }], currentLowestBid: 100, hasMinBidReduction: true, minDecrement: 10 }));
    await expect(POST(request({ bidAmount: 95 }), params())).resolves.toMatchObject({ ok: false, error: expect.stringContaining('at least INR 10 lower'), status: 400 });
    db.auction.findFirst.mockResolvedValueOnce(auction({ auctionType: 'FORWARD_AUCTION', hasStartPrice: true, startingPrice: 100, currentLowestBid: null }));
    await expect(POST(request({ bidAmount: 99 }), params())).resolves.toMatchObject({ ok: false, error: expect.stringContaining('First bid cannot be lower'), status: 400 });
    db.auction.findFirst.mockResolvedValueOnce(auction({ auctionType: 'FORWARD_AUCTION', bids: [{ vendorId: 'other' }], currentLowestBid: 100, hasMinBidReduction: true, minDecrement: 5 }));
    await expect(POST(request({ bidAmount: 104 }), params())).resolves.toMatchObject({ ok: false, error: expect.stringContaining('at least INR 5 higher'), status: 400 });
  });

  it('accepts an item-wise bid, updates its leaders, records audit data, and extends the auction', async () => {
    const endTime = new Date(Date.now() + 30_000);
    db.auctionBid.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    db.auction.findFirst.mockResolvedValueOnce(auction({
      auctionCategory: 'ITEM_WISE', hasAutoExtension: true, autoExtensionMinutes: 2, endTime,
      hasBidLimit: true, maxBidsPerParticipant: 3,
      items: [{ id: 'item-1', currentLeadingBid: 100, startPrice: 120 }], bids: [{ vendorId: 'another-vendor', auctionItemId: 'item-1' }],
    }));
    const result = await POST(request({ bidAmount: '90', auctionItemId: 'item-1' }, { 'x-forwarded-for': '203.0.113.2, 203.0.113.3' }), params());
    expect(result).toMatchObject({ ok: true, status: 201, data: {
      bid: { id: expect.any(String), bidNumber: 2, bidAmount: 90, vendorName: 'Acme' }, extended: true, remainingBids: 2,
      message: 'Bid accepted! Rolling auto-extension triggered (+2m).',
    } });
    const batch = d1Batch.mock.calls.at(-1)?.[0] as Array<{ sql: string; values: unknown[] }>;
    expect(batch).toHaveLength(5);
    expect(batch[0].sql).toContain('UPDATE "auctions"');
    expect(batch[0].values).toContain('EXTENDED');
    expect(batch[1].sql).toContain('UPDATE "auction_items"');
    expect(batch[1].values).toContain('vendor-1');
    expect(batch[2].sql).toContain('INSERT INTO "auction_bids"');
    expect(batch[2].values).toEqual(expect.arrayContaining(['tenant-1', 'auction-1', 'vendor-1', 'item-1', 2, 90, '203.0.113.2']));
    expect(batch[3].sql).toContain('UPDATE "auction_vendors"');
    expect(batch[4].sql).toContain('INSERT INTO "audit_logs"');
    expect(batch[4].values).toEqual(expect.arrayContaining(['AUCTION_BID_AND_AUTO_EXTENDED', expect.stringContaining('Acme')]));
  });

  it('accepts an auction-level bid without extension, uses real-IP fallback, and handles persistence errors', async () => {
    db.auction.findFirst.mockResolvedValueOnce(auction({
      auctionType: 'FORWARD_AUCTION', startingPrice: 100, currentLowestBid: 100,
      hasAutoExtension: true, autoExtensionMinutes: 5, endTime: new Date(Date.now() + 20 * 60_000),
      vendors: [{ ...auction().vendors[0], termsAcceptedAt: new Date() }],
    }));
    const result = await POST(request({ bidAmount: 105, vendorId: 'vendor-1' }, { 'x-real-ip': '198.51.100.7' }), params());
    expect(result).toMatchObject({ ok: true, data: {
      bid: { bidAmount: 105 }, extended: false, remainingBids: null, message: 'Bid accepted successfully.',
    } });
    const batch = d1Batch.mock.calls.at(-1)?.[0] as Array<{ sql: string; values: unknown[] }>;
    expect(batch).toHaveLength(4);
    expect(batch[0].values).toContain('LIVE');
    expect(batch[1].values).toEqual(expect.arrayContaining(['198.51.100.7', null]));
    expect(batch[3].values).toEqual(expect.arrayContaining(['AUCTION_BID_SUBMITTED']));

    db.auction.findFirst.mockRejectedValueOnce(new Error('write failed'));
    await expect(POST(request(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToSubmitBid, status: 500 });
    db.auction.findFirst.mockRejectedValueOnce({});
    await expect(POST(request(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToSubmitBid, status: 500 });
    expect(structuredLog).toHaveBeenCalledTimes(2);
    expect(structuredLog).toHaveBeenCalledWith('error', 'procurement.auction_bid_submission_failed', expect.objectContaining({ tenantId: 'tenant-1', auctionId: 'auction-1' }));
  });

  it('returns a conflict when the auction changed before the batch committed', async () => {
    d1Batch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 0 } }, { meta: { changes: 0 } }, { meta: { changes: 0 } }]);
    await expect(POST(request(), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409,
    });
    const statements = d1Batch.mock.calls[0][0] as Array<{ sql: string }>;
    expect(statements[1].sql).toContain('WHERE changes() = 1');
  });
});
