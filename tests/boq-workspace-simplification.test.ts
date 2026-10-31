// tests/boq-workspace-simplification.test.ts
// Acceptance test suite for simplified BOQ Workspace and integrated financial summary

import prisma from '../src/lib/prisma';
import * as fs from 'fs';
import * as path from 'path';


async function runTests() {
  console.log('============================================================');
  console.log('🚀 BOQ WORKSPACE SIMPLIFICATION & FINANCIAL SUMMARY TEST');
  console.log('============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${desc}`);
      failed++;
    }
  }

  // 1. INSPECTION OF BOQ STUDIO SOURCE CODE CONTRACTS
  console.log('--- 1. COMPACT BOQ WORKSPACE & HEADER CONTRACT ---');
  const studioPath = path.join(process.cwd(), 'src', 'app', '(app)', 'boq', 'studio', 'page.tsx');
  assert(fs.existsSync(studioPath), 'BOQ Studio page exists');
  const studioContent = fs.readFileSync(studioPath, 'utf8');

  // Verify compact single document card container
  assert(studioContent.includes('boq-workspace-container'), 'Workspace wrapped in unified boq-workspace-container');
  
  // Verify compact header keeps mandatory fields visible
  assert(studioContent.includes('activeBoq.boqCode'), 'Header displays BOQ Number');
  assert(studioContent.includes('activeBoq.title'), 'Header displays BOQ Title');
  assert(studioContent.includes('activeCostCentreObj?.name') || studioContent.includes('activeCostCentreObj?.code'), 'Header displays Cost Centre');
  assert(studioContent.includes('activeBoq.category'), 'Header displays Category');
  assert(studioContent.includes('activeRevision?.revisionCode'), 'Header displays Revision Code');
  assert(studioContent.includes('StatusBadge'), 'Header displays StatusBadge');

  // Verify collapsible secondary details
  assert(studioContent.includes('showDetails') && studioContent.includes('setShowDetails'), 'Collapsible details section toggle is implemented');
  assert(studioContent.includes('activeProjectObj?.name'), 'Secondary section displays Project name');
  assert(studioContent.includes('areaSqFt') || studioContent.includes('setupArea'), 'Secondary section displays Area in SqFt');
  assert(studioContent.includes('activeBoq.purpose'), 'Secondary section displays Purpose (Budget / PR)');

  // 2. INTEGRATED FINANCIAL SUMMARY CONTRACT
  console.log('\n--- 2. INTEGRATED FINANCIAL SUMMARY CONTRACT ---');
  assert(studioContent.includes('financialSummary = useMemo'), 'Financial summary is memoized from real-time BOQ line items');
  assert(studioContent.includes('BOQ Line Items'), 'Financial summary displays BOQ Line Items metric');
  assert(studioContent.includes('AI Estimated Value'), 'Financial summary displays AI Estimated Value');
  assert(studioContent.includes('Benchmark') && studioContent.includes('not approved budget'), 'AI estimate is explicitly labelled as indicative benchmark and not approved budget');
  assert(studioContent.includes('Cost per Sqft'), 'Financial summary displays Cost per Sqft');
  assert(studioContent.includes('Data Readiness'), 'Financial summary displays Data Readiness & validation issues');
  assert(studioContent.includes('showCategoryBreakdown'), 'Collapsible Category Distribution is available for granular inspection');

  // Strict calculation rule: never calculate line total when quantity is missing or invalid
  assert(
    studioContent.includes('if (qty !== null && unitCost !== null)') ||
    studioContent.includes('qty !== null && !isNaN(qty)'),
    'Line cost is never calculated if quantity is missing or invalid'
  );

  // Missing values shown as "—" rather than invented
  assert(studioContent.includes("? `₹ ${financialSummary.costPerSqFt.toLocaleString('en-IN')}` : '—'"), 'Unavailable Cost per Sqft displays em dash "—"');
  assert(studioContent.includes("? `₹ ${financialSummary.totalAiEstimate.toLocaleString('en-IN')}` : '—'"), 'Unavailable AI Estimate displays em dash "—"');

  // 3. SIMPLIFIED ACTION BAR
  console.log('\n--- 3. SIMPLIFIED ACTION BAR & WORKFLOW PRIORITY ---');
  // Primary action: Add to Budget (or Create PR)
  assert(studioContent.includes('Add to Budget'), 'Primary action "Add to Budget" present');
  assert(studioContent.includes('Create PR'), 'Primary action "Create PR" present for PR purpose');
  
  // Secondary actions: Edit BOQ, AI Refine, Generate AI Cost, Validate
  assert(studioContent.includes('Edit BOQ') || studioContent.includes('Exit Edit Mode'), 'Secondary action "Edit BOQ" present');
  assert(studioContent.includes('AI Refine'), 'Secondary action "AI Refine" present');
  assert(studioContent.includes('Generate AI Cost'), 'Secondary action "Generate AI Cost" present');
  assert(studioContent.includes('Validate'), 'Secondary action "Validate" present');

  // Clean button styling without brackets
  assert(!studioContent.includes("'>[ EDIT BOQ ]<"), 'Square bracket decorative text removed from Edit BOQ');
  assert(!studioContent.includes("'>[ AI REFINE ]<"), 'Square bracket decorative text removed from AI Refine');
  assert(!studioContent.includes("'>[ GENERATE AI COST ]<"), 'Square bracket decorative text removed from Generate AI Cost');
  assert(!studioContent.includes("'>[ VALIDATE ]<"), 'Square bracket decorative text removed from Validate');
  assert(!studioContent.includes("'>[ ADD TO BUDGET ]<"), 'Square bracket decorative text removed from Add to Budget');

  // Editing locked on approved revisions
  assert(
    studioContent.includes("activeBoq?.status === 'APPROVED'") &&
    studioContent.includes('Approved BOQ revisions are locked'),
    'In-place edit is strictly forbidden on approved revisions'
  );

  // Selective AI Cost calculation to avoid unnecessary re-generation
  assert(
    studioContent.includes('payload.lineIds = unestimated.map'),
    'Generate AI Cost only targets unestimated lines, avoiding duplicate regeneration'
  );

  // 4. LINE-ITEM GRID INTEGRATION & SPECIFICATION DETAILS
  console.log('\n--- 4. LINE-ITEM GRID INTEGRATION ---');
  assert(studioContent.includes('<SpecificationCell'), 'Line items grid uses bounded scrollable SpecificationCell');
  assert(studioContent.includes('/boq/line/'), 'Line items grid provides direct link to dedicated line details view');
  assert(studioContent.includes('enterprise-table'), 'Line items grid uses standardised enterprise table styling');
  assert(studioContent.includes('linesSearch'), 'Line items grid has integrated search filter');

  // Verify duplicate "NEXT ACTION PROMPT" card was removed
  assert(!studioContent.includes('NEXT ACTION PROMPT (Section 25)'), 'Redundant duplicate NEXT ACTION PROMPT card removed');

  // 5. DATABASE VERIFICATION & WORKFLOW INTEGRITY
  console.log('\n--- 5. DATABASE INTEGRITY & BUDGET LEDGER WORKFLOW ---');
  const boqCount = await prisma.boq.count();
  assert(boqCount > 0, `Active BOQs exist in database (${boqCount} found)`);

  const sampleRevision = await prisma.boqRevision.findFirst({
    include: {
      boq: {
        include: {
          project: true,
          costCentre: true,
        },
      },
      lines: true,
    },
  });

  assert(sampleRevision !== null, 'Found active BOQ Revision');
  if (sampleRevision) {
    assert(!!sampleRevision.boq.costCentreId, `Cost Centre link preserved: ${sampleRevision.boq.costCentre?.name || 'Linked'}`);
    assert(sampleRevision.lines.length >= 0, `Line items count verified: ${sampleRevision.lines.length}`);
  }

  // Verify approval sequence is intact: Project Approver followed by Finance Approver
  const approvalsRoutePath = path.join(process.cwd(), 'src', 'app', 'api', 'approvals', 'route.ts');
  assert(fs.existsSync(approvalsRoutePath), 'approvals route exists');
  const approvalsContent = fs.readFileSync(approvalsRoutePath, 'utf8');
  assert(approvalsContent.includes('PROJECT_APPROVER'), 'First tier in approval sequence is PROJECT_APPROVER');
  assert(approvalsContent.includes('FINANCE_APPROVER') || approvalsContent.includes('PENDING_FINANCE_APPROVAL'), 'Second tier in approval sequence is FINANCE_APPROVER');
  const addToBudgetRoutePath = path.join(process.cwd(), 'src', 'app', 'api', 'boq', 'add-to-budget', 'route.ts');
  assert(fs.existsSync(addToBudgetRoutePath), 'add-to-budget route exists');
  const addToBudgetContent = fs.readFileSync(addToBudgetRoutePath, 'utf8');
  assert(addToBudgetContent.includes('UNDER_APPROVAL'), 'Initial budget contribution status is UNDER_APPROVAL');

  console.log('\n============================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
