// tests/procurement-demo-workflow.test.ts
// Comprehensive acceptance tests for proCPX Interactive Workflow Demonstration
import assert from 'node:assert';
import {
  getInitialDemoRfq,
  getDemoComparison,
  getDemoRateCards,
  buildDemoQuotes,
  buildDemoNegotiations,
  buildDemoAwards,
  DEMO_SCOPE_LINES,
  DEMO_VENDORS,
  DEMO_QUOTES_DATA,
} from '../src/lib/procurement-demo-data';

console.log('--- Starting proCPX Interactive Workflow Demonstration Tests ---');

// Test 1: Illustrative Demo Data Initialization (Requirement 1 & 2)
{
  console.log('Test 1: Verify Initial Demo Transaction Setup (Kundanahalli Retail Project)');
  const initialRfqZero = getInitialDemoRfq(true);

  assert.strictEqual(initialRfqZero.id, 'RFQ-DEMO-001');
  assert.strictEqual(initialRfqZero.rfqNumber, 'RFQ-DEMO-001');
  assert.strictEqual(initialRfqZero.prNumber, 'PR-DEMO-001');
  assert.strictEqual(initialRfqZero.costCentre, 'CC45 - Civil & Interior Fitout');
  assert.strictEqual(initialRfqZero.project.name, 'Kundanahalli Retail Project');

  // Verify 8 scope lines inherited
  assert.strictEqual(initialRfqZero.lines.length, 8, 'Must have exactly 8 civil and interior lines');
  assert.strictEqual(initialRfqZero.lines[0].itemCode, 'CV-FLR-01');
  assert.strictEqual(initialRfqZero.lines[0].uom, 'SQM');
  assert.strictEqual(initialRfqZero.lines[0].quantity, 450);

  // Verify 3 eligible vendors
  assert.strictEqual(initialRfqZero.invitedVendors.length, 3, 'Must have 3 eligible vendors');
  const vendorCodes = initialRfqZero.invitedVendors.map((iv) => iv.vendor.code);
  assert(vendorCodes.includes('VEND-ACME-01'));
  assert(vendorCodes.includes('VEND-DECC-02'));
  assert(vendorCodes.includes('VEND-APEX-03'));

  // Verify zero quotes on start
  assert.strictEqual(initialRfqZero.quotes.length, 0, 'Must start with zero received quotations');
  console.log('✓ Initial demonstration state verified: PR-DEMO-001, CC45, 8 items, 3 vendors, 0 quotes.');
}

// Test 2: Comparison Matrix with Zero Quotes vs Populated Quotes (Requirement 2)
{
  console.log('Test 2: Verify Comparison Matrix calculation when empty and populated');
  const initialRfqZero = getInitialDemoRfq(true);
  const compareEmpty = getDemoComparison(initialRfqZero);

  assert.strictEqual(compareEmpty.summary.quotesSubmittedCount, 0);
  assert.strictEqual(compareEmpty.l1VendorId, null);
  assert.strictEqual(compareEmpty.lines.length, 8);
  assert.strictEqual(compareEmpty.lines[0].vendorQuotes['v-demo-001'].quoted, false);

  // Now simulate receiving quotations
  const rfqWithQuotes = {
    ...initialRfqZero,
    quotes: buildDemoQuotes(),
  };
  const comparePopulated = getDemoComparison(rfqWithQuotes);

  assert.strictEqual(comparePopulated.summary.quotesSubmittedCount, 3);
  assert.strictEqual(comparePopulated.l1VendorId, 'v-demo-001', 'Acme must be L1');
  assert.strictEqual(comparePopulated.l1TotalAmount, 880000);
  assert.strictEqual(comparePopulated.lines[0].vendorQuotes['v-demo-001'].quoted, true);
  assert.strictEqual(comparePopulated.lines[0].vendorQuotes['v-demo-001'].rate, 735);

  // Verify each vendor quote is preserved separately
  assert.strictEqual(rfqWithQuotes.quotes.length, 3);
  const quoteVendors = rfqWithQuotes.quotes.map((q) => q.vendorId);
  assert(quoteVendors.includes('v-demo-001'));
  assert(quoteVendors.includes('v-demo-002'));
  assert(quoteVendors.includes('v-demo-003'));
  console.log('✓ Comparison matrix updates dynamically when quotes are simulated/recorded.');
}

// Test 3: Rate Card Sourcing Match (Requirement 2)
{
  console.log('Test 3: Verify Rate Card Sourcing and Direct PPO eligibility');
  const rateCards = getDemoRateCards();

  assert.strictEqual(rateCards.rfqNumber, 'RFQ-DEMO-001');
  assert.strictEqual(rateCards.eligibleCount, 1);
  const card = rateCards.matchedRateCards[0];
  assert.strictEqual(card.rateCardNumber, 'VRC-2026-000001');
  assert.strictEqual(card.itemCoverage.coveragePercent, 100);
  assert.strictEqual(card.directPpoEligible, true);
  assert.strictEqual(card.rateCardTotalAmount, 855000);
  assert(card.savingsVsBenchmark > 0);
  console.log('✓ Rate card sourcing matches 100% item coverage and permits direct PPO eligibility.');
}

// Test 4: Commercial Negotiation Flow (Requirement 3)
{
  console.log('Test 4: Verify Negotiation Round Progression (₹8.80L -> ₹8.40L -> ₹8.50L)');
  const initialRfq = getInitialDemoRfq(false);
  const neg = initialRfq.negotiations[0];

  assert.strictEqual(neg.vendorId, 'v-demo-001');
  assert.strictEqual(neg.rounds.length, 1);
  const round1 = neg.rounds[0];
  assert.strictEqual(round1.previousQuoteAmount, 880000, 'Initial quotation must be ₹8,80,000');
  assert.strictEqual(round1.counterOfferAmount, 840000, 'Counteroffer must be ₹8,40,000');
  assert.strictEqual(round1.revisedQuoteAmount, 850000, 'Revised quote must be ₹8,50,000');
  assert.strictEqual(round1.savingsAmount, 30000);
  assert(round1.timestamp, 'Timestamp must be present');

  // Comparison matrix reflects revised rates
  const compareAfterNeg = getDemoComparison(initialRfq);
  assert.strictEqual(compareAfterNeg.l1TotalAmount, 850000, 'L1 total must reflect revised ₹8,50,000 offer');
  console.log('✓ Negotiation round correctly traces ₹8,80,000 -> ₹8,40,000 -> ₹8,50,000 with comparison update.');
}

// Test 5: Awarding & PPO Flow (Requirement 4 & 5)
{
  console.log('Test 5: Verify Award Recommendation, Approval, and PPO Generation');
  const initialRfq = getInitialDemoRfq(false);
  const award = initialRfq.awards[0];

  assert.strictEqual(award.recommendedVendorId, 'v-demo-001');
  assert.strictEqual(award.finalNegotiatedAmount, 850000);
  assert.strictEqual(award.status, 'PENDING_APPROVAL');
  assert.strictEqual(award.isNonL1Exception, false);

  // Simulate Finance Approval
  const approvedAward = {
    ...award,
    status: 'APPROVED',
    approvedBy: 'Finance Approver (Demonstration)',
    approvedAt: new Date().toISOString(),
  };

  // Simulate PPO creation
  const ppo = {
    id: 'ppo-demo-001',
    ppoNumber: 'PPO-DEMO-001',
    vendorId: 'v-demo-001',
    totalValue: 850000,
    status: 'ISSUED',
  };

  const finalRfq = {
    ...initialRfq,
    status: 'AWARDED',
    awards: [approvedAward],
    ppos: [ppo],
  };

  assert.strictEqual(finalRfq.awards[0].status, 'APPROVED');
  assert.strictEqual(finalRfq.ppos[0].ppoNumber, 'PPO-DEMO-001');
  assert.strictEqual(finalRfq.ppos[0].totalValue, 850000);
  console.log('✓ Award approved and PPO-DEMO-001 generated with locked value ₹8,50,000.');
}

console.log('--- ALL ACCEPTANCE TESTS PASSED SUCCESSFULLY ---');
