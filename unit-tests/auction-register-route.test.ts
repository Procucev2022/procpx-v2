import { NextRequest } from 'next/server';
import { GET, POST } from '../src/app/api/procurement/auctions/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { MAX_NOTIFICATION_MESSAGE_LENGTH } from '../src/lib/notification-outbox.constants';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    auction: { count: jest.fn(), findMany: jest.fn(), create: jest.fn(), findUnique: jest.fn() },
    vendor: { findFirst: jest.fn(), count: jest.fn() },
    rfq: { findFirst: jest.fn() },
    quote: { findFirst: jest.fn() },
    rfqLine: { findMany: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));
jest.mock('../src/lib/d1-batch', () => ({
  ...jest.requireActual('../src/lib/d1-batch'),
  writeD1BatchAtomically: jest.fn(),
}));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn().mockResolvedValue(undefined) }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const d1Batch = writeD1BatchAtomically as jest.Mock;
const log = writeStructuredLog as jest.Mock;
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
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.auction.count.mockReset().mockResolvedValue(2);
    db.auction.findMany.mockReset().mockResolvedValue([auction()]);
    db.auction.create.mockReset().mockResolvedValue({ id: 'auction-new' });
    db.auction.findUnique.mockReset().mockResolvedValue(null);
    db.vendor.findFirst.mockReset().mockResolvedValue({ id: 'v-1' });
    db.vendor.count.mockReset().mockResolvedValue(1);
    db.rfq.findFirst.mockReset().mockResolvedValue({ id: 'rfq-1', projectId: 'project-1', rfqNumber: 'RFQ-1' });
    db.quote.findFirst.mockReset().mockResolvedValue(null);
    db.rfqLine.findMany.mockReset().mockResolvedValue([{ id: 'line-2' }]);
    d1Batch.mockReset().mockImplementation(async (statements: Array<{ sql: string; values: unknown[] }>) => statements.map((_, index) => ({
      meta: { changes: 1 },
      ...(index === 0 ? {
        results: [{ id: statements[0].values[0], auctionNumber: `${String(statements[0].values[3])}000003`, status: statements[0].values[25] }],
      } : {}),
    })));
    log.mockReset().mockResolvedValue(undefined);
  });

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
      ok: false, error: UI_STRINGS.common.userMessages.failedToFetchAuctions, status: 500,
    });
    db.auction.count.mockRejectedValueOnce(new Error('auction count failed'));
    await expect(GET(getRequest())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToFetchAuctions, status: 500,
    });
    expect(log).toHaveBeenCalledWith('error', 'auction.register_read_failed', expect.any(Object));
    expect(d1Batch).not.toHaveBeenCalled();
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

    db.quote.findFirst.mockResolvedValueOnce({ id: 'quote-excluded' });
    await expect(POST(postRequest({ rfqId: 'rfq-1', title: 'Auction', invitedVendorIds: [] }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementAuctionsRoute.mandatoryJustificationIsRequiredWhenExcludingQuotedVendorsFromTheInvitedList, status: 400,
    });
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', projectId: 'project-1', rfqNumber: 'RFQ-1' });
    await expect(POST(postRequest({ rfqId: 'rfq-1', title: 'Auction', invitedVendorIds: [] }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementAuctionsRoute.atLeastOneVendorMustBeInvitedToScheduleAnAuction, status: 400,
    });
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', projectId: 'project-1', rfqNumber: 'RFQ-1' });
    await expect(POST(postRequest({ rfqId: 'rfq-1', title: 'Auction', invitedVendorIds: ['v-1'], startTime: 'invalid' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementAuctionsRoute.pleaseProvideValidStartAndEndDateTime, status: 400,
    });
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', projectId: 'project-1', rfqNumber: 'RFQ-1' });
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
    expect(created).toMatchObject({ ok: true, status: 201, data: { message: UI_STRINGS.common.userMessages.auctionScheduled } });
    expect(d1Batch).toHaveBeenCalledTimes(1);
    const auctionBatch = d1Batch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(auctionBatch).toHaveLength(6);
    expect(auctionBatch[0].sql).toContain('MAX(CAST(substr(existing."auctionNumber"');
    expect(auctionBatch[0].values).toContain('FWD-2026-');
    expect(auctionBatch[1].sql).toContain('INSERT INTO "audit_logs"');
    expect(auctionBatch[1].values).toContain('AUCTION_SCHEDULED');
    expect(auctionBatch[2].sql).toContain('INSERT INTO "auction_vendors"');
    expect(auctionBatch[3].sql).toContain('INSERT INTO "notification_outbox"');
    expect(JSON.parse(String(auctionBatch[3].values[2]))).toMatchObject({
      tenantId: 'tenant-1', vendorId: 'v-1', entityType: 'AUCTION', entityId: expect.any(String),
    });
    expect(auctionBatch[4].sql).toContain('INSERT INTO "auction_items"');
    expect(auctionBatch[5].sql).toContain('INSERT INTO "auction_items"');
    expect(db.auction.count).not.toHaveBeenCalled();
    expect(db.auction.create).not.toHaveBeenCalled();
    expect(db.quote.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-1', rfqId: 'rfq-1', vendorId: { notIn: ['v-1'] } }),
      select: { id: true },
    }));

    const draft = await POST(postRequest({ rfqId: 'rfq-1', title: 'Sealed draft', auctionType: 'SEALED_BID', isDraft: true,
      invitedVendorIds: [], termsAndConditions: '   ', hasMinBidReduction: false,
      refreshIntervalSeconds: 0, maxBidsPerParticipant: 20, inviteProjectUser: false, documents: null }));
    expect(draft).toMatchObject({ ok: true, data: { message: expect.stringContaining('Auction SLD-') } });
    const draftBatch = d1Batch.mock.calls[1][0] as Array<{ sql: string; values: unknown[] }>;
    expect(draftBatch).toHaveLength(2);
    expect(draftBatch[0].values).toContain('SLD-2026-');
    expect(draftBatch[0].values).toContain('DRAFT');
    expect(draftBatch[0].values).toContain('[]');
    expect(draftBatch[1].values).toContain('AUCTION_DRAFT_CREATED');
  });

  it('maps database and request failures to API errors and schedules live or past events', async () => {
    db.rfq.findFirst.mockRejectedValueOnce(new Error('RFQ lookup failed'));
    await expect(POST(postRequest({ rfqId: 'rfq-1', title: 'Auction' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToCreateAuction, status: 500,
    });

    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', projectId: 'project-1', rfqNumber: 'RFQ-1' });
    await expect(POST(postRequest({ rfqId: 'rfq-1', title: 'Live auction', invitedVendorIds: ['v-1'],
      startTime: new Date(Date.now() - 1000).toISOString(), endTime: new Date(Date.now() + 60_000).toISOString(),
      auctionType: 'REVERSE_AUCTION', hasLeadingPrice: false, hasStartPrice: false, hasMinBidReduction: false,
      startingPrice: 0, inviteProjectUser: true, projectUserId: null, termsAndConditions: '  ',
    }))).resolves.toMatchObject({ ok: true, data: { auction: { id: expect.any(String) }, message: UI_STRINGS.common.userMessages.auctionScheduled } });
    const liveBatch = d1Batch.mock.calls[0][0] as Array<{ values: unknown[] }>;
    expect(liveBatch[0].values).toContain('LIVE');
    expect(liveBatch[0].values).toContain('RANK_ONLY');
    expect(liveBatch[0].values).toContain(null);

    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', projectId: 'project-1', rfqNumber: 'RFQ-1' });
    await expect(POST(postRequest({ rfqId: 'rfq-1', title: 'Past auction', invitedVendorIds: ['v-1'],
      startTime: '2026-10-01T10:00:00Z', endTime: '2026-10-01T11:00:00Z', refreshIntervalSeconds: 1,
      minDecrement: 0, autoExtensionMinutes: 0, maxBidsPerParticipant: 0, documents: [],
    }))).resolves.toMatchObject({ ok: true, data: { auction: { id: expect.any(String) } } });
    const closedBatch = d1Batch.mock.calls[1][0] as Array<{ values: unknown[] }>;
    expect(closedBatch[0].values).toContain('CLOSED');
    expect(closedBatch[0].values).toContain(5000);
    expect(closedBatch[0].values).toContain(3);
    expect(closedBatch[0].values).toContain(10);

    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', projectId: 'project-1', rfqNumber: 'RFQ-1' });
    d1Batch.mockRejectedValueOnce({});
    await expect(POST(postRequest({ rfqId: 'rfq-1', title: 'Broken count', isDraft: true }))).resolves.toEqual({
      ok: false, error: 'Failed to create auction', status: 500,
    });
    expect(log).toHaveBeenCalledWith('error', 'auction.creation_failed', expect.objectContaining({
      operation: 'create_auction', tenantId: 'tenant-1', rfqId: 'rfq-1', itemCount: 0, invitedVendorCount: 0,
    }));
    const badJson = { json: jest.fn().mockRejectedValue(new Error('invalid JSON')) } as unknown as NextRequest;
    await expect(POST(badJson)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToCreateAuction, status: 500 });
    expect(log).toHaveBeenCalledWith('error', 'auction.creation_failed', expect.objectContaining({ operation: 'create_auction' }));
  });

  it('rejects an auction whose combined invitation and item writes exceed the safe D1 binding budget', async () => {
    db.vendor.count.mockResolvedValueOnce(100);
    const invitedVendorIds = Array.from({ length: 100 }, (_, index) => `vendor-${index}`);
    const items = Array.from({ length: 200 }, (_, index) => ({ itemCode: `item-${index}` }));

    await expect(POST(postRequest({ rfqId: 'rfq-1', title: 'Large auction', invitedVendorIds, items }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementAuctionsRoute.auctionExceedsSafeAtomicWriteLimit, status: 400,
    });
    expect(d1Batch).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('warn', 'auction.creation_rejected_batch_limit', expect.objectContaining({
      violation: 'batch_bindings', invitedVendorCount: 100, itemCount: 200,
    }));
  });

  it('keeps long auction names within the notification payload limit', async () => {
    await POST(postRequest({ rfqId: 'rfq-1', title: 'A'.repeat(MAX_NOTIFICATION_MESSAGE_LENGTH + 50), invitedVendorIds: ['v-1'] }));

    const statements = d1Batch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    const notificationStatement = statements.find(({ sql }) => sql.includes('notification_outbox'));
    expect(notificationStatement).toBeDefined();
    const payload = JSON.parse(String(notificationStatement?.values[2])) as { message: string };
    expect(payload.message.length).toBe(MAX_NOTIFICATION_MESSAGE_LENGTH);
  });
});
