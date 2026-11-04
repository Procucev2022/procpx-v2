import { NextRequest } from 'next/server';
import { GET, POST } from '../src/app/api/procurement/auctions/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    auction: { updateMany: jest.fn(), count: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    vendor: { findFirst: jest.fn() },
    rfq: { findFirst: jest.fn() },
    auctionVendor: { createMany: jest.fn() },
    auctionItem: { createMany: jest.fn() },
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
const context = { tenantId: 'tenant-1', userId: 'user-1', role: 'PROCUREMENT_MANAGER' };
const getRequest = (query = '') => new NextRequest(`http://localhost/api/procurement/auctions${query}`);
const postRequest = (body: unknown) => new NextRequest('http://localhost/api/procurement/auctions', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

const auction = (overrides: Record<string, any> = {}) => ({
  id: 'auction-1', auctionNumber: 'SLD-001', title: 'Sealed works', auctionCategory: 'ITEM_WISE', auctionType: 'SEALED_BID',
  currency: 'USD', refreshIntervalSeconds: 30, scrollingText: 'Welcome', quantityType: 'ITEM', hasStartPrice: true,
  startingPrice: 500, hasLeadingPrice: true, currentLowestBid: 450, currentLeadingBid: 450, minDecrement: 10,
  hasMinBidReduction: true, hasAutoExtension: true, autoExtensionMinutes: 2, extensionCount: 1, hasBidLimit: true,
  maxBidsPerParticipant: 2, inviteProjectUser: false, projectUserId: null, status: 'LIVE',
  startTime: new Date('2026-10-29T10:00:00.000Z'), endTime: new Date('2026-10-29T11:00:00.000Z'),
  scheduledEndTime: new Date('2026-10-29T11:30:00.000Z'), createdAt: new Date('2026-10-28T10:00:00.000Z'), rfqId: 'rfq-1',
  rfq: { rfqNumber: 'RFQ-1', title: 'Lighting', packageName: 'Office', project: { name: 'North', projectCode: 'N1' },
    pr: { prNumber: 'PR-1', title: 'Lights', costCentre: { name: 'Power' }, boq: { boqCode: 'BOQ-1' } } },
  vendors: [{ id: 'av-1', vendorId: 'v-1', vendor: { name: 'Vendor One', code: 'V1' }, termsAcceptedAt: null,
    bidsCount: 2, lastBidAmount: 400, bestBidRank: 1 }],
  items: [{ id: 'item-1', itemCode: 'CABLE', description: 'Cable', category: 'Electrical', subcategory: 'Wire', uom: 'M',
    quantity: '2', startPrice: 100, currentLeadingBid: 80 }],
  bids: [{ id: 'bid-1' }],
  ...overrides,
});

describe('auction register API', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.auction.updateMany.mockReset().mockResolvedValue({ count: 0 });
    db.auction.count.mockReset().mockResolvedValue(2);
    db.auction.findMany.mockReset().mockResolvedValue([auction()]);
    db.auction.create.mockReset().mockResolvedValue({ id: 'auction-new' });
    db.vendor.findFirst.mockReset().mockResolvedValue({ id: 'v-1' });
    db.rfq.findFirst.mockReset().mockResolvedValue({ id: 'rfq-1', projectId: 'project-1', rfqNumber: 'RFQ-1',
      quotes: [], invitedVendors: [] });
    db.auctionVendor.createMany.mockReset().mockResolvedValue({ count: 1 });
    db.auctionItem.createMany.mockReset().mockResolvedValue({ count: 1 });
    audit.mockReset().mockResolvedValue(undefined);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('filters and formats auction listings, applies privacy scope, and handles auth and data errors', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(getRequest())).resolves.toBe(denied);

    auth.mockResolvedValueOnce({ ...context, role: 'VENDOR' });
    db.vendor.findFirst.mockResolvedValueOnce(null);
    await expect(GET(getRequest())).resolves.toMatchObject({ ok: true, data: { auctions: [], total: 0 } });
    expect(db.auction.findMany).not.toHaveBeenCalled();

    auth.mockResolvedValueOnce({ ...context, role: 'PROJECT_USER' });
    db.auction.findMany.mockResolvedValueOnce([
      auction(),
      auction({ id: 'auction-2', auctionType: 'REVERSE_AUCTION', status: 'CLOSED', currency: '', refreshIntervalSeconds: 0,
        startingPrice: 0, currentLowestBid: 0, currentLeadingBid: 0, minDecrement: 0, scheduledEndTime: null,
        bids: undefined, vendors: [{ id: 'av-2', vendor: { name: 'Vendor Two', code: 'V2' }, lastBidAmount: 45, bestBidRank: 2 }],
        items: [{ id: 'item-2', quantity: 1, startPrice: 0, currentLeadingBid: 0 }], rfq: null }),
    ]);
    const result = await GET(getRequest('?tab=RESULTS&rfqId=rfq-1&type=ALL&category=ALL&search=%20cable%20&page=0&limit=200'));
    expect(result).toMatchObject({ ok: true, data: {
      total: 2, page: 1, limit: 100, totalPages: 1,
      kpis: { total: 2, live: 2, upcoming: 2, draft: 2, completed: 2, pending: 4 },
      auctions: [
        { id: 'auction-1', currentLowestBid: null, currentLeadingBid: null, startingPrice: 500, minDecrement: 10,
          vendors: [{ lastBidAmount: null, bestRank: null }], items: [{ quantity: 2, startPrice: 100, currentLowestBid: null }],
          scheduledEndTime: expect.any(String), rfqNumber: 'RFQ-1', projectName: 'North', prNumber: 'PR-1' },
        { id: 'auction-2', currency: 'INR', refreshIntervalSeconds: 15, startingPrice: null, currentLowestBid: null,
          currentLeadingBid: null, minDecrement: 0, totalBids: 0, invitedVendorsCount: 1, itemsCount: 1,
          vendors: [{ lastBidAmount: 45, bestRank: 2 }], items: [{ startPrice: null, currentLowestBid: null }],
          scheduledEndTime: expect.any(String) },
      ],
    } });
    expect(db.auction.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-1', rfqId: 'rfq-1', status: { in: ['CLOSED', 'COMPLETED'] },
        OR: expect.arrayContaining([{ auctionNumber: { contains: 'cable' } }]) }),
      skip: 0, take: 100,
    }));

    auth.mockResolvedValueOnce({ ...context, role: 'VENDOR', userEmail: 'v@example.test', vendorId: 'v-1' });
    await GET(getRequest('?tab=LIVE'));
    expect(db.auction.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ vendors: { some: { vendorId: 'v-1' } }, status: { in: ['LIVE', 'EXTENDED'] } }),
    }));

    for (const [tab, status] of [
      ['UPCOMING', 'SCHEDULED'], ['DRAFT', 'DRAFT'], ['COMPLETED', { in: ['CLOSED', 'COMPLETED'] }],
    ] as const) {
      auth.mockResolvedValueOnce(context);
      await GET(getRequest(`?tab=${tab}&type=SEALED_BID&category=ITEM_WISE`));
      expect(db.auction.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
        where: expect.objectContaining({ auctionType: 'SEALED_BID', auctionCategory: 'ITEM_WISE', status }),
      }));
    }

    auth.mockResolvedValueOnce({ ...context, role: 'PROJECT_APPROVER' });
    db.vendor.findFirst.mockResolvedValueOnce({ id: 'v-1' });
    db.auction.findMany.mockRejectedValueOnce(new Error('auction query failed'));
    await expect(GET(getRequest('?tab=UPCOMING&type=FORWARD_AUCTION&category=ITEM_WISE'))).resolves.toEqual({
      ok: false, error: 'auction query failed', status: 500,
    });
    db.auction.updateMany.mockRejectedValueOnce({});
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: 'Failed to fetch auctions', status: 500 });
    expect(consoleError).toHaveBeenCalledTimes(2);
  });

  it('validates auction creation inputs and quoted vendor exclusions', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(postRequest({}))).resolves.toBe(denied);
    await expect(POST(postRequest({ rfqId: 'rfq-1', title: '   ' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementAuctionsRoute.rFQIDAndAuctionNameAreMandatoryFields, status: 400,
    });
    db.rfq.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest({ rfqId: 'missing', title: 'Auction' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementAuctionsRoute.selectedRFQWasNotFoundOrIsInaccessibleInThisWorkspace, status: 404,
    });

    db.rfq.findFirst.mockResolvedValueOnce({ quotes: [{ vendorId: 'quoted-vendor', status: 'SUBMITTED' }] });
    await expect(POST(postRequest({ rfqId: 'rfq-1', title: 'Auction', invitedVendorIds: [] }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementAuctionsRoute.mandatoryJustificationIsRequiredWhenExcludingQuotedVendorsFromTheInvitedList, status: 400,
    });
    db.rfq.findFirst.mockResolvedValueOnce({ quotes: [] });
    await expect(POST(postRequest({ rfqId: 'rfq-1', title: 'Auction', invitedVendorIds: [] }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementAuctionsRoute.atLeastOneVendorMustBeInvitedToScheduleAnAuction, status: 400,
    });
    db.rfq.findFirst.mockResolvedValueOnce({ quotes: [] });
    await expect(POST(postRequest({ rfqId: 'rfq-1', title: 'Auction', invitedVendorIds: ['v-1'], startTime: 'invalid' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementAuctionsRoute.pleaseProvideValidStartAndEndDateTime, status: 400,
    });
    db.rfq.findFirst.mockResolvedValueOnce({ quotes: [] });
    await expect(POST(postRequest({ rfqId: 'rfq-1', title: 'Auction', invitedVendorIds: ['v-1'],
      startTime: '2026-11-01T10:00:00Z', endTime: '2026-11-01T09:00:00Z' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.auctionEndTimeMustBeLaterThanStartTime, status: 400,
    });
  });

  it('creates scheduled and sealed draft auctions with their associated vendors and items', async () => {
    const futureStart = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const created = await POST(postRequest({
      rfqId: 'rfq-1', title: '  Forward event  ', auctionType: 'FORWARD_AUCTION', startTime: futureStart, endTime: futureEnd,
      refreshIntervalSeconds: 500, scrollingText: '  Bid now  ', startingPrice: '1200', invitedVendorIds: ['v-1'],
      items: [{}, { id: 'line-2', itemCode: 'PUMP', description: 'Pump', category: 'Plant', subCategory: 'Water',
        uom: 'EA', quantity: 3, startPrice: '400' }], documents: [{ name: 'spec.pdf' }, null], inviteProjectUser: true,
      projectUserId: 'project-user', nonInvitedJustification: 'Existing vendors retained',
    }));
    expect(created).toMatchObject({ ok: true, status: 201, data: { message: expect.stringContaining('FWD-') } });
    expect(db.auction.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      auctionNumber: expect.stringMatching(/^FWD-/), title: 'Forward event', status: 'SCHEDULED', refreshIntervalSeconds: 300,
      scrollingText: 'Bid now', startingPrice: 1200, currentLowestBid: 1200, currentLeadingBid: 1200,
      projectUserId: 'project-user', bidVisibility: 'LEADERBOARD', documents: '[{"name":"spec.pdf"},null]',
      startTime: new Date(futureStart), endTime: new Date(futureEnd),
    }) });
    expect(db.auctionVendor.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ vendorId: 'v-1', auctionId: 'auction-new' })] });
    expect(db.auctionItem.createMany).toHaveBeenCalledWith({ data: [
      expect.objectContaining({ itemCode: 'ITEM-1', description: 'Auction Item', category: UI_STRINGS.common.general, uom: 'EA', quantity: 1, startPrice: null }),
      expect.objectContaining({ itemCode: 'PUMP', subcategory: 'Water', quantity: 3, startPrice: 400, currentLeadingBid: 400 }),
    ] });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUCTION_SCHEDULED', projectId: 'project-1' }));

    db.rfq.findFirst.mockResolvedValueOnce({ quotes: [{ vendorId: 'excluded', status: 'SUBMITTED' }] });
    const draft = await POST(postRequest({ rfqId: 'rfq-1', title: 'Sealed draft', auctionType: 'SEALED_BID', isDraft: true,
      invitedVendorIds: [], termsAndConditions: '   ', hasMinBidReduction: false,
      refreshIntervalSeconds: 0, maxBidsPerParticipant: 20, inviteProjectUser: false, documents: null }));
    expect(draft).toMatchObject({ ok: true, data: { message: expect.stringContaining('Draft auction SLD-') } });
    expect(db.auction.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({
      auctionNumber: expect.stringMatching(/^SLD-/), status: 'DRAFT', hasLeadingPrice: false, maxBidsPerParticipant: 1,
      minDecrement: 0, refreshIntervalSeconds: 15, projectUserId: null,
      termsAndConditions: 'Standard ProCPX Auction Terms & Conditions apply. Bids submitted are binding.', documents: '[]',
    }) });
    expect(db.auctionVendor.createMany).toHaveBeenCalledTimes(1);
    expect(db.auctionItem.createMany).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'AUCTION_DRAFT_CREATED' }));
  });

  it('maps database and request failures to API errors and schedules live or past events', async () => {
    db.rfq.findFirst.mockRejectedValueOnce(new Error('RFQ lookup failed'));
    await expect(POST(postRequest({ rfqId: 'rfq-1', title: 'Auction' }))).resolves.toEqual({ ok: false, error: 'RFQ lookup failed', status: 500 });

    db.rfq.findFirst.mockResolvedValueOnce({ quotes: [] });
    db.auction.create.mockResolvedValueOnce({ id: 'live' });
    await expect(POST(postRequest({ rfqId: 'rfq-1', title: 'Live auction', invitedVendorIds: ['v-1'],
      startTime: new Date(Date.now() - 1000).toISOString(), endTime: new Date(Date.now() + 60_000).toISOString(),
      auctionType: 'REVERSE_AUCTION', hasLeadingPrice: false, hasStartPrice: false, hasMinBidReduction: false,
      startingPrice: 0, inviteProjectUser: true, projectUserId: null, termsAndConditions: '  ',
    }))).resolves.toMatchObject({ ok: true, data: { message: expect.stringContaining('AUC-') } });
    expect(db.auction.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ status: 'LIVE', bidVisibility: 'RANK_ONLY',
      currentLowestBid: null, currentLeadingBid: null, projectUserId: null, minDecrement: 0,
      termsAndConditions: 'Standard ProCPX Auction Terms & Conditions apply. Bids submitted are binding.' }) });

    db.rfq.findFirst.mockResolvedValueOnce({ quotes: [] });
    db.auction.create.mockResolvedValueOnce({ id: 'closed' });
    await expect(POST(postRequest({ rfqId: 'rfq-1', title: 'Past auction', invitedVendorIds: ['v-1'],
      startTime: '2026-10-01T10:00:00Z', endTime: '2026-10-01T11:00:00Z', refreshIntervalSeconds: 1,
      minDecrement: 0, autoExtensionMinutes: 0, maxBidsPerParticipant: 0, documents: [],
    }))).resolves.toMatchObject({ ok: true, data: { message: expect.stringContaining('AUC-') } });
    expect(db.auction.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ status: 'CLOSED', refreshIntervalSeconds: 5,
      minDecrement: 5000, autoExtensionMinutes: 3, maxBidsPerParticipant: 10 }) });

    db.rfq.findFirst.mockResolvedValueOnce({ quotes: [] });
    db.auction.findMany.mockRejectedValueOnce({});
    await expect(POST(postRequest({ rfqId: 'rfq-1', title: 'Broken count', isDraft: true }))).resolves.toEqual({
      ok: false, error: 'Failed to create auction', status: 500,
    });
    const badJson = { json: jest.fn().mockRejectedValue(new Error('invalid JSON')) } as unknown as NextRequest;
    await expect(POST(badJson)).resolves.toEqual({ ok: false, error: 'invalid JSON', status: 500 });
    expect(consoleError).toHaveBeenCalledTimes(3);
  });
});
