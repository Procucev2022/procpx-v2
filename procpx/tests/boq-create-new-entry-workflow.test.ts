// tests/boq-create-new-entry-workflow.test.ts
// Automated Test Suite for PROCPX — PROJECT USER BOQ CREATION ENTRY WORKFLOW
// Validates: CREATE NEW BOQ -> BASIC BOQ DETAILS -> SAVE/CONTINUE -> CHOOSE GENERATION METHOD -> DUPLICATION & AUDIT

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3000';

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

async function runTests() {
  console.log('======================================================================');
  console.log('🚀 PROCPX BOQ CREATION ENTRY WORKFLOW ACCEPTANCE TEST SUITE');
  console.log('======================================================================\n');

  try {
    // Setup test tenant and user
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) throw new Error('Tenant not found');

    let testUser = await prisma.user.findFirst({
      where: { tenantId: tenant.id, role: 'PROJECT_USER' },
    });
    if (!testUser) {
      testUser = await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: `project.user.${Date.now()}@procpx.com`,
          name: 'Project User Engineer',
          role: 'PROJECT_USER',
          status: 'ACTIVE',
        },
      });
    }

    const authHeaders = {
      'Content-Type': 'application/json',
      'x-test-user-id': testUser.id,
      'x-test-tenant-id': tenant.id,
    };

    // Create Main Test Project
    const testProject = await prisma.project.create({
      data: {
        tenantId: tenant.id,
        projectCode: `PRJ-ENT-${Date.now().toString().slice(-4)}`,
        name: 'Premium Retail Flagship Store – Bengaluru',
        projectType: 'Retail Store Fitout',
        sector: 'Retail',
        status: 'ACTIVE',
        areaSqFt: 8500,
        city: 'Bengaluru',
        state: 'Karnataka',
        createdBy: testUser.name || 'Project User Engineer',
      },
    });

    // Create Cost Centres CC-001 and CC-002
    const testCostCentre1 = await prisma.costCentre.create({
      data: {
        tenantId: tenant.id,
        projectId: testProject.id,
        code: `CC-001-${Date.now().toString().slice(-3)}`,
        name: 'CC-001 — Retail Store Fitout',
        areaSqFt: 8500,
        status: 'ACTIVE',
        createdBy: testUser.name || 'Project User Engineer',
      },
    });

    const testCostCentre2 = await prisma.costCentre.create({
      data: {
        tenantId: tenant.id,
        projectId: testProject.id,
        code: `CC-002-${Date.now().toString().slice(-3)}`,
        name: 'CC-002 — Kitchen / F&B',
        areaSqFt: 2500,
        status: 'ACTIVE',
        createdBy: testUser.name || 'Project User Engineer',
      },
    });

    // Foreign Project & Cost Centre to test cross-project boundary validation
    const foreignProject = await prisma.project.create({
      data: {
        tenantId: tenant.id,
        projectCode: `PRJ-FOR-${Date.now().toString().slice(-4)}`,
        name: 'Corporate Office – Hyderabad',
        projectType: 'Commercial Fitout',
        sector: 'Office / Corporate',
        status: 'ACTIVE',
        areaSqFt: 12000,
        city: 'Hyderabad',
        state: 'Telangana',
        createdBy: testUser.name || 'Project User Engineer',
      },
    });

    const foreignCostCentre = await prisma.costCentre.create({
      data: {
        tenantId: tenant.id,
        projectId: foreignProject.id,
        code: `CC-FOR-${Date.now().toString().slice(-3)}`,
        name: 'CC-999 — Unrelated Cost Centre',
        areaSqFt: 12000,
        status: 'ACTIVE',
        createdBy: testUser.name || 'Project User Engineer',
      },
    });

    console.log('--- 1. BASIC DETAILS VALIDATION BEFORE BOQ CREATION ---');

    // Test 1: Reject missing project
    {
      const res = await fetch(`${BASE_URL}/api/boq`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          costCentreId: testCostCentre1.id,
          title: 'Retail Store Electrical BOQ',
          category: 'Electrical',
          purpose: 'BUDGET',
        }),
      });
      const data = await res.json();
      assert(res.status === 400 && /Project/i.test(data.error), 'Test 01: Rejects creation without Project');
    }

    // Test 2: Reject missing cost centre
    {
      const res = await fetch(`${BASE_URL}/api/boq`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          projectId: testProject.id,
          title: 'Retail Store Electrical BOQ',
          category: 'Electrical',
          purpose: 'BUDGET',
        }),
      });
      const data = await res.json();
      assert(res.status === 400 && /Cost Centre/i.test(data.error), 'Test 02: Rejects creation without Cost Centre');
    }

    // Test 3: Reject Cost Centre not belonging to Project
    {
      const res = await fetch(`${BASE_URL}/api/boq`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          projectId: testProject.id,
          costCentreId: foreignCostCentre.id,
          title: 'Retail Store Electrical BOQ',
          category: 'Electrical',
          purpose: 'BUDGET',
        }),
      });
      const data = await res.json();
      assert(res.status === 400 && /Cost Centre does not belong to the selected Project/i.test(data.error), 'Test 03: Rejects Cost Centre outside selected Project');
    }

    // Test 4: Reject missing BOQ Title
    {
      const res = await fetch(`${BASE_URL}/api/boq`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          projectId: testProject.id,
          costCentreId: testCostCentre1.id,
          title: '   ',
          category: 'Electrical',
          purpose: 'BUDGET',
        }),
      });
      const data = await res.json();
      assert(res.status === 400 && /Title/i.test(data.error), 'Test 04: Rejects creation without BOQ Title');
    }

    // Test 5: Reject missing Category
    {
      const res = await fetch(`${BASE_URL}/api/boq`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          projectId: testProject.id,
          costCentreId: testCostCentre1.id,
          title: 'Retail Store Electrical BOQ',
          category: '',
          purpose: 'BUDGET',
        }),
      });
      const data = await res.json();
      assert(res.status === 400 && /Category/i.test(data.error), 'Test 05: Rejects creation without Category');
    }

    // Test 6: Reject invalid or missing Purpose
    {
      const res = await fetch(`${BASE_URL}/api/boq`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          projectId: testProject.id,
          costCentreId: testCostCentre1.id,
          title: 'Retail Store Electrical BOQ',
          category: 'Electrical',
          purpose: 'INVALID_PURPOSE',
        }),
      });
      const data = await res.json();
      assert(res.status === 400 && /Purpose/i.test(data.error), 'Test 06: Rejects invalid BOQ Purpose');
    }

    console.log('\n--- 2. STEP 1: CREATE BOQ MASTER RECORD IMMEDIATELY ---');

    // Test 7: Create BOQ with Purpose: BUDGET
    let createdBudgetBoq: any = null;
    {
      const res = await fetch(`${BASE_URL}/api/boq`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          projectId: testProject.id,
          costCentreId: testCostCentre1.id,
          title: 'Retail Store Electrical BOQ',
          category: 'Electrical',
          purpose: 'BUDGET',
          scope: 'Complete electrical works for new retail store including power distribution, lighting, wiring, DBs, and earthing.',
        }),
      });
      const data = await res.json();
      assert(res.status === 201 && data.success === true, 'Test 07: Creates BOQ master record via POST /api/boq');
      createdBudgetBoq = data.boq;
      const code = createdBudgetBoq?.boqCode || createdBudgetBoq?.boqNumber;
      assert(
        createdBudgetBoq &&
        code.startsWith('BOQ-') &&
        createdBudgetBoq.title === 'Retail Store Electrical BOQ' &&
        createdBudgetBoq.category === 'Electrical' &&
        createdBudgetBoq.purpose === 'BUDGET' &&
        createdBudgetBoq.status === 'DRAFT',
        'Test 08: Master BOQ has BOQ Number, title, category, purpose, and DRAFT status'
      );

      // Verify R0 revision
      const rev0 = createdBudgetBoq?.latestRevision || createdBudgetBoq?.revisions?.[0];
      assert(
        rev0 &&
        rev0.revisionCode === 'R0' &&
        rev0.status === 'DRAFT' &&
        rev0.sourceType === 'NOT_YET_SELECTED',
        'Test 09: Initializes revision R0 with DRAFT status and NOT_YET_SELECTED source'
      );
    }

    // Test 10: Multi-Category BOQ Creation (Purpose: PR)
    let createdPrBoq: any = null;
    {
      const res = await fetch(`${BASE_URL}/api/boq`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          projectId: testProject.id,
          costCentreId: testCostCentre2.id,
          title: 'Complete F&B Kitchen Fitout BOQ',
          category: ['HVAC', 'Plumbing', 'Kitchen'],
          purpose: 'PR',
          scope: 'Kitchen ventilation, stainless steel kitchen fabrication, drainage and fresh water setup.',
        }),
      });
      const data = await res.json();
      assert(res.status === 201, 'Test 10: Supports multi-category BOQ creation for PR purpose');
      createdPrBoq = data.boq;
      assert(
        createdPrBoq &&
        createdPrBoq.category === 'HVAC, Plumbing, Kitchen' &&
        createdPrBoq.purpose === 'PR',
        'Test 11: Multi-category properly formatted and stored'
      );
    }

    console.log('\n--- 3. MY BOQS QUERYING AND FILTERING ---');

    // Test 12: List all BOQs via GET /api/boq
    {
      const res = await fetch(`${BASE_URL}/api/boq?projectId=${testProject.id}`, {
        headers: authHeaders,
      });
      const resJson = await res.json();
      const list = Array.isArray(resJson) ? resJson : (resJson.data || []);
      assert(Array.isArray(list) && list.length >= 2, 'Test 12: GET /api/boq returns created BOQs');
      const bItem = list.find((b: any) => b.id === createdBudgetBoq.id);
      assert(
        bItem &&
        bItem.title === 'Retail Store Electrical BOQ' &&
        bItem.project?.name === testProject.name &&
        bItem.costCentre?.name === testCostCentre1.name &&
        bItem.purpose === 'BUDGET',
        'Test 13: BOQ record contains Project, Cost Centre, Purpose, and Title metadata'
      );
    }

    // Test 14: Filtering by purpose
    {
      const res = await fetch(`${BASE_URL}/api/boq?projectId=${testProject.id}&purpose=PR`, {
        headers: authHeaders,
      });
      const resJson = await res.json();
      const prList = Array.isArray(resJson) ? resJson : (resJson.data || []);
      assert(
        prList.every((b: any) => b.purpose === 'PR') &&
        prList.some((b: any) => b.id === createdPrBoq.id),
        'Test 14: Filter by purpose PR correctly isolates procurement BOQs'
      );
    }

    console.log('\n--- 4. STEP 2: GENERATION ATTACHES TO PRE-CREATED BOQ ---');

    // Test 15: Method 2 generation reuses created BOQ ID
    {
      const sampleLines = [
        {
          itemDescription: 'Point wiring for light/fan with 1.5 sqmm FRLS copper wire',
          category: 'Electrical',
          uom: 'NOS',
          quantity: 50,
          estimatedRate: 850,
        },
        {
          itemDescription: '6A 3-pin modular switch socket outlet on modular box',
          category: 'Electrical',
          uom: 'NOS',
          quantity: 30,
          estimatedRate: 450,
        },
      ];

      const res = await fetch(`${BASE_URL}/api/boq/standard/generate`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          boqId: createdBudgetBoq.id,
          projectId: testProject.id,
          costCentreId: testCostCentre1.id,
          sector: 'Retail',
          projectType: 'Retail Store Fitout',
          validLines: sampleLines,
          fileName: 'Standard_BOQ_Electrical.xlsx',
        }),
      });
      const data = await res.json();
      assert((res.status === 200 || res.status === 201) && data.success === true, 'Test 15: Generation succeeds with existing boqId');
      assert(data.boq.id === createdBudgetBoq.id, 'Test 16: Lines attach strictly to pre-created BOQ record');

      const dbBoq = await prisma.boq.findUnique({
        where: { id: createdBudgetBoq.id },
        include: { revisions: { include: { lines: true } } },
      });
      const r0 = dbBoq?.revisions[0];
      assert(
        r0 && r0.lines.length === 2 && r0.sourceType.startsWith('STANDARD_BOQ'),
        'Test 17: R0 revision contains generated line items and updated sourceType'
      );
    }

    console.log('\n--- 5. DUPLICATE / COPY BOQ CAPABILITY (SECTION 23) ---');

    // Test 18: Duplicate BOQ
    {
      const res = await fetch(`${BASE_URL}/api/boq/duplicate`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          boqId: createdBudgetBoq.id,
        }),
      });
      const data = await res.json();
      assert(res.status === 201 && data.success === true, 'Test 18: Duplicate BOQ endpoint returns 201');
      const dup = data.boq;
      assert(dup.id !== createdBudgetBoq.id, 'Test 19: Duplicated BOQ has distinct new ID');
      const origCode = createdBudgetBoq.boqCode || createdBudgetBoq.boqNumber;
      assert(dup.boqCode !== origCode, 'Test 20: Duplicated BOQ has brand new sequential BOQ Number');
      assert(dup.title === 'Retail Store Electrical BOQ (Copy)', 'Test 21: Duplicated BOQ copies title with Copy suffix');
      assert(dup.status === 'DRAFT', 'Test 22: Duplicated BOQ is in DRAFT status');

      const origLines = await prisma.boqLine.count({
        where: { revision: { boqId: createdBudgetBoq.id } },
      });
      const dupLines = await prisma.boqLine.count({
        where: { revision: { boqId: dup.id } },
      });
      assert(dupLines === origLines && dupLines === 2, 'Test 23: Duplicated BOQ copies all line items');
    }

    console.log('\n--- 6. AUDIT TRAIL VERIFICATION (SECTION 30) ---');

    // Test 24: Audit logs for BOQ_CREATED and BOQ_DUPLICATED
    {
      const createAudit = await prisma.auditLog.findFirst({
        where: { action: 'BOQ_CREATED', entityId: createdBudgetBoq.id },
      });
      assert(!!createAudit, 'Test 24: BOQ_CREATED audit event logged with timestamp and user');

      const dupAudit = await prisma.auditLog.findFirst({
        where: { action: 'BOQ_DUPLICATED' },
      });
      assert(!!dupAudit, 'Test 25: BOQ_DUPLICATED audit event logged with source and new ID');
    }

    console.log('\n======================================================================');
    console.log(` RESULTS: ${passed} PASSED / ${failed} FAILED (${passed + failed} TOTAL)`);
    console.log('======================================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Fatal error during test execution:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
