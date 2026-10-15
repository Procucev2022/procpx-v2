// scripts/test-partial-blank-quantities.ts
import { prisma } from '../src/lib/prisma';
import * as XLSX from 'xlsx';

async function testPartialBlank() {
  console.log('================================================================');
  console.log('PROCPX — TEST PARTIAL QUANTITIES & DOWNSTREAM WORKFLOW');
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

  // 1. Create workbook with 10 items: 8 with quantities, 2 with blank quantities
  console.log('1. Creating test workbook with 10 items (8 with quantity, 2 blank)...');
  const rows = [];
  for (let i = 1; i <= 10; i++) {
    const isBlank = i === 4 || i === 8; // 2 blank lines
    rows.push({
      'S.No.': i,
      'Item Code': `STD-ITEM-${i}`,
      'Item Description': i % 2 === 0 ? `Cable 2.5 Sqmm Line ${i}` : `Floor Tile 600x600 Line ${i}`,
      'Specification / Scope': 'Heavy commercial grade',
      'UOM': i % 2 === 0 ? 'MTR' : 'SQFT',
      'Quantity': isBlank ? '' : 100 * i,
      'Location / Area': 'Retail Store',
      'Brand / Make': 'Standard Brand',
      'Benchmark Rate': i % 2 === 0 ? 65 : 125,
      '_Sector': 'RETAIL',
      '_ProjectType': 'Retail Store Fitout',
      '_ProjectID': project.id,
      '_CostCentreID': cc.id,
    });
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'BOQ Data');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // 2. Upload and validate
  console.log('2. Uploading & validating partial quantity BOQ...');
  const fd = new FormData();
  fd.append('file', new Blob([buf]), 'Partial_Quantities_BOQ.xlsx');
  fd.append('projectId', project.id);
  fd.append('costCentreId', cc.id);

  const valRes = await fetch('http://localhost:3000/api/boq/standard/upload-validate', {
    method: 'POST',
    headers,
    body: fd,
  });
  const valData = await valRes.json();
  const valPayload = valData.data || valData;

  console.log(`   Total Rows: ${valPayload.totalRows}, Valid Rows: ${valPayload.validRows}, Pending Qty: ${valPayload.pendingQuantityCount}`);
  if (valPayload.validRows !== 10) throw new Error(`Expected 10 valid rows, got ${valPayload.validRows}`);
  if (valPayload.pendingQuantityCount !== 2) throw new Error(`Expected 2 pending quantity lines, got ${valPayload.pendingQuantityCount}`);
  console.log('   ✓ All 10 lines recognized: 8 with quantity, 2 marked Quantity Required');

  // 3. Generate Draft BOQ
  console.log('3. Generating Draft BOQ...');
  const genRes = await fetch('http://localhost:3000/api/boq/standard/generate', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: project.id,
      costCentreId: cc.id,
      sector: 'RETAIL',
      projectType: 'Retail Store Fitout',
      validLines: valPayload.validLines,
      title: 'Partial Quantities Test BOQ',
    }),
  });
  const genData = await genRes.json();
  const genPayload = genData.data || genData;
  const revId = genPayload.revisionId;

  // 4. Inspect DB lines
  console.log('4. Inspecting database lines...');
  const dbLines = await prisma.boqLine.findMany({
    where: { boqRevisionId: revId },
    orderBy: { lineNumber: 'asc' },
  });
  if (dbLines.length !== 10) throw new Error(`Expected 10 lines in DB, got ${dbLines.length}`);

  const blankLines = dbLines.filter(l => l.quantity === null);
  const populatedLines = dbLines.filter(l => l.quantity !== null);
  if (blankLines.length !== 2 || populatedLines.length !== 8) {
    throw new Error(`FAIL: Expected 2 null qty and 8 populated qty. Got ${blankLines.length} null, ${populatedLines.length} populated.`);
  }

  for (const bLine of blankLines) {
    if (bLine.quantity !== null || bLine.aiTotalCost !== null) {
      throw new Error(`FAIL: Blank line ${bLine.lineNumber} has non-null qty (${bLine.quantity}) or total cost (${bLine.aiTotalCost})`);
    }
    if (bLine.validationStatus !== 'QUANTITY_REQUIRED') {
      throw new Error(`FAIL: Blank line ${bLine.lineNumber} status is ${bLine.validationStatus}, expected QUANTITY_REQUIRED`);
    }
  }
  console.log('   ✓ Database check: 8 lines have quantities and commercial totals, 2 lines have NULL quantity and NULL total cost');

  // 5. Test AI Cost run
  console.log('5. Running AI Cost estimation...');
  const costRes = await fetch('http://localhost:3000/api/boq/estimate-cost', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ boqRevisionId: revId }),
  });
  const costData = await costRes.json();
  const costPayload = costData.data || costData;

  // Verify that only the 8 populated lines sum into totalEstimatedBenchmarkValue
  const postCostLines = await prisma.boqLine.findMany({ where: { boqRevisionId: revId } });
  let expectedSum = 0;
  for (const l of postCostLines) {
    if (l.quantity !== null && l.quantity > 0 && l.aiTotalCost !== null) {
      expectedSum += l.aiTotalCost;
    }
  }

  console.log(`   Estimated BOQ Total: ₹ ${costPayload.totalEstimatedBenchmarkValue}, Sum of valid lines: ₹ ${expectedSum}`);
  if (Math.round(costPayload.totalEstimatedBenchmarkValue) !== Math.round(expectedSum)) {
    throw new Error(`FAIL: Total estimated benchmark does not match sum of valid lines!`);
  }
  console.log('   ✓ BOQ Total correctly excludes lines with pending quantities');

  // 6. Test Budget and PR blocking
  console.log('6. Verifying ADD TO BUDGET is blocked...');
  const budgetRes = await fetch('http://localhost:3000/api/boq/add-to-budget', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ boqRevisionId: revId, costCentreId: cc.id }),
  });
  if (budgetRes.status === 200 || budgetRes.status === 201) throw new Error('FAIL: Budget should be blocked!');
  const budgetErr = await budgetRes.json();
  console.log(`   ✓ Correctly blocked: "${budgetErr.error}"`);

  console.log('7. Verifying CREATE PR is blocked...');
  const prRes = await fetch('http://localhost:3000/api/boq/create-pr', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ boqRevisionId: revId, costCentreId: cc.id }),
  });
  if (prRes.status === 200 || prRes.status === 201) throw new Error('FAIL: PR should be blocked!');
  const prErr = await prRes.json();
  console.log(`   ✓ Correctly blocked: "${prErr.error}"`);

  // 8. Edit the 2 missing quantities
  console.log('8. User enters missing quantities for the 2 lines via [ EDIT BOQ ]...');
  for (const bLine of blankLines) {
    const editRes = await fetch(`http://localhost:3000/api/boq/${revId}/lines`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lineId: bLine.id,
        updates: {
          quantity: 500,
        },
      }),
    });
    if (editRes.status !== 200) throw new Error(`Edit failed for line ${bLine.id}`);
  }

  const updatedLines = await prisma.boqLine.findMany({ where: { boqRevisionId: revId } });
  const stillPending = updatedLines.filter(l => l.quantity === null || l.quantity <= 0);
  if (stillPending.length !== 0) {
    throw new Error(`FAIL: Expected 0 pending lines after edit, found ${stillPending.length}`);
  }
  console.log('   ✓ All 10 lines now have valid quantities in database');

  // 9. Now Add to Budget succeeds
  console.log('9. Re-attempting ADD TO BUDGET after quantities are filled...');
  const budgetSuccessRes = await fetch('http://localhost:3000/api/boq/add-to-budget', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ boqRevisionId: revId, costCentreId: cc.id }),
  });
  if (budgetSuccessRes.status !== 200 && budgetSuccessRes.status !== 201) {
    const err = await budgetSuccessRes.text();
    throw new Error(`Budget allocation failed after filling quantities: ${err}`);
  }
  const bData = await budgetSuccessRes.json();
  console.log(`   ✓ [ ADD TO BUDGET ] unlocked and succeeded! Transaction: ${bData.transactionCode}`);

  // 10. Now Create PR succeeds
  console.log('10. Re-attempting CREATE PR after quantities are filled...');
  const prSuccessRes = await fetch('http://localhost:3000/api/boq/create-pr', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ boqRevisionId: revId, costCentreId: cc.id }),
  });
  if (prSuccessRes.status !== 200 && prSuccessRes.status !== 201) {
    const err = await prSuccessRes.text();
    throw new Error(`PR creation failed after filling quantities: ${err}`);
  }
  const prData = await prSuccessRes.json();
  console.log(`   ✓ [ CREATE PR ] unlocked and succeeded! PR Number: ${prData.prNumber}`);

  console.log('\n================================================================');
  console.log('PARTIAL BLANK QUANTITY TEST PASSED FULLY! ✓');
  console.log('================================================================\n');
}

testPartialBlank().catch(e => {
  console.error('Test error:', e);
  process.exit(1);
});
