import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/procurement/rfqs/[id]/compare/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { AUDIT_LOG_INSERT_AFTER_CHANGE_SQL } from '../src/lib/d1-batch.constants';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    rfq: { findFirst: jest.fn(), update: jest.fn() },
    ppoLine: { findMany: jest.fn() },
    vendorRateCard: { count: jest.fn() },
    $queryRaw: jest.fn(),
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));
jest.mock('../src/lib/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));

const db = prisma as unknown as {
  rfq: Record<string, jest.Mock>;
  ppoLine: Record<string, jest.Mock>;
  vendorRateCard: Record<string, jest.Mock>;
  $queryRaw: jest.Mock;
};
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
const writeBatch = writeD1BatchAtomically as jest.Mock;
const structuredLog = writeStructuredLog as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'buyer-1' };
const params = (id = 'rfq-1') => ({ params: Promise.resolve({ id }) });
const request = () => new NextRequest('http://localhost/api/procurement/rfqs/rfq-1/compare');

const fullRfq = (overrides: Record<string, any> = {}) => {
  const sourceOne = { id: 'boq-line-1', itemCode: 'CAB-1', standardDescription: 'Copper cable', originalDescription: 'Copper cable 4 core',
    specification: '4 core', category: { name: 'Electrical' }, subcategory: { name: 'Wire' }, uom: { code: 'M' },
    costSource: 'AI engine', costDate: new Date('2026-09-01T00:00:00Z'), aiUnitCost: 100, location: 'North',
    drawingReference: 'D-1', brand: 'Acme', model: 'C-4', material: 'Copper', grade: 'A', remarks: 'Shielded' };
  const sourceTwo = { id: 'boq-line-2', itemCode: 'PANEL-1', standardDescription: 'Panel', originalDescription: 'Distribution panel',
    category: { name: 'Power' }, subcategory: null, uom: { code: 'EA' } };
  const quote = (id: string, vendorId: string, amount: number, version: number, lines: any[], vendorOverrides: Record<string, any> = {}) => ({
    id, vendorId, quoteNumber: `QT-${vendorId}-${version}`, quoteVersion: version, totalQuoteAmount: amount,
    submittedAt: new Date('2026-10-01T00:00:00Z'), status: 'SUBMITTED', commercialTerms: 'Net 30', paymentTermsOffered: '30 days',
    deliveryLeadTimeDays: 15, vendor: { id: vendorId, name: `Vendor ${vendorId}`, code: vendorId.toUpperCase(), ...vendorOverrides }, lines,
  });
  const line = (id: string, unitRate: number, lineTotal: number, extra: Record<string, any> = {}) => ({ id: `${id}-quote-line`, rfqLineId: id,
    unitRate, lineTotal, discountPercent: 5, taxPercent: 18, ...extra });
  return {
    id: 'rfq-1', tenantId: 'tenant-1', rfqNumber: 'RFQ-1', title: 'Electrical package', status: 'RELEASED',
    projectId: 'project-1', project: { id: 'project-1', name: 'North Plant' },
    boqRevision: { id: 'rev-1', revisionCode: 'R2', lines: [sourceOne, sourceTwo] },
    pr: { id: 'pr-1', prNumber: 'PR-1', title: 'Electrical works', status: 'PR_APPROVED', costCentre: { code: 'CC-1' } },
    submissionDeadline: new Date('2026-11-01'), commercialValidityDays: 60, paymentTerms: 'Net 30', deliveryRequirement: 'At site',
    estimatedBenchmarkValue: 9000,
    lines: [
      { id: 'line-1', lineNumber: 'RFQ-L1', description: 'Copper Cable', specification: 'Copper', quantity: 10, uom: 'M',
        boqLine: sourceOne, boqLineId: 'boq-line-1', benchmarkRate: 90 },
      { id: 'line-2', lineNumber: '2', description: 'Panel', specification: '', quantity: 2, uom: 'EA',
        boqLine: null, prLine: { estimatedRate: 80, boqLine: sourceTwo }, benchmarkRate: 0, category: 'Electrical' },
    ],
    invitedVendors: [],
    quotes: [
      quote('v1-old', 'v1', 2000, 1, [line('line-1', 120, 1200)]),
      quote('v1-new', 'v1', 1200, 2, [line('line-1', 100, 1000), line('line-2', 50, 100)], { vendorType: null, qualificationStatus: null }),
      quote('v2', 'v2', 2000, 1, [line('line-1', 200, 2000, { discountPercent: 0, taxPercent: 0 })], { vendorType: 'STRATEGIC', qualificationStatus: 'QUALIFIED' }),
      quote('v3', 'v3', 1200, 1, [line('line-1', 100, 1000), line('line-2', 50, 100)]),
      quote('v4', 'v4', 1500, 1, [line('line-1', 150, 1500), line('line-2', 75, 150)]),
    ],
    negotiations: [{ id: 'neg-1', status: 'ACTIVE', currentRound: 2 }],
    awards: [{ id: 'award-1', status: 'PENDING' }],
    ...overrides,
  };
};

const latestNegotiationRoundRows = () => [
  { vendorId: 'v1', roundNumber: 2, status: 'REVISED_SUBMITTED', counterOfferAmount: 800, revisedQuoteAmount: 1100,
    nextResponsibleParty: 'BUYER', buyerDecision: null,
    lineItemsJson: JSON.stringify([{ rfqLineId: 'line-1', counterRate: 95, revisedRate: 98 }]) },
  { vendorId: 'v2', roundNumber: 1, status: 'ROUND_ACTIVE', counterOfferAmount: 600, revisedQuoteAmount: null, lineItemsJson: null,
    nextResponsibleParty: null, buyerDecision: null },
  { vendorId: 'v3', roundNumber: 1, status: 'FINAL_OFFER_SUBMITTED', counterOfferAmount: null, revisedQuoteAmount: 1800,
    nextResponsibleParty: 'BUYER', buyerDecision: null, lineItemsJson: '{bad json' },
  { vendorId: 'v4', roundNumber: 1, status: 'FINAL_OFFER_SUBMITTED', counterOfferAmount: 700, revisedQuoteAmount: 1300,
    nextResponsibleParty: 'BUYER', buyerDecision: null,
    lineItemsJson: JSON.stringify([{ id: 'line-1', counterRate: 120, revisedRate: 110 }, { id: 'line-2' }]) },
];

const latestQuoteLineRows = () => {
  const latestByVendor = new Map<string, ReturnType<typeof fullRfq>['quotes'][number]>();
  for (const quote of fullRfq().quotes) {
    const latest = latestByVendor.get(quote.vendorId);
    if (!latest || quote.quoteVersion > latest.quoteVersion) latestByVendor.set(quote.vendorId, quote);
  }
  return [...latestByVendor.values()].flatMap((quote) =>
    quote.lines.map((line) => ({ quoteId: quote.id, ...line })));
};

describe('RFQ quote comparison API', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.rfq.findFirst.mockReset().mockResolvedValue(fullRfq());
    db.rfq.update.mockReset().mockResolvedValue({});
    db.ppoLine.findMany.mockReset().mockResolvedValue([
      { itemDescription: ' copper cable ', orderedUnitRate: 90, orderedAmount: 900, uom: 'M', orderDate: new Date('2026-08-01'), ppo: null },
      { itemDescription: 'Panel', orderedUnitRate: 70, orderedAmount: 140, uom: 'EA', orderDate: new Date('2026-07-01'),
        ppo: { ppoNumber: 'PPO-1', vendor: { name: 'Legacy Vendor' } } },
    ]);
    db.vendorRateCard.count.mockReset().mockResolvedValue(1);
    db.$queryRaw.mockReset().mockImplementation((query: { sql: string }) => query.sql.includes('latest_quotes')
      ? latestQuoteLineRows()
      : query.sql.includes('latest_negotiation_rounds')
        ? latestNegotiationRoundRows()
        : [
      { description: ' copper cable ', rate: 85, rateCardNumber: 'RC-1', version: 3, status: 'APPROVED',
        validFrom: new Date('2026-01-01'), validTo: new Date('2026-12-31'), vendorId: 'v1', vendorName: 'Vendor v1' },
      { description: 'Panel', rate: 75, rateCardNumber: 'RC-1', version: 3, status: 'APPROVED',
        validFrom: new Date('2026-01-01'), validTo: new Date('2026-12-31'), vendorId: 'v1', vendorName: 'Vendor v1' },
      ]);
    audit.mockReset().mockResolvedValue(undefined);
    writeBatch.mockReset().mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('authorizes comparisons, rejects missing RFQs, and reports lookup failures', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(request(), params())).resolves.toBe(denied);

    db.rfq.findFirst.mockResolvedValueOnce(null);
    await expect(GET(request(), params('missing'))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rFQNotFoundOrAccessDenied, status: 404 });
    db.rfq.findFirst.mockRejectedValueOnce(new Error('comparison lookup failed'));
    await expect(GET(request(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToCompareQuotes, status: 500 });
    db.rfq.findFirst.mockRejectedValueOnce({});
    await expect(GET(request(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToCompareQuotes, status: 500 });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('builds quote history, benchmark comparisons, negotiation rates, and tied package rankings', async () => {
    const result = await GET(request(), params());
    expect(structuredLog).toHaveBeenCalledWith('warn', 'procurement.negotiation_line_items_invalid', expect.objectContaining({
      rfqId: 'rfq-1', invalidRoundCount: 1,
    }));
    expect(db.vendorRateCard.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-1', status: 'APPROVED' }) }));
    expect(db.$queryRaw).toHaveBeenCalledTimes(3);
    const rfqQuery = db.rfq.findFirst.mock.calls[0][0];
    expect(rfqQuery.include.quotes.select).not.toHaveProperty('lines');
    expect(rfqQuery.include.negotiations.select).not.toHaveProperty('rounds');
    const quoteLineQuery = db.$queryRaw.mock.calls.find(([query]) => query.sql.includes('latest_quotes'))?.[0];
    expect(quoteLineQuery).toBeDefined();
    if (!quoteLineQuery) throw new Error('Latest quote line query was not executed');
    expect(quoteLineQuery.sql).toContain('MAX(quote."quoteVersion") AS "latestVersion"');
    expect(quoteLineQuery.sql).toContain('latest."quoteVersion" = summary."latestVersion"');
    expect(quoteLineQuery.values).toEqual(expect.arrayContaining(['tenant-1', 'rfq-1']));
    expect(db.$queryRaw.mock.calls[0][0].sql).toContain('latest_quotes');
    const negotiationRoundQuery = db.$queryRaw.mock.calls.find(([query]) => query.sql.includes('latest_negotiation_rounds'))?.[0];
    expect(negotiationRoundQuery).toBeDefined();
    if (!negotiationRoundQuery) throw new Error('Latest negotiation round query was not executed');
    expect(negotiationRoundQuery.sql).toContain('MAX(rounds."roundNumber") AS "latestRoundNumber"');
    expect(negotiationRoundQuery.sql).toContain('negotiation."rfqId" = ?');
    expect(negotiationRoundQuery.values).toEqual(expect.arrayContaining(['tenant-1', 'rfq-1']));
    expect(result).toMatchObject({ ok: true, data: {
      rfq: { id: 'rfq-1', status: 'COMPARISON', project: { name: 'North Plant' } },
      vendors: [
        { vendorId: 'v1', vendorType: 'CLIENT_VENDOR', qualificationStatus: 'NOT_EVALUATED', quoteId: 'v1-new', quoteVersion: 2,
          completenessPercent: 100, revisions: [{ version: 1 }, { version: 2 }], rank: 1, rankLabel: 'L1' },
        { vendorId: 'v3', rank: 1, rankLabel: 'L1' },
        { vendorId: 'v4', rank: 3, rankLabel: 'L3' },
        { vendorId: 'v2', completenessPercent: 50, missingLineCount: 1, isRankable: false },
      ],
      lines: [
        { id: 'line-1', itemCode: 'CAB-1', boqDescription: 'Copper cable 4 core', aiUnitCost: 100, aiTotalCost: 1000,
          historicalPpoRate: 90, historicalPpoNumber: 'PPO', historicalPpoVendor: 'Vendor', rateCardRate: 85,
          vendorQuotes: { v1: { rate: 100, amount: 1000, vendorRateCardRate: 85, ourOfferRate: 95, finalNegotiatedRate: 98 },
            v2: { ourOfferRate: 60, discount: 0, tax: 18 }, v3: { finalNegotiatedRate: 150 }, v4: { ourOfferRate: 120, finalNegotiatedRate: 110 } },
          lowestCompliantVendorId: 'v1', lowestRate: 100, commercialStatus: 'FAVORABLE' },
        { id: 'line-2', itemCode: 'PANEL-1', boqDescription: 'Distribution panel', aiUnitCost: 80,
          historicalPpoRate: 70, rateCardRate: 75, category: 'Power', vendorQuotes: expect.any(Object) },
      ],
      activeNegotiation: { id: 'neg-1' }, awards: [{ id: 'award-1' }],
      summary: { packageTotal: 1160, benchmarkTotal: 1160, lowestQuoteTotal: 1200, lowestVendor: 'Vendor v1',
        savings: -40, isFavorable: false, hasApprovedRateCards: true, approvedRateCardsCount: 1 },
    } });
    expect(db.rfq.update).not.toHaveBeenCalled();
    expect(writeBatch).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ sql: expect.stringContaining('UPDATE "rfqs"'), values: expect.arrayContaining(['rfq-1', 'tenant-1', 'RELEASED']) }),
      expect.objectContaining({ sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL, values: expect.arrayContaining(['QUOTE_COMPARED', 'rfq-1']) }),
    ]));
    expect(audit).not.toHaveBeenCalled();
  });

  it('keeps quote history when the latest quote has no lines and captures latest-line query failures', async () => {
    const rfqWithoutLatestLines = fullRfq({
      status: 'COMPARISON',
      quotes: [fullRfq().quotes[1]],
      negotiations: [],
      awards: [],
    });
    db.rfq.findFirst.mockResolvedValueOnce(rfqWithoutLatestLines);
    db.$queryRaw.mockImplementationOnce(() => []);

    const noLinesResult = await GET(request(), params());
    expect(noLinesResult).toMatchObject({ ok: true });
    const noLinesData = (noLinesResult as unknown as {
      data: {
        vendors: Array<Record<string, unknown>>;
        lines: Array<{ vendorQuotes: Record<string, { rate: number; quoted: boolean }> }>;
      };
    }).data;
    expect(noLinesData.vendors).toHaveLength(1);
    expect(noLinesData.vendors[0]).toMatchObject({ vendorId: 'v1', completenessPercent: 0, missingLineCount: 2, isComplete: false });
    expect(noLinesData.lines).toHaveLength(2);
    expect(noLinesData.lines[0].vendorQuotes.v1).toMatchObject({ rate: 0, quoted: false });

    db.rfq.findFirst.mockResolvedValueOnce(fullRfq({ status: 'COMPARISON' }));
    db.$queryRaw.mockRejectedValueOnce(new Error('Latest quote lines unavailable'));
    await expect(GET(request(), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToCompareQuotes, status: 500,
    });

    db.rfq.findFirst.mockResolvedValueOnce(fullRfq());
    db.$queryRaw.mockImplementationOnce(() => latestQuoteLineRows())
      .mockRejectedValueOnce(new Error('Latest negotiation rounds unavailable'));
    await expect(GET(request(), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToCompareQuotes, status: 500,
    });
  });

  it('uses empty comparison fallbacks, skips closed RFQ transitions, and handles failures in dependent reads', async () => {
    db.rfq.findFirst.mockResolvedValueOnce(fullRfq({
      status: 'COMPARISON', quotes: [], lines: [], negotiations: [], awards: [], boqRevision: null, estimatedBenchmarkValue: 500,
    }));
    await expect(GET(request(), params())).resolves.toMatchObject({ ok: true, data: {
      vendors: [], lines: [], activeNegotiation: null,
      summary: { packageTotal: 500, benchmarkTotal: 500, lowestQuoteTotal: 0, lowestVendor: '—', savings: 500,
        isFavorable: true, hasApprovedRateCards: true },
    } });
    expect(db.rfq.update).not.toHaveBeenCalled();

    db.rfq.findFirst.mockResolvedValueOnce(fullRfq({
      status: 'COMPARISON', estimatedBenchmarkValue: 0, quotes: [], negotiations: [{ id: 'closed-neg', status: 'CONCLUDED', currentRound: 1 }],
      boqRevision: { lines: [
        { id: 'revision-line', lineNumber: '3', itemCode: 'REV-3', standardDescription: 'Revision source', originalDescription: 'Other wording' },
        { id: 'standard-line', lineNumber: '4', standardDescription: 'Standard match', originalDescription: 'Standard source wording' },
        { id: 'original-line', lineNumber: '5', standardDescription: 'Other standard', originalDescription: 'Original match' },
      ] },
      lines: [
        { id: 'line-revision', lineNumber: 'L-3', description: 'Revision item', quantity: 1, uom: 'EA' },
        { id: 'line-standard', lineNumber: 'L-9', description: 'Standard match', quantity: 1, uom: 'EA' },
        { id: 'line-original', lineNumber: 'L-10', description: 'Original match', quantity: 1, uom: 'EA' },
        { id: 'line-none', lineNumber: '99', description: '', itemCode: 'FALLBACK-99', quantity: 2, uom: 'EA' },
      ],
    }));
    await expect(GET(request(), params())).resolves.toMatchObject({ ok: true, data: {
      activeNegotiation: { id: 'closed-neg' },
      lines: [
        { id: 'line-revision', itemCode: 'REV-3', itemDescription: 'Revision item', aiUnitCost: null,
          aiCostStatus: 'NOT_AVAILABLE', lowestCompliantVendorName: '—', lowestRate: 0, lowestLineTotal: 0,
          category: 'General', specification: null },
        { id: 'line-standard', itemCode: null, boqDescription: 'Standard source wording' },
        { id: 'line-original', itemCode: null, boqDescription: null },
        { id: 'line-none', itemCode: 'FALLBACK-99', itemDescription: 'Line item', boqDescription: null,
          category: 'General', historicalPpoRate: null, rateCardRate: null },
      ],
      summary: { packageTotal: 0, benchmarkTotal: 0, lowestQuoteTotal: 0, lowestVendor: '—', savings: 0,
        savingsPercent: 0, isFavorable: true },
    } });

    db.ppoLine.findMany.mockRejectedValueOnce(new Error('history unavailable'));
    await expect(GET(request(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToCompareQuotes, status: 500 });
    db.rfq.findFirst.mockResolvedValueOnce(fullRfq({ status: 'COMPARISON' }));
    audit.mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(GET(request(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToCompareQuotes, status: 500 });
    expect(consoleError).not.toHaveBeenCalled();
  });
});
