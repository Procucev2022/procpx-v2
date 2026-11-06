import { NextRequest } from 'next/server';
import { DELETE, GET, PUT } from '../src/app/api/procurement/auctions/[id]/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import {
  AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
  AUCTION_AUTO_CLOSE_IF_DUE_SQL,
  AUCTION_AUTO_START_IF_DUE_SQL,
  AUCTION_CONCLUDE_IF_EXPECTED_SQL,
  AUCTION_DELETE_DRAFT_WITHOUT_BIDS_SQL,
  AUCTION_DRAFT_UPDATE_IF_EXPECTED_SQL,
  AUCTION_EXTEND_IF_EXPECTED_SQL,
  AUCTION_STATUS_UPDATE_IF_EXPECTED_SQL,
} from '../src/lib/d1-batch.constants';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    auction: { findFirst: jest.fn() },
    auctionBid: { findMany: jest.fn() },
    vendor: { findFirst: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  getListPageWindow: jest.fn((searchParams: URLSearchParams) => ({
    pageSize: Number(searchParams.get('pageSize')) || 50,
  })),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const writeBatch = writeD1BatchAtomically as jest.Mock;
const structuredLog = writeStructuredLog as jest.Mock;
const context = {
  tenantId: 'tenant-1', userId: 'user-1', userEmail: 'buyer@example.test', role: 'PROCUREMENT_MANAGER', vendorId: null,
};
const params = (id = 'auction-1') => ({ params: Promise.resolve({ id }) });
const getRequest = (query = '') => new NextRequest(`http://localhost/api/procurement/auctions/auction-1${query}`);
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
    _count: overrides._count || { bids: overrides.bids?.length ?? 2 },
  };
}

describe('auction detail and control API', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.auction.findFirst.mockReset().mockResolvedValue(auction());
    db.auctionBid.findMany.mockReset().mockResolvedValue(auction().bids);
    db.vendor.findFirst.mockReset().mockResolvedValue({ id: 'vendor-1', name: 'Acme' });
    writeBatch.mockReset().mockImplementation((statements: Array<{ sql: string }>) => Promise.resolve(statements.map(() => ({ meta: { changes: 1 } }))));
    structuredLog.mockReset().mockResolvedValue(undefined);
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
    expect(writeBatch).toHaveBeenLastCalledWith([
      { sql: AUCTION_AUTO_START_IF_DUE_SQL, values: expect.arrayContaining(['auction-1', 'tenant-1']) },
      { sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL, values: expect.arrayContaining(['AUCTION_AUTO_STARTED']) },
    ]);

    db.auction.findFirst.mockResolvedValueOnce(auction({ status: 'EXTENDED', endTime: new Date(Date.now() - 1) }));
    await expect(GET(getRequest(), params())).resolves.toMatchObject({ ok: true, data: { auction: { status: 'CLOSED' } } });
    expect(writeBatch).toHaveBeenLastCalledWith([
      { sql: AUCTION_AUTO_CLOSE_IF_DUE_SQL, values: expect.arrayContaining(['auction-1', 'tenant-1', 'EXTENDED']) },
      { sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL, values: expect.arrayContaining(['AUCTION_AUTO_CLOSED']) },
    ]);
  });

  it('logs an automatic status update when its audit insert unexpectedly reports no row', async () => {
    db.auction.findFirst.mockResolvedValueOnce(auction({ status: 'SCHEDULED', startTime: new Date(Date.now() - 60_000) }));
    writeBatch.mockResolvedValueOnce([{ meta: { changes: 1 } }, { meta: { changes: 0 } }]);

    await expect(GET(getRequest(), params())).resolves.toMatchObject({ ok: true, data: { auction: { status: 'LIVE' } } });
    expect(structuredLog).toHaveBeenCalledWith('error', 'auction.transition_audit_missing', expect.objectContaining({
      action: 'AUCTION_AUTO_STARTED', auctionId: 'auction-1', tenantId: 'tenant-1',
    }), 'application');
  });

  it('uses a bounded stable bid cursor and returns continuation metadata', async () => {
    const cursorTimestamp = new Date('2026-10-30T10:00:00.000Z');
    const newestFetchedBid = {
      id: 'bid-next', bidNumber: 8, timestamp: new Date('2026-10-30T09:00:00.000Z'), vendorId: 'vendor-1',
      vendor: { name: 'Acme', code: 'AC' }, bidAmount: 70, rank: 1, auctionItemId: null, auctionItem: null,
    };
    const extraFetchedBid = {
      ...newestFetchedBid, id: 'bid-extra', bidNumber: 7, timestamp: new Date('2026-10-29T09:00:00.000Z'),
    };
    db.auction.findFirst.mockResolvedValueOnce(auction({ _count: { bids: 12 } }));
    db.auctionBid.findMany.mockResolvedValueOnce([newestFetchedBid, extraFetchedBid]);

    const result = await GET(getRequest(`?pageSize=1&beforeId=bid-cursor&beforeTimestamp=${encodeURIComponent(cursorTimestamp.toISOString())}`), params());

    expect(db.auctionBid.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', auctionId: 'auction-1', OR: [
        { timestamp: { lt: cursorTimestamp } },
        { timestamp: cursorTimestamp, id: { lt: 'bid-cursor' } },
      ] },
      take: 2,
      include: expect.any(Object),
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
    });
    expect(result).toMatchObject({ ok: true, data: {
      auction: { bids: [{ id: 'bid-next' }] },
      bidHistory: {
        pageSize: 1, hasMore: true,
        nextCursor: { beforeId: 'bid-next', beforeTimestamp: '2026-10-30T09:00:00.000Z' },
      },
    } });
  });

  it('rejects incomplete or malformed bid cursors before querying D1', async () => {
    await expect(GET(getRequest('?beforeId=bid-1'), params())).resolves.toMatchObject({ status: 400 });
    await expect(GET(getRequest('?beforeId=bid-1&beforeTimestamp=invalid'), params())).resolves.toMatchObject({ status: 400 });
    expect(db.auction.findFirst).not.toHaveBeenCalled();
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

  it('scopes active sealed-bid history queries and participant counts to the current vendor', async () => {
    auth.mockResolvedValueOnce({ ...context, role: 'VENDOR', vendorId: 'vendor-1' });
    db.auction.findFirst.mockResolvedValueOnce(auction({ auctionType: 'SEALED_BID', status: 'LIVE' }));
    db.auctionBid.findMany.mockResolvedValueOnce([auction().bids[0]]);

    const result = await GET(getRequest(), params());

    expect(db.auctionBid.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', auctionId: 'auction-1', vendorId: 'vendor-1' },
    }));
    expect(result).toMatchObject({ ok: true, data: {
      auction: { vendors: [{ bidCount: 2 }, { bidCount: null }], bids: [{ id: 'bid-1', vendorId: 'vendor-1' }] },
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
    db.auctionBid.findMany.mockResolvedValueOnce([]);
    await expect(GET(getRequest(), params())).resolves.toMatchObject({ ok: true, data: {
      auction: { currency: 'INR', refreshIntervalSeconds: 15, documents: [], currentLowestBid: null,
        currentLeadingBid: null, currentWinningVendorId: null, startingPrice: null, minDecrement: 0,
        scheduledEndTime: expect.any(String), rfq: { projectName: undefined, prNumber: undefined, costCentre: undefined },
        vendors: [], items: [], bids: [] },
    } });
    db.auction.findFirst.mockResolvedValueOnce(auction({ documents: null }));
    await expect(GET(getRequest(), params())).resolves.toMatchObject({ ok: true, data: { auction: { documents: [] } } });

    db.auction.findFirst.mockRejectedValueOnce(new Error('auction read failed'));
    await expect(GET(getRequest(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchAuctionDetails, status: 500 });
    db.auction.findFirst.mockRejectedValueOnce({});
    await expect(GET(getRequest(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchAuctionDetails, status: 500 });
    expect(structuredLog).toHaveBeenCalledTimes(2);
  });

  it('pauses, resumes, extends, concludes, and cancels auctions with audit records', async () => {
    db.auction.findFirst.mockResolvedValueOnce(auction({ status: 'DRAFT' }));
    await expect(PUT(putRequest({ action: 'PAUSE' }), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdRoute.onlyLiveAuctionsCanBePaused, status: 400 });
    db.auction.findFirst.mockResolvedValueOnce(auction({ status: 'EXTENDED' }));
    writeBatch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 0 } }]);
    await expect(PUT(putRequest({ action: 'PAUSE' }), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409,
    });

    db.auction.findFirst.mockResolvedValueOnce(auction({ status: 'EXTENDED' }));
    await expect(PUT(putRequest({ action: 'PAUSE' }), params())).resolves.toMatchObject({ ok: true, data: { message: 'Auction paused successfully.' } });
    expect(writeBatch.mock.calls.at(-1)?.[0]).toEqual([
      { sql: AUCTION_STATUS_UPDATE_IF_EXPECTED_SQL, values: expect.arrayContaining(['PAUSED', 'auction-1', 'tenant-1', 'EXTENDED']) },
      { sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL, values: expect.arrayContaining(['AUCTION_PAUSED', 'project-1']) },
    ]);

    db.auction.findFirst.mockResolvedValueOnce(auction({ status: 'LIVE' }));
    await expect(PUT(putRequest({ action: 'RESUME' }), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdRoute.onlyPausedAuctionsCanBeResumed, status: 400 });
    db.auction.findFirst.mockResolvedValueOnce(auction({ status: 'PAUSED' }));
    await expect(PUT(putRequest({ action: 'RESUME' }), params())).resolves.toMatchObject({ ok: true, data: { message: 'Auction resumed successfully.' } });
    expect(writeBatch.mock.calls.at(-1)?.[0][1]).toMatchObject({ sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL, values: expect.arrayContaining(['AUCTION_RESUMED']) });

    db.auction.findFirst.mockResolvedValueOnce(auction({ endTime: new Date('2026-01-01T00:00:00Z') }));
    const extended = await PUT(putRequest({ action: 'EXTEND', extensionMinutes: 0 }), params());
    expect(extended).toMatchObject({ ok: true, data: { message: 'Auction extended by 5 minutes.', newEndTime: '2026-01-01T00:05:00.000Z' } });
    expect(writeBatch.mock.calls.at(-1)?.[0]).toEqual([
      { sql: AUCTION_EXTEND_IF_EXPECTED_SQL, values: expect.arrayContaining(['auction-1', 'tenant-1', 'LIVE']) },
      { sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL, values: expect.arrayContaining(['AUCTION_EXTENDED_MANUALLY']) },
    ]);

    db.auction.findFirst.mockResolvedValueOnce(auction());
    await expect(PUT(putRequest({ action: 'CONCLUDE' }), params())).resolves.toMatchObject({ ok: true, data: { message: 'Auction concluded successfully.' } });
    expect(writeBatch.mock.calls.at(-1)?.[0]).toEqual([
      { sql: AUCTION_CONCLUDE_IF_EXPECTED_SQL, values: expect.arrayContaining(['auction-1', 'tenant-1', 'LIVE']) },
      { sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL, values: expect.arrayContaining(['AUCTION_CONCLUDED']) },
    ]);
    db.auction.findFirst.mockResolvedValueOnce(auction());
    await expect(PUT(putRequest({ action: 'CANCEL' }), params())).resolves.toMatchObject({ ok: true, data: { message: 'Auction cancelled successfully.' } });
    expect(writeBatch.mock.calls.at(-1)?.[0][1]).toMatchObject({
      sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
      values: expect.arrayContaining(['AUCTION_CANCELLED', expect.stringContaining('Operational cancellation')]),
    });

    await expect(PUT(putRequest({ action: 'UNKNOWN' }), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400,
    });
    db.auction.findFirst.mockResolvedValueOnce(auction({ status: 'PAUSED' }));
    await expect(PUT(putRequest({ action: 'EXTEND' }), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdRoute.onlyLiveOrExtendedAuctionsCanBeExtended, status: 400,
    });
    db.auction.findFirst.mockResolvedValueOnce(auction());
    await expect(PUT(putRequest({ action: 'EXTEND', extensionMinutes: 61 }), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400,
    });
    db.auction.findFirst.mockResolvedValueOnce(auction({ status: 'CLOSED' }));
    await expect(PUT(putRequest({ action: 'CONCLUDE' }), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409,
    });
    db.auction.findFirst.mockResolvedValueOnce(auction());
    await expect(PUT(putRequest({ action: 'CANCEL', reason: { text: 'bad type' } }), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400,
    });
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

    db.auction.findFirst.mockResolvedValueOnce(auction({ status: 'DRAFT' }));
    await expect(PUT(putRequest({ title: { invalid: true } }), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
    db.auction.findFirst.mockResolvedValueOnce(auction({ status: 'DRAFT' }));
    await expect(PUT(putRequest({ refreshIntervalSeconds: 'not-a-number' }), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });

    db.auction.findFirst.mockResolvedValueOnce(auction({ status: 'DRAFT' }));
    await expect(PUT(putRequest({ title: '', scrollingText: null, refreshIntervalSeconds: '30', startingPrice: '250', minDecrement: '10', termsAndConditions: '', scheduleNow: true }), params())).resolves.toMatchObject({
      ok: true, data: { auction: { status: 'SCHEDULED' }, message: 'Auction draft updated successfully.' },
    });
    expect(writeBatch.mock.calls.at(-1)?.[0]).toEqual([
      { sql: AUCTION_DRAFT_UPDATE_IF_EXPECTED_SQL, values: expect.arrayContaining(['Electrical reverse auction', null, 30, 250, 10, 'Commercial terms', 'SCHEDULED', 'auction-1', 'tenant-1']) },
      { sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL, values: expect.arrayContaining(['AUCTION_DRAFT_UPDATED']) },
    ]);

    db.auction.findFirst.mockResolvedValueOnce(auction({ status: 'DRAFT' }));
    await expect(PUT(putRequest({ title: 'Updated title', refreshIntervalSeconds: 0, startingPrice: 0, minDecrement: 0,
      termsAndConditions: 'New terms', scheduleNow: false }), params())).resolves.toMatchObject({
      ok: true, data: { auction: { title: 'Updated title' }, message: 'Auction draft updated successfully.' },
    });
    expect(writeBatch.mock.calls.at(-1)?.[0][0]).toMatchObject({
      sql: AUCTION_DRAFT_UPDATE_IF_EXPECTED_SQL,
      values: expect.arrayContaining(['Updated title', 'Bidding is open', 10, 100, 5, 'New terms', 'DRAFT', 'auction-1', 'tenant-1']),
    });

    db.auction.findFirst.mockRejectedValueOnce(new Error('auction update read failed'));
    await expect(PUT(putRequest({ action: 'CANCEL' }), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToUpdateAuction, status: 500 });
    db.auction.findFirst.mockRejectedValueOnce({});
    await expect(PUT(putRequest({ action: 'CANCEL' }), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToUpdateAuction, status: 500 });
    const badJson = { headers: new Headers(), json: jest.fn().mockRejectedValue(new Error('bad JSON')) } as unknown as NextRequest;
    await expect(PUT(badJson, params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToUpdateAuction, status: 500 });
  });

  it('deletes only tenant-owned bid-free drafts atomically with an audit record', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(DELETE(deleteRequest(), params())).resolves.toBe(denied);
    db.auction.findFirst.mockResolvedValueOnce(null);
    await expect(DELETE(deleteRequest(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.auctionNotFound, status: 404 });
    db.auction.findFirst.mockResolvedValueOnce(auction({ status: 'LIVE' }));
    await expect(DELETE(deleteRequest(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdRoute.cannotDeleteAnAuctionThatHasAlreadyBeenScheduledOrReceivedBids, status: 400 });
    db.auction.findFirst.mockResolvedValueOnce(auction({ status: 'DRAFT', bids: [{ id: 'bid-1' }] }));
    await expect(DELETE(deleteRequest(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdRoute.cannotDeleteAnAuctionThatHasAlreadyBeenScheduledOrReceivedBids, status: 400 });

    db.auction.findFirst.mockResolvedValueOnce(auction({ status: 'DRAFT', bids: [] }));
    await expect(DELETE(deleteRequest(), params())).resolves.toMatchObject({ ok: true, data: { message: 'Auction deleted successfully.' } });
    expect(writeBatch.mock.calls.at(-1)?.[0]).toEqual([
      { sql: AUCTION_DELETE_DRAFT_WITHOUT_BIDS_SQL, values: ['auction-1', 'tenant-1', 'auction-1', 'tenant-1'] },
      { sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL, values: expect.arrayContaining(['AUCTION_DELETED', 'project-1']) },
    ]);

    db.auction.findFirst.mockResolvedValueOnce(auction({ status: 'SCHEDULED', bids: [] }));
    await expect(DELETE(deleteRequest(), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdRoute.cannotDeleteAnAuctionThatHasAlreadyBeenScheduledOrReceivedBids, status: 400,
    });
    db.auction.findFirst.mockResolvedValueOnce(auction({ status: 'DRAFT', bids: [] }));
    writeBatch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 0 } }]);
    await expect(DELETE(deleteRequest(), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409,
    });
    db.auction.findFirst.mockRejectedValueOnce(new Error('delete failed'));
    await expect(DELETE(deleteRequest(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToDeleteAuction, status: 500 });
    db.auction.findFirst.mockRejectedValueOnce({});
    await expect(DELETE(deleteRequest(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToDeleteAuction, status: 500 });
  });
});
