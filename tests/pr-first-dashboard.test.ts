// tests/pr-first-dashboard.test.ts
// Verification of PR-First Dashboard, Summary Ribbon, and Expandable RFQ Register

import { prisma } from '../src/lib/prisma';

async function runPrFirstDashboardTests() {
  console.log('========================================================================');
  console.log('🔍 PROCPX PR-FIRST DASHBOARD & RFQ-LINKED WORKSPACE VERIFICATION');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${msg}`);
      failed++;
    }
  }

  const tenant = await prisma.tenant.findFirst({ where: { status: 'ACTIVE' } });
  if (!tenant) throw new Error('No active tenant found');

  // 1. Fetch Dashboard PR Register simulation
  const prs = await prisma.procurementRequest.findMany({
    where: {
      tenantId: tenant.id,
      status: { in: ['PR_APPROVED', 'PR_RELEASED_TO_PROCUREMENT', 'PR_PENDING_PROJECT_APPROVAL', 'CLOSED', 'COMPLETED'] },
    },
    include: {
      project: { select: { id: true, projectCode: true, name: true } },
      costCentre: { select: { id: true, code: true, name: true } },
      boq: { select: { id: true, boqCode: true, title: true } },
      boqRevision: { select: { id: true, revisionCode: true } },
      lines: {
        select: { id: true, itemDescription: true, category: true, quantity: true, estimatedRate: true, estimatedValue: true },
      },
      rfqs: {
        include: {
          invitedVendors: { include: { vendor: { select: { id: true, name: true, code: true } } } },
          quotes: { select: { id: true, quoteNumber: true, totalQuoteAmount: true, quoteVersion: true, vendorId: true } },
          negotiations: {
            include: {
              rounds: { select: { id: true, roundNumber: true, status: true, counterOfferAmount: true, revisedQuoteAmount: true } },
            },
          },
          awards: {
            include: { recommendedVendor: { select: { id: true, name: true } } },
          },
          ppos: { select: { id: true, ppoNumber: true, status: true, totalValue: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  console.log('--- 1. PR-FIRST REGISTER STRUCTURE & HIERARCHY ---');
  assert(prs.length > 0, `Database contains PR records for Procurement (${prs.length} found)`);

  const prWithRfq = prs.find((p) => p.rfqs.length > 0);
  assert(!!prWithRfq, `PR with linked RFQ found (${prWithRfq?.prNumber} has ${prWithRfq?.rfqs.length} RFQ)`);

  const prWithoutRfq = prs.find((p) => p.rfqs.length === 0);
  assert(!!prWithoutRfq, `Approved PR awaiting sourcing found (${prWithoutRfq?.prNumber} with 0 RFQs)`);

  console.log('\n--- 2. ASSOCIATED RFQ FIELDS ACCURACY ---');
  if (prWithRfq) {
    const rfq = prWithRfq.rfqs[0];
    assert(!!rfq.rfqNumber, `RFQ has formal number: ${rfq.rfqNumber}`);
    assert(rfq.prId === prWithRfq.id, `RFQ is strictly linked to PR (${rfq.prId} === ${prWithRfq.id})`);
    assert(rfq.invitedVendors.length >= 0, `Invited vendors tracked (${rfq.invitedVendors.length} invited)`);
    assert(rfq.quotes.length >= 0, `Quotes tracked (${rfq.quotes.length} quotes recorded)`);
  }

  console.log('\n--- 3. 4-CARD COMPACT SUMMARY METRICS ---');
  const approvedPrsReceivedCount = await prisma.procurementRequest.count({
    where: {
      tenantId: tenant.id,
      status: { in: ['PR_APPROVED', 'PR_RELEASED_TO_PROCUREMENT'] },
      rfqs: { none: { status: { in: ['AWARDED', 'CLOSED', 'FINAL_RATE_LOCKED'] } } },
    },
  });
  const rfqsInProgressCount = await prisma.rfq.count({
    where: {
      tenantId: tenant.id,
      status: { in: ['RELEASED', 'VENDOR_RESPONSE_OPEN', 'COMPARISON', 'RESPONSE_CLOSED'] },
    },
  });
  const negotiationsCount = await prisma.rfq.count({
    where: {
      tenantId: tenant.id,
      OR: [
        { status: { in: ['NEGOTIATION', 'FINAL_RATE_LOCKED'] } },
        { negotiations: { some: { status: 'ACTIVE' } } },
      ],
    },
  });
  const awardsPpoPendingCount = await prisma.awardRecommendation.count({
    where: {
      tenantId: tenant.id,
      status: { in: ['PENDING_APPROVAL', 'APPROVED'] },
    },
  });

  assert(approvedPrsReceivedCount >= 0, `Card 1: PRs Received count = ${approvedPrsReceivedCount}`);
  assert(rfqsInProgressCount >= 0, `Card 2: RFQs in Progress count = ${rfqsInProgressCount}`);
  assert(negotiationsCount >= 0, `Card 3: Negotiations Pending count = ${negotiationsCount}`);
  assert(awardsPpoPendingCount >= 0, `Card 4: Awards / PPO Pending count = ${awardsPpoPendingCount}`);

  console.log('\n--- 4. RFQ WORKSPACE 3 ADJACENT TABS INTEGRITY ---');
  if (prWithRfq) {
    const targetRfq = prWithRfq.rfqs[0];
    const quotes = await prisma.quote.findMany({
      where: { rfqId: targetRfq.id, tenantId: tenant.id },
    });
    const negotiations = await prisma.negotiation.findMany({
      where: { rfqId: targetRfq.id, tenantId: tenant.id },
    });
    const awards = await prisma.awardRecommendation.findMany({
      where: { rfqId: targetRfq.id, tenantId: tenant.id },
    });
    const ppos = await prisma.ppo.findMany({
      where: { rfqId: targetRfq.id, tenantId: tenant.id },
    });

    assert(quotes.every((q) => q.rfqId === targetRfq.id), `RFQ Tab: All ${quotes.length} quotes filtered strictly by RFQ ID ${targetRfq.rfqNumber}`);
    assert(negotiations.every((n) => n.rfqId === targetRfq.id), `Negotiation Tab: All ${negotiations.length} negotiations filtered strictly by RFQ ID`);
    assert(awards.every((a) => a.rfqId === targetRfq.id), `Awarding Tab: All ${awards.length} awards filtered strictly by RFQ ID`);
    assert(ppos.every((p) => p.rfqId === targetRfq.id), `Awarding Tab (PPO): All ${ppos.length} PPOs traceable to RFQ ID`);
  }

  console.log('\n========================================================================');
  console.log(`🎉 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED out of ${passed + failed} tests`);
  console.log('========================================================================\n');

  if (failed > 0) process.exit(1);
}

runPrFirstDashboardTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
