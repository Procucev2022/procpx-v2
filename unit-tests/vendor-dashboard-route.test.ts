import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/procurement/vendors/[id]/dashboard/route';
import { prisma } from '../src/lib/prisma';
import { apiError, isApiContext, requireAuth } from '../src/lib/api-utils';
import { hasPermission } from '../src/lib/permissions';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    vendor: { findFirst: jest.fn() },
    rfq: { findMany: jest.fn() },
    ppo: { findMany: jest.fn() },
    vendorRateCard: { findMany: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));
jest.mock('../src/lib/permissions', () => ({ hasPermission: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const permission = hasPermission as jest.Mock;
const errorResult = apiError as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1', role: 'PROCUREMENT_USER', vendorId: null };
const params = (id = 'vendor-1') => ({ params: Promise.resolve({ id }) });
const request = () => new NextRequest('http://localhost/api/procurement/vendors/vendor-1/dashboard');
const nowPlusDay = () => new Date(Date.now() + 86_400_000);

function rfq(id: string, extra: Record<string, any> = {}) {
  return {
    id, rfqNumber: `RFQ-${id}`, title: `Title ${id}`, packageName: `Package ${id}`,
    tenant: { id: 'tenant-1', name: 'Buyer Ltd' },
    project: { id: 'project-1', name: `Project ${id}`, projectCode: 'P-1' },
    boqRevision: { boq: { id: 'boq-1', title: 'BOQ Scope', boqCode: 'BOQ-1' } },
    lines: [{ id: `line-${id}`, category: 'Electrical' }],
    invitedVendors: [{ vendorId: 'vendor-1', invitedAt: new Date('2026-03-01T00:00:00Z') }],
    quotes: [], negotiations: [], ppos: [], messages: [],
    createdAt: new Date('2026-02-01T00:00:00Z'), updatedAt: new Date('2026-03-01T00:00:00Z'),
    releasedAt: null, submissionDeadline: null,
    ...extra,
  };
}

describe('vendor dashboard API', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    permission.mockReturnValue(true);
    db.vendor.findFirst.mockResolvedValue({ id: 'vendor-1', tenantId: 'tenant-1', code: 'V-1', name: 'Northwind', email: 'vendor@example.test', phone: '123', categories: 'Electrical', status: 'ACTIVE' });
    db.rfq.findMany.mockResolvedValue([]);
    db.ppo.findMany.mockResolvedValue([]);
    db.vendorRateCard.findMany.mockResolvedValue([]);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('enforces authentication, vendor isolation, role permission, and tenant lookup', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(request(), params())).resolves.toBe(denied);

    auth.mockResolvedValueOnce({ ...context, role: 'VENDOR', vendorId: null });
    await expect(GET(request(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementVendorsIdDashboardRoute.forbiddenYouCanOnlyAccessYourOwnVendorDashboard, status: 403 });
    auth.mockResolvedValueOnce({ ...context, role: 'VENDOR', vendorId: 'vendor-other' });
    await expect(GET(request(), params())).resolves.toMatchObject({ status: 403 });
    auth.mockResolvedValueOnce({ ...context, role: 'VENDOR', vendorId: 'vendor-1' });
    await expect(GET(request(), params('vendor-other'))).resolves.toMatchObject({ status: 403 });

    permission.mockReturnValue(false);
    await expect(GET(request(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.forbiddenInsufficientPermissions, status: 403 });
    expect(permission).toHaveBeenCalledWith('PROCUREMENT_USER', 'VENDOR_VIEW');

    permission.mockReturnValue(true);
    db.vendor.findFirst.mockResolvedValueOnce(null);
    await expect(GET(request(), params('missing'))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.vendorNotFoundOrAccessDenied, status: 404 });
    expect(db.vendor.findFirst).toHaveBeenCalledWith({ where: { id: 'missing', tenantId: 'tenant-1' } });
  });

  it('maps quote, negotiation, decision, PPO, counts, dates, and permitted commercial details', async () => {
    const counter = {
      roundNumber: 2, status: 'ROUND_ACTIVE', counterOfferAmount: 1400, revisedQuoteAmount: 0,
      nextResponsibleParty: 'VENDOR', buyerDecision: null, isFinalOffer: false,
      createdAt: new Date('2026-03-03'), updatedAt: new Date('2026-03-04'),
    };
    db.rfq.findMany.mockResolvedValue([
      rfq('new', { packageName: null, submissionDeadline: nowPlusDay(), invitedVendors: [{ vendorId: 'vendor-1', invitedAt: null }], messages: [], lines: [], tenant: null, project: null, boqRevision: null }),
      rfq('quote', { packageName: null, lines: [], quotes: [{ id: 'q1', status: 'SUBMITTED', totalQuoteAmount: 2500, submittedAt: new Date('2026-03-05'), updatedAt: new Date('2026-03-06') }], negotiations: [{ status: 'ACTIVE', rounds: [] }] }),
      rfq('counter', { negotiations: [{ status: 'ACTIVE', rounds: [counter] }], messages: [{ createdAt: new Date('2026-03-07') }], quotes: [{ id: 'q2', status: 'REVISED', totalQuoteAmount: 2000 }], lines: [], boqRevision: null }),
      rfq('revision', { negotiations: [{ status: 'ACTIVE', rounds: [{ roundNumber: 3, status: 'REVISED_SUBMITTED', revisedQuoteAmount: 1900, counterOfferAmount: 0, nextResponsibleParty: 'BUYER', buyerDecision: null, isFinalOffer: false }] }], quotes: [] }),
      rfq('final-pending', { negotiations: [{ status: 'ACTIVE', rounds: [{ roundNumber: 4, status: 'FINAL_OFFER_SUBMITTED', revisedQuoteAmount: 1800, nextResponsibleParty: 'BUYER', buyerDecision: null, isFinalOffer: true }] }] }),
      rfq('final-accept', { negotiations: [{ status: 'ACTIVE', rounds: [{ roundNumber: 5, status: 'FINAL_OFFER_SUBMITTED', revisedQuoteAmount: 1700, nextResponsibleParty: 'BUYER', buyerDecision: 'FINAL_ACCEPTANCE_PENDING', isFinalOffer: true }] }] }),
      rfq('accepted', { negotiations: [{ status: 'ACTIVE', rounds: [{ roundNumber: 6, status: 'ROUND_CLOSED', revisedQuoteAmount: 1600, nextResponsibleParty: 'BUYER', buyerDecision: 'ACCEPTED', isFinalOffer: false }] }] }),
      rfq('rejected', { negotiations: [{ status: 'CLOSED', rounds: [{ roundNumber: 7, status: 'ROUND_CLOSED', revisedQuoteAmount: 1500, nextResponsibleParty: 'VENDOR', buyerDecision: 'REJECTED' }] }] }),
      rfq('ppo-accepted', { quotes: [{ id: 'q3', status: 'APPROVED' }], ppos: [{ id: 'p1', vendorStatus: 'ACCEPTED_BY_VENDOR', status: 'ISSUED', totalValue: 3500, lines: [], createdAt: new Date('2026-03-08') }] }),
      rfq('ppo-issue', { ppos: [{ id: 'p2', vendorStatus: 'ISSUE_RAISED', status: 'ISSUED', totalValue: 3000 }] }),
      rfq('ppo-pending', { ppos: [{ id: 'p3', vendorStatus: 'PENDING_VENDOR_ACCEPTANCE', status: 'ISSUED', totalValue: 2500 }] }),
      rfq('confirmed', { ppos: [{ id: 'p4', vendorStatus: 'PENDING_VENDOR_ACCEPTANCE', status: 'CONFIRMED', totalValue: 1000 }] }),
      rfq('round-fallback', { negotiations: [{ status: 'PENDING', rounds: [] }] }),
    ]);
    db.ppo.findMany.mockResolvedValue([
      { id: 'p1', vendorStatus: 'PENDING_VENDOR_ACCEPTANCE', status: 'DRAFT', vendorAcceptedAt: null },
      { id: 'p2', vendorStatus: 'OTHER', status: 'ISSUED', vendorAcceptedAt: null },
      { id: 'p3', vendorStatus: 'ACCEPTED_BY_VENDOR', status: 'DRAFT', vendorAcceptedAt: new Date() },
      { id: 'p4', vendorStatus: 'OTHER', status: 'CONFIRMED', vendorAcceptedAt: new Date() },
    ]);
    db.vendorRateCard.findMany.mockResolvedValue([{ id: 'rate-1', items: [{ id: 'item-1' }] }]);

    const result = await GET(request(), params());
    expect(consoleError).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, data: {
      vendor: { id: 'vendor-1', name: 'Northwind' },
      counts: {
        newRfqs: 10, quotesDueSoon: 1, quotesSubmitted: 3, negotiationsAwaitingVendor: 1,
        finalOffersAwaitingBuyer: 2, quotesAcceptedPpoAwaited: 1, pposAwaitingAcceptance: 2, acceptedPpos: 2,
      },
      rateCards: [{ id: 'rate-1' }],
    } });
    const data = (result as any).data;
    const byId = Object.fromEntries(data.rfqRegister.map((item: any) => [item.id, item]));
    expect(byId.new).toMatchObject({
      clientTenant: 'Procucev Client', projectPackage: 'Project / Main Package', category: 'General Works',
      quotationStatus: 'PENDING_SUBMISSION', buyerDecisionStatus: 'Awaiting Initial Quotation',
      nextAction: 'Submit quote before deadline', availableActions: ['VIEW_RFQ', 'SUBMIT_QUOTE', 'OPEN_NEGOTIATION', 'CHAT_CLARIFY'],
    });
    expect(byId.quote).toMatchObject({
      category: 'BOQ Scope', quotationStatus: 'SUBMITTED', buyerDecisionStatus: 'Quote Under Buyer Evaluation',
      negotiationStatus: 'ACTIVE', nextResponsibleParty: 'BUYER', availableActions: expect.arrayContaining(['REVISE_QUOTE']),
    });
    expect(byId.counter).toMatchObject({
      negotiationStatus: 'BUYER_COUNTER_ACTIVE', buyerDecisionStatus: 'Buyer Counter-Offer Received (Round 2)',
      nextAction: 'Buyer Counter-Offer received; Submit revised offer', permittedCommercial: { counterOfferAmount: 1400 },
      unreadMessagesCount: 1,
    });
    expect(byId.revision).toMatchObject({ buyerDecisionStatus: 'Revised Quote Submitted (Round 3)', quotationStatus: 'PENDING_SUBMISSION' });
    expect(byId['final-pending'].buyerDecisionStatus).toContain('Final Offer Submitted');
    expect(byId['final-pending'].buyerDecisionStatus).toContain('Pending Buyer Decision');
    expect(byId['final-accept'].buyerDecisionStatus).toBe('Final Acceptance Pending from Buyer');
    expect(byId.accepted.nextAction).toBe('PPO issuance awaited from Procurement Team');
    expect(byId.rejected).toMatchObject({ buyerDecisionStatus: 'Quote Not Accepted / Negotiation Closed', nextResponsibleParty: 'CLOSED' });
    expect(byId['ppo-accepted']).toMatchObject({
      nextAction: 'Order Execution & Delivery Fulfilment',
      permittedCommercial: { ppoTotalValue: 3500 },
    });
    expect(byId['ppo-accepted'].buyerDecisionStatus).toContain('PPO Accepted');
    expect(byId['ppo-issue'].nextAction).toBe('Awaiting Buyer Review of Raised Issue');
    expect(byId['ppo-pending']).toMatchObject({
      buyerDecisionStatus: 'PPO Pending Vendor Acceptance', nextAction: 'Review and Accept Issued Purchase Order (PPO)',
      availableActions: expect.arrayContaining(['ACCEPT_PPO']),
    });
    expect(byId.confirmed.nextAction).toBe('Order Execution & Delivery Fulfilment');
    expect(byId['round-fallback'].negotiationStatus).toBe(UI_STRINGS.common.pENDING);
  });

  it('returns role errors and handles errors from each related data source', async () => {
    auth.mockResolvedValueOnce({ ...context, role: 'VENDOR', vendorId: 'vendor-1' });
    await expect(GET(request(), params())).resolves.toMatchObject({ ok: true });

    db.rfq.findMany.mockRejectedValueOnce(new Error('RFQ lookup failed'));
    await expect(GET(request(), params())).resolves.toEqual({ ok: false, error: 'RFQ lookup failed', status: 500 });
    db.ppo.findMany.mockRejectedValueOnce({});
    await expect(GET(request(), params())).resolves.toEqual({ ok: false, error: 'Failed to fetch vendor dashboard data', status: 500 });
    db.vendorRateCard.findMany.mockRejectedValueOnce(new Error('rate card lookup failed'));
    await expect(GET(request(), params())).resolves.toEqual({ ok: false, error: 'rate card lookup failed', status: 500 });
    expect(errorResult).toHaveBeenCalledWith('RFQ lookup failed', 500);
    expect(errorResult).toHaveBeenCalledWith('Failed to fetch vendor dashboard data', 500);
    expect(errorResult).toHaveBeenCalledWith('rate card lookup failed', 500);
    expect(consoleError).toHaveBeenCalledTimes(3);
  });
});
