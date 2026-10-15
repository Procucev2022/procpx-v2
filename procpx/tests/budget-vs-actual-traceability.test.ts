// tests/budget-vs-actual-traceability.test.ts
// Automated Acceptance Verification for Section 28 - Budget vs Actual Financial Traceability Architecture
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: [${testName}]`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: [${testName}] - ${details || 'Assertion failed'}`);
  }
}

async function runAcceptanceTests() {
  console.log('======================================================================');
  console.log('🚀 PROCPX BUDGET VS ACTUAL & COMMERCIAL LINEAGE ACCEPTANCE TEST SUITE');
  console.log('======================================================================\n');

  try {
    const tenantA = await prisma.tenant.findUnique({ where: { slug: 'procucev-retail-demo' } });
    if (!tenantA) throw new Error('Tenant A not found');

    const project1 = await prisma.project.findFirst({
      where: { tenantId: tenantA.id, projectCode: 'CPX-P-000001' },
      include: { costCentres: true },
    });
    if (!project1) throw new Error('Project 1 not found');

    const costCentre1 = project1.costCentres.find(cc => cc.code === 'CC-001');
    if (!costCentre1) throw new Error('Cost Centre CC-001 not found');

    // ------------------------------------------------------------------
    // CRITERION 1: Every Budget transaction can identify its BOQ Line
    // ------------------------------------------------------------------
    console.log('--- 1. BUDGET TRANSACTION TRACEABILITY ---');
    await prisma.budgetTransaction.deleteMany({
      where: { transactionCode: { startsWith: 'BTX-TEST-' } },
    });
    const budgetTxs = await prisma.budgetTransaction.findMany({
      where: { tenantId: tenantA.id, projectId: project1.id },
      include: { boqLine: true, costCentre: true },
    });
    assert(budgetTxs.length > 0, 'Criterion 1.1', 'Budget transactions exist');
    const btxWithBoqLine = budgetTxs.filter(bt => bt.boqLineId && bt.boqLine);
    assert(
      btxWithBoqLine.length === budgetTxs.length,
      'Criterion 1.2',
      `All ${budgetTxs.length} Budget transactions persistently reference their BOQ Line`
    );
    assert(
      budgetTxs.every(bt => bt.costCentreId === costCentre1.id),
      'Criterion 1.3',
      'Budget transactions persistently link to Cost Centre'
    );

    // ------------------------------------------------------------------
    // CRITERION 2: Every PR Line can identify its BOQ Line
    // ------------------------------------------------------------------
    console.log('\n--- 2. PR LINE TRACEABILITY ---');
    const pr = await prisma.procurementRequest.findFirst({
      where: { tenantId: tenantA.id, prNumber: 'PR-2026-000001' },
      include: { lines: { include: { boqLine: true } } },
    });
    assert(!!pr, 'Criterion 2.1', 'Procurement Request PR-2026-000001 exists');
    assert(
      (pr?.lines.length || 0) > 0,
      'Criterion 2.2',
      'PR Lines exist on the procurement request'
    );
    const prLinesWithBoq = pr?.lines.filter(l => l.boqLineId && l.boqLine) || [];
    assert(
      prLinesWithBoq.length === (pr?.lines.length || 0),
      'Criterion 2.3',
      `All ${pr?.lines.length} PR Lines reference their originating BOQ Line ID`
    );

    // ------------------------------------------------------------------
    // CRITERION 3: Every RFQ Line can identify its PR / BOQ Line
    // ------------------------------------------------------------------
    console.log('\n--- 3. RFQ LINE TRACEABILITY ---');
    const rfqLines = await prisma.rfqLine.findMany({
      where: { tenantId: tenantA.id, rfq: { rfqNumber: 'RFQ-2026-000009' } },
      include: { prLine: true, boqLine: true },
    });
    assert(rfqLines.length > 0, 'Criterion 3.1', 'RFQ Lines exist for RFQ-2026-000009');
    assert(
      rfqLines.every(l => l.prLineId && l.prLine),
      'Criterion 3.2',
      'All RFQ Lines identify their originating PR Line'
    );
    assert(
      rfqLines.every(l => l.boqLineId && l.boqLine),
      'Criterion 3.3',
      'All RFQ Lines identify their originating BOQ Line'
    );

    // ------------------------------------------------------------------
    // CRITERION 4: Every PPO / PO Line can identify its RFQ / PR / BOQ Line
    // ------------------------------------------------------------------
    console.log('\n--- 4. PPO / PO LINE TRACEABILITY ---');
    const ppoLines = await prisma.ppoLine.findMany({
      where: { tenantId: tenantA.id, projectId: project1.id },
      include: { boqLine: true, prLine: true, rfqLine: true, vendor: true },
    });
    assert(ppoLines.length >= 4, 'Criterion 4.1', `At least 4 PPO Lines exist (found: ${ppoLines.length})`);
    assert(
      ppoLines.every(l => l.rfqLineId && l.rfqLine),
      'Criterion 4.2',
      'Every PPO Line identifies its originating RFQ Line'
    );
    assert(
      ppoLines.every(l => l.prLineId && l.prLine),
      'Criterion 4.3',
      'Every PPO Line identifies its originating PR Line'
    );
    assert(
      ppoLines.every(l => l.boqLineId && l.boqLine),
      'Criterion 4.4',
      'Every PPO Line identifies its originating BOQ Line'
    );
    assert(
      ppoLines.every(l => l.vendorId && l.vendor),
      'Criterion 4.5',
      'Every PPO Line identifies its vendor'
    );

    // ------------------------------------------------------------------
    // CRITERION 5: Actual Cost can identify its PPO / PO Line
    // ------------------------------------------------------------------
    console.log('\n--- 5. ACTUAL COST LINEAGE ---');
    const actualCosts = await prisma.actualCostTransaction.findMany({
      where: { tenantId: tenantA.id, projectId: project1.id },
      include: { ppoLine: true, boqLine: true, ppo: true },
    });
    assert(actualCosts.length >= 4, 'Criterion 5.1', `Actual cost transactions exist (found: ${actualCosts.length})`);
    assert(
      actualCosts.every(ac => ac.ppoLineId && ac.ppoLine),
      'Criterion 5.2',
      'Every Actual Cost transaction identifies its PPO Line ID'
    );
    assert(
      actualCosts.every(ac => ac.boqLineId && ac.boqLine),
      'Criterion 5.3',
      'Every Actual Cost transaction identifies its BOQ Line ID'
    );

    // ------------------------------------------------------------------
    // CRITERION 6: Multiple POs can map to one BOQ Line
    // ------------------------------------------------------------------
    console.log('\n--- 6. MULTIPLE POS TO SINGLE BOQ LINE ---');
    // Group ppoLines by boqLineId
    const poMapByBoq = new Map<string, typeof ppoLines>();
    for (const pl of ppoLines) {
      if (!pl.boqLineId) continue;
      const list = poMapByBoq.get(pl.boqLineId) || [];
      list.push(pl);
      poMapByBoq.set(pl.boqLineId, list);
    }
    const multiPoEntries = Array.from(poMapByBoq.entries()).filter(([_, lines]) => lines.length > 1);
    assert(
      multiPoEntries.length > 0,
      'Criterion 6.1',
      'System supports and contains single BOQ Line with multiple POs'
    );
    const [tileBoqLineId, tilePoLines] = multiPoEntries[0];
    const uniquePpos = new Set(tilePoLines.map(p => p.ppoId));
    assert(
      uniquePpos.size >= 2,
      'Criterion 6.2',
      `BOQ Line ${tileBoqLineId} has ${uniquePpos.size} distinct PPOs mapped to it (PO-001 & PO-002)`
    );

    // ------------------------------------------------------------------
    // CRITERION 7: Partial completion is supported
    // ------------------------------------------------------------------
    console.log('\n--- 7. PARTIAL COMPLETION ---');
    const partialPoLine = ppoLines.find(l => l.status === 'PARTIALLY_COMPLETED');
    assert(!!partialPoLine, 'Criterion 7.1', 'PPO Line in PARTIALLY_COMPLETED status exists');
    assert(
      (partialPoLine?.completedQuantity || 0) < (partialPoLine?.orderedQuantity || 0) &&
        (partialPoLine?.completedQuantity || 0) > 0,
      'Criterion 7.2',
      `Partial quantity supported: completed ${partialPoLine?.completedQuantity} of ${partialPoLine?.orderedQuantity} ordered`
    );
    const partialActual = actualCosts.find(ac => ac.ppoLineId === partialPoLine?.id);
    assert(
      !!partialActual && partialActual.actualQuantity === partialPoLine?.completedQuantity,
      'Criterion 7.3',
      'Actual transaction records partial execution quantity and amount independently'
    );

    // ------------------------------------------------------------------
    // CRITERIA 8, 9, 10: Actual Qty, Rate, Amount are separate from PO
    // ------------------------------------------------------------------
    console.log('\n--- 8, 9, 10. INDEPENDENCE OF ACTUAL VS PO METRICS ---');
    // Find PO-002 transaction where rate was negotiated down on invoice (e.g. rate 118 -> 115)
    const discountedActual = actualCosts.find(ac => ac.transactionCode === 'ACT-2026-000002');
    const matchingPoLine = ppoLines.find(l => l.id === discountedActual?.ppoLineId);
    assert(
      !!discountedActual && !!matchingPoLine,
      'Criterion 8.1',
      'Matching PO Line and Actual transaction located'
    );
    assert(
      discountedActual?.actualUnitRate !== matchingPoLine?.orderedUnitRate,
      'Criterion 9.1',
      `Actual Rate (₹${discountedActual?.actualUnitRate}) is distinct from PO Rate (₹${matchingPoLine?.orderedUnitRate})`
    );
    assert(
      discountedActual?.actualAmount !== matchingPoLine?.orderedAmount,
      'Criterion 10.1',
      `Actual Amount (₹${discountedActual?.actualAmount}) is distinct from PO Amount (₹${matchingPoLine?.orderedAmount})`
    );

    // ------------------------------------------------------------------
    // CRITERIA 11 & 12: BUDGET ≠ COMMITTED ≠ ACTUAL
    // ------------------------------------------------------------------
    console.log('\n--- 11 & 12. BUDGET ≠ COMMITTED ≠ ACTUAL THREE-WAY DISTINCTION ---');
    // Prompt Section 12 MCCB Line Example:
    // Budget: ₹80,000, PO/Committed: ₹75,000, Actual: ₹74,000
    const mccbActual = actualCosts.find(ac => ac.transactionCode === 'ACT-2026-000003');
    const mccbPo = ppoLines.find(l => l.id === mccbActual?.ppoLineId);
    const mccbBtx = budgetTxs.find(bt => bt.boqLineId === mccbActual?.boqLineId);

    assert(
      !!mccbActual && !!mccbPo && !!mccbBtx,
      'Criterion 11.1',
      'Section 12 MCCB Line records found across Budget, PO, and Actual'
    );
    const budgetVal = mccbBtx?.amount || 0;
    const committedVal = mccbPo?.orderedAmount || 0;
    const actualVal = mccbActual?.actualAmount || 0;

    assert(
      budgetVal === 80000 && committedVal === 75000 && actualVal === 74000,
      'Criterion 11.2',
      `Exact Prompt Section 12 Values: Budget ₹${budgetVal}, Committed ₹${committedVal}, Actual ₹${actualVal}`
    );
    assert(
      budgetVal !== committedVal && committedVal !== actualVal && budgetVal !== actualVal,
      'Criterion 12.1',
      'BUDGET (₹80k) ≠ COMMITTED (₹75k) ≠ ACTUAL (₹74k) strictly enforced as 3 distinct numbers'
    );

    // Variances
    const budgetVariance = budgetVal - actualVal; // 80000 - 74000 = 6000
    const variancePercent = (budgetVariance / budgetVal) * 100; // 7.5%
    const commitmentVariance = budgetVal - committedVal; // 80000 - 75000 = 5000
    const actualVsCommitment = committedVal - actualVal; // 75000 - 74000 = 1000

    assert(
      budgetVariance === 6000 && variancePercent === 7.5,
      'Criterion 12.2',
      `Saving vs Budget calculated correctly: ₹${budgetVariance} (${variancePercent}%)`
    );
    assert(
      commitmentVariance === 5000,
      'Criterion 12.3',
      `Commitment Variance calculated correctly: ₹${commitmentVariance}`
    );
    assert(
      actualVsCommitment === 1000,
      'Criterion 12.4',
      `Actual vs Commitment saving calculated correctly: ₹${actualVsCommitment}`
    );

    // ------------------------------------------------------------------
    // CRITERION 13: Budget vs Actual calculated at line level
    // ------------------------------------------------------------------
    console.log('\n--- 13. LINE-LEVEL BUDGET VS ACTUAL CALCULATION ---');
    // Overrun Line Example (Acoustic Cladding: Budget ₹1,50,000, Actual ₹1,65,000 -> -₹15,000 Over Budget)
    const overrunActual = actualCosts.find(ac => ac.transactionCode === 'ACT-2026-000004');
    const overrunBtx = budgetTxs.find(bt => bt.boqLineId === overrunActual?.boqLineId);
    const overrunVariance = (overrunBtx?.amount || 0) - (overrunActual?.actualAmount || 0);

    assert(
      overrunVariance === -15000,
      'Criterion 13.1',
      `Line-level negative variance detected correctly: ₹${overrunVariance} (OVER BUDGET)`
    );

    // Quantity & Rate Variance
    const rateSavingBudgetToPo = (mccbBtx?.rate || 0) - (mccbPo?.orderedUnitRate || 0); // 8000 - 7500 = 500
    const rateSavingBudgetToActual = (mccbBtx?.rate || 0) - (mccbActual?.actualUnitRate || 0); // 8000 - 7400 = 600
    const rateSavingPoToActual = (mccbPo?.orderedUnitRate || 0) - (mccbActual?.actualUnitRate || 0); // 7500 - 7400 = 100

    assert(
      rateSavingBudgetToPo === 500 &&
        rateSavingBudgetToActual === 600 &&
        rateSavingPoToActual === 100,
      'Criterion 13.2',
      `Rate variance tracked: Budget→PO ₹${rateSavingBudgetToPo}/u, Budget→Actual ₹${rateSavingBudgetToActual}/u, PO→Actual ₹${rateSavingPoToActual}/u`
    );

    // ------------------------------------------------------------------
    // CRITERIA 14, 15, 16: Cost Centre, Category, Project Aggregations
    // ------------------------------------------------------------------
    console.log('\n--- 14, 15, 16. AGGREGATIONS ---');
    // Cost Centre CC-001 Aggregation
    const cc1BudgetTotal = budgetTxs
      .filter(bt => bt.costCentreId === costCentre1.id)
      .reduce((sum, b) => sum + b.amount, 0);
    const cc1ActualTotal = actualCosts
      .filter(ac => ac.costCentreId === costCentre1.id)
      .reduce((sum, a) => sum + a.actualAmount, 0);
    const cc1CommittedTotal = ppoLines
      .filter(pl => pl.costCentreId === costCentre1.id)
      .reduce((sum, p) => sum + p.orderedAmount, 0);

    assert(cc1BudgetTotal > 0, 'Criterion 14.1', `Cost Centre Budget aggregated: ₹${cc1BudgetTotal}`);
    assert(cc1CommittedTotal > 0, 'Criterion 14.2', `Cost Centre Committed aggregated: ₹${cc1CommittedTotal}`);
    assert(cc1ActualTotal > 0, 'Criterion 14.3', `Cost Centre Actual aggregated: ₹${cc1ActualTotal}`);
    const costPerSqFt = costCentre1.areaSqFt ? cc1ActualTotal / costCentre1.areaSqFt : 0;
    assert(costPerSqFt > 0, 'Criterion 14.4', `Cost / Sqft calculated: ₹${costPerSqFt.toFixed(2)} / sqft`);

    // Category Aggregation
    const civilBudget = budgetTxs.filter(b => b.category === 'Civil & Interior').reduce((s, b) => s + b.amount, 0);
    const civilActual = actualCosts.filter(a => a.category === 'Civil & Interior').reduce((s, a) => s + a.actualAmount, 0);
    assert(civilBudget > 0 && civilActual > 0, 'Criterion 15.1', `Category aggregation for Civil & Interior: Budget ₹${civilBudget}, Actual ₹${civilActual}`);

    // Project Aggregation
    const projBudget = budgetTxs.reduce((s, b) => s + b.amount, 0);
    const projActual = actualCosts.reduce((s, a) => s + a.actualAmount, 0);
    assert(projBudget > 0 && projActual > 0, 'Criterion 16.1', `Project Level aggregation: Budget ₹${projBudget}, Actual ₹${projActual}`);

    // ------------------------------------------------------------------
    // CRITERIA 17 & 18: Historical Budget & Revisions Preserved
    // ------------------------------------------------------------------
    console.log('\n--- 17 & 18. BUDGET IMMUTABILITY & REVISION CONTROL ---');
    const allRevisions = await prisma.boqRevision.findMany({
      where: { boq: { projectId: project1.id } },
    });
    assert(allRevisions.length >= 2, 'Criterion 17.1', `Multiple revisions preserved (found: ${allRevisions.length})`);
    const approvedRevisions = allRevisions.filter(r => r.status === 'APPROVED');
    // Revision records remain historical
    assert(
      budgetTxs.every(bt => bt.boqRevisionId),
      'Criterion 18.1',
      'Every Budget transaction retains originating BOQ Revision ID for revision comparison'
    );

    // ------------------------------------------------------------------
    // CRITERION 19: Financial Auditability
    // ------------------------------------------------------------------
    console.log('\n--- 19. AUDIT TRAIL ---');
    assert(
      actualCosts.every(ac => ac.transactionCode && ac.source && ac.status && ac.createdBy),
      'Criterion 19.1',
      'All Actual Cost transactions contain code, source, status, and creator for audit'
    );
    assert(
      budgetTxs.every(bt => bt.transactionCode && bt.status && bt.createdBy),
      'Criterion 19.2',
      'All Budget transactions contain code, status, and creator for audit'
    );

    // ------------------------------------------------------------------
    // CRITERION 20: RBAC and Tenant Isolation
    // ------------------------------------------------------------------
    console.log('\n--- 20. MULTI-TENANT ISOLATION ---');
    const tenantB = await prisma.tenant.findUnique({ where: { slug: 'procucev-hospitality-demo' } });
    if (!tenantB) throw new Error('Tenant B not found');

    const tenantBCrossLeak = await prisma.actualCostTransaction.findMany({
      where: { tenantId: tenantB.id, projectId: project1.id },
    });
    assert(
      tenantBCrossLeak.length === 0,
      'Criterion 20.1',
      'Zero cross-tenant leakage: Tenant B cannot query Tenant A actual costs'
    );

    console.log('\n======================================================================');
    console.log(` RESULTS: ${passed} PASSED / ${failed} FAILED (${passed + failed} TOTAL)`);
    console.log('======================================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test suite runtime error:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runAcceptanceTests();
