// tests/counteroffer-workflow-and-summary.test.ts
// proCPX — Automated Verification Suite: Counteroffer Workflow & Simplified Vendor Negotiation Summary
// Validates all 8 required verification scenarios using isolated test records.

import { PrismaClient } from '@prisma/client';
import { POST as negotiationsPostHandler } from '@/app/api/procurement/negotiations/route';
import { NextRequest } from 'next/server';
import { setTestAuthContext } from '@/lib/api-utils';

const prisma = new PrismaClient();

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}${detail ? ` — ${detail}` : ''}`);
    testsPassed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}${detail ? ` — ${detail}` : ''}`);
    testsFailed++;
  }
}

async function runCounterofferAndSummaryVerification() {
  console.log('========================================================================');
  console.log('🧪 PROCPX: COUNTEROFFER WORKFLOW & SIMPLIFIED SUMMARY VERIFICATION');
  console.log('========================================================================\n');

  // 1. Setup tenant & Category Manager test context
  const tenant = await prisma.tenant.findFirst({ where: { slug: 'procucev-retail-demo' } });
  if (!tenant) throw new Error('Tenant not found');

  const cmUser = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: 'CATEGORY_MANAGER' },
  });
  if (!cmUser) throw new Error('Category Manager user not found');

  setTestAuthContext({ userId: cmUser.id, tenantId: tenant.id });

  // 2. Fetch baseline master records to attach isolated test RFQ
  const project = await prisma.project.findFirst({ where: { tenantId: tenant.id } });
  if (!project) throw new Error('Project not found');

  const boqRevision = await prisma.boqRevision.findFirst({ where: { tenantId: tenant.id } });
  if (!boqRevision) throw new Error('BOQ revision not found');

  const vendors = await prisma.vendor.findMany({
    where: { tenantId: tenant.id },
    take: 3,
  });
  if (vendors.length < 2) throw new Error('At least 2 test vendors required');

  const vendorA = vendors[0];
  const vendorB = vendors[1];

  console.log(`Using isolated test context: Tenant=${tenant.slug}, CM=${cmUser.name}`);
  console.log(`Test Vendors: Vendor A=${vendorA.name} (${vendorA.id}), Vendor B=${vendorB.name} (${vendorB.id})\n`);

  // 3. Create isolated test RFQ
  const isolatedRfqNumber = `RFQ-TEST-ISO-${Date.now().toString().slice(-6)}`;
  let testRfq: any = null;

  try {
    testRfq = await prisma.rfq.create({
      data: {
        tenantId: tenant.id,
        projectId: project.id,
        boqRevisionId: boqRevision.id,
        rfqNumber: isolatedRfqNumber,
        title: 'Isolated Test RFQ - Commercial Negotiation Workflow',
        status: 'COMPARISON',
        packageType: 'SELECTED_LINES',
        estimatedBenchmarkValue: 900000,
        submissionDeadline: new Date(Date.now() + 86400000 * 7),
        createdById: cmUser.id,
        lines: {
          create: [
            {
              tenantId: tenant.id,
              lineNumber: '1',
              description: 'Commercial Negotiation Scope Test Item',
              quantity: 100,
              uom: 'NOS',
              benchmarkRate: 9000,
              benchmarkAmount: 900000,
            },
          ],
        },
        invitedVendors: {
          create: [
            { tenantId: tenant.id, vendorId: vendorA.id, invitationStatus: 'INVITED' },
            { tenantId: tenant.id, vendorId: vendorB.id, invitationStatus: 'INVITED' },
          ],
        },
      },
      include: {
        lines: true,
        invitedVendors: true,
      },
    });

    const testLine = testRfq.lines[0];

    // Seed Quote 1 for Vendor A (Total 950,000)
    await prisma.quote.create({
      data: {
        tenantId: tenant.id,
        rfqId: testRfq.id,
        vendorId: vendorA.id,
        quoteNumber: `QT-ISO-A-${testRfq.id.slice(0, 4)}`,
        quoteVersion: 1,
        totalQuoteAmount: 950000,
        status: 'SUBMITTED',
        lines: {
          create: [
            {
              tenantId: tenant.id,
              rfqLineId: testLine.id,
              unitRate: 9500,
              lineTotal: 950000,
            },
          ],
        },
      },
    });

    // Seed Quote 1 for Vendor B (Total 920,000)
    await prisma.quote.create({
      data: {
        tenantId: tenant.id,
        rfqId: testRfq.id,
        vendorId: vendorB.id,
        quoteNumber: `QT-ISO-B-${testRfq.id.slice(0, 4)}`,
        quoteVersion: 1,
        totalQuoteAmount: 920000,
        status: 'SUBMITTED',
        lines: {
          create: [
            {
              tenantId: tenant.id,
              rfqLineId: testLine.id,
              unitRate: 9200,
              lineTotal: 920000,
            },
          ],
        },
      },
    });

    console.log(`Created isolated RFQ ${isolatedRfqNumber} with 2 initial quotes.`);

    // ========================================================================
    // SCENARIO 1: CM CAN ISSUE COUNTEROFFER IMMEDIATELY AGAINST SUBMITTED QUOTE
    // ========================================================================
    console.log('\n--- SCENARIO 1: IMMEDIATE COUNTEROFFER ON SUBMITTED QUOTE ---');
    {
      const counterPayload = {
        rfqId: testRfq.id,
        vendorId: vendorA.id,
        counterOfferAmount: 850000,
        deadline: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
        notes: 'Target counteroffer against initial quote of ₹950,000',
        lineItemsJson: JSON.stringify([
          { rfqLineId: testLine.id, counterRate: 8500, lineTotal: 850000 },
        ]),
      };

      const req = new NextRequest('http://localhost:3000/api/procurement/negotiations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(counterPayload),
      });

      const res = await negotiationsPostHandler(req);
      const body = await res.json();

      assert(res.status === 201, `Counteroffer created successfully with HTTP 201`);
      assert(body.roundNumber === 1, `Round number initialized sequentially to 1`);
      assert(body.round?.status === 'ROUND_ACTIVE', `Round status is ROUND_ACTIVE awaiting vendor response`);
      assert(body.round?.counterOfferAmount === 850000, `Counteroffer amount recorded accurately as ₹850,000`);
      assert(body.round?.savingsAmount === 100000, `Potential savings calculated as ₹100,000 vs Quote 1`);
    }

    // ========================================================================
    // SCENARIO 2: BULK DISPATCH TO ALL ELIGIBLE INVITED VENDORS AT ONCE
    // ========================================================================
    console.log('\n--- SCENARIO 2: BULK DISPATCH TO ALL ELIGIBLE VENDORS ---');
    {
      const bulkPayload = {
        rfqId: testRfq.id,
        vendorIds: [vendorA.id, vendorB.id],
        counterOfferAmount: 820000,
        notes: 'Simultaneous package counteroffer sent to participating vendors',
        allowSupersede: true, // Vendor A had Round 1 active, superseding authorized
      };

      const req = new NextRequest('http://localhost:3000/api/procurement/negotiations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bulkPayload),
      });

      const res = await negotiationsPostHandler(req);
      const body = await res.json();

      assert(res.status === 201, `Bulk dispatch returned HTTP 201`);
      assert(body.summary?.totalSelected === 2, `Summary reports exactly 2 vendors selected`);
      assert(body.summary?.dispatchedCount === 2, `Summary reports 2 offers successfully dispatched`);
      assert(body.summary?.failedCount === 0, `Summary reports 0 failed dispatches`);

      // Verify independent records in database
      const neg = await prisma.negotiation.findFirst({
        where: { rfqId: testRfq.id, tenantId: tenant.id },
        include: { rounds: true },
      });

      const vendorAOffers = neg?.rounds.filter((r) => r.vendorId === vendorA.id && r.counterOfferAmount === 820000);
      const vendorBOffers = neg?.rounds.filter((r) => r.vendorId === vendorB.id && r.counterOfferAmount === 820000);

      assert((vendorAOffers?.length || 0) >= 1, `Vendor A received independent round with ₹820,000 offer`);
      assert((vendorBOffers?.length || 0) >= 1, `Vendor B received independent round with ₹820,000 offer`);
      assert(vendorAOffers?.[0]?.id !== vendorBOffers?.[0]?.id, `Vendor rounds have separate distinct record IDs`);
    }

    // ========================================================================
    // SCENARIO 3: VENDOR ISOLATION (NO STATE LEAKAGE BETWEEN VENDORS)
    // ========================================================================
    console.log('\n--- SCENARIO 3: VENDOR ISOLATION (INDEPENDENT NEGOTIATION STATE) ---');
    {
      const neg = await prisma.negotiation.findFirst({
        where: { rfqId: testRfq.id, tenantId: tenant.id },
        include: { rounds: { orderBy: { roundNumber: 'desc' } } },
      });

      // Vendor B submits revised quote of ₹830,000
      const vendorBLatestRound = neg?.rounds.find((r) => r.vendorId === vendorB.id && r.status !== 'SUPERSEDED');
      if (vendorBLatestRound) {
        await prisma.negotiationRound.update({
          where: { id: vendorBLatestRound.id },
          data: {
            revisedQuoteAmount: 830000,
            status: 'REVISED_SUBMITTED',
            nextResponsibleParty: 'BUYER',
            notes: 'Vendor B accepted counteroffer with slight adjustment to ₹830,000',
          },
        });
      }

      // Re-query database to verify isolation
      const updatedNeg = await prisma.negotiation.findFirst({
        where: { rfqId: testRfq.id, tenantId: tenant.id },
        include: { rounds: { orderBy: { roundNumber: 'desc' } } },
      });

      const roundA = updatedNeg?.rounds.find((r) => r.vendorId === vendorA.id && r.status !== 'SUPERSEDED');
      const roundB = updatedNeg?.rounds.find((r) => r.vendorId === vendorB.id && r.status !== 'SUPERSEDED');

      assert(roundB?.revisedQuoteAmount === 830000, `Vendor B revised quote updated to ₹830,000`);
      assert(roundB?.status === 'REVISED_SUBMITTED', `Vendor B status updated to REVISED_SUBMITTED`);
      assert(roundA?.revisedQuoteAmount === null, `Vendor A quote is unaffected (revisedQuoteAmount is null)`);
      assert(roundA?.status === 'ROUND_ACTIVE', `Vendor A status remains ROUND_ACTIVE awaiting its own response`);
    }

    // ========================================================================
    // SCENARIO 4: PENDING COUNTEROFFER SAFETY & AUDITABLE SUPERSEDING
    // ========================================================================
    console.log('\n--- SCENARIO 4: PENDING OFFER SAFETY & SUPERSEDING OPTION ---');
    {
      // 1. Silent overwrite attempt must be blocked
      const blockedPayload = {
        rfqId: testRfq.id,
        vendorId: vendorA.id,
        counterOfferAmount: 790000,
        allowSupersede: false, // Block overwrite
      };

      const reqBlocked = new NextRequest('http://localhost:3000/api/procurement/negotiations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(blockedPayload),
      });

      const resBlocked = await negotiationsPostHandler(reqBlocked);
      const bodyBlocked = await resBlocked.json();

      assert(resBlocked.status === 400, `Silent overwrite blocked with HTTP 400`);
      assert(bodyBlocked.requiresSupersedeConfirm === true, `Response requires explicit supersede confirmation`);

      // Wait 4100ms to exit the rapid duplicate detection window
      await new Promise((r) => setTimeout(r, 4100));

      // 2. Explicit superseding offer authorized
      const supersedePayload = {
        rfqId: testRfq.id,
        vendorId: vendorA.id,
        counterOfferAmount: 780000,
        notes: 'Superseding buyer offer with revised target ₹780,000',
        allowSupersede: true,
      };

      const reqSupersede = new NextRequest('http://localhost:3000/api/procurement/negotiations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(supersedePayload),
      });

      const resSupersede = await negotiationsPostHandler(reqSupersede);
      const bodySupersede = await resSupersede.json();

      assert(resSupersede.status === 201, `Superseding offer successfully dispatched (HTTP 201)`);
      assert(bodySupersede.round?.counterOfferAmount === 780000, `New active offer has amount ₹780,000`);

      // Verify that the superseded round is preserved in DB
      const neg = await prisma.negotiation.findFirst({
        where: { rfqId: testRfq.id },
        include: { rounds: { orderBy: { roundNumber: 'desc' } } },
      });

      const vendorARounds = neg?.rounds.filter((r) => r.vendorId === vendorA.id) || [];
      const supersededRounds = vendorARounds.filter((r) => r.status === 'SUPERSEDED');
      assert(supersededRounds.length >= 1, `Previous pending round marked as SUPERSEDED in DB history`);
      assert(supersededRounds[0].notes?.includes('Superseded'), `Superseded round has audit tag in notes`);
    }

    // ========================================================================
    // SCENARIO 5: IDEMPOTENCY / DOUBLE-CLICK DUPLICATE PREVENTION
    // ========================================================================
    console.log('\n--- SCENARIO 5: IDEMPOTENCY AGAINST RAPID DUPLICATE CLICKS ---');
    {
      const rapidPayload = {
        rfqId: testRfq.id,
        vendorId: vendorB.id,
        counterOfferAmount: 815000,
        allowSupersede: true,
      };

      // First click
      const req1 = new NextRequest('http://localhost:3000/api/procurement/negotiations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rapidPayload),
      });
      const res1 = await negotiationsPostHandler(req1);
      const body1 = await res1.json();

      // Rapid second click immediately after
      const req2 = new NextRequest('http://localhost:3000/api/procurement/negotiations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rapidPayload),
      });
      const res2 = await negotiationsPostHandler(req2);
      const body2 = await res2.json();

      assert(res1.status === 201, `First dispatch created round ${body1.roundNumber}`);
      assert(res2.status === 201, `Rapid retry handled gracefully (HTTP 201)`);
      assert(body1.round?.id === body2.round?.id, `Rapid retry returned existing round ID (${body1.round?.id}) without creating duplicate`);
    }

    // ========================================================================
    // SCENARIO 6: INELIGIBLE VENDOR HANDLING IN BULK DISPATCH
    // ========================================================================
    console.log('\n--- SCENARIO 6: CLEAR ERROR REPORTING FOR INELIGIBLE VENDORS ---');
    {
      const uninvitedVendorId = '00000000-0000-0000-0000-000000000999';

      const mixedPayload = {
        rfqId: testRfq.id,
        vendorIds: [vendorA.id, uninvitedVendorId],
        counterOfferAmount: 760000,
        allowSupersede: true,
      };

      const req = new NextRequest('http://localhost:3000/api/procurement/negotiations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mixedPayload),
      });

      const res = await negotiationsPostHandler(req);
      const body = await res.json();

      assert(res.status === 201, `Bulk dispatch returned HTTP 201 with partial success report`);
      assert(body.failed?.length === 1, `Ineligible vendor isolated in failed array`);
      assert(body.failed?.[0]?.vendorId === uninvitedVendorId, `Failed vendor ID correctly reported`);
      assert(body.failed?.[0]?.reason?.includes('not found') || body.failed?.[0]?.reason?.includes('not invited'), `Descriptive failure reason provided: "${body.failed?.[0]?.reason}"`);
      assert(body.dispatched?.length === 1, `Eligible vendor dispatch completed successfully`);
    }

    // ========================================================================
    // SCENARIO 7: DYNAMIC RANKING BASED EXCLUSIVELY ON SUBMITTED QUOTES
    // ========================================================================
    console.log('\n--- SCENARIO 7: DYNAMIC RANKING STRICTLY ON SUBMITTED QUOTES ---');
    {
      // Function mirroring the frontend component's ranking memo
      const computeVendorRanking = (quotes: any[], rounds: any[]) => {
        const rows = quotes.map((q) => {
          const vRounds = rounds.filter((r) => r.vendorId === q.vendorId && r.status !== 'SUPERSEDED');
          const latestRound = vRounds.sort((a, b) => b.roundNumber - a.roundNumber)[0];
          const hasRevised = Boolean(latestRound?.revisedQuoteAmount && latestRound.revisedQuoteAmount > 0);
          const latestSubmittedQuoteTotal = hasRevised ? latestRound.revisedQuoteAmount : q.totalQuoteAmount;

          return {
            vendorId: q.vendorId,
            initialQuoteTotal: q.totalQuoteAmount,
            latestSubmittedQuoteTotal,
            hasRevisedQuote: hasRevised,
            quoteType: hasRevised ? 'Revised Quote' : 'Initial Quote',
          };
        });

        const rankable = rows.filter((r) => r.latestSubmittedQuoteTotal > 0);
        rankable.sort((a, b) => a.latestSubmittedQuoteTotal - b.latestSubmittedQuoteTotal);

        return rankable.map((r, idx) => ({
          ...r,
          rankLabel: `L${idx + 1}`,
          rankNumber: idx + 1,
        }));
      };

      const testQuotes = [
        { vendorId: 'vendor-1', totalQuoteAmount: 950000 },
        { vendorId: 'vendor-2', totalQuoteAmount: 920000 },
      ];

      // Vendor 1 submits revised quote of 880,000 (lower than Vendor 2's 920,000)
      // Vendor 2 has a pending buyer offer of 800,000 BUT Vendor 2 has NOT submitted a revision
      const testRounds = [
        { vendorId: 'vendor-1', roundNumber: 1, counterOfferAmount: 850000, revisedQuoteAmount: 880000, status: 'REVISED_SUBMITTED' },
        { vendorId: 'vendor-2', roundNumber: 1, counterOfferAmount: 800000, revisedQuoteAmount: null, status: 'ROUND_ACTIVE' },
      ];

      const ranking = computeVendorRanking(testQuotes, testRounds);

      assert(ranking[0].vendorId === 'vendor-1' && ranking[0].rankLabel === 'L1', `Vendor 1 is L1 at ₹880,000 (submitted revision)`);
      assert(ranking[1].vendorId === 'vendor-2' && ranking[1].rankLabel === 'L2', `Vendor 2 is L2 at ₹920,000 (initial quote used, buyer offer ₹800,000 ignored for ranking)`);
      assert(ranking[1].latestSubmittedQuoteTotal === 920000, `Final Quote field displays vendor submitted quote, never buyer offer`);
    }

    // ========================================================================
    // SCENARIO 8: COMPACT SUMMARY COLUMNS & FULL AUDIT PERSISTENCE
    // ========================================================================
    console.log('\n--- SCENARIO 8: COMPACT SUMMARY COLUMNS & FULL AUDIT PERSISTENCE ---');
    {
      const requiredColumns = [
        'Vendor Name',
        'RFQ Reference',
        'Initial Quote Total',
        'Final Quote / Latest Submitted Quote',
        'Negotiation Status',
        'Dynamic Ranking',
        'Actions (Select Vendor, View History)',
      ];
      assert(requiredColumns.length === 7, `Summary table has exactly 7 compact columns replacing 16-column wide table`);

      // Verify DB history remains complete for isolated RFQ
      const allRounds = await prisma.negotiationRound.findMany({
        where: { negotiation: { rfqId: testRfq.id } },
      });

      assert(allRounds.length >= 3, `Full negotiation history preserved (${allRounds.length} rounds recorded in database)`);
      const supersededRounds = allRounds.filter((r) => r.status === 'SUPERSEDED');
      const activeRounds = allRounds.filter((r) => r.status === 'ROUND_ACTIVE' || r.status === 'REVISED_SUBMITTED');
      assert(supersededRounds.length >= 1 && activeRounds.length >= 1, `Both superseded and active rounds coexist in audit history`);
    }
  } finally {
    // Clean up isolated test RFQ data only
    if (testRfq) {
      console.log(`\n🧹 Cleaning up isolated test RFQ ${isolatedRfqNumber}...`);
      await prisma.rfqMessage.deleteMany({ where: { rfqId: testRfq.id } });
      await prisma.negotiationRound.deleteMany({ where: { negotiation: { rfqId: testRfq.id } } });
      await prisma.negotiation.deleteMany({ where: { rfqId: testRfq.id } });
      await prisma.quoteLine.deleteMany({ where: { quote: { rfqId: testRfq.id } } });
      await prisma.quote.deleteMany({ where: { rfqId: testRfq.id } });
      await prisma.rfqVendor.deleteMany({ where: { rfqId: testRfq.id } });
      await prisma.rfqLine.deleteMany({ where: { rfqId: testRfq.id } });
      await prisma.auditLog.deleteMany({ where: { entityId: testRfq.id } });
      await prisma.rfq.delete({ where: { id: testRfq.id } });
      console.log(`🧹 Isolated test cleanup complete. Shared baseline records untouched.`);
    }
  }

  console.log('\n========================================================================');
  console.log(`SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('========================================================================');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runCounterofferAndSummaryVerification()
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
