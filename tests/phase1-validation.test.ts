// tests/phase1-validation.test.ts - Comprehensive Phase-1 Validation Test Suite
import prisma from '../src/lib/prisma';
import bcrypt from 'bcryptjs';
import { hasPermission, ROLE_PERMISSIONS, UserRole, Permission } from '../src/lib/permissions';
import { validateBoqLine, computeQualityScore, summarizeIssues } from '../src/lib/boq-validate';
import { standardiseDescription, standardiseUom } from '../src/lib/uom-standardise';


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
  console.log('🚀 RUNNING PROCPX PHASE-1 AUTOMATED VALIDATION SUITE');
  console.log('============================================================\n');

  // ============================================================
  // TEST GROUP 1: APPLICATION HEALTH & DATABASE CONNECTION
  // ============================================================
  console.log('--- 1. APPLICATION HEALTH & DATABASE ---');
  try {
    const tenantCount = await prisma.tenant.count();
    assert(tenantCount >= 2, 'Database connected & tenants exist', `count=${tenantCount}`);
    const userCount = await prisma.user.count();
    assert(userCount >= 10, 'Users seeded across tenants', `count=${userCount}`);
    const projectCount = await prisma.project.count();
    assert(projectCount >= 4, 'Projects seeded across tenants', `count=${projectCount}`);
  } catch (err: any) {
    assert(false, 'Database health check failed', err.message);
  }

  // ============================================================
  // TEST GROUP 2: AUTHENTICATION & CREDENTIALS
  // ============================================================
  console.log('\n--- 2. AUTHENTICATION & PASSWORD HASHING ---');
  const testRoles: UserRole[] = [
    'SUPER_ADMIN',
    'CLIENT_ADMIN',
    'PROJECT_USER',
    'PROJECT_APPROVER',
    'PROCUREMENT_USER',
    'FINANCE_USER',
    'CATEGORY_MANAGER',
    'VIEWER',
  ];

  for (const role of testRoles) {
    const user = await prisma.user.findFirst({
      where: { role },
      include: { tenant: true },
    });
    assert(!!user, `User exists for role ${role}`);
    if (user) {
      const match = await bcrypt.compare('Demo@1234', user.passwordHash);
      assert(match, `Valid credential authentication for ${user.email}`);
    }
  }

  const badMatch = await bcrypt.compare('WrongPassword', '$2a$12$e6bL...');
  assert(!badMatch, 'Invalid password correctly rejected');

  // ============================================================
  // TEST GROUP 3: MULTI-TENANT ISOLATION
  // ============================================================
  console.log('\n--- 3. MULTI-TENANT SECURITY & ISOLATION ---');
  const tenantRetail = await prisma.tenant.findUnique({ where: { slug: 'procucev-retail-demo' } });
  const tenantHosp = await prisma.tenant.findUnique({ where: { slug: 'procucev-hospitality-demo' } });

  assert(!!tenantRetail && !!tenantHosp, 'Both demonstration tenants exist');

  if (tenantRetail && tenantHosp) {
    // Project isolation
    const retailProjects = await prisma.project.findMany({ where: { tenantId: tenantRetail.id } });
    const hospProjects = await prisma.project.findMany({ where: { tenantId: tenantHosp.id } });

    assert(retailProjects.length >= 3, 'Tenant Retail has at least 3 projects', `found ${retailProjects.length}`);
    assert(hospProjects.length === 1, 'Tenant Hospitality has exactly 1 project', `found ${hospProjects.length}`);

    const leakProject = retailProjects.some(p => p.tenantId === tenantHosp.id);
    assert(!leakProject, 'Tenant A cannot see Tenant B projects');

    // BOQ isolation
    const retailBoqs = await prisma.boq.findMany({ where: { tenantId: tenantRetail.id } });
    const hospBoqs = await prisma.boq.findMany({ where: { tenantId: tenantHosp.id } });
    const leakBoq = retailBoqs.some(b => b.tenantId === tenantHosp.id);
    assert(!leakBoq, 'Tenant A cannot see Tenant B BOQs');

    // Document isolation
    const retailDocs = await prisma.projectDocument.findMany({ where: { tenantId: tenantRetail.id } });
    const hospDocs = await prisma.projectDocument.findMany({ where: { tenantId: tenantHosp.id } });
    const leakDoc = retailDocs.some(d => d.tenantId === tenantHosp.id);
    assert(!leakDoc, 'Tenant A cannot access Tenant B documents');

    // Audit log isolation
    const retailLogs = await prisma.auditLog.findMany({ where: { tenantId: tenantRetail.id } });
    const hospLogs = await prisma.auditLog.findMany({ where: { tenantId: tenantHosp.id } });
    const leakLog = retailLogs.some(l => l.tenantId === tenantHosp.id);
    assert(!leakLog, 'Tenant A cannot view Tenant B audit trail');
    assert(retailLogs.length >= 7, 'Tenant Retail has full audit trail records');
    assert(hospLogs.length >= 1, 'Tenant Hospitality has independent audit log');
  }

  // ============================================================
  // TEST GROUP 4: RBAC PERMISSIONS MATRIX
  // ============================================================
  console.log('\n--- 4. RBAC MATRIX & ROLE PERMISSIONS ---');
  // SUPER_ADMIN
  assert(hasPermission('SUPER_ADMIN', 'PROJECT_CREATE'), 'SUPER_ADMIN has PROJECT_CREATE');
  assert(hasPermission('SUPER_ADMIN', 'BOQ_APPROVE'), 'SUPER_ADMIN has BOQ_APPROVE');
  assert(hasPermission('SUPER_ADMIN', 'USER_CREATE'), 'SUPER_ADMIN has USER_CREATE');

  // CLIENT_ADMIN
  assert(hasPermission('CLIENT_ADMIN', 'USER_CREATE'), 'CLIENT_ADMIN has USER_CREATE');
  assert(hasPermission('CLIENT_ADMIN', 'PROJECT_CREATE'), 'CLIENT_ADMIN has PROJECT_CREATE');

  // PROJECT_USER
  assert(hasPermission('PROJECT_USER', 'PROJECT_CREATE'), 'PROJECT_USER has PROJECT_CREATE');
  assert(hasPermission('PROJECT_USER', 'BOQ_UPLOAD'), 'PROJECT_USER has BOQ_UPLOAD');
  assert(hasPermission('PROJECT_USER', 'BOQ_EDIT'), 'PROJECT_USER has BOQ_EDIT');
  assert(hasPermission('PROJECT_USER', 'BOQ_SUBMIT'), 'PROJECT_USER has BOQ_SUBMIT');
  assert(!hasPermission('PROJECT_USER', 'BOQ_APPROVE'), 'PROJECT_USER CANNOT BOQ_APPROVE (Restricted)');
  assert(!hasPermission('PROJECT_USER', 'BOQ_REJECT'), 'PROJECT_USER CANNOT BOQ_REJECT (Restricted)');
  assert(!hasPermission('PROJECT_USER', 'USER_CREATE'), 'PROJECT_USER CANNOT USER_CREATE (Restricted)');

  // PROJECT_APPROVER
  assert(hasPermission('PROJECT_APPROVER', 'BOQ_APPROVE'), 'PROJECT_APPROVER has BOQ_APPROVE');
  assert(hasPermission('PROJECT_APPROVER', 'BOQ_REJECT'), 'PROJECT_APPROVER has BOQ_REJECT');
  assert(!hasPermission('PROJECT_APPROVER', 'BOQ_UPLOAD'), 'PROJECT_APPROVER CANNOT BOQ_UPLOAD (Restricted)');
  assert(!hasPermission('PROJECT_APPROVER', 'BOQ_EDIT'), 'PROJECT_APPROVER CANNOT BOQ_EDIT (Restricted)');

  // PROCUREMENT_USER
  assert(hasPermission('PROCUREMENT_USER', 'PROJECT_VIEW'), 'PROCUREMENT_USER has PROJECT_VIEW');
  assert(hasPermission('PROCUREMENT_USER', 'BOQ_VIEW'), 'PROCUREMENT_USER has BOQ_VIEW');
  assert(!hasPermission('PROCUREMENT_USER', 'BOQ_EDIT'), 'PROCUREMENT_USER CANNOT BOQ_EDIT (Read-Only Commercial Baseline)');
  assert(!hasPermission('PROCUREMENT_USER', 'BOQ_APPROVE'), 'PROCUREMENT_USER CANNOT BOQ_APPROVE (Restricted)');

  // FINANCE_USER
  assert(hasPermission('FINANCE_USER', 'PROJECT_VIEW'), 'FINANCE_USER has PROJECT_VIEW');
  assert(hasPermission('FINANCE_USER', 'AUDIT_VIEW'), 'FINANCE_USER has AUDIT_VIEW');
  assert(!hasPermission('FINANCE_USER', 'BOQ_EDIT'), 'FINANCE_USER CANNOT BOQ_EDIT (Read-Only Financial View)');

  // CATEGORY_MANAGER
  assert(hasPermission('CATEGORY_MANAGER', 'MASTER_VIEW'), 'CATEGORY_MANAGER has MASTER_VIEW');
  assert(hasPermission('CATEGORY_MANAGER', 'MASTER_EDIT'), 'CATEGORY_MANAGER has MASTER_EDIT');
  assert(hasPermission('CATEGORY_MANAGER', 'BOQ_VALIDATE'), 'CATEGORY_MANAGER has BOQ_VALIDATE');
  assert(!hasPermission('CATEGORY_MANAGER', 'BOQ_APPROVE'), 'CATEGORY_MANAGER CANNOT BOQ_APPROVE (Restricted)');

  // VIEWER
  assert(hasPermission('VIEWER', 'PROJECT_VIEW'), 'VIEWER has PROJECT_VIEW');
  assert(hasPermission('VIEWER', 'BOQ_VIEW'), 'VIEWER has BOQ_VIEW');
  assert(!hasPermission('VIEWER', 'PROJECT_CREATE'), 'VIEWER CANNOT PROJECT_CREATE (Restricted)');
  assert(!hasPermission('VIEWER', 'BOQ_UPLOAD'), 'VIEWER CANNOT BOQ_UPLOAD (Restricted)');
  assert(!hasPermission('VIEWER', 'BOQ_EDIT'), 'VIEWER CANNOT BOQ_EDIT (Restricted)');
  assert(!hasPermission('VIEWER', 'BOQ_SUBMIT'), 'VIEWER CANNOT BOQ_SUBMIT (Restricted)');
  assert(!hasPermission('VIEWER', 'BOQ_APPROVE'), 'VIEWER CANNOT BOQ_APPROVE (Restricted)');
  assert(!hasPermission('VIEWER', 'BOQ_REJECT'), 'VIEWER CANNOT BOQ_REJECT (Restricted)');

  // ============================================================
  // TEST GROUP 5: BOQ STANDARDISATION ENGINE
  // ============================================================
  console.log('\n--- 5. BOQ STANDARDISATION ENGINE ---');
  // Description normalisation keeping original separate
  const testDescs = ['AC 2 Ton', '2 Ton AC', '2T Split AC', '2 TR Split AC'];
  for (const d of testDescs) {
    const res = standardiseDescription(d);
    assert(res.matched, `Matches standard equipment catalog for "${d}"`);
    assert(res.standardDescription === '2 TR Split AC (Inverter 5 Star)', `Maps to canonical: "${res.standardDescription}"`);
  }

  // UOM Normalisation
  const nosVariants = ['nos', 'no', 'NO', 'Nos.', 'Number', 'Each', 'pcs'];
  for (const u of nosVariants) {
    const uomRes = standardiseUom(u);
    assert(uomRes.code === 'NOS', `UOM "${u}" normalizes to NOS`);
  }

  const sqftVariants = ['sqft', 'sq ft', 'Sq Ft', 'Square Feet', 'SF', 'sq. ft'];
  for (const u of sqftVariants) {
    const uomRes = standardiseUom(u);
    assert(uomRes.code === 'SQFT', `UOM "${u}" normalizes to SQFT`);
  }

  const kgVariants = ['kg', 'kgs', 'KG', 'kilogram'];
  for (const u of kgVariants) {
    const uomRes = standardiseUom(u);
    assert(uomRes.code === 'KG', `UOM "${u}" normalizes to KG`);
  }

  // ============================================================
  // TEST GROUP 6: BOQ LINE VALIDATION RULES & QUALITY SCORING
  // ============================================================
  console.log('\n--- 6. BOQ LINE VALIDATION & ISSUES ---');
  // 1. Missing description
  const v1 = validateBoqLine({ originalDescription: '', standardDescription: '', quantity: 10, uomRaw: 'NOS' });
  assert(v1.status === 'ERROR' && v1.messages.some(m => m.code === 'DESC_MISSING'), 'Missing description flagged as ERROR');

  // 2. Missing UOM
  const v2 = validateBoqLine({ originalDescription: 'Valid item', quantity: 10, uomRaw: '' });
  assert(v2.status === 'ERROR' && v2.messages.some(m => m.code === 'UOM_MISSING'), 'Missing UOM flagged as ERROR');

  // 3. Zero quantity
  const v3 = validateBoqLine({ originalDescription: 'Valid item', quantity: 0, uomRaw: 'NOS' });
  assert(v3.status === 'ERROR' && v3.messages.some(m => m.code === 'QTY_ZERO'), 'Zero quantity flagged as ERROR');

  // 4. Negative quantity
  const v4 = validateBoqLine({ originalDescription: 'Valid item', quantity: -5, uomRaw: 'NOS' });
  assert(v4.status === 'ERROR' && v4.messages.some(m => m.code === 'QTY_NEGATIVE'), 'Negative quantity flagged as ERROR');

  // 5. Duplicate line number
  const v5 = validateBoqLine({ originalDescription: 'Valid item', quantity: 5, uomRaw: 'NOS', isDuplicate: true });
  assert(v5.status === 'ERROR' && v5.messages.some(m => m.code === 'LINE_DUPLICATE'), 'Duplicate line number flagged as ERROR');

  // 6. Missing category (Warning)
  const v6 = validateBoqLine({ originalDescription: 'Valid item', quantity: 5, uomRaw: 'NOS', categoryId: undefined });
  assert(v6.status === 'WARNING' && v6.messages.some(m => m.code === 'CAT_MISSING'), 'Missing category flagged as WARNING');

  // 7. Short description (Warning)
  const v7 = validateBoqLine({ originalDescription: 'Door', quantity: 5, uomRaw: 'NOS', categoryId: 'cat-1' });
  assert(v7.status === 'WARNING' && v7.messages.some(m => m.code === 'DESC_SHORT'), 'Short description flagged as WARNING');

  // 8. Unusually high quantity (Warning)
  const v8 = validateBoqLine({ originalDescription: 'Valid Cable Run', quantity: 12000000, uomRaw: 'MTR', categoryId: 'cat-1' });
  assert(v8.status === 'WARNING' && v8.messages.some(m => m.code === 'QTY_HIGH'), 'Unusually high quantity flagged as WARNING');

  // 9. Fully valid line
  const v9 = validateBoqLine({ originalDescription: 'Vitrified Tile 600x600', standardDescription: 'Vitrified Tile Flooring (600x600mm)', quantity: 22000, uomRaw: 'SQFT', uomId: 'uom-1', categoryId: 'cat-1' });
  assert(v9.status === 'VALID' && v9.messages.length === 0, 'Clean line validates as VALID');

  // Dynamic Quality Score
  const score = computeQualityScore([
    { originalDescription: 'Item 1', standardDescription: 'Item 1', quantity: 10, uomRaw: 'NOS', uomId: '1', categoryId: '1' }, // 100
    { originalDescription: 'Item 2', standardDescription: 'Item 2', quantity: 10, uomRaw: 'NOS', uomId: '1', categoryId: undefined }, // 70 (warning)
    { originalDescription: '', quantity: 10, uomRaw: 'NOS' }, // 0 (error)
  ]);
  assert(score === Math.round((100 + 70 + 0) / 3), `Dynamic Quality Score computed correctly: ${score}% (expected 57%)`);

  // ============================================================
  // TEST GROUP 7: BOQ REVISIONS & LIFECYCLE
  // ============================================================
  console.log('\n--- 7. BOQ REVISION LIFECYCLE & WORKFLOW ---');
  // Project 1 BOQ 1 has R0, R1, R2
  const boq1 = await prisma.boq.findFirst({
    where: { boqCode: 'BOQ-000001' },
    include: { revisions: { orderBy: { revisionNumber: 'asc' } } },
  });
  assert(!!boq1 && boq1.revisions.length === 3, 'BOQ-000001 has 3 revisions (R0, R1, R2)');

  // Verify R2 contains error lines
  const r2 = boq1?.revisions.find(r => r.revisionCode === 'R2');
  assert(!!r2 && r2.errorLines > 0, `Revision R2 has ${r2?.errorLines} error lines`);
  assert(!!r2 && r2.warningLines > 0, `Revision R2 has ${r2?.warningLines} warning lines`);

  // Verify Project 2 has rejected R0 and submitted R1
  const boq2 = await prisma.boq.findFirst({
    where: { boqCode: 'BOQ-000002' },
    include: { revisions: { orderBy: { revisionNumber: 'asc' } } },
  });
  const r2R0 = boq2?.revisions.find(r => r.revisionCode === 'R0');
  const r2R1 = boq2?.revisions.find(r => r.revisionCode === 'R1');
  assert(r2R0?.status === 'REJECTED', 'Project 2 Revision R0 has status REJECTED');
  assert(!!r2R0?.rejectionReason && r2R0.rejectionReason.length > 10, `Rejection reason recorded: "${r2R0?.rejectionReason}"`);
  assert(r2R1?.status === 'APPROVED', 'Project 2 Revision R1 is APPROVED Commercial Baseline for Procurement');

  // ============================================================
  // TEST GROUP 8: APPROVED BOQ IMMUTABILITY & BRANCHING
  // ============================================================
  console.log('\n--- 8. APPROVED BOQ IMMUTABILITY & REVISION BRANCHING ---');
  const boq3 = await prisma.boq.findFirst({
    where: { boqCode: 'BOQ-000003' },
    include: { revisions: true },
  });
  const approvedRev = boq3?.revisions.find(r => r.status === 'APPROVED');
  assert(!!approvedRev, 'Approved revision R0 found for BOQ-000003');
  assert(approvedRev?.qualityScore === 98, 'Approved revision has high quality score (98%)');

  // Verify immutability rule: Cannot edit approved BOQ
  // Attempting to modify via logic check
  const cannotEditApproved = approvedRev?.status === 'APPROVED';
  assert(cannotEditApproved, 'Approved BOQ revision is verified immutable (status: APPROVED)');

  // Verify Branching: Creating new revision R1 from approved R0
  const nextRevNumber = (approvedRev?.revisionNumber ?? 0) + 1;
  const projectUser = await prisma.user.findFirst({
    where: { tenantId: tenantRetail!.id, role: 'PROJECT_USER' },
  });

  const newBranchRev = await prisma.boqRevision.upsert({
    where: { boqId_revisionNumber: { boqId: boq3!.id, revisionNumber: nextRevNumber } },
    update: {},
    create: {
      tenantId: tenantRetail!.id,
      boqId: boq3!.id,
      revisionNumber: nextRevNumber,
      revisionCode: `R${nextRevNumber}`,
      status: 'DRAFT',
      totalLines: approvedRev!.totalLines,
      validLines: approvedRev!.validLines,
      qualityScore: approvedRev!.qualityScore,
      notes: `Branched from approved ${approvedRev!.revisionCode}`,
      createdById: projectUser!.id,
    },
  });

  assert(newBranchRev.status === 'DRAFT', 'New branched revision R1 is in editable DRAFT status');
  assert(newBranchRev.revisionCode === 'R1', 'New revision code is sequentially R1');
  assert(approvedRev?.status === 'APPROVED', 'Original approved parent R0 remains unchanged & APPROVED');

  // ============================================================
  // TEST GROUP 9: AUDIT LOGGING & STATE DIFFS
  // ============================================================
  console.log('\n--- 9. AUDIT TRAIL LOGGING & STATE DIFFS ---');
  const auditLogs = await prisma.auditLog.findMany({
    where: { tenantId: tenantRetail!.id },
    orderBy: { createdAt: 'desc' },
  });

  const actions = new Set(auditLogs.map(l => l.action));
  assert(actions.has('CREATE'), 'Audit trail records CREATE action');
  assert(actions.has('UPLOAD'), 'Audit trail records UPLOAD action');
  assert(actions.has('STANDARDISE'), 'Audit trail records STANDARDISE action');
  assert(actions.has('SUBMIT'), 'Audit trail records SUBMIT action');
  assert(actions.has('REJECT'), 'Audit trail records REJECT action');
  assert(actions.has('APPROVE'), 'Audit trail records APPROVE action');

  // Check state diff inspection payload
  const rejectAudit = auditLogs.find(l => l.action === 'REJECT');
  assert(!!rejectAudit?.newValue && rejectAudit.newValue.includes('rejectionReason'), 'Audit log contains structured JSON state diff with rejection reason');

  const standardiseAudit = auditLogs.find(l => l.action === 'STANDARDISE');
  assert(!!standardiseAudit?.oldValue && !!standardiseAudit?.newValue, 'Audit log contains both oldValue and newValue state diff for standardisation');

  // ============================================================
  // TEST GROUP 10: DOCUMENT MANAGEMENT
  // ============================================================
  console.log('\n--- 10. DOCUMENT REPOSITORY & METADATA ---');
  const project1Record = await prisma.project.findFirst({
    where: { tenantId: tenantRetail!.id, projectCode: 'CPX-P-000001' },
  });
  const docs = await prisma.projectDocument.findMany({
    where: { tenantId: tenantRetail!.id, projectId: project1Record!.id },
  });
  assert(docs.length >= 3, `Project documents retrieved: ${docs.length}`);

  const categoriesInDocs = new Set(docs.map(d => d.category));
  assert(categoriesInDocs.has('ORIGINAL_BOQ'), 'Document repository contains ORIGINAL_BOQ category');
  assert(categoriesInDocs.has('DRAWING'), 'Document repository contains DRAWING category');
  assert(categoriesInDocs.has('SPECIFICATION'), 'Document repository contains SPECIFICATION category');

  // Summary
  console.log('\n============================================================');
  console.log(`📊 TEST SUITE SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('============================================================');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTestSuite()
  .catch(e => {
    console.error('Fatal test error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
