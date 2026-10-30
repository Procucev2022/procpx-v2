import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '../src/lib/api-utils';
import { GET } from '../src/app/api/procurement/rate-cards/compare-workspace/route';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    vendor: { findUnique: jest.fn() },
    quote: { findMany: jest.fn() },
    vendorRateCard: { findMany: jest.fn() },
    ppoLine: { findMany: jest.fn() },
    standardBoqItem: { findMany: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
}));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const errorResponse = apiError as jest.Mock;
const successResponse = apiSuccess as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'buyer-1', role: 'BUYER' };
const request = (query = '?vendorId=vendor-1') => new NextRequest(`http://localhost/api/rate-cards/compare-workspace${query}`);
const vendor = { id: 'vendor-1', code: 'V-1', name: 'Cable Supplier', vendorType: 'LOCAL' };
const instant = '2026-02-01T10:00:00.000Z';

describe('rate card comparison workspace API', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    errorResponse.mockImplementation((error: string, status = 400) => ({ ok: false, error, status }));
    successResponse.mockImplementation((data: unknown, status = 200) => ({ ok: true, data, status }));
    db.vendor.findUnique.mockResolvedValue(vendor);
    db.quote.findMany.mockResolvedValue([]);
    db.vendorRateCard.findMany.mockResolvedValue([]);
    db.ppoLine.findMany.mockResolvedValue([]);
    db.standardBoqItem.findMany.mockResolvedValue([]);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('validates authentication and the required vendor before querying comparison data', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(request())).resolves.toBe(denied);
    await expect(GET(request(''))).resolves.toEqual({ ok: false, error: 'vendorId query parameter is required', status: 400 });
    db.vendor.findUnique.mockResolvedValueOnce(null);
    await expect(GET(request())).resolves.toEqual({ ok: false, error: 'Vendor not found', status: 404 });
    expect(db.quote.findMany).not.toHaveBeenCalled();
  });

  it('flattens vendor quote, rate card, PPO, and benchmark rates with category filters', async () => {
    db.quote.findMany.mockResolvedValueOnce([{
      id: 'quote-1', quoteNumber: 'Q-1', submittedAt: instant,
      rfq: { rfqNumber: 'RFQ-1', title: 'Electrical', id: 'rfq-1' },
      lines: [
        { rfqLineId: 'line-1', unitRate: 12, lineTotal: 24, rfqLine: { category: 'Electrical', description: 'Cable' } },
        { rfqLineId: 'line-2', unitRate: 4, lineTotal: 8, rfqLine: { category: null, description: 'Uncategorised' } },
        { rfqLineId: 'line-3', unitRate: 9, lineTotal: 9, rfqLine: { category: 'Lighting', description: 'Lamp' } },
      ],
    }]);
    db.vendorRateCard.findMany.mockResolvedValueOnce([
      {
        id: 'card-1', rateCardNumber: 'RC-1', version: 2, status: 'APPROVED', location: 'Warehouse',
        items: [{
          id: 'item-1', location: '', rate: 15, proposedRate: 16, benchmarkRate: 5,
          comparisonRef: JSON.stringify({ buyerOffer1: 10, vendorQuote1: 11, buyerOffer2: 12, vendorQuote2: 13, finalAgreedRate: 14, previousPpoRate: 8, referenceQty: 3, remarks: 'Checked' }),
        }, {
          id: 'item-2', location: null, rate: 20, proposedRate: 22, historicalRate: 7, minQuantity: 4,
          benchmarkRate: 0, comparisonRef: '{invalid',
        }],
      },
      { id: 'card-2', rateCardNumber: 'RC-2', version: 1, status: 'DRAFT', items: [{ id: 'item-3', rate: 8 }] },
    ]);
    db.ppoLine.findMany.mockResolvedValueOnce([
      {
        ppoId: 'ppo-1', ppoNumber: 'PPO-1', orderDate: instant, createdAt: instant, itemDescription: 'Cable',
        orderedUnitRate: 12, ppo: { ppoNumber: 'PPO-1', title: 'Cable order', vendorId: 'vendor-1', vendor: { name: 'Cable Supplier' } },
      },
      { ppoId: 'ppo-2', orderDate: null, createdAt: instant, itemDescription: 'Other', ppo: null },
      {
        ppoId: 'ppo-3', createdAt: instant,
        ppo: { ppoNumber: '', title: null, vendorId: 'vendor-2', vendor: { name: '' } },
      },
    ]);
    db.standardBoqItem.findMany.mockResolvedValueOnce([{
      id: 'std-1', itemCode: 'EL-1', category: 'Electrical', subcategory: 'Cable',
      standardDescription: 'Copper cable', detailedSpecification: '4 core', uom: 'm', benchmarkRate: 17,
      brandMake: 'Generic', updatedAt: instant,
    }]);

    const result = await GET(request('?vendorId=vendor-1&category=Electrical&subcategory=Cable'));
    expect(result).toMatchObject({ ok: true, data: { vendor, vendorPastQuotes: expect.any(Array), existingRateCards: expect.any(Array) } });
    expect(db.quote.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', vendorId: 'vendor-1', status: { in: ['SUBMITTED', 'ACCEPTED', 'UNDER_EVALUATION', 'REVISED'] } },
      take: 20,
    }));
    expect(db.vendorRateCard.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1', vendorId: 'vendor-1', category: 'Electrical' } }));
    expect(db.ppoLine.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1', category: 'Electrical' } }));
    expect(db.standardBoqItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', isActive: true, category: 'Electrical', subcategory: 'Cable' },
    }));

    const data = (result as unknown as { data: Record<string, any[]> }).data;
    expect(data.vendorPastQuotes).toHaveLength(2);
    expect(data.vendorPastQuotes[0]).toMatchObject({
      quoteNumber: 'Q-1', rfqNumber: 'RFQ-1', description: 'Cable', source: 'RFQ Quote (RFQ-1)',
    });
    expect(data.existingRateCards).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId: 'item-1', location: 'Warehouse', rate: 15, source: 'Rate Card (RC-1 2)' }),
      expect.objectContaining({ itemId: 'item-2', location: 'Warehouse', rate: 20, source: 'Rate Card (RC-1 2)' }),
      expect.objectContaining({ itemId: 'item-3', source: 'Rate Card (RC-2 1)' }),
    ]));
    expect(data.historicalPpoRates).toEqual(expect.arrayContaining([
      expect.objectContaining({ ppoNumber: 'PPO-1', vendorName: 'Cable Supplier', isSameVendor: true, orderDate: instant }),
      expect.objectContaining({ ppoNumber: 'PPO', ppoTitle: '', vendorName: 'Vendor', isSameVendor: false, orderDate: instant }),
    ]));
    expect(data.benchmarkRates[0]).toMatchObject({
      standardBoqItemId: 'std-1', description: 'Copper cable', benchmarkRate: 17,
      source: 'proCPX Standard BOQ Library Benchmark', sourceDate: instant,
    });
  });

  it('omits optional category and subcategory filters when they are absent', async () => {
    await expect(GET(request())).resolves.toMatchObject({ ok: true, data: { vendor } });
    expect(db.vendorRateCard.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1', vendorId: 'vendor-1' } }));
    expect(db.ppoLine.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1' } }));
    expect(db.standardBoqItem.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1', isActive: true } }));
  });

  it('maps query failures to specific or generic server errors', async () => {
    db.quote.findMany.mockRejectedValueOnce(new Error('quote history unavailable'));
    await expect(GET(request())).resolves.toEqual({ ok: false, error: 'quote history unavailable', status: 500 });
    db.quote.findMany.mockRejectedValueOnce({});
    await expect(GET(request())).resolves.toEqual({ ok: false, error: 'Failed to fetch comparison workspace data', status: 500 });
    expect(consoleError).toHaveBeenCalledTimes(2);
  });
});
