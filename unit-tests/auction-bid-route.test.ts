import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/procurement/auctions/[id]/bid/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    vendor: { findFirst: jest.fn() },
    auction: { findFirst: jest.fn(), update: jest.fn() },
    auctionBid: { create: jest.fn() },
    auctionItem: { update: jest.fn() },
    auctionVendor: { update: jest.fn() },
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
  return {
    id: 'auction-1', auctionNumber: 'AUC-001', tenantId: 'tenant-1', status: 'LIVE',
    startTime: new Date(now - 60_000), endTime: new Date(now + 60 * 60_000),
    auctionType: 'REVERSE_AUCTION', auctionCategory: 'TOTAL_COST', currency: 'INR',
    hasStartPrice: false, startingPrice: 100, currentLowestBid: 100, currentLeadingBid: 100,
    hasMinBidReduction: false, minDecrement: 5, hasBidLimit: false, maxBidsPerParticipant: null,
    hasAutoExtension: false, autoExtensionMinutes: 0, extensionCount: 0,
    rfq: { projectId: 'project-1' }, vendors: [{ id: 'participant-1', termsAcceptedAt: new Date() }],
    items: [], bids: [], ...overrides,
  };
}

describe('auction bid API', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.vendor.findFirst.mockResolvedValue({ id: 'vendor-1', name: 'Acme' });
    db.auction.findFirst.mockResolvedValue(auction());
    db.auctionBid.create.mockImplementation(async ({ data }: { data: Record<string, any> }) => ({
      id: 'bid-1', bidNumber: data.bidNumber, bidAmount: data.bidAmount, timestamp: data.timestamp,
      vendor: { name: 'Acme' },
    }));
    db.auction.update.mockResolvedValue({ id: 'auction-1' });
    db.auctionItem.update.mockResolvedValue({ id: 'item-1' });
    db.auctionVendor.update.mockResolvedValue({ id: 'participant-1' });
    audit.mockResolvedValue(undefined);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('enforces authentication, observer access, vendor mapping, and positive numeric amounts', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(request(), params())).resolves.toBe(denied);

    auth.mockResolvedValueOnce({ ...context, role: 'PROJECT_USER' });
    await expect(POST(request(), params())).resolves.toEqual({ ok: false, error: 'Project Users have read-only observer access and cannot submit bids.', status: 403 });
    auth.mockResolvedValueOnce({ ...context, role: 'PROJECT_APPROVER' });
    await expect(POST(request(), params())).resolves.toEqual({ ok: false, error: 'Project Users have read-only observer access and cannot submit bids.', status: 403 });

    db.vendor.findFirst.mockResolvedValueOnce(null);
    await expect(POST(request(), params())).resolves.toEqual({ ok: false, error: 'Vendor profile not found for this account.', status: 403 });
    auth.mockResolvedValueOnce({ ...context, role: 'PROCUREMENT_MANAGER', vendorId: undefined });
    await expect(POST(request(), params())).resolves.toEqual({ ok: false, error: 'Vendor ID is required.', status: 400 });
    await expect(POST(request({ vendorId: 'vendor-1', bidAmount: 'invalid' }), params())).resolves.toEqual({ ok: false, error: 'Please enter a valid positive bid amount.', status: 400 });
    await expect(POST(request({ vendorId: 'vendor-1', bidAmount: 0 }), params())).resolves.toEqual({ ok: false, error: 'Please enter a valid positive bid amount.', status: 400 });
  });

  it('rejects unavailable auctions, closed states, expired times, and unqualified participants', async () => {
    db.auction.findFirst.mockResolvedValueOnce(null);
    await expect(POST(request(), params())).resolves.toEqual({ ok: false, error: 'Auction not found or access denied.', status: 404 });
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
    await expect(POST(request(), params())).resolves.toEqual({ ok: false, error: 'Auction time has expired. No further bids are accepted.', status: 400 });
    expect(db.auction.update).toHaveBeenCalledWith({ where: { id: 'auction-1' }, data: { status: 'CLOSED' } });

    db.auction.findFirst.mockResolvedValueOnce(auction({ vendors: [] }));
    await expect(POST(request(), params())).resolves.toEqual({ ok: false, error: 'Vendor is not invited to participate in this auction.', status: 403 });
    db.auction.findFirst.mockResolvedValueOnce(auction({ vendors: [{ id: 'participant-1', termsAcceptedAt: null }] }));
    await expect(POST(request(), params())).resolves.toEqual({ ok: false, error: 'You must review and accept the auction Terms & Conditions before placing your first bid.', status: 400 });
  });

  it('enforces sealed-bid and participant limits and item-wise auction requirements', async () => {
    db.auction.findFirst.mockResolvedValueOnce(auction({ auctionType: 'SEALED_BID', bids: [{ vendorId: 'vendor-1' }] }));
    await expect(POST(request(), params())).resolves.toEqual({
      ok: false, error: 'Sealed Bid Protocol: You have already submitted your single permitted sealed bid for this auction.', status: 400,
    });
    db.auction.findFirst.mockResolvedValueOnce(auction({ hasBidLimit: true, maxBidsPerParticipant: 2, bids: [
      { vendorId: 'vendor-1' }, { vendorId: 'vendor-1' }, { vendorId: 'other-vendor' },
    ] }));
    await expect(POST(request(), params())).resolves.toMatchObject({ ok: false, error: expect.stringContaining('Bid limit reached.'), status: 400 });

    db.auction.findFirst.mockResolvedValueOnce(auction({ auctionCategory: 'ITEM_WISE' }));
    await expect(POST(request(), params())).resolves.toEqual({ ok: false, error: 'Item ID is required for an Item-Wise auction bid.', status: 400 });
    db.auction.findFirst.mockResolvedValueOnce(auction({ auctionCategory: 'ITEM_WISE', items: [] }));
    await expect(POST(request({ bidAmount: 90, auctionItemId: 'missing' }), params())).resolves.toEqual({ ok: false, error: 'Selected auction item was not found.', status: 404 });
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
    db.auction.findFirst.mockResolvedValueOnce(auction({
      auctionCategory: 'ITEM_WISE', hasAutoExtension: true, autoExtensionMinutes: 2, endTime,
      hasBidLimit: true, maxBidsPerParticipant: 3,
      items: [{ id: 'item-1', currentLeadingBid: 100, startPrice: 120 }], bids: [{ vendorId: 'another-vendor' }],
    }));
    const result = await POST(request({ bidAmount: '90', auctionItemId: 'item-1' }, { 'x-forwarded-for': '203.0.113.2, 203.0.113.3' }), params());
    expect(result).toMatchObject({ ok: true, status: 201, data: {
      bid: { id: 'bid-1', bidNumber: 2, bidAmount: 90, vendorName: 'Acme' }, extended: true, remainingBids: 2,
      message: 'Bid accepted! Rolling auto-extension triggered (+2m).',
    } });
    expect(db.auctionBid.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      tenantId: 'tenant-1', auctionId: 'auction-1', auctionItemId: 'item-1', vendorId: 'vendor-1',
      bidAmount: 90, bidNumber: 2, ipAddress: '203.0.113.2',
    }) }));
    expect(db.auction.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      currentLowestBid: 90, currentLeadingBid: 90, status: 'EXTENDED', extensionCount: { increment: 1 },
    }) }));
    expect(db.auctionItem.update).toHaveBeenCalledWith({ where: { id: 'item-1' }, data: { currentLeadingBid: 90 } });
    expect(db.auctionVendor.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ bidsCount: { increment: 1 }, bestBidAmount: 90 }) }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUCTION_BID_AND_AUTO_EXTENDED', entityId: 'auction-1' }));
  });

  it('accepts an auction-level bid without extension, uses real-IP fallback, and handles persistence errors', async () => {
    db.auction.findFirst.mockResolvedValueOnce(auction({
      auctionType: 'FORWARD_AUCTION', startingPrice: 100, currentLowestBid: 100,
      hasAutoExtension: true, autoExtensionMinutes: 5, endTime: new Date(Date.now() + 20 * 60_000),
      vendors: [{ id: 'participant-1', termsAcceptedAt: new Date() }],
    }));
    const result = await POST(request({ bidAmount: 105, vendorId: 'vendor-1' }, { 'x-real-ip': '198.51.100.7' }), params());
    expect(result).toMatchObject({ ok: true, data: {
      bid: { bidAmount: 105 }, extended: false, remainingBids: null, message: 'Bid accepted successfully.',
    } });
    expect(db.auctionBid.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ ipAddress: '198.51.100.7', auctionItemId: null }) }));
    expect(db.auction.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'LIVE' }) }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUCTION_BID_SUBMITTED' }));

    db.auction.findFirst.mockRejectedValueOnce(new Error('write failed'));
    await expect(POST(request(), params())).resolves.toEqual({ ok: false, error: 'write failed', status: 500 });
    db.auction.findFirst.mockRejectedValueOnce({});
    await expect(POST(request(), params())).resolves.toEqual({ ok: false, error: 'Failed to submit bid', status: 500 });
    expect(consoleError).toHaveBeenCalledTimes(2);
  });
});
