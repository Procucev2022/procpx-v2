import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/procurement/rate-cards/match/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    procurementRequest: { findFirst: jest.fn() },
    rfq: { findFirst: jest.fn() },
    vendorRateCard: { findMany: jest.fn() },
    ppoLine: { findMany: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1' };
const request = (query = '') => new NextRequest(`http://localhost/api/procurement/rate-cards/match${query}`);
const today = new Date();
const yesterday = new Date(today.getTime() - 86_400_000);
const tomorrow = new Date(today.getTime() + 86_400_000);

function card(overrides: Record<string, any> = {}) {
  return {
    id: 'card-1', rateCardNumber: 'RC-001', title: 'Approved electrical rates', category: 'Electrical',
    status: 'APPROVED', validFrom: yesterday, validTo: tomorrow,
    vendor: { id: 'vendor-1', name: 'Acme', complianceStatus: 'COMPLIANT' },
    items: [
      { description: 'Copper Cable', rate: 75, uom: 'MTR' },
      { description: 'Switch', rate: 25, uom: 'EA' },
    ],
    ...overrides,
  };
}

describe('rate card match API', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.procurementRequest.findFirst.mockResolvedValue(null);
    db.rfq.findFirst.mockResolvedValue(null);
    db.vendorRateCard.findMany.mockResolvedValue([]);
    db.ppoLine.findMany.mockResolvedValue([]);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('requires authorization and a PR or RFQ, and reports missing reference records', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(request())).resolves.toBe(denied);
    await expect(GET(request())).resolves.toEqual({ ok: false, error: 'Either prId or rfqId is required to match rate cards', status: 400 });
    await expect(GET(request('?prId=pr-missing'))).resolves.toEqual({ ok: false, error: 'Procurement Request not found', status: 404 });
    await expect(GET(request('?rfqId=rfq-missing'))).resolves.toEqual({ ok: false, error: 'RFQ not found', status: 404 });
  });

  it('returns an empty match result without querying rate cards when the PR has no lines', async () => {
    db.procurementRequest.findFirst.mockResolvedValueOnce({
      id: 'pr-1', prNumber: 'PR-001', title: 'Empty PR', status: 'PR_DRAFT', project: null, costCentre: null, lines: [],
    });
    await expect(GET(request('?prId=pr-1'))).resolves.toEqual({ ok: true, status: 200, data: {
      reference: { type: 'PR', id: 'pr-1', number: 'PR-001', title: 'Empty PR', status: 'PR_DRAFT', project: null, costCentre: null },
      matchedRateCards: [], lines: [], message: 'No line items available to match against rate cards.',
    } });
    expect(db.vendorRateCard.findMany).not.toHaveBeenCalled();
  });

  it('matches PR lines, compares historical PPO rates, and ranks direct PPO eligible cards first', async () => {
    db.procurementRequest.findFirst.mockResolvedValueOnce({
      id: 'pr-1', prNumber: 'PR-001', title: 'Electrical fitout', status: 'PR_RELEASED_TO_PROCUREMENT',
      project: { name: 'West Campus' }, costCentre: { name: 'Electrical' },
      lines: [
        {
          id: 'line-1', lineNumber: '1', itemDescription: 'Copper Cable 2 Core', specification: null,
          category: 'Electrical', subcategory: null, uom: 'MTR', quantity: 2, estimatedRate: 80,
          boqLine: { aiUnitCost: 100, specification: '2 core XLPE' },
        },
        {
          id: 'line-2', lineNumber: '2', itemDescription: 'Switch', specification: null,
          category: null, subcategory: null, uom: 'EA', quantity: 0, estimatedRate: 0,
          boqLine: { aiUnitCost: 0, specification: null },
        },
      ],
    });
    db.vendorRateCard.findMany.mockResolvedValueOnce([
      card(),
      card({ id: 'card-2', rateCardNumber: 'RC-002', title: 'Pending card', status: 'PENDING', items: [
        { description: 'Copper Cable 2 Core', rate: 90, uom: 'MTR' }, { description: 'Switch', rate: 35, uom: 'EA' },
      ] }),
      card({ id: 'card-3', rateCardNumber: 'RC-003', title: 'Partial card', status: 'APPROVED',
        validFrom: new Date(today.getTime() + 86_400_000), validTo: tomorrow,
        vendor: { id: 'vendor-3', name: 'Vendor 3', complianceStatus: 'PENDING' },
        items: [{ description: 'Copper Cable', rate: 110, uom: 'ROLL' }],
      }),
      card({ id: 'card-4', rateCardNumber: 'RC-004', title: 'Other partial card', status: 'APPROVED',
        vendor: { id: 'vendor-4', name: 'Vendor 4', complianceStatus: 'COMPLIANT' },
        items: [{ description: 'Copper Cable', rate: 80, uom: 'MTR' }],
      }),
    ]);
    db.ppoLine.findMany.mockResolvedValueOnce([
      { itemDescription: ' copper cable 2 core ', orderedUnitRate: 95, orderedAmount: 190, uom: 'MTR',
        orderDate: new Date('2025-01-02T00:00:00Z'), ppo: { ppoNumber: 'PPO-009', vendor: { name: 'Historic Co' } } },
      { itemDescription: 'COPPER CABLE 2 CORE', orderedUnitRate: 99, orderedAmount: 198, uom: 'MTR',
        orderDate: new Date('2025-02-02T00:00:00Z'), ppo: { ppoNumber: 'PPO-010', vendor: { name: 'Later Co' } } },
      { itemDescription: 'Switch', orderedUnitRate: 22, orderedAmount: 22, uom: 'EA',
        orderDate: new Date('2025-03-02T00:00:00Z'), ppo: { ppoNumber: 'PPO-011', vendor: { name: 'Switch Co' } } },
    ]);

    const result = await GET(request('?prId=pr-1'));
    expect(result).toMatchObject({ ok: true, data: {
      reference: { type: 'PR', number: 'PR-001' }, baselineBenchmarkTotal: 300,
      lines: [
        { id: 'line-1', specification: '2 core XLPE', quantity: 2, aiUnitCost: 100, aiTotalCost: 200 },
        { id: 'line-2', specification: null, category: null, quantity: 1, aiUnitCost: 100, aiTotalCost: 100 },
      ],
      eligibleCount: 1,
    } });
    const cards = (result as any).data.matchedRateCards;
    expect(cards[0].rateCardId).toBe('card-1');
    expect(cards.find((item: any) => item.rateCardId === 'card-2').blockReasons).toContain("Rate card is in status 'PENDING' (Must be APPROVED)");
    expect(cards.find((item: any) => item.rateCardId === 'card-3').blockReasons).toContain('Line 1: UOM mismatch (MTR required vs ROLL on rate card)');
    expect(cards.find((item: any) => item.rateCardId === 'card-3').blockReasons).toContain('Partial item coverage: only 1/2 items covered (50%)');
    expect(db.procurementRequest.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'pr-1', tenantId: 'tenant-1' } }));
    expect(db.ppoLine.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-1' }) }));
  });

  it('matches RFQ lines using category, quantity, and benchmark fallbacks', async () => {
    db.rfq.findFirst.mockResolvedValueOnce({
      id: 'rfq-1', rfqNumber: 'RFQ-001', title: 'Furniture', status: 'OPEN', project: { name: 'East Office' },
      lines: [{
        id: 'rfq-line-1', lineNumber: '1', description: 'Office Chair', specification: 'Fabric', category: '', subcategory: '',
        uom: 'EA', quantity: null, benchmarkRate: 0, boqLine: { aiUnitCost: 0, specification: 'Mesh chair' },
      }],
    });
    db.vendorRateCard.findMany.mockResolvedValueOnce([card({
      id: 'rfq-card', rateCardNumber: 'RC-RFQ', items: [{ description: 'Office Chair High Back', rate: 4500, uom: 'EA' }],
    })]);
    const result = await GET(request('?rfqId=rfq-1'));
    expect(result).toMatchObject({ ok: true, status: 200, data: {
      reference: { type: 'RFQ', number: 'RFQ-001' }, baselineBenchmarkTotal: 100,
      lines: [{ id: 'rfq-line-1', specification: 'Fabric', category: 'General', quantity: 1, aiUnitCost: 100, aiTotalCost: 100 }],
      matchedRateCards: [{ rateCardId: 'rfq-card', directPpoEligible: true, lines: [{ isMatch: true, uomMismatch: false }] }],
    } });
  });

  it('handles legacy RFQ lines with non-positive quantities without dividing negative totals', async () => {
    db.rfq.findFirst.mockResolvedValueOnce({
      id: 'rfq-negative', rfqNumber: 'RFQ-NEG', title: 'Legacy quantity', status: 'OPEN', project: null,
      lines: [{
        id: 'negative-line', lineNumber: '1', description: 'Office Chair', specification: null, category: null,
        subcategory: null, uom: 'EA', quantity: -1, benchmarkRate: 100, boqLine: null,
      }],
    });
    db.vendorRateCard.findMany.mockResolvedValueOnce([card({
      id: 'negative-card', items: [{ description: 'Office Chair', rate: 80, uom: 'EA' }],
    })]);

    await expect(GET(request('?rfqId=rfq-negative'))).resolves.toMatchObject({ ok: true, data: {
      baselineBenchmarkTotal: -100,
      lines: [{ quantity: -1, aiTotalCost: -100, specification: null }],
      matchedRateCards: [{ rateCardId: 'negative-card', directPpoEligible: true, savingsPercent: 0,
        lines: [{ variancePercent: 0, historicalPpoRate: null, historicalPpoNumber: null, historicalPpoDate: null }] }],
    } });
  });

  it('returns clear failures when matching queries throw', async () => {
    db.procurementRequest.findFirst.mockRejectedValueOnce(new Error('matching query failed'));
    await expect(GET(request('?prId=pr-1'))).resolves.toEqual({ ok: false, error: 'matching query failed', status: 500 });
    db.rfq.findFirst.mockRejectedValueOnce({});
    await expect(GET(request('?rfqId=rfq-1'))).resolves.toEqual({ ok: false, error: 'Failed to match rate cards', status: 500 });
    expect(consoleError).toHaveBeenCalledTimes(2);
  });
});
