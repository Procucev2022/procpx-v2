import {
  buildDemoAwards,
  buildDemoNegotiations,
  buildDemoQuotes,
  DEMO_SCOPE_LINES,
  DEMO_VENDORS,
  getDemoComparison,
  getDemoRateCards,
  getInitialDemoRfq,
} from '../src/lib/procurement-demo-data';

describe('procurement demo fixtures', () => {
  it('builds linked quote, negotiation, award, and rate-card data', () => {
    const quotes = buildDemoQuotes();
    const negotiations = buildDemoNegotiations();
    const awards = buildDemoAwards();
    const rateCards = getDemoRateCards();

    expect(quotes.length).toBeGreaterThan(0);
    expect(quotes.every((quote) => quote.lines.length > 0)).toBe(true);
    expect(quotes[0]).toMatchObject({ status: 'SUBMITTED', deliveryLeadTimeDays: expect.any(Number) });
    expect(negotiations[0].rounds[0]).toMatchObject({ status: 'REVISED_SUBMITTED', roundNumber: 1 });
    expect(awards[0]).toMatchObject({ status: 'PENDING_APPROVAL', isNonL1Exception: false });
    expect(rateCards.matchedRateCards[0].itemCoverage.isFullCoverage).toBe(true);
    expect(rateCards.matchedRateCards[0].lineMatches).toHaveLength(DEMO_SCOPE_LINES.length);
  });

  it('creates empty-quote and submitted-quote RFQ lifecycle states', () => {
    const awaitingQuotes = getInitialDemoRfq();
    const submittedQuotes = getInitialDemoRfq(false);

    expect(awaitingQuotes).toMatchObject({ status: 'VENDOR_RESPONSE_OPEN', quotes: [], negotiations: [], awards: [], ppos: [] });
    expect(awaitingQuotes.invitedVendors.every((vendor) => vendor.submissionStatus === 'PENDING')).toBe(true);
    expect(submittedQuotes).toMatchObject({ status: 'NEGOTIATION' });
    expect(submittedQuotes.invitedVendors.every((vendor) => vendor.submissionStatus === 'SUBMITTED')).toBe(true);
    expect(submittedQuotes.quotes.length).toBeGreaterThan(0);
    expect(DEMO_VENDORS.length).toBe(awaitingQuotes.invitedVendors.length);
  });
});

describe('demo comparison matrix', () => {
  it('returns zero quote totals and no leader before vendors submit', () => {
    const comparison = getDemoComparison(getInitialDemoRfq());

    expect(comparison.totalBenchmark).toBeGreaterThan(0);
    expect(comparison.l1VendorId).toBeNull();
    expect(comparison.summary.quotesSubmittedCount).toBe(0);
    expect(comparison.vendors.every((vendor) => !vendor.hasSubmitted && vendor.rank === null)).toBe(true);
    expect(comparison.lines.every((line) => line.lowestRate === 0)).toBe(true);
  });

  it('ranks quotes, applies the negotiated rate, and reports line leaders', () => {
    const comparison = getDemoComparison(getInitialDemoRfq(false));

    expect(comparison.summary.quotesSubmittedCount).toBeGreaterThan(0);
    expect(comparison.l1VendorId).toBeTruthy();
    expect(comparison.vendors[0].rank).toBe(1);
    expect(comparison.vendors.some((vendor) => vendor.isL1)).toBe(true);
    expect(comparison.lines).toHaveLength(DEMO_SCOPE_LINES.length);
    expect(comparison.matrixLines).toBe(comparison.lines);
    expect(comparison.lines.some((line) => Object.values(line.vendorRates).some((rate: any) => rate.isLowest))).toBe(true);
  });

  it('handles vendors without quotes and lines without any positive rates', () => {
    const submitted = getInitialDemoRfq(false);
    const partialQuotes = { ...submitted, quotes: submitted.quotes.slice(0, 1), negotiations: [] };
    const comparison = getDemoComparison(partialQuotes);
    const noLines = getDemoComparison({ ...submitted, lines: [], invitedVendors: [], quotes: [], negotiations: [] });

    expect(comparison.vendors.some((vendor) => !vendor.hasSubmitted && vendor.originalQuoteAmount === 0)).toBe(true);
    expect(comparison.lines.some((line) => Object.values(line.vendorQuotes).some((quote: any) => !quote.quoted))).toBe(true);
    expect(noLines).toMatchObject({ totalBenchmark: 0, l1VendorId: null, l1TotalAmount: null, lines: [] });
  });
});
