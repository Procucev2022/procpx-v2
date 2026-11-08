import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/procurement/rfqs/[id]/compare/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { AUDIT_LOG_INSERT_AFTER_CHANGE_SQL } from '../src/lib/d1-batch.constants';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { RFQ_COMPARE_FALLBACK_BOQ_CANDIDATE_LIMIT, RFQ_COMPARE_LINE_PAGE_SIZE } from '../src/app/api/procurement/rfqs/[id]/compare/route.constants';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    rfq: { findFirst: jest.fn(), update: jest.fn() },
    rfqLine: { count: jest.fn(), findMany: jest.fn() },
    boqLine: { findMany: jest.fn() },
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
  rfqLine: Record<string, jest.Mock>;
  boqLine: Record<string, jest.Mock>;
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
const request = (query = '') => new NextRequest(`http://localhost/api/procurement/rfqs/rfq-1/compare${query}`);

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
    lineItemsJson: JSON.stringify([{ rfqLineId: 'line-1', counterRate: 95, revisedRate: 98 }]),
    totalRoundCount: 5, activeBuyerOfferCount: 2, submittedRoundId: 'v1-submitted', submittedRoundNumber: 2,
    submittedRevisedQuoteAmount: 1100, submittedStatus: 'REVISED_SUBMITTED', submittedNextResponsibleParty: 'BUYER',
    submittedBuyerDecision: null, pendingRoundId: null, pendingRoundNumber: null, pendingCounterOfferAmount: null,
    pendingRevisedQuoteAmount: null, pendingStatus: null, pendingNextResponsibleParty: null, pendingBuyerDecision: null },
  { vendorId: 'v2', roundNumber: 1, status: 'ROUND_ACTIVE', counterOfferAmount: 600, revisedQuoteAmount: null, lineItemsJson: null,
    nextResponsibleParty: null, buyerDecision: null, totalRoundCount: 1, activeBuyerOfferCount: 1,
    submittedRoundId: null, submittedRoundNumber: null, submittedRevisedQuoteAmount: null, submittedStatus: null,
    submittedNextResponsibleParty: null, submittedBuyerDecision: null, pendingRoundId: 'v2-pending', pendingRoundNumber: 1,
    pendingCounterOfferAmount: 600, pendingRevisedQuoteAmount: null, pendingStatus: 'ROUND_ACTIVE',
    pendingNextResponsibleParty: null, pendingBuyerDecision: null },
  { vendorId: 'v3', roundNumber: 1, status: 'FINAL_OFFER_SUBMITTED', counterOfferAmount: null, revisedQuoteAmount: 1800,
    nextResponsibleParty: 'BUYER', buyerDecision: null, lineItemsJson: '{bad json', totalRoundCount: 1, activeBuyerOfferCount: 0,
    submittedRoundId: 'v3-submitted', submittedRoundNumber: 1, submittedRevisedQuoteAmount: 1800,
    submittedStatus: 'FINAL_OFFER_SUBMITTED', submittedNextResponsibleParty: 'BUYER', submittedBuyerDecision: null,
    pendingRoundId: null, pendingRoundNumber: null, pendingCounterOfferAmount: null, pendingRevisedQuoteAmount: null,
    pendingStatus: null, pendingNextResponsibleParty: null, pendingBuyerDecision: null },
  { vendorId: 'v4', roundNumber: 1, status: 'FINAL_OFFER_SUBMITTED', counterOfferAmount: 700, revisedQuoteAmount: 1300,
    nextResponsibleParty: 'BUYER', buyerDecision: null,
    lineItemsJson: JSON.stringify([{ id: 'line-1', counterRate: 120, revisedRate: 110 }, { id: 'line-2' }]),
    totalRoundCount: 1, activeBuyerOfferCount: 1, submittedRoundId: 'v4-submitted', submittedRoundNumber: 1,
    submittedRevisedQuoteAmount: 1300, submittedStatus: 'FINAL_OFFER_SUBMITTED', submittedNextResponsibleParty: 'BUYER',
    submittedBuyerDecision: null, pendingRoundId: null, pendingRoundNumber: null, pendingCounterOfferAmount: null,
    pendingRevisedQuoteAmount: null, pendingStatus: null, pendingNextResponsibleParty: null, pendingBuyerDecision: null },
];

const latestCompareQuoteRows = (rfq = fullRfq(), visibleLineIds = new Set(rfq.lines.map((line) => line.id))) => {
  const latestByVendor = new Map<string, typeof rfq.quotes[number]>();
  const versionCounts = new Map<string, number>();
  for (const quote of rfq.quotes) {
    versionCounts.set(quote.vendorId, (versionCounts.get(quote.vendorId) || 0) + 1);
    const latest = latestByVendor.get(quote.vendorId);
    if (!latest || quote.quoteVersion > latest.quoteVersion) latestByVendor.set(quote.vendorId, quote);
  }
  return [...latestByVendor.values()].flatMap((quote) => {
    const vendor = quote.vendor as typeof quote.vendor & {
      vendorType?: string | null;
      qualificationStatus?: string | null;
      complianceStatus?: string | null;
      performanceScore?: number | null;
    };
    const header = {
      quoteId: quote.id, vendorId: quote.vendorId, quoteNumber: quote.quoteNumber, quoteVersion: quote.quoteVersion,
      versionCount: versionCounts.get(quote.vendorId), totalQuoteAmount: quote.totalQuoteAmount,
      quotedCount: new Set(quote.lines.filter((line) => line.unitRate > 0).map((line) => line.rfqLineId)).size,
      submittedAt: quote.submittedAt, status: quote.status, commercialTerms: quote.commercialTerms,
      paymentTermsOffered: quote.paymentTermsOffered, deliveryLeadTimeDays: quote.deliveryLeadTimeDays,
      vendorName: vendor.name, vendorCode: vendor.code, vendorType: vendor.vendorType ?? null,
      qualificationStatus: vendor.qualificationStatus ?? null, complianceStatus: vendor.complianceStatus ?? null,
      performanceScore: vendor.performanceScore ?? null,
    };
    const visibleQuoteLines = quote.lines.filter((line) => visibleLineIds.has(line.rfqLineId));
    return visibleQuoteLines.length > 0
      ? visibleQuoteLines.map((line) => ({ ...header, quoteLineId: line.id, ...line }))
      : [{ ...header, quoteLineId: null, rfqLineId: null, unitRate: null, lineTotal: null, discountPercent: null, taxPercent: null }];
  });
};

describe('RFQ quote comparison API', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.rfq.findFirst.mockReset().mockResolvedValue(fullRfq());
    db.rfqLine.count.mockReset().mockResolvedValue(fullRfq().lines.length);
    db.rfqLine.findMany.mockReset().mockImplementation(({ skip = 0, take = 50 }: { skip?: number; take?: number }) =>
      Promise.resolve(fullRfq().lines.slice(skip, skip + take)));
    db.boqLine.findMany.mockReset().mockResolvedValue([]);
    db.rfq.update.mockReset().mockResolvedValue({});
    db.ppoLine.findMany.mockReset().mockResolvedValue([
      { itemDescription: ' copper cable ', orderedUnitRate: 90, orderedAmount: 900, uom: 'M', orderDate: new Date('2026-08-01'), ppo: null },
      { itemDescription: 'Panel', orderedUnitRate: 70, orderedAmount: 140, uom: 'EA', orderDate: new Date('2026-07-01'),
        ppo: { ppoNumber: 'PPO-1', vendor: { name: 'Legacy Vendor' } } },
    ]);
    db.vendorRateCard.count.mockReset().mockResolvedValue(1);
    db.$queryRaw.mockReset().mockImplementation((query: { sql: string }) => query.sql.includes('latest_quotes')
      ? latestCompareQuoteRows()
      : query.sql.includes('negotiation_round_summaries')
        ? latestNegotiationRoundRows()
        : query.sql.includes('totalAiBenchmark')
          ? [{ totalAiBenchmark: 1160 }]
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

  it('builds latest quote comparisons, negotiation rates, and tied package rankings', async () => {
    const result = await GET(request(), params());
    expect(structuredLog).toHaveBeenCalledWith('warn', 'procurement.negotiation_line_items_invalid', expect.objectContaining({
      rfqId: 'rfq-1', invalidRoundCount: 1,
    }));
    expect(db.vendorRateCard.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-1', status: 'APPROVED' }) }));
    expect(db.$queryRaw).toHaveBeenCalledTimes(4);
    const rfqQuery = db.rfq.findFirst.mock.calls[0][0];
    expect(rfqQuery.include).not.toHaveProperty('quotes');
    expect(rfqQuery.include).not.toHaveProperty('lines');
    expect(rfqQuery.include.boqRevision.select).not.toHaveProperty('lines');
    expect(rfqQuery.include.negotiations.select).not.toHaveProperty('rounds');
    expect(db.boqLine.findMany).not.toHaveBeenCalled();
    const latestQuoteQuery = db.$queryRaw.mock.calls.find(([query]) => query.sql.includes('latest_quotes'))?.[0];
    expect(latestQuoteQuery).toBeDefined();
    if (!latestQuoteQuery) throw new Error('Latest quote query was not executed');
    expect(latestQuoteQuery.sql).toContain('MAX(quote."quoteVersion") AS "latestVersion"');
    expect(latestQuoteQuery.sql).toContain('latest."quoteVersion" = summary."latestVersion"');
    expect(latestQuoteQuery.sql).toContain('COUNT(*) AS "versionCount"');
    expect(latestQuoteQuery.sql).toContain('LEFT JOIN "quote_lines" AS quoteLine');
    expect(latestQuoteQuery.values).toEqual(expect.arrayContaining(['tenant-1', 'rfq-1']));
    expect(db.$queryRaw.mock.calls[0][0].sql).toContain('latest_quotes');
    const negotiationRoundQuery = db.$queryRaw.mock.calls.find(([query]) => query.sql.includes('negotiation_round_summaries'))?.[0];
    expect(negotiationRoundQuery).toBeDefined();
    if (!negotiationRoundQuery) throw new Error('Latest negotiation round query was not executed');
    expect(negotiationRoundQuery.sql).toContain('MAX(rounds."roundNumber") AS "latestRoundNumber"');
    expect(negotiationRoundQuery.sql).toContain('COUNT(*) AS "totalRoundCount"');
    expect(negotiationRoundQuery.sql).toContain('SUM(CASE WHEN rounds."status" <> \'SUPERSEDED\'');
    expect(negotiationRoundQuery.sql).toContain('submitted."id" AS "submittedRoundId"');
    expect(negotiationRoundQuery.sql).toContain('pending."id" AS "pendingRoundId"');
    expect(negotiationRoundQuery.sql).toContain('negotiation."rfqId" = ?');
    expect(negotiationRoundQuery.values).toEqual(expect.arrayContaining(['tenant-1', 'rfq-1']));
    expect(db.rfqLine.count).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1', rfqId: 'rfq-1' } });
    expect(db.rfqLine.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', rfqId: 'rfq-1' }, skip: 0, take: RFQ_COMPARE_LINE_PAGE_SIZE,
    }));
    const benchmarkQuery = db.$queryRaw.mock.calls.find(([query]) => query.sql.includes('totalAiBenchmark'))?.[0];
    expect(benchmarkQuery?.sql).toContain('LEFT JOIN "boq_lines" AS boqLine');
    expect(benchmarkQuery?.sql).toContain('LEFT JOIN "pr_lines" AS prLine');
    expect(benchmarkQuery?.values).toEqual(['tenant-1', 'rfq-1']);
    expect(result).toMatchObject({ ok: true, data: {
      rfq: { id: 'rfq-1', status: 'COMPARISON', project: { name: 'North Plant' }, boqRevision: { id: 'rev-1', revisionCode: 'R2' } },
      vendors: [
        { vendorId: 'v1', vendorType: 'CLIENT_VENDOR', qualificationStatus: 'NOT_EVALUATED', quoteId: 'v1-new', quoteVersion: 2,
          versionCount: 2, completenessPercent: 100, rank: 1, rankLabel: 'L1' },
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
      negotiationSummaries: expect.arrayContaining([
        { vendorId: 'v1', totalRoundCount: 5, activeBuyerOfferCount: 2,
          submittedRevisionRound: { id: 'v1-submitted', roundNumber: 2, revisedQuoteAmount: 1100, status: 'REVISED_SUBMITTED', nextResponsibleParty: 'BUYER', buyerDecision: null },
          pendingBuyerOffer: null },
        { vendorId: 'v2', totalRoundCount: 1, activeBuyerOfferCount: 1, submittedRevisionRound: null,
          pendingBuyerOffer: { id: 'v2-pending', roundNumber: 1, counterOfferAmount: 600, revisedQuoteAmount: null, status: 'ROUND_ACTIVE', nextResponsibleParty: null, buyerDecision: null } },
      ]),
      activeNegotiation: { id: 'neg-1' }, awards: [{ id: 'award-1' }],
      summary: { packageTotal: 1160, benchmarkTotal: 1160, lowestQuoteTotal: 1200, lowestVendor: 'Vendor v1',
        savings: -40, isFavorable: false, hasApprovedRateCards: true, approvedRateCardsCount: 1 },
    } });
    const comparedData = result as unknown as { data: { vendors: Array<Record<string, unknown>> } };
    expect(comparedData.data.vendors[0]).not.toHaveProperty('revisions');
    expect(db.rfq.update).not.toHaveBeenCalled();
    expect(writeBatch).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ sql: expect.stringContaining('UPDATE "rfqs"'), values: expect.arrayContaining(['rfq-1', 'tenant-1', 'RELEASED']) }),
      expect.objectContaining({ sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL, values: expect.arrayContaining(['QUOTE_COMPARED', 'rfq-1']) }),
    ]));
    expect(audit).not.toHaveBeenCalled();
  });

  it('pages the vendor-by-line matrix while retaining whole-RFQ totals and quote completeness', async () => {
    const base = fullRfq();
    const lines = Array.from({ length: 52 }, (_, index) => ({
      ...base.lines[0],
      id: `page-line-${String(index + 1).padStart(3, '0')}`,
      lineNumber: String(index + 1).padStart(3, '0'),
      description: `Package line ${index + 1}`,
      boqLine: null,
      boqLineId: null,
      prLine: null,
      benchmarkRate: 100,
      quantity: 1,
    }));
    const pagedRfq = {
      ...base,
      estimatedBenchmarkValue: 0,
      lines,
      quotes: base.quotes.map((quote) => quote.vendorId === 'v1' && quote.quoteVersion === 2
        ? {
          ...quote,
          lines: lines.map((line, index) => ({
            id: `quote-line-${index + 1}`,
            rfqLineId: line.id,
            unitRate: 100,
            lineTotal: 100,
            discountPercent: 0,
            taxPercent: 0,
          })),
        }
        : quote),
    } as unknown as ReturnType<typeof fullRfq>;
    const pageLineIds = new Set(lines.slice(50).map((line) => line.id));
    db.rfq.findFirst.mockResolvedValueOnce(pagedRfq);
    db.rfqLine.count.mockResolvedValueOnce(lines.length);
    db.rfqLine.findMany.mockResolvedValueOnce(lines.slice(50));
    db.$queryRaw.mockImplementation((query: { sql: string }) => query.sql.includes('latest_quotes')
      ? latestCompareQuoteRows(pagedRfq, pageLineIds)
      : query.sql.includes('negotiation_round_summaries')
        ? latestNegotiationRoundRows()
        : query.sql.includes('totalAiBenchmark')
          ? [{ totalAiBenchmark: 5200 }]
          : []);

    const result = await GET(request('?page=2'), params());
    const response = result as unknown as { data: {
      lines: Array<{ id: string }>;
      vendors: Array<{ vendorId: string; quotedCount: number; completenessPercent: number }>;
      pagination: { page: number; pageSize: number; totalItems: number; totalPages: number; hasPreviousPage: boolean; hasNextPage: boolean };
      summary: { benchmarkTotal: number };
    } };
    expect(response.data.lines.map((line) => line.id)).toEqual(['page-line-051', 'page-line-052']);
    expect(response.data.pagination).toEqual({
      page: 2, pageSize: 50, totalItems: 52, totalPages: 2, hasPreviousPage: true, hasNextPage: false,
    });
    expect(response.data.summary.benchmarkTotal).toBe(5200);
    expect(response.data.vendors.find((vendor) => vendor.vendorId === 'v1')).toMatchObject({
      quotedCount: 52,
      completenessPercent: 100,
    });
    expect(db.rfqLine.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', rfqId: 'rfq-1' },
      skip: 50,
      take: 50,
      orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
    }));

    const latestQuoteQuery = db.$queryRaw.mock.calls.find(([query]) => query.sql.includes('latest_quotes'))?.[0];
    expect(latestQuoteQuery?.sql).toContain('latest_quote_line_summaries');
    expect(latestQuoteQuery?.sql).toContain('quoteLine."rfqLineId" IN (?,?)');
    expect(latestQuoteQuery?.values).toEqual(expect.arrayContaining(['page-line-051', 'page-line-052']));
    expect(latestQuoteQuery?.values).not.toContain('page-line-001');
  });

  it('keeps vendors when the latest quote has no lines and captures latest-quote query failures', async () => {
    const rfqWithoutLatestLines = fullRfq({
      status: 'COMPARISON',
      quotes: [{ ...fullRfq().quotes[1], lines: [] }],
      negotiations: [],
      awards: [],
    });
    db.rfq.findFirst.mockResolvedValueOnce(rfqWithoutLatestLines);
    db.$queryRaw.mockImplementationOnce(() => latestCompareQuoteRows(rfqWithoutLatestLines));

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
    db.$queryRaw.mockRejectedValueOnce(new Error('Latest quote data unavailable'));
    await expect(GET(request(), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToCompareQuotes, status: 500,
    });

    db.rfq.findFirst.mockResolvedValueOnce(fullRfq());
    db.$queryRaw.mockImplementationOnce(() => latestCompareQuoteRows())
      .mockRejectedValueOnce(new Error('Latest negotiation rounds unavailable'));
    await expect(GET(request(), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToCompareQuotes, status: 500,
    });
  });

  it('uses empty comparison fallbacks, skips closed RFQ transitions, and handles failures in dependent reads', async () => {
    db.rfq.findFirst.mockResolvedValueOnce(fullRfq({
      status: 'COMPARISON', quotes: [], lines: [], negotiations: [], awards: [], boqRevision: null, estimatedBenchmarkValue: 500,
    }));
    db.rfqLine.count.mockResolvedValueOnce(0);
    db.rfqLine.findMany.mockResolvedValueOnce([]);
    db.$queryRaw.mockImplementation((query: { sql: string }) => query.sql.includes('totalAiBenchmark')
      ? [{ totalAiBenchmark: 0 }]
      : []);
    await expect(GET(request(), params())).resolves.toMatchObject({ ok: true, data: {
      vendors: [], lines: [], activeNegotiation: null,
      summary: { packageTotal: 500, benchmarkTotal: 500, lowestQuoteTotal: 0, lowestVendor: '—', savings: 500,
        isFavorable: true, hasApprovedRateCards: true },
    } });
    expect(db.rfq.update).not.toHaveBeenCalled();

    const fallbackLines = [
      { id: 'line-revision', lineNumber: 'L-3', description: 'Revision item', quantity: 1, uom: 'EA' },
      { id: 'line-standard', lineNumber: 'L-9', description: 'Standard match', quantity: 1, uom: 'EA' },
      { id: 'line-original', lineNumber: 'L-10', description: 'Original match', quantity: 1, uom: 'EA' },
      { id: 'line-none', lineNumber: '99', description: '', quantity: 2, uom: 'EA' },
    ];
    db.rfq.findFirst.mockResolvedValueOnce(fullRfq({
      status: 'COMPARISON', estimatedBenchmarkValue: 0, quotes: [], negotiations: [{ id: 'closed-neg', status: 'CONCLUDED', currentRound: 1 }],
      boqRevision: { id: 'rev-1', revisionCode: 'R2', lines: [
        { id: 'revision-line', lineNumber: '3', itemCode: 'REV-3', standardDescription: 'Revision source', originalDescription: 'Other wording' },
        { id: 'standard-line', lineNumber: '4', standardDescription: 'Standard match', originalDescription: 'Standard source wording' },
        { id: 'original-line', lineNumber: '5', standardDescription: 'Other standard', originalDescription: 'Original match' },
      ] },
      lines: fallbackLines,
    }));
    db.rfqLine.count.mockResolvedValueOnce(fallbackLines.length);
    db.rfqLine.findMany.mockResolvedValueOnce(fallbackLines);
    db.$queryRaw.mockImplementation((query: { sql: string }) => query.sql.includes('totalAiBenchmark')
      ? [{ totalAiBenchmark: 0 }]
      : []);
    db.boqLine.findMany.mockResolvedValueOnce([
      { id: 'revision-line', lineNumber: '3', itemCode: 'REV-3', standardDescription: 'Revision source', originalDescription: 'Other wording' },
      { id: 'standard-line', lineNumber: '4', standardDescription: 'Standard match', originalDescription: 'Standard source wording' },
      { id: 'original-line', lineNumber: '5', standardDescription: 'Other standard', originalDescription: 'Original match' },
    ]);
    await expect(GET(request(), params())).resolves.toMatchObject({ ok: true, data: {
      activeNegotiation: { id: 'closed-neg' },
      lines: [
        { id: 'line-revision', itemCode: 'REV-3', itemDescription: 'Revision item', aiUnitCost: null,
          aiCostStatus: 'NOT_AVAILABLE', lowestCompliantVendorName: '—', lowestRate: 0, lowestLineTotal: 0,
          category: 'General', specification: null },
        { id: 'line-standard', itemCode: null, boqDescription: 'Standard source wording' },
        { id: 'line-original', itemCode: null, boqDescription: null },
        { id: 'line-none', itemCode: null, itemDescription: 'Line item', boqDescription: null,
          category: 'General', historicalPpoRate: null, rateCardRate: null },
      ],
      summary: { packageTotal: 0, benchmarkTotal: 0, lowestQuoteTotal: 0, lowestVendor: '—', savings: 0,
        savingsPercent: 0, isFavorable: true },
    } });
    expect(db.boqLine.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-1', boqRevisionId: 'rev-1',
        OR: expect.arrayContaining([
          { lineNumber: { in: expect.arrayContaining(['L-3', '3']) } },
          { standardDescription: { contains: 'Revision item' } },
        ]),
      }),
      orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
      take: RFQ_COMPARE_FALLBACK_BOQ_CANDIDATE_LIMIT + 1,
    }));

    db.ppoLine.findMany.mockRejectedValueOnce(new Error('history unavailable'));
    await expect(GET(request(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToCompareQuotes, status: 500 });
    db.rfq.findFirst.mockResolvedValueOnce(fullRfq({ status: 'COMPARISON' }));
    audit.mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(GET(request(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToCompareQuotes, status: 500 });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('fails closed and logs when fallback BOQ matching exceeds its candidate cap', async () => {
    const oneLine = [{ id: 'line-1', lineNumber: '1', description: 'Copper cable', quantity: 1, uom: 'M', boqLine: null, prLine: null }];
    db.rfq.findFirst.mockResolvedValueOnce(fullRfq({ lines: oneLine }));
    db.rfqLine.count.mockResolvedValueOnce(1);
    db.rfqLine.findMany.mockResolvedValueOnce(oneLine);
    db.boqLine.findMany.mockResolvedValueOnce(Array.from(
      { length: RFQ_COMPARE_FALLBACK_BOQ_CANDIDATE_LIMIT + 1 }, (_, index) => ({ id: `candidate-${index}` }),
    ));

    await expect(GET(request(), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToCompareQuotes, status: 500,
    });
    expect(db.boqLine.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: RFQ_COMPARE_FALLBACK_BOQ_CANDIDATE_LIMIT + 1 }));
    expect(structuredLog).toHaveBeenCalledWith('warn', 'procurement.rfq_compare_fallback_candidates_exceeded', expect.objectContaining({
      tenantId: 'tenant-1', rfqId: 'rfq-1',
      candidateCountAtLeast: RFQ_COMPARE_FALLBACK_BOQ_CANDIDATE_LIMIT + 1,
      maxCandidates: RFQ_COMPARE_FALLBACK_BOQ_CANDIDATE_LIMIT,
    }));
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
});
