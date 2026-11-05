import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '../src/lib/api-utils';
import { GET } from '../src/app/api/vendor-portal/rfqs/route';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({ prisma: { rfq: { findMany: jest.fn(), count: jest.fn() } } }));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
}));

const findRfqs = prisma.rfq.findMany as jest.Mock;
const countRfqs = prisma.rfq.count as jest.Mock;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const errorResponse = apiError as jest.Mock;
const successResponse = apiSuccess as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1', role: 'VENDOR', vendorId: 'vendor-1' };
const request = (url = 'http://localhost/api/vendor-portal/rfqs') => new NextRequest(url);
const instant = (day: number) => `2026-02-${String(day).padStart(2, '0')}T10:00:00.000Z`;

const rfq = (overrides: Record<string, unknown> = {}) => ({
  id: 'rfq-1',
  rfqNumber: 'RFQ-001',
  packageName: 'Lighting package',
  createdAt: instant(1),
  updatedAt: instant(2),
  tenant: { name: 'Client tenant' },
  project: { name: 'Store project' },
  invitedVendors: [],
  quotes: [],
  negotiations: [],
  ppos: [],
  messages: [],
  ...overrides,
});

describe('vendor portal RFQ list', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    errorResponse.mockImplementation((error: string, status = 400) => ({ ok: false, error, status }));
    successResponse.mockImplementation((data: unknown, status = 200) => ({ ok: true, data, status }));
    findRfqs.mockResolvedValue([]);
    countRfqs.mockResolvedValue(0);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('requires an authenticated vendor mapping and scopes the query to it', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(request())).resolves.toBe(denied);

    auth.mockResolvedValueOnce({ ...context, role: 'BUYER', vendorId: null });
    await expect(GET(request())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.forbiddenVendorPortalIsAccessibleOnlyToMappedVendorAccounts, status: 403,
    });

    auth.mockResolvedValueOnce({ ...context, vendorId: null });
    await expect(GET(request())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.vendorRecordNotAssociatedWithThisUserAccount, status: 404,
    });

    await expect(GET(request())).resolves.toEqual({ ok: true, data: { rfqs: [], total: 0, page: 1, pageSize: 50, totalPages: 0, hasMore: false, nextCursor: null }, status: 200 });
    expect(findRfqs).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', invitedVendors: { some: { vendorId: 'vendor-1' } } },
      skip: 0, take: 50, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }));
    expect(countRfqs).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1', invitedVendors: { some: { vendorId: 'vendor-1' } } } });
  });

  it('enriches RFQs with quote, negotiation, decision, PPO, action, and activity summaries', async () => {
    findRfqs.mockResolvedValueOnce([
      rfq({
        rfqNumber: 'RFQ-INITIAL',
        tenant: { name: '' },
        project: { name: '' },
        packageName: '',
        releasedAt: instant(3),
        invitedVendors: [{ invitedAt: null, submissionStatus: 'SUBMITTED' }],
      }),
      rfq({
        rfqNumber: 'RFQ-ACCEPTED',
        invitedVendors: [{ invitedAt: instant(4), submissionStatus: 'SUBMITTED' }],
        quotes: [{ status: 'SUBMITTED', submittedAt: instant(5), updatedAt: instant(6) }],
        negotiations: [{ rounds: [{ roundNumber: 3, buyerDecision: 'ACCEPTED', createdAt: instant(7), updatedAt: instant(8) }] }],
        messages: [{ createdAt: instant(9) }],
      }),
      rfq({
        rfqNumber: 'RFQ-REJECTED',
        negotiations: [{ rounds: [{ roundNumber: 2, buyerDecision: 'REJECTED' }] }],
      }),
      rfq({
        rfqNumber: 'RFQ-FINAL-PENDING',
        quotes: [{ status: 'SUBMITTED' }],
        negotiations: [{ rounds: [{ roundNumber: 4, isFinalOffer: true, buyerDecision: 'FINAL_ACCEPTANCE_PENDING' }] }],
      }),
      rfq({
        rfqNumber: 'RFQ-FINAL-OTHER',
        quotes: [{ status: 'SUBMITTED' }],
        negotiations: [{ rounds: [{ roundNumber: 5, isFinalOffer: true }] }],
      }),
      rfq({
        rfqNumber: 'RFQ-COUNTER',
        quotes: [{ status: 'SUBMITTED' }],
        negotiations: [{ rounds: [{ roundNumber: 6, counterOfferAmount: 450, revisedQuoteAmount: null }] }],
      }),
      rfq({
        rfqNumber: 'RFQ-QUOTE',
        quotes: [{ status: 'SUBMITTED' }],
        negotiations: [{ rounds: [{ roundNumber: 7, counterOfferAmount: 0, nextResponsibleParty: 'BUYER' }] }],
      }),
      rfq({
        rfqNumber: 'RFQ-PPO-CONFIRMED',
        quotes: [{ status: 'APPROVED', submittedAt: instant(10), updatedAt: instant(11) }],
        negotiations: [{ rounds: [{ roundNumber: 8, buyerDecision: 'ACCEPTED', createdAt: instant(12), updatedAt: instant(13) }] }],
        ppos: [{ status: 'CONFIRMED', vendorStatus: 'PENDING', createdAt: instant(14), updatedAt: instant(15) }],
        messages: [{ createdAt: instant(16) }],
      }),
      rfq({
        rfqNumber: 'RFQ-PPO-ACCEPTED',
        ppos: [{ status: 'ISSUED', vendorStatus: 'ACCEPTED_BY_VENDOR' }],
      }),
      rfq({
        rfqNumber: 'RFQ-PPO-ISSUE',
        ppos: [{ status: 'ISSUED', vendorStatus: 'ISSUE_RAISED' }],
      }),
      rfq({
        rfqNumber: 'RFQ-PPO-PENDING',
        ppos: [{ status: 'ISSUED', vendorStatus: 'PENDING' }],
      }),
      rfq({
        rfqNumber: 'RFQ-NEGOTIATION-FALLBACK',
        negotiations: [{ rounds: [] }, {}],
        messages: undefined,
      }),
    ]);
    countRfqs.mockResolvedValueOnce(12);

    const result = await GET(request());
    expect(result).toMatchObject({ ok: true, data: { total: 12 } });
    const data = (result as unknown as { data: { rfqs: any[] } }).data.rfqs;
    const byNumber = Object.fromEntries(data.map((entry) => [entry.rfqNumber, entry]));

    expect(byNumber['RFQ-INITIAL']).toMatchObject({
      rfqReceivedDate: instant(3), clientTenant: 'Enterprise Client', projectPackage: 'Project / Main Package',
      quoteStatus: 'SUBMITTED', buyerDecisionStatus: 'Awaiting Initial Quotation',
      nextAction: 'Submit quote before deadline', nextResponsibleParty: 'VENDOR',
      availableActions: ['VIEW_RFQ', 'SUBMIT_QUOTE', 'OPEN_NEGOTIATION', 'CHAT_CLARIFY'],
    });
    expect(byNumber['RFQ-ACCEPTED']).toMatchObject({
      buyerDecisionStatus: 'Quote Accepted by Buyer — PPO Awaited',
      nextAction: 'PPO issuance awaited from Procurement Team', nextResponsibleParty: 'BUYER',
      availableActions: ['VIEW_RFQ', 'REVISE_QUOTE', 'OPEN_NEGOTIATION', 'CHAT_CLARIFY', 'VIEW_DECISION'],
    });
    expect(byNumber['RFQ-REJECTED']).toMatchObject({
      buyerDecisionStatus: 'Quote Not Accepted / Negotiation Closed', nextResponsibleParty: 'CLOSED',
      nextAction: 'Negotiation Concluded / Sourcing Closed',
    });
    expect(byNumber['RFQ-FINAL-PENDING']).toMatchObject({
      buyerDecisionStatus: 'Final Acceptance Pending', nextAction: 'Awaiting Buyer Commercial Acceptance / Award',
    });
    expect(byNumber['RFQ-FINAL-OTHER']).toMatchObject({
      buyerDecisionStatus: 'Final Offer Submitted — Pending Decision', nextAction: 'Awaiting Buyer Commercial Acceptance / Award',
    });
    expect(byNumber['RFQ-COUNTER']).toMatchObject({
      buyerDecisionStatus: 'Buyer Counter-Offer Received (Round 6)',
      nextAction: 'Buyer Counter-Offer received; Submit revised offer',
    });
    expect(byNumber['RFQ-QUOTE']).toMatchObject({
      buyerDecisionStatus: 'Quote Under Buyer Evaluation', nextAction: 'Under technical & commercial evaluation',
    });
    expect(byNumber['RFQ-PPO-CONFIRMED']).toMatchObject({
      buyerDecisionStatus: 'PPO Accepted — Order Execution',
      nextAction: 'Order Execution & Delivery Fulfilment',
      availableActions: ['VIEW_RFQ', 'REVISE_QUOTE', 'OPEN_NEGOTIATION', 'CHAT_CLARIFY', 'VIEW_DECISION', 'ACCEPT_PPO'],
    });
    expect(byNumber['RFQ-PPO-ACCEPTED']).toMatchObject({
      buyerDecisionStatus: 'PPO Accepted — Order Execution', nextAction: 'Order Execution & Delivery Fulfilment',
    });
    expect(byNumber['RFQ-PPO-ISSUE']).toMatchObject({
      buyerDecisionStatus: 'PPO Issue Raised — Under Clarification',
      nextAction: 'Awaiting Buyer Review of Raised Issue', nextResponsibleParty: 'BUYER',
    });
    expect(byNumber['RFQ-PPO-PENDING']).toMatchObject({
      buyerDecisionStatus: 'PPO Issued — Pending Acceptance',
      nextAction: 'Review and Accept Issued Purchase Order (PPO)',
    });
    expect(byNumber['RFQ-PPO-PENDING'].availableActions).toContain('ACCEPT_PPO');
    expect(byNumber['RFQ-NEGOTIATION-FALLBACK'].latestRound).toBeNull();
    expect(byNumber['RFQ-ACCEPTED'].lastActivityDate).toEqual(new Date(instant(9)));
  });

  it('maps database errors to specific and generic API errors', async () => {
    findRfqs.mockRejectedValueOnce(new Error('RFQ store offline'));
    await expect(GET(request())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchRfqs, status: 500 });
    findRfqs.mockRejectedValueOnce({});
    await expect(GET(request())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchRfqs, status: 500 });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('bounds page size and returns deterministic pagination metadata for vendor search', async () => {
    countRfqs.mockResolvedValueOnce(225);
    await GET(request('http://localhost/api/vendor-portal/rfqs?page=2&pageSize=900&search=wire'));
    expect(findRfqs).toHaveBeenCalledWith(expect.objectContaining({
      skip: 100, take: 100,
      where: expect.objectContaining({
        tenantId: 'tenant-1', invitedVendors: { some: { vendorId: 'vendor-1' } },
        OR: expect.arrayContaining([{ rfqNumber: { contains: 'wire' } }]),
      }),
    }));
  });

  it('uses a stable vendor-scoped cursor for subsequent pages', async () => {
    findRfqs.mockResolvedValueOnce([rfq({ id: 'rfq-51', _count: { lines: 4 } })]);
    countRfqs.mockResolvedValueOnce(51);
    const result = await GET(request('http://localhost/api/vendor-portal/rfqs?pageSize=50&cursor=rfq-50')) as unknown as {
      data: { hasMore: boolean; nextCursor: string | null; rfqs: Array<{ lineCount: number }> };
    };
    expect(findRfqs).toHaveBeenCalledWith(expect.objectContaining({ cursor: { id: 'rfq-50' }, skip: 1, take: 50 }));
    expect(result.data).toMatchObject({ hasMore: false, nextCursor: null });
    expect(result.data.rfqs[0].lineCount).toBe(4);
  });
});
