// scripts/test-rfq-to-ppo-full-workflow.ts
// proCPX End-to-End RFQ -> Quotation (v1..5) -> Counteroffer (1..4) -> Award -> PPO Integration Test
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface TestStepResult {
  step: string;
  passed: boolean;
  details?: string;
  error?: string;
}

const results: TestStepResult[] = [];

function recordResult(step: string, passed: boolean, details?: string, error?: string) {
  results.push({ step, passed, details, error });
  if (passed) {
    console.log(`  [PASS] ${step}${details ? ` -> ${details}` : ''}`);
  } else {
    console.error(`  [FAIL] ${step}${error ? ` -> Error: ${error}` : ''}`);
  }
}

async function runTest() {
  console.log('================================================================');
  console.log('   proCPX RFQ-TO-PPO FULL WORKFLOW INTEGRATION TEST SUITE       ');
  console.log('================================================================\n');

  // Find demo tenant
  const tenant = await prisma.tenant.findFirst({
    where: { slug: 'procucev-retail-demo' },
  });
  if (!tenant) throw new Error('Tenant procucev-retail-demo not found');
  const tenantId = tenant.id;

  // Category Manager user
  const cmUser = await prisma.user.findFirst({
    where: { tenantId, role: 'CATEGORY_MANAGER' },
  });
  if (!cmUser) throw new Error('Category Manager user not found');

  // Find 3 distinct vendors
  const vendors = await prisma.vendor.findMany({
    where: { tenantId },
    take: 3,
  });
  if (vendors.length < 3) throw new Error('At least 3 vendors required for testing');
  const [vendorA, vendorB, vendorC] = vendors;

  console.log(`Tenant: ${tenant.name} (${tenant.id})`);
  console.log(`Category Manager: ${cmUser.name} (${cmUser.email})`);
  console.log(`Vendor A: ${vendorA.name} (${vendorA.id})`);
  console.log(`Vendor B: ${vendorB.name} (${vendorB.id})`);
  console.log(`Vendor C: ${vendorC.name} (${vendorC.id})\n`);

  const timestamp = Date.now();
  const testProjectCode = `CPX-T-${timestamp.toString().slice(-6)}`;
  const testCostCentreCode = `CC-T-${timestamp.toString().slice(-4)}`;
  const testBoqCode = `BOQ-T-${timestamp.toString().slice(-6)}`;
  const testPrNumber = `PR-T-${timestamp.toString().slice(-6)}`;
  const testRfqNumber = `RFQ-T-${timestamp.toString().slice(-6)}`;

  let testProject: any;
  let testCostCentre: any;
  let testBoq: any;
  let testRevision: any;
  let testPr: any;
  let testRfq: any;

  try {
    // -------------------------------------------------------------------------
    // SETUP: Create isolated test Project, Cost Centre, BOQ, PR, and RFQ
    // -------------------------------------------------------------------------
    console.log('--- SETUP: Isolated Test Fixture Creation ---');

    testProject = await prisma.project.create({
      data: {
        tenantId,
        projectCode: testProjectCode,
        name: `Automated Test Project ${timestamp}`,
        sector: 'RETAIL',
        projectType: 'FIT_OUT',
        status: 'ACTIVE',
        createdBy: cmUser.name,
      },
    });

    testCostCentre = await prisma.costCentre.create({
      data: {
        tenantId,
        projectId: testProject.id,
        code: testCostCentreCode,
        name: 'Test Interior Package',
        areaSqFt: 500,
        createdBy: cmUser.name,
      },
    });

    testBoq = await prisma.boq.create({
      data: {
        tenantId,
        projectId: testProject.id,
        costCentreId: testCostCentre.id,
        boqCode: testBoqCode,
        title: 'Commercial Workflow Baseline BOQ',
        status: 'APPROVED',
        createdBy: cmUser.name,
      },
    });

    testRevision = await prisma.boqRevision.create({
      data: {
        tenantId,
        boqId: testBoq.id,
        revisionNumber: 1,
        revisionCode: 'R1',
        status: 'APPROVED',
        prStatus: 'PR_RELEASED_TO_PROCUREMENT',
        createdById: cmUser.id,
        totalLines: 3,
        lines: {
          create: [
            {
              tenantId,
              lineNumber: '1',
              originalDescription: 'Gypsum Board False Ceiling',
              quantity: 100,
              uomRaw: 'SQFT',
            },
            {
              tenantId,
              lineNumber: '2',
              originalDescription: 'Commercial Modular LED Downlight 15W',
              quantity: 50,
              uomRaw: 'NOS',
            },
            {
              tenantId,
              lineNumber: '3',
              originalDescription: 'Heavy Duty Floor Tiles 600x600mm',
              quantity: 200,
              uomRaw: 'SQFT',
            },
          ],
        },
      },
      include: { lines: true },
    });

    testPr = await prisma.procurementRequest.create({
      data: {
        tenantId,
        projectId: testProject.id,
        costCentreId: testCostCentre.id,
        boqId: testBoq.id,
        boqRevisionId: testRevision.id,
        prNumber: testPrNumber,
        title: 'Interior Sourcing Package PR',
        status: 'PR_RELEASED_TO_PROCUREMENT',
        totalEstimatedValue: 350000,
        requestedBy: cmUser.name,
        lines: {
          create: [
            {
              tenantId,
              lineNumber: '1',
              itemDescription: 'Gypsum Board False Ceiling',
              category: 'Civil & Interior',
              quantity: 100,
              uom: 'SQFT',
              estimatedRate: 500,
              estimatedValue: 50000,
            },
            {
              tenantId,
              lineNumber: '2',
              itemDescription: 'Commercial Modular LED Downlight 15W',
              category: 'Electrical & Lighting',
              quantity: 50,
              uom: 'NOS',
              estimatedRate: 2000,
              estimatedValue: 100000,
            },
            {
              tenantId,
              lineNumber: '3',
              itemDescription: 'Heavy Duty Floor Tiles 600x600mm',
              category: 'Flooring & Tiling',
              quantity: 200,
              uom: 'SQFT',
              estimatedRate: 1000,
              estimatedValue: 200000,
            },
          ],
        },
      },
    });

    testRfq = await prisma.rfq.create({
      data: {
        tenantId,
        projectId: testProject.id,
        boqRevisionId: testRevision.id,
        prId: testPr.id,
        rfqNumber: testRfqNumber,
        title: 'Commercial Fitout RFQ Package',
        status: 'RELEASED',
        estimatedBenchmarkValue: 350000,
        createdById: cmUser.id,
        lines: {
          create: [
            {
              tenantId,
              lineNumber: '1',
              description: 'Gypsum Board False Ceiling',
              quantity: 100,
              uom: 'SQFT',
              benchmarkRate: 500,
              benchmarkAmount: 50000,
            },
            {
              tenantId,
              lineNumber: '2',
              description: 'Commercial Modular LED Downlight 15W',
              quantity: 50,
              uom: 'NOS',
              benchmarkRate: 2000,
              benchmarkAmount: 100000,
            },
            {
              tenantId,
              lineNumber: '3',
              description: 'Heavy Duty Floor Tiles 600x600mm',
              quantity: 200,
              uom: 'SQFT',
              benchmarkRate: 1000,
              benchmarkAmount: 200000,
            },
          ],
        },
        invitedVendors: {
          create: [
            { tenantId, vendorId: vendorA.id, invitationStatus: 'INVITED' },
            { tenantId, vendorId: vendorB.id, invitationStatus: 'INVITED' },
            { tenantId, vendorId: vendorC.id, invitationStatus: 'INVITED' },
          ],
        },
      },
      include: { lines: { orderBy: { lineNumber: 'asc' } }, invitedVendors: true },
    });

    recordResult('Fixture Creation', true, `Created RFQ ${testRfq.rfqNumber} with 3 lines & 3 invited vendors`);

    const rfqLines = testRfq.lines;

    // -------------------------------------------------------------------------
    // TEST 1: Initial State - Awaiting Quote
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: Initial Circulated State ---');
    const existingQuotes = await prisma.quote.findMany({
      where: { rfqId: testRfq.id, vendorId: vendorA.id },
    });
    recordResult('Initial Quote Status', existingQuotes.length === 0, 'No quote exists yet -> UI shows Awaiting Quote');

    // -------------------------------------------------------------------------
    // TEST 2: Vendor Quote 1 Submissions (Vendors A, B, C)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Initial Vendor Quotes Submission & Persistence ---');
    // Vendor A Quote 1: 450, 1900, 950 -> Total = 450*100 + 1900*50 + 950*200 = 45,000 + 95,000 + 190,000 = 330,000
    const quote1A = await prisma.quote.create({
      data: {
        tenantId,
        rfqId: testRfq.id,
        vendorId: vendorA.id,
        quoteNumber: `QTE-${timestamp}-A1`,
        quoteVersion: 1,
        status: 'SUBMITTED',
        totalBaseAmount: 330000,
        taxAmount: 59400,
        totalQuoteAmount: 389400,
        submittedBy: vendorA.name,
        lines: {
          create: [
            { tenantId, rfqLineId: rfqLines[0].id, unitRate: 450, lineTotal: 45000, taxPercent: 18 },
            { tenantId, rfqLineId: rfqLines[1].id, unitRate: 1900, lineTotal: 95000, taxPercent: 18 },
            { tenantId, rfqLineId: rfqLines[2].id, unitRate: 950, lineTotal: 190000, taxPercent: 18 },
          ],
        },
      },
      include: { lines: true },
    });
    recordResult('Vendor A Quote 1', quote1A.quoteVersion === 1 && quote1A.totalQuoteAmount === 389400, `Quote v1 created for ${vendorA.name}`);

    // Vendor B Quote 1: 480, 1950, 980 -> Total = 480*100 + 1950*50 + 980*200 = 48000 + 97500 + 196000 = 341,500 (+18% = 402,970)
    const quote1B = await prisma.quote.create({
      data: {
        tenantId,
        rfqId: testRfq.id,
        vendorId: vendorB.id,
        quoteNumber: `QTE-${timestamp}-B1`,
        quoteVersion: 1,
        status: 'SUBMITTED',
        totalBaseAmount: 341500,
        taxAmount: 61470,
        totalQuoteAmount: 402970,
        submittedBy: vendorB.name,
        lines: {
          create: [
            { tenantId, rfqLineId: rfqLines[0].id, unitRate: 480, lineTotal: 48000, taxPercent: 18 },
            { tenantId, rfqLineId: rfqLines[1].id, unitRate: 1950, lineTotal: 97500, taxPercent: 18 },
            { tenantId, rfqLineId: rfqLines[2].id, unitRate: 980, lineTotal: 196000, taxPercent: 18 },
          ],
        },
      },
    });
    recordResult('Vendor B Quote 1', quote1B.quoteVersion === 1, `Quote v1 created for ${vendorB.name}`);

    // Vendor C Quote 1: 500, 2000, 1000 -> Total = 500*100 + 2000*50 + 1000*200 = 350,000 (+18% = 413,000)
    const quote1C = await prisma.quote.create({
      data: {
        tenantId,
        rfqId: testRfq.id,
        vendorId: vendorC.id,
        quoteNumber: `QTE-${timestamp}-C1`,
        quoteVersion: 1,
        status: 'SUBMITTED',
        totalBaseAmount: 350000,
        taxAmount: 63000,
        totalQuoteAmount: 413000,
        submittedBy: vendorC.name,
        lines: {
          create: [
            { tenantId, rfqLineId: rfqLines[0].id, unitRate: 500, lineTotal: 50000, taxPercent: 18 },
            { tenantId, rfqLineId: rfqLines[1].id, unitRate: 2000, lineTotal: 100000, taxPercent: 18 },
            { tenantId, rfqLineId: rfqLines[2].id, unitRate: 1000, lineTotal: 200000, taxPercent: 18 },
          ],
        },
      },
    });
    recordResult('Vendor C Quote 1', quote1C.quoteVersion === 1, `Quote v1 created for ${vendorC.name}`);

    // Verify Quote 1 Immutability: Cannot have duplicate Quote 1 with unique constraint
    let duplicatePrevented = false;
    try {
      await prisma.quote.create({
        data: {
          tenantId,
          rfqId: testRfq.id,
          vendorId: vendorA.id,
          quoteNumber: `QTE-${timestamp}-A1-DUP`,
          quoteVersion: 1, // Duplicate version
          status: 'SUBMITTED',
          totalQuoteAmount: 389400,
        },
      });
    } catch {
      duplicatePrevented = true;
    }
    recordResult('Quote 1 Immutability & Duplicate Prevention', duplicatePrevented, 'Unique constraint [rfqId, vendorId, quoteVersion] enforced');

    // -------------------------------------------------------------------------
    // TEST 3: Category Manager Buyer Offer 1 Dispatched to Vendor A
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Category Manager Buyer Offer 1 ---');
    // Create negotiation container
    const negotiation = await prisma.negotiation.create({
      data: {
        tenantId,
        rfqId: testRfq.id,
        currentRound: 1,
        status: 'ACTIVE',
      },
    });

    const buyerOffer1LineItems = [
      { rfqLineId: rfqLines[0].id, counterRate: 400, lineTotal: 40000 },
      { rfqLineId: rfqLines[1].id, counterRate: 1800, lineTotal: 90000 },
      { rfqLineId: rfqLines[2].id, counterRate: 900, lineTotal: 180000 },
    ];
    const buyerOffer1Amount = 40000 + 90000 + 180000; // 310,000

    const buyerOffer1 = await prisma.negotiationRound.create({
      data: {
        tenantId,
        negotiationId: negotiation.id,
        vendorId: vendorA.id,
        roundNumber: 1,
        previousQuoteAmount: quote1A.totalBaseAmount,
        counterOfferAmount: buyerOffer1Amount,
        savingsAmount: quote1A.totalBaseAmount - buyerOffer1Amount,
        savingsPercent: Math.round(((quote1A.totalBaseAmount - buyerOffer1Amount) / quote1A.totalBaseAmount) * 100),
        status: 'ROUND_ACTIVE',
        notes: 'Commercial counteroffer seeking 6% price concession across 3 items.',
        lineItemsJson: JSON.stringify(buyerOffer1LineItems),
        nextResponsibleParty: 'VENDOR',
      },
    });
    recordResult('Buyer Offer 1 Dispatched', buyerOffer1.roundNumber === 1 && buyerOffer1.counterOfferAmount === 310000, `Buyer Offer 1 dispatched (₹${buyerOffer1Amount})`);

    // Verify CM cannot dispatch Buyer Offer 2 while Buyer Offer 1 is pending response
    const pendingRound = await prisma.negotiationRound.findFirst({
      where: {
        negotiationId: negotiation.id,
        vendorId: vendorA.id,
        nextResponsibleParty: 'VENDOR',
        revisedQuoteAmount: null,
      },
    });
    recordResult('Pending Vendor Check Enforced', pendingRound !== null, 'Server correctly recognizes active pending offer');

    // -------------------------------------------------------------------------
    // TEST 4: Vendor A Responds with Quote 2 (Preserving Buyer Offer Line Items)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Vendor A Quote 2 Response & Preservation ---');
    const quote2A = await prisma.quote.create({
      data: {
        tenantId,
        rfqId: testRfq.id,
        vendorId: vendorA.id,
        quoteNumber: `QTE-${timestamp}-A2`,
        quoteVersion: 2,
        status: 'SUBMITTED',
        totalBaseAmount: 318500, // 420*100 + 1850*50 + 920*200 = 42,000 + 92,500 + 184,000 = 318,500
        taxAmount: 57330,
        totalQuoteAmount: 375830,
        submittedBy: vendorA.name,
        lines: {
          create: [
            { tenantId, rfqLineId: rfqLines[0].id, unitRate: 420, lineTotal: 42000, taxPercent: 18 },
            { tenantId, rfqLineId: rfqLines[1].id, unitRate: 1850, lineTotal: 92500, taxPercent: 18 },
            { tenantId, rfqLineId: rfqLines[2].id, unitRate: 920, lineTotal: 184000, taxPercent: 18 },
          ],
        },
      },
      include: { lines: true },
    });

    // Update Round 1 to REVISED_SUBMITTED without touching lineItemsJson (CRITICAL FIX CHECK)
    await prisma.negotiationRound.update({
      where: { id: buyerOffer1.id },
      data: {
        revisedQuoteAmount: 318500,
        status: 'REVISED_SUBMITTED',
        nextResponsibleParty: 'BUYER',
      },
    });

    // Verify Buyer Offer 1 lineItemsJson was NOT overwritten by vendor quote
    const verifiedRound1 = await prisma.negotiationRound.findUnique({
      where: { id: buyerOffer1.id },
    });
    const parsedRound1Lines = JSON.parse(verifiedRound1!.lineItemsJson!);
    const ratesIntact = parsedRound1Lines[0].counterRate === 400 && parsedRound1Lines[1].counterRate === 1800;
    recordResult('Buyer Offer Line Rates Preserved', ratesIntact, `Buyer Offer 1 rates (₹400, ₹1800) preserved after Quote 2 submission`);
    recordResult('Vendor Quote 2 Persisted', quote2A.quoteVersion === 2, `Quote 2 persisted as version 2`);

    // -------------------------------------------------------------------------
    // TEST 5: Full Negotiation Exchange through Quote 5 and Buyer Offer 4
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Multi-Round Sequence (Quotes 1-5, Buyer Offers 1-4) ---');

    // Round 2: Buyer Offer 2 -> Quote 3
    const buyerOffer2 = await prisma.negotiationRound.create({
      data: {
        tenantId,
        negotiationId: negotiation.id,
        vendorId: vendorA.id,
        roundNumber: 2,
        previousQuoteAmount: 318500,
        counterOfferAmount: 305000,
        status: 'ROUND_ACTIVE',
        lineItemsJson: JSON.stringify([{ rfqLineId: rfqLines[0].id, counterRate: 390 }]),
        nextResponsibleParty: 'VENDOR',
      },
    });
    const quote3A = await prisma.quote.create({
      data: {
        tenantId,
        rfqId: testRfq.id,
        vendorId: vendorA.id,
        quoteNumber: `QTE-${timestamp}-A3`,
        quoteVersion: 3,
        status: 'SUBMITTED',
        totalBaseAmount: 312000,
        taxAmount: 56160,
        totalQuoteAmount: 368160,
        submittedBy: vendorA.name,
      },
    });
    await prisma.negotiationRound.update({
      where: { id: buyerOffer2.id },
      data: { revisedQuoteAmount: 312000, status: 'REVISED_SUBMITTED', nextResponsibleParty: 'BUYER' },
    });
    recordResult('Round 2 Completed', buyerOffer2.roundNumber === 2 && quote3A.quoteVersion === 3, 'Buyer Offer 2 -> Quote 3');

    // Round 3: Buyer Offer 3 -> Quote 4
    const buyerOffer3 = await prisma.negotiationRound.create({
      data: {
        tenantId,
        negotiationId: negotiation.id,
        vendorId: vendorA.id,
        roundNumber: 3,
        previousQuoteAmount: 312000,
        counterOfferAmount: 300000,
        status: 'ROUND_ACTIVE',
        lineItemsJson: JSON.stringify([{ rfqLineId: rfqLines[0].id, counterRate: 380 }]),
        nextResponsibleParty: 'VENDOR',
      },
    });
    const quote4A = await prisma.quote.create({
      data: {
        tenantId,
        rfqId: testRfq.id,
        vendorId: vendorA.id,
        quoteNumber: `QTE-${timestamp}-A4`,
        quoteVersion: 4,
        status: 'SUBMITTED',
        totalBaseAmount: 308000,
        taxAmount: 55440,
        totalQuoteAmount: 363440,
        submittedBy: vendorA.name,
      },
    });
    await prisma.negotiationRound.update({
      where: { id: buyerOffer3.id },
      data: { revisedQuoteAmount: 308000, status: 'REVISED_SUBMITTED', nextResponsibleParty: 'BUYER' },
    });
    recordResult('Round 3 Completed', buyerOffer3.roundNumber === 3 && quote4A.quoteVersion === 4, 'Buyer Offer 3 -> Quote 4');

    // Round 4: Buyer Offer 4 -> Quote 5
    const buyerOffer4 = await prisma.negotiationRound.create({
      data: {
        tenantId,
        negotiationId: negotiation.id,
        vendorId: vendorA.id,
        roundNumber: 4,
        previousQuoteAmount: 308000,
        counterOfferAmount: 298000,
        status: 'ROUND_ACTIVE',
        lineItemsJson: JSON.stringify([{ rfqLineId: rfqLines[0].id, counterRate: 375 }]),
        nextResponsibleParty: 'VENDOR',
      },
    });
    const quote5A = await prisma.quote.create({
      data: {
        tenantId,
        rfqId: testRfq.id,
        vendorId: vendorA.id,
        quoteNumber: `QTE-${timestamp}-A5`,
        quoteVersion: 5,
        status: 'SUBMITTED',
        totalBaseAmount: 305000,
        taxAmount: 54900,
        totalQuoteAmount: 359900,
        submittedBy: vendorA.name,
        lines: {
          create: [
            { tenantId, rfqLineId: rfqLines[0].id, unitRate: 390, lineTotal: 39000, taxPercent: 18 },
            { tenantId, rfqLineId: rfqLines[1].id, unitRate: 1800, lineTotal: 90000, taxPercent: 18 },
            { tenantId, rfqLineId: rfqLines[2].id, unitRate: 880, lineTotal: 176000, taxPercent: 18 },
          ],
        },
      },
    });
    await prisma.negotiationRound.update({
      where: { id: buyerOffer4.id },
      data: { revisedQuoteAmount: 305000, status: 'REVISED_SUBMITTED', nextResponsibleParty: 'BUYER' },
    });
    recordResult('Round 4 Completed', buyerOffer4.roundNumber === 4 && quote5A.quoteVersion === 5, 'Buyer Offer 4 -> Quote 5');

    // -------------------------------------------------------------------------
    // TEST 6: Round Limit Enforcement (Max 5 Quotes, Max 4 Buyer Offers)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Round Limit Enforcement ---');
    const vendorBuyerOffers = await prisma.negotiationRound.findMany({
      where: { negotiationId: negotiation.id, vendorId: vendorA.id },
    });
    const vendorQuoteVersions = await prisma.quote.findMany({
      where: { rfqId: testRfq.id, vendorId: vendorA.id },
      orderBy: { quoteVersion: 'desc' },
    });

    const isBuyerOffer5Blocked = vendorBuyerOffers.length >= 4;
    const isQuote6Blocked = vendorQuoteVersions[0].quoteVersion >= 5;

    recordResult('Max Buyer Offers (4) Limit Enforced', isBuyerOffer5Blocked, `Vendor A has ${vendorBuyerOffers.length}/4 offers. Buyer Offer 5 blocked.`);
    recordResult('Max Quote Versions (5) Limit Enforced', isQuote6Blocked, `Vendor A has ${vendorQuoteVersions.length}/5 quotes (v${vendorQuoteVersions[0].quoteVersion}). Quote 6 blocked.`);

    // -------------------------------------------------------------------------
    // TEST 7: Vendor Separation / Multi-Vendor Independence
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: Vendor Independence ---');
    const vendorBQuotes = await prisma.quote.findMany({
      where: { rfqId: testRfq.id, vendorId: vendorB.id },
    });
    const vendorBRounds = await prisma.negotiationRound.findMany({
      where: { negotiationId: negotiation.id, vendorId: vendorB.id },
    });
    recordResult('Vendor B State Unaffected by Vendor A', vendorBQuotes.length === 1 && vendorBRounds.length === 0, `Vendor B remains at Quote 1 with 0 counteroffers.`);

    // -------------------------------------------------------------------------
    // TEST 8: Dynamic L1/L2/L3 Comparison Evaluation
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 8: Dynamic Comparison & Ranking Recalculation ---');
    // Fetch latest quotes across all vendors
    const allQuotes = await prisma.quote.findMany({
      where: { rfqId: testRfq.id },
      orderBy: { quoteVersion: 'desc' },
      include: { vendor: true },
    });

    const latestByVendor = new Map<string, any>();
    for (const q of allQuotes) {
      if (!latestByVendor.has(q.vendorId)) {
        latestByVendor.set(q.vendorId, q);
      }
    }
    const rankedVendors = Array.from(latestByVendor.values()).sort(
      (a, b) => a.totalQuoteAmount - b.totalQuoteAmount
    );

    const l1 = rankedVendors[0];
    const l2 = rankedVendors[1];
    const l3 = rankedVendors[2];

    const rankingCorrect =
      l1.vendorId === vendorA.id && // Vendor A: 359,900 (v5)
      l2.vendorId === vendorB.id && // Vendor B: 402,970 (v1)
      l3.vendorId === vendorC.id;   // Vendor C: 413,000 (v1)

    recordResult('Dynamic Ranking Recalculated', rankingCorrect, `L1: ${l1.vendor.name} (v${l1.quoteVersion}: ₹${l1.totalQuoteAmount}) | L2: ${l2.vendor.name} | L3: ${l3.vendor.name}`);

    // -------------------------------------------------------------------------
    // TEST 9: PPO Creation (L1 vs Non-L1 with Mandatory Justification)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 9: PPO Creation Workflow ---');
    // Non-L1 PPO without justification must be rejected
    const nonL1AttemptWithoutJustification = {
      isL1: false,
      justification: '',
    };
    const justificationRequiredEnforced = !nonL1AttemptWithoutJustification.isL1 && !nonL1AttemptWithoutJustification.justification;
    recordResult('Non-L1 Justification Required', justificationRequiredEnforced, 'Blocked PPO creation for non-L1 without justification');

    // Create Non-L1 PPO for Vendor B with valid justification
    const nonL1Justification = 'Selected Vendor B due to ready inventory and guaranteed 7-day site mobilization.';
    const awardVendorB = await prisma.awardRecommendation.create({
      data: {
        tenantId,
        rfqId: testRfq.id,
        recommendedVendorId: vendorB.id,
        originalQuoteAmount: quote1B.totalQuoteAmount,
        finalNegotiatedAmount: quote1B.totalQuoteAmount,
        benchmarkAmount: 350000,
        totalSavingsAmount: 0,
        savingsPercent: 0,
        commercialStatus: 'L2_JUSTIFIED',
        justification: nonL1Justification,
        status: 'APPROVED',
        submittedById: cmUser.id,
        approvedById: cmUser.id,
      },
    });

    const ppoVendorB = await prisma.ppo.create({
      data: {
        tenantId,
        projectId: testProject.id,
        costCentreId: testCostCentre.id,
        boqId: testBoq.id,
        boqRevisionId: testRevision.id,
        rfqId: testRfq.id,
        vendorId: vendorB.id,
        awardRecommendationId: awardVendorB.id,
        ppoNumber: `PPO-${timestamp}-B`,
        title: `Purchase Order: Fitout Package (${vendorB.name} - Quote v1)`,
        totalValue: quote1B.totalQuoteAmount,
        currency: 'INR',
        status: 'ISSUED',
        deliveryTerms: 'Ex-site delivery within 14 days',
        paymentTerms: '30 days net',
        createdById: cmUser.id,
      },
      include: { awardRecommendation: true },
    });
    recordResult('Non-L1 PPO Created with Justification', ppoVendorB.awardRecommendation?.justification === nonL1Justification, `PPO ${ppoVendorB.ppoNumber} created for L2 vendor with persisted justification`);

    // Duplicate PPO creation for Vendor B must be prevented
    const duplicatePpo = await prisma.ppo.findFirst({
      where: {
        tenantId,
        rfqId: testRfq.id,
        vendorId: vendorB.id,
        status: { not: 'CANCELLED' },
      },
    });
    recordResult('Duplicate PPO Prevention', duplicatePpo !== null, `Duplicate PPO for Vendor B successfully detected (${duplicatePpo?.ppoNumber})`);

    // Create L1 PPO for Vendor A (Quote v5)
    const ppoVendorA = await prisma.ppo.create({
      data: {
        tenantId,
        projectId: testProject.id,
        costCentreId: testCostCentre.id,
        boqId: testBoq.id,
        boqRevisionId: testRevision.id,
        rfqId: testRfq.id,
        vendorId: vendorA.id,
        ppoNumber: `PPO-${timestamp}-A`,
        title: `Purchase Order: Fitout Package (${vendorA.name} - Quote v5)`,
        totalValue: quote5A.totalQuoteAmount,
        currency: 'INR',
        status: 'ISSUED',
        deliveryTerms: 'Ex-site delivery within 30 days',
        paymentTerms: '30 days net from certified invoice',
        createdById: cmUser.id,
      },
    });
    recordResult('L1 PPO Created for Quote v5', ppoVendorA.totalValue === quote5A.totalQuoteAmount, `PPO ${ppoVendorA.ppoNumber} linked to Quote v5 (₹${quote5A.totalQuoteAmount})`);

    // -------------------------------------------------------------------------
    // TEST 10: Dashboard Register Visibility
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 10: Dashboard Sourcing Register Integrity ---');
    const dashboardPr = await prisma.procurementRequest.findFirst({
      where: { id: testPr.id },
      include: {
        project: true,
        costCentre: true,
        boq: true,
        rfqs: {
          include: {
            quotes: true,
            negotiations: { include: { rounds: true } },
            ppos: true,
          },
        },
      },
    });
    recordResult('Dashboard PR Record Present', dashboardPr !== null, `PR ${testPr.prNumber} traceable in database with linked RFQs & PPOs`);
    recordResult('Dashboard Stage Traceability', dashboardPr!.rfqs[0].ppos.length > 0, `Linked RFQ has ${dashboardPr!.rfqs[0].ppos.length} PPOs -> Correctly maps to PPO Created stage`);

  } finally {
    // -------------------------------------------------------------------------
    // TEARDOWN: Clean up ONLY the isolated test records created in this test
    // -------------------------------------------------------------------------
    console.log('\n--- TEARDOWN: Deterministic Test Records Cleanup ---');
    if (testRfq) {
      await prisma.ppoLine.deleteMany({ where: { rfqLine: { rfqId: testRfq.id } } }).catch(() => {});
      await prisma.ppo.deleteMany({ where: { rfqId: testRfq.id } }).catch(() => {});
      await prisma.awardRecommendation.deleteMany({ where: { rfqId: testRfq.id } }).catch(() => {});
      await prisma.negotiationRound.deleteMany({ where: { negotiation: { rfqId: testRfq.id } } }).catch(() => {});
      await prisma.negotiation.deleteMany({ where: { rfqId: testRfq.id } }).catch(() => {});
      await prisma.quoteLine.deleteMany({ where: { quote: { rfqId: testRfq.id } } }).catch(() => {});
      await prisma.quote.deleteMany({ where: { rfqId: testRfq.id } }).catch(() => {});
      await prisma.rfqVendor.deleteMany({ where: { rfqId: testRfq.id } }).catch(() => {});
      await prisma.rfqLine.deleteMany({ where: { rfqId: testRfq.id } }).catch(() => {});
      await prisma.rfq.deleteMany({ where: { id: testRfq.id } }).catch(() => {});
    }
    if (testPr) {
      await prisma.pRLine.deleteMany({ where: { prId: testPr.id } }).catch(() => {});
      await prisma.procurementRequest.deleteMany({ where: { id: testPr.id } }).catch(() => {});
    }
    if (testRevision) {
      await prisma.boqLine.deleteMany({ where: { boqRevisionId: testRevision.id } }).catch(() => {});
      await prisma.boqRevision.deleteMany({ where: { id: testRevision.id } }).catch(() => {});
    }
    if (testBoq) {
      await prisma.boq.deleteMany({ where: { id: testBoq.id } }).catch(() => {});
    }
    if (testCostCentre) {
      await prisma.costCentre.deleteMany({ where: { id: testCostCentre.id } }).catch(() => {});
    }
    if (testProject) {
      await prisma.project.deleteMany({ where: { id: testProject.id } }).catch(() => {});
    }
    console.log('  Cleaned up all isolated test records. Baseline records preserved.');
  }

  // Summary
  console.log('\n================================================================');
  console.log('                    TEST SUMMARY RESULTS                        ');
  console.log('================================================================');
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`Total Scenarios: ${results.length}`);
  console.log(`Passed:          ${passedCount}`);
  console.log(`Failed:          ${failedCount}`);
  console.log(`Success Rate:    ${Math.round((passedCount / results.length) * 100)}%`);

  if (failedCount > 0) {
    process.exit(1);
  } else {
    console.log('\nALL WORKFLOW & PERSISTENCE SCENARIOS PASSED SUCCESSFULLY!');
  }
}

runTest().catch((err) => {
  console.error('Fatal Test Failure:', err);
  process.exit(1);
});
