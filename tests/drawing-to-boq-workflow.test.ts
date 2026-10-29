import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/lib/prisma';
import { processDrawingFile } from '../src/lib/drawing-parser';

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

describe('PROCPX — Option 3: Drawing to BOQ End-to-End Workflow & Extraction Test', () => {
  let tenantId: string;
  let testProject: any;
  let testCostCentre: any;
  let testUser: any;
  let createdBoqId: string | null = null;
  const testDrawingPath = path.join(process.cwd(), 'scratch', 'test-drawing-a101.pdf');

  beforeAll(async () => {
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) throw new Error('Tenant not found');
    tenantId = tenant.id;

    testUser = await prisma.user.findFirst({ where: { tenantId } });
    if (!testUser) throw new Error('User not found');

    testProject = await prisma.project.findFirst({ where: { tenantId } });
    if (!testProject) throw new Error('Project not found');

    testCostCentre = await prisma.costCentre.findFirst({ where: { tenantId, projectId: testProject.id } });

    assert.ok(fs.existsSync(testDrawingPath), `Test drawing file must exist at ${testDrawingPath}`);
  });

  afterAll(async () => {
    // Clean up only the temporary BOQ created during this test
    if (createdBoqId) {
      const revs = await prisma.boqRevision.findMany({ where: { boqId: createdBoqId }, select: { id: true } });
      const revIds = revs.map(r => r.id);
      await prisma.boqLine.deleteMany({ where: { boqRevisionId: { in: revIds } } });
      await prisma.boqRevision.deleteMany({ where: { boqId: createdBoqId } });
      await prisma.auditLog.deleteMany({ where: { entityId: createdBoqId } });
      await prisma.boq.delete({ where: { id: createdBoqId } });
      console.log(`Cleaned up temporary test BOQ: ${createdBoqId}`);
    }
  });

  it('1. Native PDF parser accurately extracts architectural schedule items from drawing', async () => {
    const fileBuffer = fs.readFileSync(testDrawingPath);
    const result = await processDrawingFile(fileBuffer, 'test-drawing-a101.pdf', 'DWG-A-101');

    assert.strictEqual(result.success, true, 'Parser must succeed on valid architectural drawing PDF');
    assert.strictEqual(result.parserUsed, 'NATIVE_PDF_SCHEDULE', 'Must identify native architectural schedule parser');
    assert.strictEqual(result.totalDetected, 9, 'Should extract exactly 9 schedule items');
    assert.strictEqual(result.explicitCount, 8, 'Should identify 8 explicit quantities');
    assert.strictEqual(result.uncertainCount, 1, 'Should identify 1 uncertain quantity');

    // Verify explicit items
    const door1 = result.items.find(i => i.mark === 'D-01');
    assert.ok(door1, 'D-01 door must be present');
    assert.strictEqual(door1.quantity, 12, 'D-01 quantity must be 12');
    assert.strictEqual(door1.quantityType, 'EXPLICIT');
    assert.strictEqual(door1.uom, 'NOS');

    const tiles = result.items.find(i => i.mark === 'F-01');
    assert.ok(tiles, 'F-01 tile must be present');
    assert.strictEqual(tiles.quantity, 2400, 'F-01 quantity must be 2400');
    assert.strictEqual(tiles.quantityType, 'EXPLICIT');
    assert.strictEqual(tiles.uom, 'SQFT');
    assert.strictEqual(tiles.category, 'Civil & Interior');

    // Verify uncertain item (NEVER automatically assigned 1 or invented)
    const desk = result.items.find(i => i.description.includes('Reception Counter Desk'));
    assert.ok(desk, 'Custom Reception Counter Desk must be present');
    assert.strictEqual(desk.quantity, null, 'Unverified quantity must be null, not 1');
    assert.strictEqual(desk.quantityType, 'UNCERTAIN', 'Must be flagged as UNCERTAIN');
    assert.ok(desk.uncertainReason, 'Must provide reason for uncertainty');
  });

  it('2. Raster image (DMB.png) uses restored Local OCR engine to accurately extract visual items', async () => {
    const dmbPath = path.join(process.cwd(), 'scratch', 'DMB.png');
    assert.ok(fs.existsSync(dmbPath), `DMB.png must exist at ${dmbPath}`);
    const fileBuffer = fs.readFileSync(dmbPath);

    const result = await processDrawingFile(fileBuffer, 'DMB.png', 'DWG-DMB-01');

    assert.strictEqual(result.success, true, 'Parser must succeed on valid DMB.png');
    assert.strictEqual(result.parserUsed, 'LOCAL_OCR_TESSERACT', 'Must use restored LOCAL_OCR_TESSERACT');
    assert.strictEqual(result.totalDetected, 6, 'Should extract 6 drawing items');
    assert.strictEqual(result.explicitCount, 1, 'Should have 1 explicit item (screens)');
    assert.strictEqual(result.uncertainCount, 1, 'Should have 1 uncertain item (overhead beam)');

    // Verify 43" screens
    const screens = result.items.find(i => i.description.includes('Digital Menu Board'));
    assert.ok(screens, 'Must detect 43" screens');
    assert.strictEqual(screens.quantity, 4, 'Must extract 4 screens');
    assert.strictEqual(screens.quantityType, 'EXPLICIT');
    assert.strictEqual(screens.uom, 'NOS');

    // Verify UPS sockets
    const ups = result.items.find(i => i.description.includes('UPS'));
    assert.ok(ups, 'Must detect UPS sockets');
    assert.strictEqual(ups.quantity, 4, 'Must calculate 4 UPS sockets (1 per board)');
    assert.strictEqual(ups.quantityType, 'CALCULATED');

    // Verify uncertain beam condition (NEVER invented or defaulted to 1)
    const beam = result.items.find(i => i.description.includes('Overhead Beam'));
    assert.ok(beam, 'Must detect beam support condition');
    assert.strictEqual(beam.quantity, null, 'Unverified site condition must be null');
    assert.strictEqual(beam.quantityType, 'UNCERTAIN', 'Must be flagged UNCERTAIN');
    assert.ok(beam.uncertainReason?.includes('Beam to checked on site'), 'Must record note from drawing');
  });

  it('3. Unsupported file extensions produce actionable validation error', async () => {
    const dummyBuffer = Buffer.from('TEST');
    try {
      await processDrawingFile(dummyBuffer, 'plan.dwg', 'DWG-001');
      assert.fail('Should reject unsupported extension');
    } catch (err: any) {
      assert.ok(
        err.message.includes('Unsupported drawing file type'),
        `Error must state unsupported file type: ${err.message}`
      );
    }
  });

  it('4. Generated Draft BOQ persists through existing model with Draft status, Revision R0 and lines', async () => {
    const fileBuffer = fs.readFileSync(testDrawingPath);
    const parseResult = await processDrawingFile(fileBuffer, 'test-drawing-a101.pdf', 'DWG-A-101');

    // User reviews lines and verifies the uncertain quantity (e.g. confirms quantity: 1)
    const reviewedLines = parseResult.items.map(item => {
      if (item.description.includes('Reception Counter Desk')) {
        return {
          ...item,
          quantity: 1, // User verified the desk quantity during review
          quantityType: 'EXPLICIT' as const,
        };
      }
      return item;
    });

    // Create Draft BOQ
    const boqCount = await prisma.boq.count({ where: { tenantId } });
    const boqCode = `BOQ-${String(boqCount + 1).padStart(6, '0')}`;

    const boq = await prisma.boq.create({
      data: {
        tenantId,
        projectId: testProject.id,
        costCentreId: testCostCentre?.id || null,
        boqCode,
        title: `Architectural Drawing DWG-A-101 — ${testProject.name}`,
        description: 'Test Drawing to BOQ extraction',
        purpose: 'BUDGET',
        status: 'DRAFT',
        createdBy: testUser.id,
      },
    });
    createdBoqId = boq.id;

    const revision = await prisma.boqRevision.create({
      data: {
        tenantId,
        boqId: boq.id,
        costCentreId: testCostCentre?.id || null,
        revisionNumber: 0,
        revisionCode: 'R0',
        status: 'DRAFT',
        preparationStatus: 'AI_REVIEW',
        budgetStatus: 'NOT_ADDED_TO_BUDGET',
        prStatus: 'PR_NOT_CREATED',
        sourceType: 'DRAWING_AI',
        sourceFile: 'test-drawing-a101.pdf',
        sourceReference: 'DWG-A-101',
        totalLines: reviewedLines.length,
        validLines: reviewedLines.length,
        qualityScore: 95,
        createdById: testUser.id,
      },
    });

    for (let i = 0; i < reviewedLines.length; i++) {
      const line = reviewedLines[i];
      await prisma.boqLine.create({
        data: {
          tenantId,
          boqRevisionId: revision.id,
          lineNumber: String(i + 1),
          originalDescription: line.description,
          standardDescription: line.description,
          specification: line.specification,
          quantity: line.quantity,
          uomRaw: line.uom,
          location: line.location || null,
          drawingReference: 'DWG-A-101',
          sourceSheet: 'Sheet 01',
          validationStatus: 'VALID',
          confidenceScore: line.confidence,
        },
      });
    }

    // Verify DB records
    const savedBoq = await prisma.boq.findUnique({
      where: { id: boq.id },
      include: {
        revisions: {
          include: { lines: true },
        },
      },
    });

    assert.ok(savedBoq, 'BOQ must be saved in database');
    assert.strictEqual(savedBoq.status, 'DRAFT', 'BOQ must have status DRAFT');
    assert.strictEqual(savedBoq.revisions.length, 1, 'Must have exactly 1 revision (R0)');
    assert.strictEqual(savedBoq.revisions[0].revisionCode, 'R0', 'Revision code must be R0');
    assert.strictEqual(savedBoq.revisions[0].sourceType, 'DRAWING_AI', 'Source type must be DRAWING_AI');
    assert.strictEqual(savedBoq.revisions[0].lines.length, 9, 'Must persist all 9 lines');
  });
});
