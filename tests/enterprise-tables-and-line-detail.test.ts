// tests/enterprise-tables-and-line-detail.test.ts
// Comprehensive Test Suite for Enterprise Tables, SpecificationCell, and Line Item Detail View
import prisma from '../src/lib/prisma';
import fs from 'fs';
import path from 'path';


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

async function runTestSuite() {
  console.log('============================================================');
  console.log('🚀 ENTERPRISE TABLES & LINE-ITEM DETAIL TEST SUITE');
  console.log('============================================================\n');

  // TEST GROUP 1: Shared SpecificationCell Component
  console.log('--- 1. SPECIFICATION CELL COMPONENT CONTRACT ---');
  const specCellPath = path.join(process.cwd(), 'src/components/ui/SpecificationCell.tsx');
  assert(fs.existsSync(specCellPath), 'SpecificationCell.tsx exists');

  const specCellContent = fs.readFileSync(specCellPath, 'utf8');
  assert(specCellContent.includes('spec-preview-trigger'), 'SpecificationCell includes preview trigger styling');
  assert(specCellContent.includes('textOverflow: \'ellipsis\''), 'SpecificationCell truncates with ellipsis');
  assert(specCellContent.includes('maxHeight: 260') || specCellContent.includes('overflowY'), 'SpecificationCell provides bounded scrollable container');
  assert(specCellContent.includes('handleKeyDown'), 'SpecificationCell supports keyboard navigation (Enter/Space)');
  assert(specCellContent.includes('navigator.clipboard.writeText'), 'SpecificationCell provides copy functionality');
  assert(specCellContent.includes('/boq/line/'), 'SpecificationCell links to dedicated full line-item detail view');

  // TEST GROUP 2: Enterprise Table CSS in globals.css
  console.log('\n--- 2. ENTERPRISE TABLE DESIGN SYSTEM CSS ---');
  const globalsCssPath = path.join(process.cwd(), 'src/app/globals.css');
  const globalsCss = fs.readFileSync(globalsCssPath, 'utf8');
  assert(globalsCss.includes('.table-container'), '.table-container defined in globals.css');
  assert(globalsCss.includes('.enterprise-table'), '.enterprise-table defined in globals.css');
  assert(globalsCss.includes('overflow-x: auto'), 'Internal horizontal scrolling container defined');
  assert(globalsCss.includes('position: sticky'), 'Sticky header support defined');
  assert(globalsCss.includes('.cell-numeric') || globalsCss.includes('.text-right'), 'Numeric alignment utilities defined');
  assert(globalsCss.includes('.cell-spec-preview') || globalsCss.includes('.cell-truncate'), 'Single-line truncation utilities defined');

  // TEST GROUP 3: Dedicated Line Item Detail Route & API
  console.log('\n--- 3. DEDICATED LINE ITEM DETAIL VIEW & API ---');
  const linePagePath = path.join(process.cwd(), 'src/app/(app)/boq/line/[id]/page.tsx');
  const lineApiPath = path.join(process.cwd(), 'src/app/api/boq/lines/[id]/route.ts');
  assert(fs.existsSync(linePagePath), 'BOQ Line detail page exists at /boq/line/[id]/page.tsx');
  assert(fs.existsSync(lineApiPath), 'BOQ Line API route exists at /api/boq/lines/[id]/route.ts');

  const linePageContent = fs.readFileSync(linePagePath, 'utf8');
  assert(linePageContent.includes('Standard Description'), 'Detail page displays Standard Description');
  assert(linePageContent.includes('Complete Specification'), 'Detail page displays Complete Specification');
  assert(linePageContent.includes('Quantity & UOM'), 'Detail page displays Quantity & UOM');
  assert(linePageContent.includes('Total Benchmark'), 'Detail page displays Benchmark Total');
  assert(linePageContent.includes('Return to BOQ') || linePageContent.includes('returnUrl'), 'Detail page provides return path to originating BOQ');

  // TEST GROUP 4: Database Line Item Query & Data Integrity
  console.log('\n--- 4. LINE ITEM DATA RETRIEVAL & INTEGRITY ---');
  const sampleLine = await prisma.boqLine.findFirst({
    where: { isDeleted: false },
    include: {
      category: true,
      subcategory: true,
      uom: true,
      revision: {
        include: {
          boq: {
            include: {
              project: true,
              costCentre: true,
            },
          },
        },
      },
    },
  });

  if (sampleLine) {
    assert(!!sampleLine.id, 'Sample line item found in database', sampleLine.id);
    assert(!!sampleLine.lineNumber, 'Line has line number', String(sampleLine.lineNumber));
    assert(!!sampleLine.originalDescription, 'Line has original description', sampleLine.originalDescription);
    assert(!!sampleLine.revision?.boq?.boqCode, 'Line is traceable to originating BOQ', sampleLine.revision?.boq?.boqCode);
    console.log(`  ℹ Sample line verified: #${sampleLine.lineNumber} in BOQ ${sampleLine.revision?.boq?.boqCode}`);
  } else {
    assert(false, 'No line items found in database to verify');
  }

  // TEST GROUP 5: Table Standardisation Across Pages
  console.log('\n--- 5. APPLICATION SCREENS TABLE STANDARDISATION AUDIT ---');
  const boqStudio = fs.readFileSync(path.join(process.cwd(), 'src/app/(app)/boq/studio/page.tsx'), 'utf8');
  assert(boqStudio.includes('SpecificationCell'), 'BOQ Studio uses SpecificationCell');
  assert(boqStudio.includes('table-container') && boqStudio.includes('enterprise-table'), 'BOQ Studio uses enterprise table classes');
  assert(boqStudio.includes('/boq/line/'), 'BOQ Studio row actions include Open Details link');

  const boqRevision = fs.readFileSync(path.join(process.cwd(), 'src/app/(app)/boq/[revisionId]/page.tsx'), 'utf8');
  assert(boqRevision.includes('SpecificationCell'), 'BOQ Revision uses SpecificationCell');
  assert(boqRevision.includes('table-container') && boqRevision.includes('enterprise-table'), 'BOQ Revision uses enterprise table classes');
  assert(boqRevision.includes('/boq/line/'), 'BOQ Revision row actions include Open Details link');

  const rfqDetail = fs.readFileSync(path.join(process.cwd(), 'src/app/(app)/procurement/rfqs/[id]/page.tsx'), 'utf8');
  assert(rfqDetail.includes('SpecificationCell'), 'RFQ detail lines use SpecificationCell');
  assert(rfqDetail.includes('table enterprise-table'), 'RFQ detail comparison & tables use enterprise-table');

  const rfqNew = fs.readFileSync(path.join(process.cwd(), 'src/app/(app)/procurement/rfqs/new/page.tsx'), 'utf8');
  assert(rfqNew.includes('SpecificationCell'), 'RFQ New wizard uses SpecificationCell');
  assert(rfqNew.includes('table enterprise-table'), 'RFQ New wizard uses enterprise-table');

  const approvedPrs = fs.readFileSync(path.join(process.cwd(), 'src/app/(app)/procurement/approved-prs/page.tsx'), 'utf8');
  assert(approvedPrs.includes('SpecificationCell'), 'Approved PRs requirements table uses SpecificationCell');

  const quotesHub = fs.readFileSync(path.join(process.cwd(), 'src/app/(app)/procurement/quotes/page.tsx'), 'utf8');
  assert(quotesHub.includes('table-container') && quotesHub.includes('enterprise-table'), 'Quotes hub uses enterprise table classes');

  const pposHub = fs.readFileSync(path.join(process.cwd(), 'src/app/(app)/procurement/ppos/page.tsx'), 'utf8');
  assert(pposHub.includes('table-container') && pposHub.includes('enterprise-table'), 'PPOs desk uses enterprise table classes');

  const negHub = fs.readFileSync(path.join(process.cwd(), 'src/app/(app)/procurement/negotiations/page.tsx'), 'utf8');
  assert(negHub.includes('table-container') && negHub.includes('enterprise-table'), 'Negotiations hub uses enterprise table classes');

  const budgetTx = fs.readFileSync(path.join(process.cwd(), 'src/app/(app)/budget/transactions/page.tsx'), 'utf8');
  assert(budgetTx.includes('table-container') && budgetTx.includes('enterprise-table'), 'Budget transactions ledger uses enterprise table classes');

  // SUMMARY
  console.log('\n============================================================');
  console.log(`TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('============================================================');

  await prisma.$disconnect();

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
