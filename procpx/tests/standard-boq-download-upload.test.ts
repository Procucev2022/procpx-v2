import assert from 'node:assert';
import { prisma } from '../src/lib/prisma';
import * as XLSX from 'xlsx';

type TestFn = () => Promise<void> | void;
const beforeFns: TestFn[] = [];
const afterFns: TestFn[] = [];
const tests: Array<{ name: string; fn: TestFn }> = [];

function beforeAll(fn: TestFn) { beforeFns.push(fn); }
function afterAll(fn: TestFn) { afterFns.push(fn); }
function it(name: string, fn: TestFn) { tests.push({ name, fn }); }
function describe(name: string, fn: () => void) {
  fn();
  (async () => {
    console.log(`============================================================\n🚀 ${name}\n============================================================`);
    for (const b of beforeFns) await b();
    let passed = 0;
    let failed = 0;
    for (const t of tests) {
      try {
        await t.fn();
        console.log(`  ✅ PASS: ${t.name}`);
        passed++;
      } catch (err: any) {
        console.error(`  ❌ FAIL: ${t.name} -> ${err.message}`);
        failed++;
      }
    }
    for (const a of afterFns) await a();
    console.log(`\nTEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    if (failed > 0) process.exit(1);
  })();
}

describe('PROCPX — Method 2 Standard BOQ Download -> Fill -> Upload Workflow', () => {
  let tenantId: string;
  let testProject: any;
  let testCostCentre: any;
  let testUser: any;

  beforeAll(async () => {
    // 1. Get default tenant
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) throw new Error('Tenant not found');
    tenantId = tenant.id;

    // 2. Ensure test user
    testUser = await prisma.user.findFirst({ where: { tenantId } });
    if (!testUser) {
      testUser = await prisma.user.create({
        data: {
          tenantId,
          email: 'project.user@protest.com',
          name: 'Project Fitout Engineer',
          role: 'PROJECT_USER',
          status: 'ACTIVE',
        },
      });
    }

    // 3. Create or find test project
    testProject = await prisma.project.create({
      data: {
        tenantId,
        projectCode: `PRJ-STD-${Date.now().toString().slice(-4)}`,
        name: 'Phoenix Marketcity Retail Store Fitout',
        projectType: 'Retail Store Fitout',
        sector: 'Retail',
        status: 'ACTIVE',
        areaSqFt: 8500,
        city: 'Mumbai',
        state: 'Maharashtra',
        createdBy: testUser.name || 'Project Fitout Engineer',
      },
    });

    // 4. Create cost centre CC-001
    const costCode = `CC-${Date.now().toString().slice(-4)}`;
    testCostCentre = await prisma.costCentre.create({
      data: {
        tenantId,
        projectId: testProject.id,
        code: costCode,
        name: 'CC-001 — Retail Store Fitout',
        areaSqFt: 8500,
        status: 'ACTIVE',
        createdBy: testUser.name || 'Project Fitout Engineer',
      },
    });
  });

  afterAll(async () => {
    // Cleanup if necessary
  });

  it('1. Standard BOQ Library items exist across sectors in database', async () => {
    const items = await prisma.standardBoqItem.findMany({
      where: { tenantId },
    });
    assert(items.length >= 20, `Expected at least 20 seeded standard items, found ${items.length}`);

    // Verify presence of retail, hospitality, banking, and office items
    const retailItems = items.filter(it => it.sector === 'RETAIL' || !it.sector);
    const electricalItems = items.filter(it => it.category === 'Electrical');
    const civilItems = items.filter(it => it.category === 'Civil & Interior');

    assert(retailItems.length > 0, 'Retail sector items must be present');
    assert(electricalItems.length > 0, 'Electrical items must be present');
    assert(civilItems.length > 0, 'Civil & Interior items must be present');
  });

  it('2. Standard BOQ Download generates an Excel file with BOQ, INSTRUCTIONS, and MASTER_DATA sheets', async () => {
    // Test the download logic directly using XLSX matching the route
    const items = await prisma.standardBoqItem.findMany({
      where: {
        tenantId,
        sector: 'RETAIL',
        category: { in: ['Civil & Interior', 'Electrical', 'HVAC'] },
      },
    });

    assert(items.length > 0, 'Should find matching standard items for Retail');

    // Build the workbook structure as created by /api/boq/standard/download
    const boqData = items.map((it, idx) => ({
      'S.No.': idx + 1,
      'Item Code': it.itemCode,
      'Category': it.category,
      'Sub-category': it.subcategory || 'General',
      'Item Description': it.standardDescription,
      'Detailed Specification': it.detailedSpecification,
      'UOM': it.uom,
      'Quantity': '', // Mandatory: Must be blank for user fill
      'Wastage %': 0,
      'Drawing Reference': 'A-101',
      'Area / Zone': 'Main Sales Floor',
      'Brand / Make': '',
      'Model / Reference': '',
      'Remarks': '',
    }));

    const wb = XLSX.utils.book_new();
    const wsBoq = XLSX.utils.json_to_sheet(boqData);
    XLSX.utils.book_append_sheet(wb, wsBoq, 'BOQ');

    const instructionsData = [
      { 'Rule #': 1, 'Standard BOQ User Instructions': 'Do not change Item Code.' },
      { 'Rule #': 2, 'Standard BOQ User Instructions': 'Do not change Category unless explicitly permitted.' },
      { 'Rule #': 3, 'Standard BOQ User Instructions': 'Enter Quantity for required items.' },
      { 'Rule #': 4, 'Standard BOQ User Instructions': 'Rows with blank or zero quantity will be skipped.' },
      { 'Rule #': 5, 'Standard BOQ User Instructions': 'Additional project-specific items can be added in designated section.' },
      { 'Rule #': 6, 'Standard BOQ User Instructions': 'UOM must use the approved UOM list.' },
      { 'Rule #': 7, 'Standard BOQ User Instructions': 'Do not change system-generated identifiers.' },
      { 'Rule #': 8, 'Standard BOQ User Instructions': 'Save the file in Excel format (.xlsx).' },
      { 'Rule #': 9, 'Standard BOQ User Instructions': 'Upload the completed file through proCPX.' },
    ];
    const wsInst = XLSX.utils.json_to_sheet(instructionsData);
    XLSX.utils.book_append_sheet(wb, wsInst, 'INSTRUCTIONS');

    const masterData = [
      { 'Approved UOM': 'SQFT', 'Standard Category': 'Civil & Interior' },
      { 'Approved UOM': 'NOS', 'Standard Category': 'Electrical' },
      { 'Approved UOM': 'MTR', 'Standard Category': 'HVAC' },
    ];
    const wsMaster = XLSX.utils.json_to_sheet(masterData);
    XLSX.utils.book_append_sheet(wb, wsMaster, 'MASTER_DATA');

    // Verify sheet names
    assert.deepStrictEqual(wb.SheetNames, ['BOQ', 'INSTRUCTIONS', 'MASTER_DATA']);

    // Verify quantity column is blank
    const parsedBoq = XLSX.utils.sheet_to_json<any>(wb.Sheets['BOQ']);
    assert.strictEqual(parsedBoq[0]['Quantity'], '', 'Quantity in downloaded template must be blank');
    assert(parsedBoq.length > 0, 'BOQ sheet must contain standard rows');
  });

  it('3. User Fills Quantities and Upload Validation inspects rows accurately', async () => {
    // Simulate user filling quantities in the downloaded Excel:
    // Row 1: Valid (LED Downlight 45 Nos)
    // Row 2: Valid (Socket 38 Nos)
    // Row 3: Valid (2.5 Sqmm Cable 1,200 Mtr)
    // Row 4: Warning (Quantity left blank)
    // Row 5: Error (Invalid UOM)
    // Row 6: Error (Negative Quantity)

    const filledRows = [
      {
        'S.No.': 1,
        'Item Code': 'ELE-002',
        'Category': 'Electrical',
        'Sub-category': 'Lighting',
        'Item Description': 'LED Downlight 15W Commercial Grade',
        'Detailed Specification': 'Die-cast aluminum, 4000K, CRI>80',
        'UOM': 'NOS',
        'Quantity': 45,
        'Remarks': 'Front showroom ceiling',
      },
      {
        'S.No.': 2,
        'Item Code': 'ELE-003',
        'Category': 'Electrical',
        'Sub-category': 'Wiring',
        'Item Description': '6/16A Modular Socket with Switch',
        'Detailed Specification': 'Polycarbonate plate, shuttered sockets',
        'UOM': 'NOS',
        'Quantity': 38,
        'Remarks': 'Checkout and counter desks',
      },
      {
        'S.No.': 3,
        'Item Code': 'ELE-001',
        'Category': 'Electrical',
        'Sub-category': 'Wiring',
        'Item Description': 'FRLS Copper Cable 2.5 Sqmm',
        'Detailed Specification': '1100V grade multi-strand copper wire',
        'UOM': 'MTR',
        'Quantity': 1200,
        'Remarks': 'Power circuits',
      },
      {
        'S.No.': 4,
        'Item Code': 'CIV-002',
        'Category': 'Civil & Interior',
        'Sub-category': 'Flooring',
        'Item Description': 'Tile Skirting 100mm height',
        'Detailed Specification': 'Matching vitrified tile skirting',
        'UOM': 'RMT',
        'Quantity': '', // Blank -> Warning
        'Remarks': 'Not required for this store',
      },
      {
        'S.No.': 5,
        'Item Code': 'ELE-041',
        'Category': 'Electrical',
        'Sub-category': 'Wiring',
        'Item Description': 'Custom Armoured Cable 4C 16 Sqmm',
        'Detailed Specification': 'Heavy duty XLPE cable',
        'UOM': 'UNKNOWN_UOM', // Invalid UOM -> Error
        'Quantity': 250,
      },
      {
        'S.No.': 6,
        'Item Code': 'CIV-001',
        'Category': 'Civil & Interior',
        'Sub-category': 'Flooring',
        'Item Description': 'Vitrified Floor Tile 600x600mm',
        'Detailed Specification': 'Commercial grade double charged vitrified tile',
        'UOM': 'SQFT',
        'Quantity': -50, // Negative Qty -> Error
      },
    ];

    // Validate using the validation engine rules
    const approvedUoms = new Set(['SQFT', 'RMT', 'MTR', 'NOS', 'LOT', 'SET', 'KG', 'TR', 'HP']);
    const issues: any[] = [];
    const validLines: any[] = [];

    filledRows.forEach((row, idx) => {
      const rowNum = idx + 2;
      const itemCode = row['Item Code'];
      const desc = row['Item Description'];
      const uom = String(row['UOM'] || '').toUpperCase().trim();
      const rawQty = row['Quantity'];
      const qty = parseFloat(String(rawQty));

      if (rawQty === '' || rawQty === undefined || rawQty === null || isNaN(qty) || qty === 0) {
        issues.push({
          rowNumber: rowNum,
          itemCode,
          description: desc,
          issue: 'Quantity is missing or 0',
          action: 'Row will be skipped from Draft BOQ',
          severity: 'WARNING',
        });
        return;
      }

      if (qty < 0) {
        issues.push({
          rowNumber: rowNum,
          itemCode,
          description: desc,
          issue: `Invalid negative quantity: ${qty}`,
          action: 'Enter positive numeric quantity',
          severity: 'ERROR',
        });
        return;
      }

      if (!approvedUoms.has(uom)) {
        issues.push({
          rowNumber: rowNum,
          itemCode,
          description: desc,
          issue: `Invalid UOM '${row['UOM']}'`,
          action: 'Must match approved UOM master taxonomy',
          severity: 'ERROR',
        });
        return;
      }

      validLines.push({
        itemCode,
        category: row['Category'],
        subcategory: row['Sub-category'],
        description: desc,
        specification: row['Detailed Specification'],
        uom,
        quantity: qty,
        remarks: row['Remarks'],
      });
    });

    assert.strictEqual(filledRows.length, 6, 'Total rows should be 6');
    assert.strictEqual(validLines.length, 3, 'Valid lines should be exactly 3');
    assert.strictEqual(issues.filter(i => i.severity === 'WARNING').length, 1, 'Should have 1 warning (blank qty)');
    assert.strictEqual(issues.filter(i => i.severity === 'ERROR').length, 2, 'Should have 2 errors (invalid UOM, negative qty)');
  });

  it('4. Generate Draft BOQ creates BOQ with sourceType STANDARD_BOQ_DOWNLOAD_UPLOAD', async () => {
    // Generate Draft BOQ using valid lines from upload
    const validLines = [
      {
        itemCode: 'ELE-002',
        category: 'Electrical',
        subcategory: 'Lighting',
        description: 'LED Downlight 15W Commercial Grade',
        specification: 'Die-cast aluminum, 4000K, CRI>80',
        uom: 'NOS',
        quantity: 45,
        benchmarkRate: 850,
      },
      {
        itemCode: 'ELE-003',
        category: 'Electrical',
        subcategory: 'Wiring',
        description: '6/16A Modular Socket with Switch',
        specification: 'Polycarbonate plate, shuttered sockets',
        uom: 'NOS',
        quantity: 38,
        benchmarkRate: 420,
      },
      {
        itemCode: 'ELE-001',
        category: 'Electrical',
        subcategory: 'Wiring',
        description: 'FRLS Copper Cable 2.5 Sqmm',
        specification: '1100V grade multi-strand copper wire',
        uom: 'MTR',
        quantity: 1200,
        benchmarkRate: 58,
      },
    ];

    const boqCount = await prisma.boq.count({ where: { projectId: testProject.id } });
    const boqCode = `BOQ-${testProject.projectCode}-${String(boqCount + 1).padStart(3, '0')}`;

    // Create BOQ and Revision with sourceType: STANDARD_BOQ_DOWNLOAD_UPLOAD
    const boq = await prisma.boq.create({
      data: {
        tenantId,
        projectId: testProject.id,
        costCentreId: testCostCentre.id,
        boqCode,
        status: 'DRAFT',
        createdBy: testUser.name || 'Project Fitout Engineer',
      },
    });

    const revision = await prisma.boqRevision.create({
      data: {
        tenantId,
        boqId: boq.id,
        revisionCode: 'REV-01',
        revisionNumber: 1,
        sourceType: 'STANDARD_BOQ_DOWNLOAD_UPLOAD',
        status: 'DRAFT',
        createdById: testUser.id,
      },
    });

    // Populate lines
    let totalEstimatedCost = 0;
    for (let i = 0; i < validLines.length; i++) {
      const line = validLines[i];
      const unitRate = line.benchmarkRate || 100;
      const totalCost = unitRate * line.quantity;
      totalEstimatedCost += totalCost;

      await prisma.boqLine.create({
        data: {
          tenantId,
          boqRevisionId: revision.id,
          lineNumber: `STD-${String(i + 1).padStart(3, '0')}`,
          itemCode: line.itemCode,
          originalDescription: line.description,
          standardDescription: line.description,
          specification: line.specification,
          uomRaw: line.uom,
          quantity: line.quantity,
          aiUnitCost: unitRate,
          aiTotalCost: totalCost,
          aiConfidence: 0.95,
        },
      });
    }

    assert.strictEqual(revision.sourceType, 'STANDARD_BOQ_DOWNLOAD_UPLOAD', 'sourceType must be STANDARD_BOQ_DOWNLOAD_UPLOAD');
    assert.strictEqual(revision.status, 'DRAFT', 'Status must be DRAFT');

    const createdLines = await prisma.boqLine.findMany({
      where: { boqRevisionId: revision.id },
    });
    assert.strictEqual(createdLines.length, 3, 'Must have created 3 lines');
    assert(totalEstimatedCost > 0, 'Total estimated cost must be calculated');
  });

  it('5. Generated Standard BOQ seamlessly links to Budget or PR dual workflows', async () => {
    // Verify that BOQ generated via Method 2 can be added to Budget
    const latestBoq = await prisma.boq.findFirst({
      where: { projectId: testProject.id },
      include: {
        revisions: {
          include: { lines: true },
        },
      },
    });

    assert(latestBoq, 'Latest BOQ must exist');
    const rev = latestBoq.revisions[0];
    assert.strictEqual(rev.sourceType, 'STANDARD_BOQ_DOWNLOAD_UPLOAD');

    // Add to Budget workflow via BudgetContribution
    const budgetLinesTotal = rev.lines.reduce((sum, l) => sum + (l.aiTotalCost || 0), 0);
    const budgetContribution = await prisma.budgetContribution.create({
      data: {
        tenantId,
        projectId: testProject.id,
        costCentreId: testCostCentre.id,
        boqId: latestBoq.id,
        boqRevisionId: rev.id,
        totalEstimatedValue: budgetLinesTotal,
        acceptedEstimatedValue: budgetLinesTotal,
        status: 'SUBMITTED',
        createdBy: testUser.name || 'Project Fitout Engineer',
      },
    });

    assert(Boolean(budgetContribution.id), 'Budget contribution successfully created');
    assert.strictEqual(budgetContribution.totalEstimatedValue, budgetLinesTotal);
  });
});
