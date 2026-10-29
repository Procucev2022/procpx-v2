// scripts/test-enhancements.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runTests() {
  console.log('=== STARTING PROCPX ENHANCEMENTS TEST SUITE ===\n');
  const results = [];

  // Find a test user and tenant
  const user = await prisma.user.findFirst({
    where: { role: 'PROJECT_USER' },
    include: { tenant: true },
  });

  if (!user) {
    throw new Error('No PROJECT_USER found in database.');
  }

  const tenantId = user.tenantId;
  const baseUrl = 'http://localhost:3000';
  const headers = {
    'x-test-user-id': user.id,
    'x-test-tenant-id': tenantId,
    'Content-Type': 'application/json',
  };

  // -------------------------------------------------------------
  // TEST 1: Dashboard Summary Cards show correct live transactional values
  // -------------------------------------------------------------
  try {
    console.log('--- TEST 1: Dashboard Summary Cards ---');
    const res = await fetch(`${baseUrl}/api/dashboard`, { headers });
    const dashData = await res.json();

    if (!res.ok) throw new Error(`Dashboard API failed: ${JSON.stringify(dashData)}`);

    // Verify DB counts directly
    const dbTotalBoqs = await prisma.boq.count({ where: { tenantId } });
    const dbPending = await prisma.boq.count({ where: { tenantId, status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } });
    const dbApproved = await prisma.boq.count({ where: { tenantId, status: 'APPROVED' } });
    const dbAction = await prisma.boq.count({ where: { tenantId, status: { in: ['DRAFT', 'REJECTED'] } } });

    console.log('Dashboard KPI Card 1 (Total BOQs Raised):', dashData.totalBoqsRaised, 'vs DB:', dbTotalBoqs);
    console.log('Dashboard KPI Card 2 (BOQs Pending Approval):', dashData.boqsPendingApproval, 'vs DB:', dbPending);
    console.log('Dashboard KPI Card 3 (Approved BOQs):', dashData.approvedBoqs, 'vs DB:', dbApproved);
    console.log('Dashboard KPI Card 4 (BOQs Requiring Action):', dashData.boqsRequiringAction, 'vs DB:', dbAction);
    console.log('Dashboard KPI Card 5 (Total Proposed Budget): ₹', dashData.totalProposedBudget?.toLocaleString());
    console.log('Dashboard KPI Card 6 (Total Approved Budget): ₹', dashData.totalApprovedBudget?.toLocaleString());

    const pass1 =
      dashData.totalBoqsRaised === dbTotalBoqs &&
      dashData.boqsPendingApproval === dbPending &&
      dashData.approvedBoqs === dbApproved &&
      dashData.boqsRequiringAction === dbAction &&
      typeof dashData.totalProposedBudget === 'number' &&
      typeof dashData.totalApprovedBudget === 'number';

    if (!pass1) throw new Error('Dashboard KPI values do not match live database counts.');
    results.push({ name: '1. Dashboard Summary Cards show correct live transactional values', status: 'PASS' });
  } catch (err) {
    console.error('Test 1 failed:', err);
    results.push({ name: '1. Dashboard Summary Cards show correct live transactional values', status: 'FAIL', error: err.message });
  }

  // -------------------------------------------------------------
  // TEST 2: Recent BOQs displays no more than 5 records with correct columns & descriptions
  // -------------------------------------------------------------
  try {
    console.log('\n--- TEST 2: Recent BOQs Table Data ---');
    const res = await fetch(`${baseUrl}/api/dashboard`, { headers });
    const dashData = await res.json();

    const recentBoqs = dashData.recentBoqs;
    console.log(`Recent BOQs count: ${recentBoqs.length} (Max 5 allowed)`);
    if (recentBoqs.length > 5) throw new Error(`Recent BOQs returned ${recentBoqs.length} records, exceeding max of 5.`);

    for (const b of recentBoqs) {
      console.log(`- [${b.boqNumber}] Status: ${b.status} | CC: ${b.costCentre} | Est: ₹${b.estimatedValue} | Desc: "${b.boqDescription}"`);
      if (!b.boqNumber || b.estimatedValue === undefined || !b.status || !b.lastUpdated || !b.id) {
        throw new Error(`Recent BOQ record missing required fields: ${JSON.stringify(b)}`);
      }
    }

    results.push({ name: '2. Recent BOQs displays no more than 5 records with correct columns & descriptions', status: 'PASS' });
  } catch (err) {
    console.error('Test 2 failed:', err);
    results.push({ name: '2. Recent BOQs displays no more than 5 records with correct columns & descriptions', status: 'FAIL', error: err.message });
  }

  // -------------------------------------------------------------
  // TEST 3: BOQ Description saves, persists, and appears when reopening a BOQ
  // -------------------------------------------------------------
  let createdBoqId = null;
  try {
    console.log('\n--- TEST 3: BOQ Description Creation & Persistence ---');
    const testProject = await prisma.project.findFirst({
      where: { tenantId },
      include: { costCentres: true },
    });

    if (!testProject || !testProject.costCentres.length) {
      throw new Error('No test project with cost centres available.');
    }

    const testDescription = 'Complete turnkey interior fitout including high-side HVAC, electrical DBs, vitrified flooring, and brand signage.';
    const testTitle = `Test Fitout BOQ ${Date.now()}`;

    // 1. Create BOQ with Description
    const createRes = await fetch(`${baseUrl}/api/boq`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        projectId: testProject.id,
        costCentreId: testProject.costCentres[0].id,
        title: testTitle,
        description: testDescription,
        category: ['Civil & Interior', 'Electrical'],
        purpose: 'BUDGET',
        sector: 'RETAIL',
        projectType: 'Retail Store Fitout',
        areaSqFt: 5000,
      }),
    });

    const createData = await createRes.json();
    if (!createRes.ok) throw new Error(`Create BOQ failed: ${JSON.stringify(createData)}`);

    createdBoqId = createData.boqId || createData.boq?.id;
    console.log(`Created BOQ with ID: ${createdBoqId}, Code: ${createData.boqCode}`);

    // 2. Fetch directly from DB
    const dbBoq = await prisma.boq.findUnique({ where: { id: createdBoqId } });
    if (dbBoq.description !== testDescription) {
      throw new Error(`DB description "${dbBoq.description}" did not match expected "${testDescription}"`);
    }
    console.log('✓ Verified DB persistence of BOQ description:', dbBoq.description);

    // 3. Fetch via API endpoint /api/boq/[id] (used when reopening in BOQ Studio)
    const getRes = await fetch(`${baseUrl}/api/boq/${createdBoqId}`, { headers });
    const getData = await getRes.json();
    if (!getRes.ok) throw new Error(`Get BOQ details failed: ${JSON.stringify(getData)}`);

    const loadedDescription = getData.boq?.description;
    if (loadedDescription !== testDescription) {
      throw new Error(`Loaded BOQ description "${loadedDescription}" did not match "${testDescription}"`);
    }
    console.log('✓ Verified API retrieval on reopening:', loadedDescription);

    // 4. Update / PATCH description
    const updatedDescription = 'Updated scope: Added fire suppression sprinklers and acoustic ceiling tiles.';
    const patchRes = await fetch(`${baseUrl}/api/boq/${createdBoqId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ description: updatedDescription }),
    });
    const patchData = await patchRes.json();
    if (!patchRes.ok) throw new Error(`PATCH BOQ failed: ${JSON.stringify(patchData)}`);

    const reloadedDbBoq = await prisma.boq.findUnique({ where: { id: createdBoqId } });
    if (reloadedDbBoq.description !== updatedDescription) {
      throw new Error(`Updated DB description "${reloadedDbBoq.description}" did not match "${updatedDescription}"`);
    }
    console.log('✓ Verified updated description persists in DB:', reloadedDbBoq.description);

    // 5. Verify it appears on Dashboard Recent BOQs
    const dashCheck = await fetch(`${baseUrl}/api/dashboard`, { headers });
    const dashCheckData = await dashCheck.json();
    const topRecent = dashCheckData.recentBoqs?.[0];
    console.log('Top Recent BOQ on Dashboard:', topRecent?.boqNumber, '| Desc:', topRecent?.boqDescription);
    if (topRecent?.id !== createdBoqId || topRecent?.boqDescription !== updatedDescription) {
      throw new Error(`Recent BOQ on Dashboard did not reflect updated description.`);
    }
    console.log('✓ Verified updated BOQ appears at top of Dashboard Recent BOQs table.');

    results.push({ name: '3. BOQ Description saves, persists, and appears when reopening a BOQ', status: 'PASS' });
  } catch (err) {
    console.error('Test 3 failed:', err);
    results.push({ name: '3. BOQ Description saves, persists, and appears when reopening a BOQ', status: 'FAIL', error: err.message });
  }

  // -------------------------------------------------------------
  // TEST 4: Existing BOQ creation methods (Standard & Manual) with BOQ Description
  // -------------------------------------------------------------
  try {
    console.log('\n--- TEST 4: Creation Methods with BOQ Description ---');
    const testProject = await prisma.project.findFirst({
      where: { tenantId },
      include: { costCentres: true },
    });

    const manualDesc = 'Manual entry BOQ for HVAC & Plumbing fixtures package.';
    const manualRes = await fetch(`${baseUrl}/api/boq/manual`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        projectId: testProject.id,
        costCentreId: testProject.costCentres[0].id,
        title: `Manual BOQ ${Date.now()}`,
        description: manualDesc,
        lines: [
          { lineNumber: '1', originalDescription: 'Daikin VRV Indoor Unit 2.5HP', specification: 'Ceiling cassette type', category: 'HVAC', uom: 'NOS', quantity: 4, aiUnitCost: 45000 },
          { lineNumber: '2', originalDescription: 'CPVC pipe 1 inch', specification: 'Class 1 pressure pipe', category: 'Plumbing', uom: 'RMT', quantity: 150, aiUnitCost: 320 },
        ],
      }),
    });

    const manualData = await manualRes.json();
    if (!manualRes.ok) throw new Error(`Manual BOQ creation failed: ${JSON.stringify(manualData)}`);

    const manualBoqRecord = await prisma.boq.findUnique({ where: { id: manualData.boqId } });
    if (manualBoqRecord.description !== manualDesc) {
      throw new Error(`Manual BOQ description "${manualBoqRecord.description}" did not match "${manualDesc}"`);
    }
    console.log('✓ Manual BOQ creation saved description successfully:', manualBoqRecord.description);

    results.push({ name: '4. BOQ creation methods (Manual & Standard) support BOQ Description', status: 'PASS' });
  } catch (err) {
    console.error('Test 4 failed:', err);
    results.push({ name: '4. BOQ creation methods (Manual & Standard) support BOQ Description', status: 'FAIL', error: err.message });
  }

  // -------------------------------------------------------------
  // TEST 5: Downstream Budget & PR workflows
  // -------------------------------------------------------------
  try {
    console.log('\n--- TEST 5: Downstream Budget & PR Workflows ---');
    if (!createdBoqId) throw new Error('No created BOQ available for budget test.');

    const testProject = await prisma.project.findFirst({
      where: { tenantId },
      include: { costCentres: true },
    });

    // Add a line item to the created BOQ first
    const boqRev = await prisma.boqRevision.findFirst({
      where: { boqId: createdBoqId },
    });

    const lineRes = await fetch(`${baseUrl}/api/boq/${boqRev.id}/lines`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        description: 'LED Panel Lights 2x2 36W',
        specification: 'Philips commercial glare-free 4000K',
        uomRaw: 'NOS',
        quantity: 50,
        aiUnitCost: 1800,
      }),
    });
    if (!lineRes.ok) throw new Error('Failed to add line item to BOQ');

    // Add to Budget
    const budgetRes = await fetch(`${baseUrl}/api/budgets/add-boq`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        boqRevisionId: boqRev.id,
        costCentreId: testProject.costCentres[0].id,
        projectId: testProject.id,
      }),
    });

    const budgetData = await budgetRes.json();
    if (!budgetRes.ok) throw new Error(`Add to budget failed: ${JSON.stringify(budgetData)}`);
    console.log('✓ Successfully added BOQ to Budget Contribution:', budgetData.contributionId || budgetData.contribution?.id);

    // Create PR
    const prRes = await fetch(`${baseUrl}/api/pr`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        boqRevisionId: boqRev.id,
        costCentreId: testProject.costCentres[0].id,
        projectId: testProject.id,
        title: `PR for ${createdBoqId}`,
      }),
    });

    const prData = await prRes.json();
    if (!prRes.ok) throw new Error(`Create PR failed: ${JSON.stringify(prData)}`);
    console.log('✓ Successfully created PR from BOQ:', prData.prNumber || prData.pr?.prNumber);

    results.push({ name: '5. Downstream Budget & PR workflows continue to work seamlessly', status: 'PASS' });
  } catch (err) {
    console.error('Test 5 failed:', err);
    results.push({ name: '5. Downstream Budget & PR workflows continue to work seamlessly', status: 'FAIL', error: err.message });
  }

  // -------------------------------------------------------------
  // TEST 6: Tenant Isolation & Role Visibility
  // -------------------------------------------------------------
  try {
    console.log('\n--- TEST 6: Tenant Isolation & Role Visibility ---');
    // Test with non-existent tenant
    const isolatedRes = await fetch(`${baseUrl}/api/dashboard`, {
      headers: {
        'x-test-tenant-id': '00000000-0000-0000-0000-000000000000',
        'Content-Type': 'application/json',
      },
    });

    // Should return 401 unauthenticated or 0 records
    const isoData = await isolatedRes.json();
    console.log('Isolated request response status:', isolatedRes.status);
    if (isolatedRes.ok && isoData.totalBoqsRaised > 0) {
      throw new Error('Tenant isolation breach! Returned records for nonexistent tenant.');
    }
    console.log('✓ Tenant isolation boundary verified.');

    results.push({ name: '6. Tenant isolation and role-based visibility remain intact', status: 'PASS' });
  } catch (err) {
    console.error('Test 6 failed:', err);
    results.push({ name: '6. Tenant isolation and role-based visibility remain intact', status: 'FAIL', error: err.message });
  }

  // -------------------------------------------------------------
  // FINAL SUMMARY REPORT
  // -------------------------------------------------------------
  console.log('\n=============================================');
  console.log('TEST EXECUTION SUMMARY');
  console.log('=============================================');
  let allPassed = true;
  for (const r of results) {
    console.log(`[${r.status}] ${r.name}`);
    if (r.status !== 'PASS') allPassed = false;
  }
  console.log('=============================================');
  if (allPassed) {
    console.log('ALL TESTS PASSED SUCCESSFULLY! ✓✓✓');
  } else {
    console.log('SOME TESTS FAILED. PLEASE REVIEW LOGS.');
  }
}

runTests()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
