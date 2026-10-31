import { NextRequest } from 'next/server';
import { DELETE, GET, PUT } from '../src/app/api/procurement/auctions/[id]/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    auction: { findFirst: jest.fn(), update: jest.fn(), delete: jest.fn() },
    vendor: { findFirst: jest.fn() },
    auctionVendor: { deleteMany: jest.fn() },
    auctionItem: { deleteMany: jest.fn() },
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
  tenantId: 'tenant-1', userId: 'user-1', userEmail: 'buyer@example.test', role: 'PROCUREMENT_MANAGER', vendorId: null,
};
const params = (id = 'auction-1') => ({ params: Promise.resolve({ id }) });
const getRequest = () => new NextRequest('http://localhost/api/procurement/auctions/auction-1');
const putRequest = (body: unknown) => new NextRequest('http://localhost/api/procurement/auctions/auction-1', {
  method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const deleteRequest = () => new NextRequest('http://localhost/api/procurement/auctions/auction-1', { method: 'DELETE' });

function auction(overrides: Record<string, any> = {}) {
  const now = Date.now();
  return {
    id: 'auction-1', auctionNumber: 'AUC-001', title: 'Electrical reverse auction',
    auctionCategory: 'TOTAL_COST', auctionType: 'REVERSE_AUCTION', currency: 'INR', refreshIntervalSeconds: 10,
    scrollingText: 'Bidding is open', quantityType: 'TOTAL', hasStartPrice: true, startingPrice: 100,
    currentLowestBid: 80, currentLeadingBid: 80, currentWinningVendorId: 'vendor-1', hasLeadingPrice: true,
    minDecrement: 5, hasMinBidReduction: true, hasAutoExtension: true, autoExtensionMinutes: 3, extensionCount: 0,
    hasBidLimit: true, maxBidsPerParticipant: 5, inviteProjectUser: true, projectUserId: 'project-user-1',
    nonInvitedJustification: null, termsAndConditions: 'Commercial terms', documents: '[{"name":"terms.pdf"}]',
    startTime: new Date(now - 60_000), endTime: new Date(now + 60 * 60_000), scheduledEndTime: null,
    status: 'LIVE', createdAt: new Date(now - 3_600_000),
    rfq: {
      id: 'rfq-1', rfqNumber: 'RFQ-001', title: 'Lighting', packageName: 'Office lights', projectId: 'project-1',
      project: { id: 'project-1', name: 'West Campus', projectCode: 'P-01' },
      pr: { id: 'pr-1', prNumber: 'PR-001', title: 'Electrical works', costCentre: { id: 'cc-1', name: 'Power', code: 'CC-1' }, boq: { id: 'boq-1', boqCode: 'BOQ-1', title: 'Power BOQ' } },
    },
    vendors: [
      { id: 'participant-1', vendorId: 'vendor-1', vendor: { id: 'vendor-1', name: 'Acme', code: 'AC', email: 'acme@example.test', phone: '111' },
        termsAcceptedAt: new Date(now - 20_000), bidsCount: 2, lastBidAmount: 0, bestBidRank: 1 },
      { id: 'participant-2', vendorId: 'vendor-2', vendor: { id: 'vendor-2', name: 'Other', code: 'OT', email: 'other@example.test', phone: '222' },
        termsAcceptedAt: null, bidsCount: 1, lastBidAmount: 60, bestBidRank: 2 },
    ],
    items: [{ id: 'item-1', itemCode: 'ITEM-1', description: 'Cable', category: 'Electrical', subcategory: 'Wires', uom: 'MTR', quantity: '2', startPrice: 0, currentLeadingBid: 70 }],
    bids: [
      { id: 'bid-1', bidNumber: 1, timestamp: new Date(now - 30_000), vendorId: 'vendor-1', vendor: { name: 'Acme', code: 'AC' }, bidAmount: 80, rank: 1, auctionItemId: 'item-1', auctionItem: { itemCode: 'ITEM-1' } },
      { id: 'bid-2', bidNumber: 2, timestamp: new Date(now - 10_000), vendorId: 'vendor-2', vendor: { name: 'Other', code: 'OT' }, bidAmount: 85, rank: 2, auctionItemId: null, auctionItem: null },
    ],
    ...overrides,
  };
}

describe('auction detail and control API', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.auction.findFirst.mockReset().mockResolvedValue(auction());
    db.auction.update.mockReset().mockResolvedValue({ id: 'auction-1' });
    db.auction.delete.mockReset().mockResolvedValue({ id: 'auction-1' });
    db.vendor.findFirst.mockReset().mockResolvedValue({ id: 'vendor-1', name: 'Acme' });
    db.auctionVendor.deleteMany.mockReset().mockResolvedValue({ count: 2 });
    db.auctionItem.deleteMany.mockReset().mockResolvedValue({ count: 1 });
    audit.mockReset().mockResolvedValue(undefined);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('authorizes detail reads, advances server status, and returns buyer details with visible bids', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(getRequest(), params())).resolves.toBe(denied);

    db.auction.findFirst.mockResolvedValueOnce(null);
    await expect(GET(getRequest(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionEventNotFoundOrAccessDenied, status: 404 });

    db.auction.findFirst.mockResolvedValueOnce(auction({ status: 'SCHEDULED', startTime: new Date(Date.now() - 60_000) }));
    const live = await GET(getRequest(), params());
    expect(live).toMatchObject({ ok: true, data: {
      auction: {
        id: 'auction-1', currency: 'INR', refreshIntervalSeconds: 10, startingPrice: 100, currentLowestBid: 80,
        status: 'LIVE', documents: [{ name: 'terms.pdf' }], scheduledEndTime: expect.any(String),
        rfq: { rfqNumber: 'RFQ-001', projectName: 'West Campus', projectCode: 'P-01', prNumber: 'PR-001', costCentre: 'Power', boqNumber: 'BOQ-1' },
        vendors: [{ id: 'participant-1', lastBidAmount: null, bestRank: 1 }, { id: 'participant-2', lastBidAmount: 60, bestRank: 2 }],
        items: [{ id: 'item-1', quantity: 2, startPrice: null, currentLowestBid: 70 }],
        bids: [{ id: 'bid-1', vendorName: 'Acme', bidAmount: 80, itemCode: 'ITEM-1' }, { id: 'bid-2', vendorName: 'Other', bidAmount: 85 }],
      }, currentVendorParticipation: null, isObserver: false,
    } });
    expect(db.auction.update).toHaveBeenCalledWith({ where: { id: 'auction-1' }, data: { status: 'LIVE' } });

    db.auction.findFirst.mockResolvedValueOnce(auction({ status: 'EXTENDED', endTime: new Date(Date.now() - 1) }));
    await expect(GET(getRequest(), params())).resolves.toMatchObject({ ok: true, data: { auction: { status: 'CLOSED' } } });
    expect(db.auction.update).toHaveBeenLastCalledWith({ where: { id: 'auction-1' }, data: { status: 'CLOSED' } });
  });

  it('applies vendor and observer privacy rules for sealed bids and hidden leading prices', async () => {
    auth.mockResolvedValueOnce({ ...context, role: 'VENDOR', vendorId: 'vendor-1' });
    const result = await GET(getRequest(), params());
    expect(result).toMatchObject({ ok: true, data: {
      currentVendorParticipation: { id: 'participant-1', vendorId: 'vendor-1', name: 'Acme', bidCount: 2, bestRank: 1 },
      isObserver: false,
      auction: {
        vendors: [{ lastBidAmount: null, bestRank: 1 }, { lastBidAmount: 60, bestRank: 2 }],
        bids: [
          { id: 'bid-1', vendorId: 'vendor-1', vendorName: 'Acme', bidAmount: 80 },
          { id: 'bid-2', vendorId: 'VENDOR-XXX', vendorName: 'Competitor', vendorCode: '***', bidAmount: 85 },
        ],
      },
    } });

    auth.mockResolvedValueOnce({ ...context, role: 'VENDOR', vendorId: 'vendor-1' });
    const hiddenPriceAuction = auction({ hasLeadingPrice: false });
    hiddenPriceAuction.vendors[0].termsAcceptedAt = null;
    hiddenPriceAuction.vendors[0].lastBidAmount = 45;
    db.auction.findFirst.mockResolvedValueOnce(hiddenPriceAuction);
    await expect(GET(getRequest(), params())).resolves.toMatchObject({ ok: true, data: {
      currentVendorParticipation: { termsAcceptedAt: null, lastBidAmount: 45 },
      auction: { bids: [{ id: 'bid-1', bidAmount: 80 }, { id: 'bid-2', vendorName: 'Competitor', bidAmount: null }] },
    } });

    auth.mockResolvedValueOnce({ ...context, role: 'VENDOR', vendorId: 'vendor-1' });
    db.auction.findFirst.mockResolvedValueOnce(auction({ auctionType: 'SEALED_BID' }));
    const sealed = await GET(getRequest(), params());
    expect(sealed).toMatchObject({ ok: true, data: {
      auction: {
        currentLowestBid: null, currentLeadingBid: null, currentWinningVendorId: null,
        bids: [{ id: 'bid-1', vendorName: 'Acme', bidAmount: 80 }],
        vendors: [{ bestRank: null }, { lastBidAmount: null, bestRank: null }],
      },
    } });

    auth.mockResolvedValueOnce({ ...context, role: 'PROJECT_USER' });
    db.auction.findFirst.mockResolvedValueOnce(auction({ auctionType: 'SEALED_BID' }));
    const observer = await GET(getRequest(), params());
    expect(observer).toMatchObject({ ok: true, data: {
      isObserver: true,
      auction: { bids: [
        { id: 'bid-1', vendorId: 'CONFIDENTIAL', vendorName: 'Anonymous Participant', bidAmount: null, rank: null },
        { id: 'bid-2', vendorId: 'CONFIDENTIAL', vendorName: 'Anonymous Participant', bidAmount: null, rank: null },
      ] },
    } });
  });

  it('rejects uninvited vendors, defaults optional fields, tolerates malformed documents, and reports load errors', async () => {
    db.vendor.findFirst.mockResolvedValueOnce(null);
    auth.mockResolvedValueOnce({ ...context, role: 'VENDOR' });
    await expect(GET(getRequest(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdRoute.youAreNotInvitedToParticipateInThisAuction, status: 403 });

    db.vendor.findFirst.mockResolvedValueOnce({ id: 'vendor-3', name: 'Not invited' });
    auth.mockResolvedValueOnce({ ...context, role: 'VENDOR' });
    await expect(GET(getRequest(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdRoute.youAreNotInvitedToParticipateInThisAuction, status: 403 });

    db.auction.findFirst.mockResolvedValueOnce(auction({
      currency: null, refreshIntervalSeconds: 0, hasLeadingPrice: false, documents: '{bad json',
      startingPrice: 0, currentLowestBid: 0, currentLeadingBid: 0, minDecrement: 0, scheduledEndTime: null,
      rfq: { id: 'rfq-2', rfqNumber: 'RFQ-2', title: 'No project', packageName: null, project: null, pr: null },
      vendors: [], items: [], bids: [],
    }));
    await expect(GET(getRequest(), params())).resolves.toMatchObject({ ok: true, data: {
      auction: { currency: 'INR', refreshIntervalSeconds: 15, documents: [], currentLowestBid: null,
        currentLeadingBid: null, currentWinningVendorId: null, startingPrice: null, minDecrement: 0,
        scheduledEndTime: expect.any(String), rfq: { projectName: undefined, prNumber: undefined, costCentre: undefined },
        vendors: [], items: [], bids: [] },
    } });
    db.auction.findFirst.mockResolvedValueOnce(auction({ documents: null }));
    await expect(GET(getRequest(), params())).resolves.toMatchObject({ ok: true, data: { auction: { documents: [] } } });

    db.auction.findFirst.mockRejectedValueOnce(new Error('auction read failed'));
    await expect(GET(getRequest(), params())).resolves.toEqual({ ok: false, error: 'auction read failed', status: 500 });
    db.auction.findFirst.mockRejectedValueOnce({});
    await expect(GET(getRequest(), params())).resolves.toEqual({ ok: false, error: 'Failed to fetch auction details', status: 500 });
    expect(consoleError).toHaveBeenCalledTimes(2);
  });

  it('pauses, resumes, extends, concludes, and cancels auctions with audit records', async () => {
    db.auction.findFirst.mockResolvedValueOnce(auction({ status: 'DRAFT' }));
    await expect(PUT(putRequest({ action: 'PAUSE' }), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdRoute.onlyLiveAuctionsCanBePaused, status: 400 });
    db.auction.findFirst.mockResolvedValueOnce(auction({ status: 'EXTENDED' }));
    await expect(PUT(putRequest({ action: 'PAUSE' }), params())).resolves.toMatchObject({ ok: true, data: { message: 'Auction paused successfully.' } });
    expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'AUCTION_PAUSED', projectId: 'project-1' }));

    db.auction.findFirst.mockResolvedValueOnce(auction({ status: 'LIVE' }));
    await expect(PUT(putRequest({ action: 'RESUME' }), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdRoute.onlyPausedAuctionsCanBeResumed, status: 400 });
    db.auction.findFirst.mockResolvedValueOnce(auction({ status: 'PAUSED' }));
    await expect(PUT(putRequest({ action: 'RESUME' }), params())).resolves.toMatchObject({ ok: true, data: { message: 'Auction resumed successfully.' } });
    expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'AUCTION_RESUMED' }));

    db.auction.findFirst.mockResolvedValueOnce(auction({ endTime: new Date('2026-01-01T00:00:00Z') }));
    const extended = await PUT(putRequest({ action: 'EXTEND', extensionMinutes: 0 }), params());
    expect(extended).toMatchObject({ ok: true, data: { message: 'Auction extended by 5 minutes.', newEndTime: '2026-01-01T00:05:00.000Z' } });
    expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'AUCTION_EXTENDED_MANUALLY' }));

    db.auction.findFirst.mockResolvedValueOnce(auction());
    await expect(PUT(putRequest({ action: 'CONCLUDE' }), params())).resolves.toMatchObject({ ok: true, data: { message: 'Auction concluded successfully.' } });
    expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'AUCTION_CONCLUDED' }));
    db.auction.findFirst.mockResolvedValueOnce(auction());
    await expect(PUT(putRequest({ action: 'CANCEL' }), params())).resolves.toMatchObject({ ok: true, data: { message: 'Auction cancelled successfully.' } });
    expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'AUCTION_CANCELLED', description: expect.stringContaining('Operational cancellation') }));
  });

  it('updates draft configuration only, handles missing records, and maps failures to errors', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(PUT(putRequest({}), params())).resolves.toBe(denied);
    db.auction.findFirst.mockResolvedValueOnce(null);
    await expect(PUT(putRequest({}), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionNotFoundOrAccessDenied, status: 404 });
    db.auction.findFirst.mockResolvedValueOnce(auction({ status: 'LIVE' }));
    await expect(PUT(putRequest({ title: 'Change' }), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdRoute.onlyDraftAuctionsCanBeReConfigured, status: 400 });

    db.auction.update.mockResolvedValueOnce({ id: 'auction-1', status: 'SCHEDULED' });
    db.auction.findFirst.mockResolvedValueOnce(auction({ status: 'DRAFT' }));
    await expect(PUT(putRequest({ title: '', scrollingText: null, refreshIntervalSeconds: '30', startingPrice: '250', minDecrement: '10', termsAndConditions: '', scheduleNow: true }), params())).resolves.toMatchObject({
      ok: true, data: { auction: { status: 'SCHEDULED' }, message: 'Auction draft updated successfully.' },
    });
    expect(db.auction.update).toHaveBeenLastCalledWith({ where: { id: 'auction-1' }, data: {
      title: 'Electrical reverse auction', scrollingText: null, refreshIntervalSeconds: 30, startingPrice: 250,
      minDecrement: 10, termsAndConditions: 'Commercial terms', status: 'SCHEDULED',
    } });

    db.auction.update.mockResolvedValueOnce({ id: 'auction-1', title: 'Updated title' });
    db.auction.findFirst.mockResolvedValueOnce(auction({ status: 'DRAFT' }));
    await expect(PUT(putRequest({ title: 'Updated title', refreshIntervalSeconds: 0, startingPrice: 0, minDecrement: 0,
      termsAndConditions: 'New terms', scheduleNow: false }), params())).resolves.toMatchObject({
      ok: true, data: { auction: { title: 'Updated title' }, message: 'Auction draft updated successfully.' },
    });
    expect(db.auction.update).toHaveBeenLastCalledWith({ where: { id: 'auction-1' }, data: {
      title: 'Updated title', scrollingText: 'Bidding is open', refreshIntervalSeconds: 10, startingPrice: 100,
      minDecrement: 5, termsAndConditions: 'New terms', status: 'DRAFT',
    } });

    db.auction.findFirst.mockRejectedValueOnce(new Error('auction update read failed'));
    await expect(PUT(putRequest({ action: 'CANCEL' }), params())).resolves.toEqual({ ok: false, error: 'auction update read failed', status: 500 });
    db.auction.findFirst.mockRejectedValueOnce({});
    await expect(PUT(putRequest({ action: 'CANCEL' }), params())).resolves.toEqual({ ok: false, error: 'Failed to update auction', status: 500 });
    const badJson = { json: jest.fn().mockRejectedValue(new Error('bad JSON')) } as unknown as NextRequest;
    await expect(PUT(badJson, params())).resolves.toEqual({ ok: false, error: 'bad JSON', status: 500 });
  });

  it('deletes only auctions without bids and cleans up dependent rows', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(DELETE(deleteRequest(), params())).resolves.toBe(denied);
    db.auction.findFirst.mockResolvedValueOnce(null);
    await expect(DELETE(deleteRequest(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.auctionNotFound, status: 404 });
    db.auction.findFirst.mockResolvedValueOnce(auction({ status: 'LIVE' }));
    await expect(DELETE(deleteRequest(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdRoute.cannotDeleteAnAuctionThatHasAlreadyBeenScheduledOrReceivedBids, status: 400 });

    db.auction.findFirst.mockResolvedValueOnce(auction({ status: 'DRAFT', bids: [] }));
    await expect(DELETE(deleteRequest(), params())).resolves.toMatchObject({ ok: true, data: { message: 'Auction deleted successfully.' } });
    expect(db.auctionVendor.deleteMany).toHaveBeenCalledWith({ where: { auctionId: 'auction-1' } });
    expect(db.auctionItem.deleteMany).toHaveBeenCalledWith({ where: { auctionId: 'auction-1' } });
    expect(db.auction.delete).toHaveBeenCalledWith({ where: { id: 'auction-1' } });

    db.auction.findFirst.mockResolvedValueOnce(auction({ status: 'SCHEDULED', bids: [] }));
    await expect(DELETE(deleteRequest(), params())).resolves.toMatchObject({ ok: true });
    db.auction.findFirst.mockRejectedValueOnce(new Error('delete failed'));
    await expect(DELETE(deleteRequest(), params())).resolves.toEqual({ ok: false, error: 'delete failed', status: 500 });
    db.auction.findFirst.mockRejectedValueOnce({});
    await expect(DELETE(deleteRequest(), params())).resolves.toEqual({ ok: false, error: 'Failed to delete auction', status: 500 });
  });
});
