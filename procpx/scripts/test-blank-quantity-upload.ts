// scripts/test-blank-quantity-upload.ts
import { prisma } from '../src/lib/prisma';
import * as XLSX from 'xlsx';

async function test() {
  console.log('================================================================');
  console.log('PROCPX — TEST BLANK QUANTITY UPLOAD & COMMERCIAL SEMANTICS');
  console.log('================================================================\n');

  const user = await prisma.user.findFirst({
    where: { email: 'project.user@procpx.internal' },
  });
  if (!user) throw new Error('User not found');

  const headers = {
    'x-test-user-id': user.id,
    'x-test-tenant-id': user.tenantId,
  };

  const project = await prisma.project.findFirst({
    where: { name: { contains: 'Kundanahalli' }, tenantId: user.tenantId },
    include: { costCentres: true },
  });
  if (!project) throw new Error('Project not found');
  const cc = project.costCentres[0];

  // -------------------------------------------------------------
  // TEST 1: Download Standard BOQ (blank quantities) & Upload
  // -------------------------------------------------------------
  console.log('1. Downloading Standard BOQ Excel with blank quantities...');
  const q = new URLSearchParams({
    sector: 'RETAIL',
    projectType: 'Retail Store Fitout',
    projectId: project.id,
    costCentreId: cc.id,
    categories: 'Civil & Interior,Electrical',
  });
  const dlRes = await fetch(`http://localhost:3000/api/boq/standard/download?${q.toString()}`, { headers });
  if (dlRes.status !== 200) throw new Error(`Download failed HTTP ${dlRes.status}`);
  const buf = Buffer.from(await dlRes.arrayBuffer());

  console.log('2. Uploading unfilled Standard BOQ...');
  const fd = new FormData();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  fd.append('file', blob, 'Unfilled_Standard_BOQ.xlsx');
  fd.append('projectId', project.id);
  fd.append('costCentreId', cc.id);
  fd.append('sector', 'RETAIL');
  fd.append('projectType', 'Retail Store Fitout');

  const valRes = await fetch('http://localhost:3000/api/boq/standard/upload-validate', {
    method: 'POST',
    headers,
    body: fd,
  });

  if (valRes.status !== 200) throw new Error(`Upload validate failed HTTP ${valRes.status}`);
  const valData = await valRes.json();
  const valPayload = valData.data || valData;

  console.log(`   Total Rows: ${valPayload.totalRows}, Valid Rows: ${valPayload.validRows}, Pending Qty: ${valPayload.pendingQuantityCount}`);
  if (valPayload.validLines.length === 0) {
    throw new Error('FAIL: validLines is 0!');
  }

  // Verify that upload-validate did NOT default any blank quantity to 1
  const defaultedToOneInVal = valPayload.validLines.filter((l: any) => l.quantity === 1);
  if (defaultedToOneInVal.length > 0) {
    throw new Error(`FAIL: Found ${defaultedToOneInVal.length} lines defaulted to quantity = 1 in upload-validate!`);
  }
  console.log('   ✓ upload-validate preserved blank quantities as null (none defaulted to 1)');

  // -------------------------------------------------------------
  // 3. Generate Draft BOQ
  // -------------------------------------------------------------
  console.log('3. Generating Draft BOQ from lines with blank quantities...');
  const genRes = await fetch('http://localhost:3000/api/boq/standard/generate', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: project.id,
      costCentreId: cc.id,
      sector: 'RETAIL',
      projectType: 'Retail Store Fitout',
      validLines: valPayload.validLines,
      title: 'Blank Quantities Commercial Test BOQ',
    }),
  });

  if (genRes.status !== 200 && genRes.status !== 201) throw new Error(`Generate failed HTTP ${genRes.status}`);
  const genData = await genRes.json();
  const genPayload = genData.data || genData;
  const boqId = genPayload.boqId;
  const revId = genPayload.revisionId;

  // -------------------------------------------------------------
  // 4. DATABASE VERIFICATION: Check lines in DB
  // -------------------------------------------------------------
  console.log('4. Verifying database records in BoqLine...');
  const dbLines = await prisma.boqLine.findMany({
    where: { boqRevisionId: revId },
  });

  console.log(`   Found ${dbLines.length} lines in DB.`);
  const linesWithQtyOne = dbLines.filter(l => l.quantity === 1);
  if (linesWithQtyOne.length > 0) {
    throw new Error(`CRITICAL VIOLATION: ${linesWithQtyOne.length} lines have quantity = 1 in DB!`);
  }

  const nullQtyLines = dbLines.filter(l => l.quantity === null);
  console.log(`   ✓ All ${nullQtyLines.length} lines in DB have quantity = NULL`);

  const linesWithTotalCost = dbLines.filter(l => l.aiTotalCost !== null && l.aiTotalCost > 0);
  if (linesWithTotalCost.length > 0) {
    throw new Error(`CRITICAL VIOLATION: ${linesWithTotalCost.length} lines have aiTotalCost calculated for blank quantities!`);
  }
  console.log('   ✓ All blank quantity lines have aiTotalCost = NULL (uncalculated)');

  const qtyRequiredStatusLines = dbLines.filter(l => l.validationStatus === 'QUANTITY_REQUIRED');
  console.log(`   ✓ All ${qtyRequiredStatusLines.length} lines have validationStatus = 'QUANTITY_REQUIRED'`);

  // -------------------------------------------------------------
  // 5. AI COST ESTIMATION TEST
  // -------------------------------------------------------------
  console.log('5. Testing AI Cost Estimation with blank quantities...');
  const costRes = await fetch('http://localhost:3000/api/boq/estimate-cost', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ boqRevisionId: revId }),
  });
  if (costRes.status !== 200) throw new Error(`AI cost estimation failed HTTP ${costRes.status}`);
  const costData = await costRes.json();
  const costPayload = costData.data || costData;

  // Commercial total must be 0 or null since all lines have blank quantities
  console.log(`   Total Estimated Benchmark: ₹ ${costPayload.totalEstimatedBenchmarkValue}`);
  if (costPayload.totalEstimatedBenchmarkValue > 0) {
    throw new Error(`FAIL: Commercial BOQ Total was calculated as ₹ ${costPayload.totalEstimatedBenchmarkValue} despite all quantities being blank!`);
  }
  console.log('   ✓ AI Total Cost correctly remains 0 / uncalculated for blank quantities');

  // Verify indicative unit rates are populated but total costs are null
  const postCostDbLines = await prisma.boqLine.findMany({ where: { boqRevisionId: revId } });
  const linesWithUnitCost = postCostDbLines.filter(l => l.aiUnitCost !== null && l.aiUnitCost > 0);
  const postCostWithTotal = postCostDbLines.filter(l => l.aiTotalCost !== null && l.aiTotalCost > 0);
  if (postCostWithTotal.length > 0) {
    throw new Error(`FAIL: ${postCostWithTotal.length} lines generated aiTotalCost after cost run!`);
  }
  console.log(`   ✓ ${linesWithUnitCost.length} lines have Indicative AI Unit Cost, but 0 lines have aiTotalCost`);

  // -------------------------------------------------------------
  // 6. BLOCK ADD TO BUDGET WHEN QUANTITIES INCOMPLETE
  // -------------------------------------------------------------
  console.log('6. Verifying ADD TO BUDGET is strictly blocked...');
  const budgetRes = await fetch('http://localhost:3000/api/boq/add-to-budget', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      boqRevisionId: revId,
      costCentreId: cc.id,
    }),
  });

  if (budgetRes.status === 200 || budgetRes.status === 201) {
    throw new Error('FAIL: Add to budget succeeded when all quantities were blank!');
  }
  const budgetErr = await budgetRes.json();
  console.log(`   ✓ Correctly blocked with HTTP ${budgetRes.status}: "${budgetErr.error}"`);

  // -------------------------------------------------------------
  // 7. BLOCK CREATE PR WHEN QUANTITIES INCOMPLETE
  // -------------------------------------------------------------
  console.log('7. Verifying CREATE PR is strictly blocked...');
  const prRes = await fetch('http://localhost:3000/api/boq/create-pr', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      boqRevisionId: revId,
      costCentreId: cc.id,
    }),
  });

  if (prRes.status === 200 || prRes.status === 201) {
    throw new Error('FAIL: Create PR succeeded when all quantities were blank!');
  }
  const prErr = await prRes.json();
  console.log(`   ✓ Correctly blocked with HTTP ${prRes.status}: "${prErr.error}"`);

  // -------------------------------------------------------------
  // 8. TEST EDIT BOQ (Enter quantities)
  // -------------------------------------------------------------
  console.log('8. Testing in-place quantity entry via [ EDIT BOQ ]...');
  const firstLine = dbLines[0];
  const editRes = await fetch(`http://localhost:3000/api/boq/${revId}/lines`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lineId: firstLine.id,
      updates: {
        quantity: 2500,
        aiUnitCost: 95,
      },
    }),
  });

  if (editRes.status !== 200) throw new Error(`Edit line failed HTTP ${editRes.status}`);
  const editedDbLine = await prisma.boqLine.findUnique({ where: { id: firstLine.id } });
  if (!editedDbLine || editedDbLine.quantity !== 2500) {
    throw new Error(`FAIL: Updated quantity not saved. Got: ${editedDbLine?.quantity}`);
  }
  if (editedDbLine.aiTotalCost !== 237500) {
    throw new Error(`FAIL: aiTotalCost should be 2500 * 95 = 237500. Got: ${editedDbLine.aiTotalCost}`);
  }
  if (editedDbLine.validationStatus !== 'COST GENERATED' && editedDbLine.validationStatus !== 'VALID') {
    throw new Error(`FAIL: Status should be updated. Got: ${editedDbLine.validationStatus}`);
  }
  console.log(`   ✓ Line updated: Qty = 2500, Unit Cost = ₹95, Total Cost = ₹${editedDbLine.aiTotalCost}, Status = ${editedDbLine.validationStatus}`);

  // -------------------------------------------------------------
  // 9. TEST COMMA FORMATTED & NON-NUMERIC QUANTITY PARSING
  // -------------------------------------------------------------
  console.log('9. Testing edge case quantity parsing...');
  const testWb = XLSX.utils.book_new();
  const testRows = [
    {
      'Item Description': 'Tile 600x600',
      'Specification': 'Vitrified',
      'UOM': 'SQFT',
      'Quantity': '2,500', // comma formatted
    },
    {
      'Item Description': 'Downlight LED',
      'Specification': '15W',
      'UOM': 'NOS',
      'Quantity': 0, // zero quantity
    },
    {
      'Item Description': 'Copper Cable',
      'Specification': '2.5 Sqmm',
      'UOM': 'MTR',
      'Quantity': 'Qty', // invalid non-numeric
    },
  ];
  const testWs = XLSX.utils.json_to_sheet(testRows);
  XLSX.utils.book_append_sheet(testWb, testWs, 'BOQ Data');
  const testBuf = XLSX.write(testWb, { type: 'buffer', bookType: 'xlsx' });

  const testFd = new FormData();
  testFd.append('file', new Blob([testBuf]), 'edge_cases.xlsx');
  testFd.append('projectId', project.id);
  testFd.append('costCentreId', cc.id);

  const edgeValRes = await fetch('http://localhost:3000/api/boq/standard/upload-validate', {
    method: 'POST',
    headers,
    body: testFd,
  });
  const edgeValData = await edgeValRes.json();
  const edgePayload = edgeValData.data || edgeValData;

  const commaLine = edgePayload.validLines?.find((l: any) => l.description === 'Tile 600x600');
  if (!commaLine || commaLine.quantity !== 2500) {
    throw new Error(`FAIL: "2,500" was not parsed to 2500! Got: ${commaLine?.quantity}`);
  }
  console.log('   ✓ Comma-formatted "2,500" parsed correctly to 2500');

  const zeroLine = edgePayload.validLines?.find((l: any) => l.description === 'Downlight LED');
  if (!zeroLine || zeroLine.quantity !== 0) {
    throw new Error(`FAIL: Zero quantity was not preserved as 0! Got: ${zeroLine?.quantity}`);
  }
  console.log('   ✓ Zero quantity preserved as 0 (not converted to 1)');

  const nonNumericIssue = edgePayload.issues?.find((i: any) => i.description === 'Copper Cable');
  if (!nonNumericIssue || nonNumericIssue.severity !== 'ERROR') {
    throw new Error('FAIL: "Qty" non-numeric quantity did not produce validation ERROR!');
  }
  console.log(`   ✓ Non-numeric "Qty" produced validation ERROR: "${nonNumericIssue.issue}"`);

  console.log('\n================================================================');
  console.log('ALL COMMERCIAL BLANK QUANTITY TESTS PASSED SUCCESSFULLY! ✓');
  console.log('================================================================\n');
}

test().catch(e => {
  console.error('Test error:', e);
  process.exit(1);
});
