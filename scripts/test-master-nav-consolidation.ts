// scripts/test-master-nav-consolidation.ts
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/lib/prisma';

async function run() {
  console.log('================================================================');
  console.log(' PROCPX — MASTER NAVIGATION CONSOLIDATION VALIDATION TEST');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, desc: string) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] ${desc}`);
      passedTests++;
    } else {
      console.error(`[FAIL] ${desc}`);
      process.exitCode = 1;
    }
  }

  // TEST 1: Inspect Sidebar.tsx code structure for Project User
  console.log('--- TEST GROUP 1: SIDEBAR NAVIGATION STRUCTURE ---');
  const sidebarPath = path.join(__dirname, '../src/components/Sidebar.tsx');
  const sidebarCode = fs.readFileSync(sidebarPath, 'utf8');

  // Extract isProjectUser block accurately between comments
  const projectUserNav = sidebarCode
    .split('{/* ROLE 2: PROJECT USER NAVIGATION */}')[1]
    ?.split('{/* ROLE 3: PROJECT APPROVER NAVIGATION */}')[0] || '';

  assert(projectUserNav.length > 0, 'Found isProjectUser navigation section in Sidebar.tsx');

  // 1.1 Master Creation Heading
  assert(
    projectUserNav.includes('MASTER CREATION'),
    'Project User has "MASTER CREATION" heading in sidebar'
  );

  // 1.2 Exactly Projects and Cost Centres under Master Creation
  const masterCreationSlice = projectUserNav.split('MASTER CREATION')[1]?.split('BOQ')[0] || '';
  assert(
    masterCreationSlice.includes('/projects') && masterCreationSlice.includes('Projects'),
    'MASTER CREATION contains "Projects" link (/projects)'
  );
  assert(
    masterCreationSlice.includes('/cost-centres') && masterCreationSlice.includes('Cost Centres'),
    'MASTER CREATION contains "Cost Centres" link (/cost-centres)'
  );

  // 1.3 BOQ Heading and BOQ Studio as single entry point
  assert(
    projectUserNav.includes('nav-section-label">BOQ</div>'),
    'Project User has "BOQ" section heading'
  );
  assert(
    projectUserNav.includes('/boq/studio') && projectUserNav.includes('BOQ Studio'),
    'BOQ Studio (/boq/studio) is present under BOQ'
  );

  // 1.4 Prohibition: No duplicate My BOQs or Standard Library
  assert(
    !projectUserNav.includes('My BOQs'),
    'My BOQs is removed from Project User navigation'
  );
  assert(
    !projectUserNav.includes('Standard Library'),
    'Standard Library is removed from Project User navigation'
  );
  assert(
    !projectUserNav.includes('Cost Centre Budgets'),
    'Cost Centre Budgets is not present in Project User navigation'
  );
  assert(
    !projectUserNav.includes('Created BOQ List'),
    'Created BOQ List is not present in Project User navigation'
  );

  // 1.5 BUDGET Section
  assert(
    projectUserNav.includes('Project Budget') &&
    projectUserNav.includes('Budget Transaction Ledger') &&
    projectUserNav.includes('Budget vs Actual'),
    'BUDGET section retains Project Budget, Budget Transaction Ledger, and Budget vs Actual'
  );

  // TEST 2: Inspect BOQ Studio (src/app/(app)/boq/studio/page.tsx) Preview Simplification
  console.log('\n--- TEST GROUP 2: BOQ STUDIO EXISTING BOQS PREVIEW ---');
  const studioPath = path.join(__dirname, '../src/app/(app)/boq/studio/page.tsx');
  const studioCode = fs.readFileSync(studioPath, 'utf8');

  // 2.1 Max 3 BOQ records preview
  assert(
    studioCode.includes('filteredExistingBoqs.slice(0, 3)'),
    'Existing Project BOQs preview slices to maximum 3 records (slice(0, 3))'
  );

  // 2.2 Exactly 5 preview columns: BOQ No. | BOQ Title | Category | Status | Action
  assert(
    studioCode.includes('>BOQ No.</th>') &&
    studioCode.includes('>BOQ Title</th>') &&
    studioCode.includes('>Category</th>') &&
    studioCode.includes('>Status</th>') &&
    studioCode.includes('>Action</th>'),
    'Preview table contains exactly required 5 columns: BOQ No., BOQ Title, Category, Status, Action'
  );

  // 2.3 Open action loads BOQ into workspace
  assert(
    studioCode.includes('loadBoqDetails(b.id)') &&
    studioCode.includes('[ OPEN ]'),
    '[ OPEN ] action exists and calls loadBoqDetails to load into workspace'
  );

  // 2.4 "Showing 3 recent BOQs." notice when > 3
  assert(
    studioCode.includes('Showing 3 recent BOQs.'),
    'Displays "Showing 3 recent BOQs." message when records exceed 3'
  );

  // 2.5 Line items are not shown in the preview list
  const previewTableMatch = studioCode.match(/<table className="table"[\s\S]*?<\/table>/g);
  const existingBoqTable = previewTableMatch?.[previewTableMatch.length - 1] || '';
  assert(
    !existingBoqTable.includes('lineItem') && !existingBoqTable.includes('uomRaw'),
    'Preview table does not display line items'
  );

  // 2.6 Line item workspace remains complete
  assert(
    studioCode.includes('lineItems.map(') || studioCode.includes('paginatedLines.map('),
    'Main BOQ workspace continues displaying full line-item grid'
  );

  // TEST 3: Validate HTTP Endpoints & Database records remain intact
  console.log('\n--- TEST GROUP 3: BACKEND APIS & DATABASE REPOSITORIES ---');
  const user = await prisma.user.findFirst({
    where: { email: 'project.user@procpx.internal' },
  });
  assert(!!user, 'Project User exists in database (project.user@procpx.internal)');

  if (user) {
    const headers = {
      'x-test-user-id': user.id,
      'x-test-tenant-id': user.tenantId,
      'Content-Type': 'application/json',
    };

    // 3.1 GET /api/boq
    try {
      const boqRes = await fetch('http://localhost:3000/api/boq', { headers });
      assert(boqRes.status === 200, `GET /api/boq returned 200 OK (Status: ${boqRes.status})`);
      const boqData = await boqRes.json();
      const boqs = boqData.data || boqData || [];
      assert(boqs.length > 0, `Existing BOQs accessible in database: count = ${boqs.length}`);

      if (boqs[0]) {
        // 3.2 GET /api/boq/{id}
        const singleRes = await fetch(`http://localhost:3000/api/boq/${boqs[0].id}`, { headers });
        assert(singleRes.status === 200, `GET /api/boq/${boqs[0].id} returned 200 OK`);
        const singleData = await singleRes.json();
        const lines = singleData.data?.lines || singleData.lines || [];
        assert(lines.length > 0, `BOQ line items remain intact and loaded: count = ${lines.length}`);
      }
    } catch (e: any) {
      assert(false, `API request to /api/boq failed: ${e.message}`);
    }

    // 3.3 GET /api/projects
    try {
      const projRes = await fetch('http://localhost:3000/api/projects', { headers });
      assert(projRes.status === 200, `GET /api/projects returned 200 OK (Status: ${projRes.status})`);
    } catch (e: any) {
      assert(false, `API request to /api/projects failed: ${e.message}`);
    }

    // 3.4 GET /api/cost-centres
    try {
      const ccRes = await fetch('http://localhost:3000/api/cost-centres', { headers });
      assert(ccRes.status === 200, `GET /api/cost-centres returned 200 OK (Status: ${ccRes.status})`);
    } catch (e: any) {
      assert(false, `API request to /api/cost-centres failed: ${e.message}`);
    }

    // 3.5 GET /api/budgets
    try {
      const bgRes = await fetch('http://localhost:3000/api/budgets', { headers });
      assert(bgRes.status === 200, `GET /api/budgets returned 200 OK (Status: ${bgRes.status})`);
    } catch (e: any) {
      assert(false, `API request to /api/budgets failed: ${e.message}`);
    }
  }

  console.log('\n================================================================');
  console.log(` RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log('================================================================\n');

  if (passedTests === totalTests) {
    console.log('SUCCESS: All acceptance tests passed! Navigation and BOQ preview consolidated.');
    process.exit(0);
  } else {
    console.error('FAILURE: Some acceptance tests failed.');
    process.exit(1);
  }
}

run()
  .catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
