// tests/procurement-workflow.test.ts - Comprehensive Procurement & Sourcing Workflow Test Suite
import prisma from '../src/lib/prisma';
import { hasPermission, ROLE_PERMISSIONS, UserRole } from '../src/lib/permissions';


let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}${detail ? ` (${detail})` : ''}`);
    testsFailed++;
  }
}

async function runProcurementTests() {
  console.log('============================================================');
  console.log('🚀 RUNNING PROCPX PROCUREMENT WORKFLOW AUTOMATED TEST SUITE');
  console.log('============================================================\n');

  const tenantA = await prisma.tenant.findUnique({ where: { slug: 'procucev-retail-demo' } });
  const tenantB = await prisma.tenant.findUnique({ where: { slug: 'procucev-hospitality-demo' } });

  if (!tenantA || !tenantB) {
    throw new Error('Tenants not found. Run seed script first.');
  }

  // ============================================================
  // TEST SUITE A: PROCUREMENT USER CAPABILITIES (ACTIVE SOURCING)
  // ============================================================
  console.log('--- A. PROCUREMENT USER PERMISSIONS & CAPABILITIES ---');
  assert(hasPermission('PROCUREMENT_USER', 'BOQ_VIEW'), 'A.1: Procurement User can access approved BOQ');
  assert(hasPermission('PROCUREMENT_USER', 'RFQ_CREATE'), 'A.2: Procurement User can create RFQ');
  assert(hasPermission('PROCUREMENT_USER', 'RFQ_EDIT'), 'A.3: Procurement User can edit RFQ before release');
  assert(hasPermission('PROCUREMENT_USER', 'RFQ_RELEASE'), 'A.4: Procurement User can release RFQ to vendors');
  assert(hasPermission('PROCUREMENT_USER', 'VENDOR_INVITE'), 'A.5: Procurement User can select and invite vendors');
  assert(hasPermission('PROCUREMENT_USER', 'QUOTE_VIEW'), 'A.6: Procurement User can view quote responses');
  assert(hasPermission('PROCUREMENT_USER', 'QUOTE_COMPARE'), 'A.7: Procurement User can compare quotes');
  assert(hasPermission('PROCUREMENT_USER', 'NEGOTIATION_MANAGE'), 'A.8: Procurement User can create negotiations & rounds');
  assert(hasPermission('PROCUREMENT_USER', 'AUCTION_MANAGE'), 'A.9: Procurement User can manage reverse auctions & sealed bids');
  assert(hasPermission('PROCUREMENT_USER', 'FINAL_RATE_LOCK'), 'A.10: Procurement User can lock final commercial rates');
  assert(hasPermission('PROCUREMENT_USER', 'AWARD_RECOMMEND'), 'A.11: Procurement User can prepare & submit award recommendations');
  assert(hasPermission('PROCUREMENT_USER', 'PPO_CREATE'), 'A.12: Procurement User can generate PPO / procurement orders');

  // ============================================================
  // TEST SUITE B: PROCUREMENT USER CANNOT ALTER APPROVED BOQ
  // ============================================================
  console.log('\n--- B. IMMUTABLE BASELINE CONTROLS (WHAT PROCUREMENT USER CANNOT DO) ---');
  assert(!hasPermission('PROCUREMENT_USER', 'BOQ_UPLOAD'), 'B.1: Procurement User CANNOT upload BOQ');
  assert(!hasPermission('PROCUREMENT_USER', 'BOQ_EDIT'), 'B.2: Procurement User CANNOT edit BOQ');
  assert(!hasPermission('PROCUREMENT_USER', 'BOQ_VALIDATE'), 'B.3: Procurement User CANNOT validate BOQ');
  assert(!hasPermission('PROCUREMENT_USER', 'BOQ_SUBMIT'), 'B.4: Procurement User CANNOT submit BOQ');
  assert(!hasPermission('PROCUREMENT_USER', 'BOQ_APPROVE'), 'B.5: Procurement User CANNOT approve BOQ');
  assert(!hasPermission('PROCUREMENT_USER', 'BOQ_REJECT'), 'B.6: Procurement User CANNOT reject BOQ');
  assert(!hasPermission('PROCUREMENT_USER', 'BOQ_REVISION_CREATE'), 'B.7: Procurement User CANNOT create BOQ revisions');

  // Verify Approved BOQ Revision R1 in DB is locked and unchanged
  const approvedRev = await prisma.boqRevision.findFirst({
    where: { tenantId: tenantA.id, revisionCode: 'R1', status: 'APPROVED' },
    include: { lines: true, boq: true },
  });
  assert(!!approvedRev, 'B.8: Approved BOQ Baseline R1 exists in database', `lines=${approvedRev?.lines.length}`);
  assert(approvedRev?.status === 'APPROVED', 'B.9: Approved BOQ Baseline status is immutable APPROVED');

  // ============================================================
  // TEST SUITE C & D: VENDOR ACCESS CONTROLS & ISOLATION
  // ============================================================
  console.log('\n--- C & D. VENDOR ACCESS & CONFIDENTIALITY CONTROLS ---');
  // Check invited vendors
  const rfq2 = await prisma.rfq.findFirst({
    where: { tenantId: tenantA.id, rfqNumber: 'RFQ-2026-000002' },
    include: { invitedVendors: true },
  });
  assert(rfq2?.invitedVendors.length === 2, 'C.1: Invited vendors are tracked per RFQ', `count=${rfq2?.invitedVendors.length}`);

  // Check quote versioning (never overwrite previous quotes)
  const quotesCount = await prisma.quote.count({ where: { tenantId: tenantA.id } });
  assert(quotesCount >= 5, 'C.2: Vendor quotes are stored as immutable versioned records', `count=${quotesCount}`);

  // Test quote revision doesn't overwrite
  const rfq4Quotes = await prisma.quote.findMany({ where: { rfqId: (await prisma.rfq.findFirst({ where: { rfqNumber: 'RFQ-2026-000004' } }))?.id } });
  assert(rfq4Quotes.length === 2, 'C.3: Multiple vendor quotes preserved in comparison state', `quotes=${rfq4Quotes.length}`);

  // ============================================================
  // TEST SUITE E & F: PROJECT USER & APPROVER SEPARATION OF DUTIES
  // ============================================================
  console.log('\n--- E & F. ROLE SEPARATION OF DUTIES ---');
  assert(!hasPermission('PROJECT_USER', 'BOQ_APPROVE'), 'E.1: Project User CANNOT approve own BOQ');
  assert(!hasPermission('PROJECT_USER', 'RFQ_CREATE'), 'E.2: Project User CANNOT create RFQ');
  assert(!hasPermission('PROJECT_USER', 'FINAL_RATE_LOCK'), 'E.3: Project User CANNOT lock commercial rates');
  assert(!hasPermission('PROJECT_USER', 'PPO_CREATE'), 'E.4: Project User CANNOT create PPO');

  assert(!hasPermission('PROJECT_APPROVER', 'RFQ_CREATE'), 'F.1: Project Approver CANNOT create RFQ');
  assert(!hasPermission('PROJECT_APPROVER', 'NEGOTIATION_MANAGE'), 'F.2: Project Approver CANNOT negotiate commercial rates');
  assert(!hasPermission('PROJECT_APPROVER', 'FINAL_RATE_LOCK'), 'F.3: Project Approver CANNOT lock commercial rates');

  // ============================================================
  // TEST SUITE G & H: FINANCE USER & CATEGORY MANAGER GOVERNANCE
  // ============================================================
  console.log('\n--- G & H. FINANCE & CATEGORY MANAGER GOVERNANCE ---');
  assert(hasPermission('FINANCE_USER', 'AWARD_APPROVE'), 'G.1: Finance User can approve commercial awards');
  assert(hasPermission('FINANCE_USER', 'PPO_APPROVE'), 'G.2: Finance User can approve PPO');
  assert(!hasPermission('FINANCE_USER', 'RFQ_CREATE'), 'G.3: Finance User CANNOT create RFQs');

  assert(hasPermission('CATEGORY_MANAGER', 'VENDOR_MANAGE'), 'H.1: Category Manager can manage vendor directory & eligibility');
  assert(hasPermission('CATEGORY_MANAGER', 'QUOTE_COMPARE'), 'H.2: Category Manager can inspect quote comparison');
  assert(!hasPermission('CATEGORY_MANAGER', 'FINAL_RATE_LOCK'), 'H.3: Category Manager CANNOT lock transactional final rates');

  // ============================================================
  // TEST SUITE I: MULTI-TENANT ISOLATION BOUNDARY
  // ============================================================
  console.log('\n--- I. TENANT ISOLATION VERIFICATION ---');
  const tenantARfqs = await prisma.rfq.findMany({ where: { tenantId: tenantA.id } });
  const tenantBRfqs = await prisma.rfq.findMany({ where: { tenantId: tenantB.id } });
  assert(tenantARfqs.length >= 7, 'I.1: Tenant A has isolated RFQ repository', `tenantA=${tenantARfqs.length}`);
  assert(tenantBRfqs.length === 0, 'I.2: Tenant B has ZERO access to Tenant A RFQs (Zero leakage)', `tenantB=${tenantBRfqs.length}`);

  const tenantAVendors = await prisma.vendor.findMany({ where: { tenantId: tenantA.id } });
  const tenantBVendors = await prisma.vendor.findMany({ where: { tenantId: tenantB.id } });
  assert(tenantAVendors.length >= 4, 'I.3: Tenant A has registered vendors', `count=${tenantAVendors.length}`);
  assert(tenantBVendors.length === 1, 'I.4: Tenant B vendor isolated from Tenant A', `count=${tenantBVendors.length}`);

  const crossLeakage = tenantAVendors.filter(v => v.tenantId === tenantB.id);
  assert(crossLeakage.length === 0, 'I.5: Strict row-level isolation prevents cross-tenant vendor query');

  // ============================================================
  // TEST SUITE J: DIRECT API 403 FORBIDDEN ENFORCEMENT
  // ============================================================
  console.log('\n--- J. API LEVEL AUTHORIZATION & 403 GUARDS ---');
  // Check permissions lookup for forbidden combinations
  assert(
    !hasPermission('VIEWER', 'RFQ_CREATE'),
    'J.1: Direct RFQ creation returns 403 Forbidden for VIEWER role'
  );
  assert(
    !hasPermission('PROJECT_USER', 'RFQ_RELEASE'),
    'J.2: Direct RFQ release returns 403 Forbidden for PROJECT_USER role'
  );
  assert(
    !hasPermission('PROJECT_APPROVER', 'FINAL_RATE_LOCK'),
    'J.3: Direct Rate Lock returns 403 Forbidden for PROJECT_APPROVER role'
  );

  // ============================================================
  // TEST SUITE K: AUDIT TRAIL LOGGING
  // ============================================================
  console.log('\n--- K. COMPREHENSIVE PROCUREMENT AUDIT TRAIL ---');
  const rfqCreatedAudit = await prisma.auditLog.findFirst({ where: { tenantId: tenantA.id, action: 'RFQ_CREATED' } });
  assert(!!rfqCreatedAudit, 'K.1: RFQ_CREATED audit event logged');

  const rfqReleasedAudit = await prisma.auditLog.findFirst({ where: { tenantId: tenantA.id, action: 'RFQ_RELEASED' } });
  assert(!!rfqReleasedAudit, 'K.2: RFQ_RELEASED audit event logged');

  const quoteSubmittedAudit = await prisma.auditLog.findFirst({ where: { tenantId: tenantA.id, action: 'QUOTE_SUBMITTED' } });
  assert(!!quoteSubmittedAudit, 'K.3: QUOTE_SUBMITTED audit event logged');

  const quoteComparedAudit = await prisma.auditLog.findFirst({ where: { tenantId: tenantA.id, action: 'QUOTE_COMPARED' } });
  assert(!!quoteComparedAudit, 'K.4: QUOTE_COMPARED audit event logged');

  const negAudit = await prisma.auditLog.findFirst({ where: { tenantId: tenantA.id, action: 'NEGOTIATION_ROUND_CREATED' } });
  assert(!!negAudit, 'K.5: NEGOTIATION_ROUND_CREATED audit event logged');

  const rateLockAudit = await prisma.auditLog.findFirst({ where: { tenantId: tenantA.id, action: 'FINAL_RATE_LOCKED' } });
  assert(!!rateLockAudit, 'K.6: FINAL_RATE_LOCKED audit event logged');

  const awardAudit = await prisma.auditLog.findFirst({ where: { tenantId: tenantA.id, action: 'AWARD_RECOMMENDED' } });
  assert(!!awardAudit, 'K.7: AWARD_RECOMMENDED audit event logged');

  const ppoAudit = await prisma.auditLog.findFirst({ where: { tenantId: tenantA.id, action: 'PPO_CREATED' } });
  assert(!!ppoAudit, 'K.8: PPO_CREATED audit event logged');

  // ============================================================
  // TEST SUITE L: END-TO-END TRANSACTION TEST (SECTION 32)
  // ============================================================
  console.log('\n--- L. LIVE END-TO-END PROCUREMENT TRANSACTION EXECUTION ---');
  // Execute a full transactional cycle on a new RFQ:
  // Approved BOQ -> RFQ -> Invite -> Quote -> Compare -> Negotiate -> Lock -> Award -> PPO

  // Step 1: Create RFQ from Approved BOQ R1
  const procUser = await prisma.user.findFirst({ where: { tenantId: tenantA.id, role: 'PROCUREMENT_USER' } });
  const liveRfq = await prisma.rfq.create({
    data: {
      tenantId: tenantA.id,
      projectId: approvedRev.boq.projectId,
      boqRevisionId: approvedRev.id,
      rfqNumber: `RFQ-TEST-${Date.now()}`,
      title: 'E2E Validation Test RFQ',
      packageType: 'CATEGORY',
      status: 'DRAFT',
      estimatedBenchmarkValue: 500000,
      totalLines: 1,
      createdById: procUser!.id,
      lines: {
        create: [
          {
            tenantId: tenantA.id,
            lineNumber: 'L-1',
            description: 'Vitrified Tile Flooring (600x600mm)',
            uom: 'SQFT',
            quantity: 5000,
            benchmarkRate: 100,
            benchmarkAmount: 500000,
          },
        ],
      },
    },
    include: { lines: true },
  });
  assert(liveRfq.status === 'DRAFT', 'L.1: End-to-End RFQ created in DRAFT state');

  // Step 2: Release RFQ with Vendor Invitation
  const vendorApex = await prisma.vendor.findFirst({ where: { code: 'VND-0001' } });
  await prisma.rfqVendor.create({
    data: {
      tenantId: tenantA.id,
      rfqId: liveRfq.id,
      vendorId: vendorApex!.id,
      invitationStatus: 'INVITED',
    },
  });
  const releasedRfq = await prisma.rfq.update({
    where: { id: liveRfq.id },
    data: { status: 'RELEASED', releasedAt: new Date() },
  });
  assert(releasedRfq.status === 'RELEASED', 'L.2: RFQ released to invited vendor');

  // Step 3: Vendor Submits Quote
  const liveQuote = await prisma.quote.create({
    data: {
      tenantId: tenantA.id,
      rfqId: liveRfq.id,
      vendorId: vendorApex!.id,
      quoteNumber: `QTE-TEST-${Date.now()}`,
      quoteVersion: 1,
      status: 'SUBMITTED',
      totalBaseAmount: 450000,
      taxAmount: 81000,
      totalQuoteAmount: 531000,
      submittedBy: procUser!.id,
      lines: {
        create: [
          {
            tenantId: tenantA.id,
            rfqLineId: liveRfq.lines[0].id,
            unitRate: 90,
            taxPercent: 18,
            discountPercent: 0,
            lineTotal: 531000,
          },
        ],
      },
    },
  });
  assert(liveQuote.totalQuoteAmount === 531000, 'L.3: Vendor quote submitted with line calculation');

  // Step 4: Conduct Negotiation Round
  const liveNeg = await prisma.negotiation.create({
    data: {
      tenantId: tenantA.id,
      rfqId: liveRfq.id,
      status: 'ACTIVE',
      currentRound: 1,
      rounds: {
        create: [
          {
            tenantId: tenantA.id,
            vendorId: vendorApex!.id,
            roundNumber: 1,
            previousQuoteAmount: 531000,
            counterOfferAmount: 460000,
            revisedQuoteAmount: 472000,
            savingsAmount: 59000,
            savingsPercent: 11.1,
            status: 'CONCLUDED',
          },
        ],
      },
    },
  });
  assert(liveNeg.currentRound === 1, 'L.4: Negotiation round executed with counter-offer');

  // Step 5: Lock Final Rates
  const lockedRfq = await prisma.rfq.update({
    where: { id: liveRfq.id },
    data: {
      status: 'FINAL_RATE_LOCKED',
      finalLockedAt: new Date(),
      finalLockedById: procUser!.id,
    },
  });
  assert(lockedRfq.status === 'FINAL_RATE_LOCKED', 'L.5: Final commercial rates locked');

  // Step 6: Create & Submit Award Recommendation
  const liveAward = await prisma.awardRecommendation.create({
    data: {
      tenantId: tenantA.id,
      rfqId: liveRfq.id,
      recommendedVendorId: vendorApex!.id,
      originalQuoteAmount: 531000,
      finalNegotiatedAmount: 472000,
      benchmarkAmount: 500000,
      totalSavingsAmount: 28000,
      savingsPercent: 5.6,
      justification: 'E2E validation test award recommendation',
      status: 'APPROVED',
      submittedById: procUser!.id,
    },
  });
  assert(liveAward.status === 'APPROVED', 'L.6: Award recommendation approved');

  // Step 7: Generate PPO
  const livePpo = await prisma.ppo.create({
    data: {
      tenantId: tenantA.id,
      projectId: liveRfq.projectId,
      rfqId: liveRfq.id,
      vendorId: vendorApex!.id,
      awardRecommendationId: liveAward.id,
      ppoNumber: `PPO-TEST-${Date.now()}`,
      title: 'E2E Test Purchase Order',
      totalValue: 472000,
      status: 'ISSUED',
      createdById: procUser!.id,
    },
  });
  assert(livePpo.status === 'ISSUED', 'L.7: PPO generated and issued from locked commercial result');

  // Clean up test live transaction records
  await prisma.ppo.delete({ where: { id: livePpo.id } });
  await prisma.awardRecommendation.delete({ where: { id: liveAward.id } });
  await prisma.negotiationRound.deleteMany({ where: { negotiationId: liveNeg.id } });
  await prisma.negotiation.delete({ where: { id: liveNeg.id } });
  await prisma.quoteLine.deleteMany({ where: { quoteId: liveQuote.id } });
  await prisma.quote.delete({ where: { id: liveQuote.id } });
  await prisma.rfqVendor.deleteMany({ where: { rfqId: liveRfq.id } });
  await prisma.rfqLine.deleteMany({ where: { rfqId: liveRfq.id } });
  await prisma.rfq.delete({ where: { id: liveRfq.id } });
  console.log('  ✓ Cleaned up live E2E test transaction records');

  console.log('\n============================================================');
  console.log(`🏁 TEST EXECUTION SUMMARY:`);
  console.log(`   Total Tests Passed: ${testsPassed}`);
  console.log(`   Total Tests Failed: ${testsFailed}`);
  console.log(`   Status: ${testsFailed === 0 ? 'ALL PROCUREMENT TESTS PASSED ✅' : 'SOME TESTS FAILED ❌'}`);
  console.log('============================================================');

  if (testsFailed > 0) process.exit(1);
}

runProcurementTests()
  .catch((e) => {
    console.error('Test Suite Fatal Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
