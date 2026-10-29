// tests/category-manager-master-creation.test.ts
// Comprehensive Regression Test Suite: Category Manager Access to Master Creation
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/lib/prisma';
import { hasPermission } from '../src/lib/permissions';

async function run() {
  console.log('============================================================');
  console.log('🧪 RUNNING CATEGORY MANAGER MASTER CREATION TEST SUITE');
  console.log('============================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, desc: string) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ PASS: ${desc}`);
      passedTests++;
    } else {
      console.error(`  ❌ FAIL: ${desc}`);
      process.exitCode = 1;
    }
  }

  // -------------------------------------------------------------
  // GROUP 1: RBAC PERMISSIONS MAPPING VERIFICATION
  // -------------------------------------------------------------
  console.log('--- 1. RBAC PERMISSIONS & ROLE MAPPINGS ---');
  assert(hasPermission('CATEGORY_MANAGER', 'MASTER_VIEW'), '1.1: CATEGORY_MANAGER has MASTER_VIEW');
  assert(hasPermission('CATEGORY_MANAGER', 'MASTER_EDIT'), '1.2: CATEGORY_MANAGER has MASTER_EDIT');
  assert(hasPermission('CATEGORY_MANAGER', 'STANDARD_BOQ_VIEW'), '1.3: CATEGORY_MANAGER has STANDARD_BOQ_VIEW');
  assert(hasPermission('CATEGORY_MANAGER', 'STANDARD_BOQ_MANAGE'), '1.4: CATEGORY_MANAGER has STANDARD_BOQ_MANAGE');
  assert(hasPermission('CATEGORY_MANAGER', 'PROJECT_VIEW'), '1.5: CATEGORY_MANAGER has PROJECT_VIEW');
  assert(hasPermission('CATEGORY_MANAGER', 'COST_CENTRE_VIEW'), '1.6: CATEGORY_MANAGER has COST_CENTRE_VIEW');
  assert(!hasPermission('CATEGORY_MANAGER', 'PROJECT_CREATE'), '1.7: CATEGORY_MANAGER CANNOT PROJECT_CREATE (Preserved restricted right)');
  assert(!hasPermission('CATEGORY_MANAGER', 'PROJECT_EDIT'), '1.8: CATEGORY_MANAGER CANNOT PROJECT_EDIT (Preserved restricted right)');
  assert(!hasPermission('CATEGORY_MANAGER', 'COST_CENTRE_CREATE'), '1.9: CATEGORY_MANAGER CANNOT COST_CENTRE_CREATE (Preserved restricted right)');
  assert(!hasPermission('CATEGORY_MANAGER', 'COST_CENTRE_EDIT'), '1.10: CATEGORY_MANAGER CANNOT COST_CENTRE_EDIT (Preserved restricted right)');

  // -------------------------------------------------------------
  // GROUP 2: SIDEBAR NAVIGATION & MENU VISIBILITY
  // -------------------------------------------------------------
  console.log('\n--- 2. SIDEBAR NAVIGATION & MENU VISIBILITY ---');
  const sidebarPath = path.join(__dirname, '../src/components/Sidebar.tsx');
  const sidebarCode = fs.readFileSync(sidebarPath, 'utf8');

  // 2.1 Category Manager Navigation contains MASTER CREATION with 4 modules
  const cmNav = sidebarCode
    .split('{/* ROLE 5: CATEGORY MANAGER NAVIGATION */}')[1]
    ?.split('{/* ROLE 6: ADMIN / SUPER ADMIN / OTHER ROLES */}')[0] || '';

  assert(cmNav.length > 0, '2.1: Found Category Manager navigation section in Sidebar.tsx');
  assert(cmNav.includes('MASTER CREATION'), '2.2: Category Manager sidebar has "MASTER CREATION" section heading');

  const cmMasterSlice = cmNav.split('MASTER CREATION')[1]?.split('nav-section-label">VENDOR GOVERNANCE</div>')[0] || '';
  assert(cmMasterSlice.includes('/projects') && cmMasterSlice.includes('Projects'), '2.3: Category Manager MASTER CREATION contains Projects (/projects)');
  assert(cmMasterSlice.includes('/cost-centres') && cmMasterSlice.includes('Cost Centres'), '2.4: Category Manager MASTER CREATION contains Cost Centres (/cost-centres)');
  assert(cmMasterSlice.includes('/masters/standard-boq') && cmMasterSlice.includes('Standard BOQ Creation'), '2.5: Category Manager MASTER CREATION contains Standard BOQ Creation (/masters/standard-boq)');
  assert(cmMasterSlice.includes('/masters/categories') && cmMasterSlice.includes('Category Creation'), '2.6: Category Manager MASTER CREATION contains Category Creation (/masters/categories)');

  // 2.2 Project User and Admin sidebars continue to have MASTER CREATION
  const puNav = sidebarCode
    .split('{/* ROLE 2: PROJECT USER NAVIGATION */}')[1]
    ?.split('{/* ROLE 3: PROJECT APPROVER NAVIGATION */}')[0] || '';
  assert(puNav.includes('MASTER CREATION'), '2.7: Project User retains MASTER CREATION heading');
  assert(puNav.includes('/projects') && puNav.includes('/cost-centres') && puNav.includes('/masters/standard-boq') && puNav.includes('/masters/categories'), '2.8: Project User retains all 4 modules under MASTER CREATION');

  const adminNav = (sidebarCode.split('{/* ROLE 6: ADMIN / SUPER ADMIN / OTHER ROLES */}')[1] ||
    sidebarCode.split('{/* ROLE 5: ADMIN / SUPER ADMIN / OTHER ROLES */}')[1] || '');
  assert(adminNav.includes('MASTER CREATION'), '2.9: Admin retains MASTER CREATION heading');
  assert(adminNav.includes('/masters/standard-boq') && adminNav.includes('/masters/categories'), '2.10: Admin retains Standard BOQ and Category Creation');

  // -------------------------------------------------------------
  // GROUP 3: PROVISION TEST USERS ACROSS ROLES
  // -------------------------------------------------------------
  console.log('\n--- 3. PROVISIONING USERS & ENVIRONMENT SETUP ---');
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) throw new Error('No tenant found');

  const existingProjectUser = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: 'PROJECT_USER' },
  });
  if (!existingProjectUser) throw new Error('Project User not found');

  let catManager = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: 'CATEGORY_MANAGER' },
  });
  if (!catManager) {
    catManager = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        name: 'Test Category Manager',
        email: `cm.test.${Date.now()}@procpx.internal`,
        passwordHash: existingProjectUser.passwordHash,
        role: 'CATEGORY_MANAGER',
        status: 'ACTIVE',
      },
    });
  }

  let clientAdmin = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: 'CLIENT_ADMIN' },
  });
  if (!clientAdmin) {
    clientAdmin = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        name: 'Test Client Admin',
        email: `admin.test.${Date.now()}@procpx.internal`,
        passwordHash: existingProjectUser.passwordHash,
        role: 'CLIENT_ADMIN',
        status: 'ACTIVE',
      },
    });
  }

  let viewerUser = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: 'VIEWER' },
  });
  if (!viewerUser) {
    viewerUser = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        name: 'Test Viewer',
        email: `viewer.test.${Date.now()}@procpx.internal`,
        passwordHash: existingProjectUser.passwordHash,
        role: 'VIEWER',
        status: 'ACTIVE',
      },
    });
  }

  let procUser = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: 'PROCUREMENT_USER' },
  });
  if (!procUser) {
    procUser = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        name: 'Test Procurement User',
        email: `proc.test.${Date.now()}@procpx.internal`,
        passwordHash: existingProjectUser.passwordHash,
        role: 'PROCUREMENT_USER',
        status: 'ACTIVE',
      },
    });
  }

  const cmHeaders = {
    'x-test-user-id': catManager.id,
    'x-test-tenant-id': tenant.id,
    'Content-Type': 'application/json',
  };

  const adminHeaders = {
    'x-test-user-id': clientAdmin.id,
    'x-test-tenant-id': tenant.id,
    'Content-Type': 'application/json',
  };

  const projectUserHeaders = {
    'x-test-user-id': existingProjectUser.id,
    'x-test-tenant-id': tenant.id,
    'Content-Type': 'application/json',
  };

  const viewerHeaders = {
    'x-test-user-id': viewerUser.id,
    'x-test-tenant-id': tenant.id,
    'Content-Type': 'application/json',
  };

  const procHeaders = {
    'x-test-user-id': procUser.id,
    'x-test-tenant-id': tenant.id,
    'Content-Type': 'application/json',
  };

  console.log('  ✅ PASS: Provisioned test user headers for CATEGORY_MANAGER, CLIENT_ADMIN, PROJECT_USER, VIEWER, and PROCUREMENT_USER');

  // -------------------------------------------------------------
  // GROUP 4: CATEGORY MANAGER MASTER DATA CREATION OPERATIONS
  // -------------------------------------------------------------
  console.log('\n--- 4. CATEGORY MANAGER MASTER DATA CREATION OPERATIONS ---');
  const timestamp = Date.now();
  const testCatName = `Flooring & Tiling Systems ${timestamp}`;
  const testCatCode = `FTS${String(timestamp).slice(-4)}`;

  // 4.1 Category Manager creates top-level Category
  const catRes = await fetch('http://localhost:3000/api/masters/categories', {
    method: 'POST',
    headers: cmHeaders,
    body: JSON.stringify({
      name: testCatName,
      code: testCatCode,
    }),
  });
  assert(catRes.status === 201, `4.1: Category Manager successfully created category "${testCatName}" (HTTP 201)`);
  const catData = await catRes.json();
  const createdCategory = catData.data || catData;
  assert(createdCategory?.name === testCatName, `4.2: Created category returned correctly: ID=${createdCategory?.id}`);

  // 4.2 Category Manager creates Subcategory
  const testSubcatName = `Vitrified Floor Tiles 600x600 ${timestamp}`;
  const subcatRes = await fetch('http://localhost:3000/api/masters/categories', {
    method: 'POST',
    headers: cmHeaders,
    body: JSON.stringify({
      name: testSubcatName,
      code: `${testCatCode}-VT6`,
      parentId: createdCategory.id,
    }),
  });
  assert(subcatRes.status === 201, `4.3: Category Manager created subcategory "${testSubcatName}" (HTTP 201)`);

  // 4.3 Duplicate category rejection for Category Manager
  const dupCatRes = await fetch('http://localhost:3000/api/masters/categories', {
    method: 'POST',
    headers: cmHeaders,
    body: JSON.stringify({
      name: testCatName,
      code: `DIFF-${timestamp}`,
    }),
  });
  assert(dupCatRes.status === 409, `4.4: Duplicate category name correctly rejected with HTTP 409 Conflict`);

  // 4.4 Category Manager creates Standard BOQ items
  const testBoqCode1 = `STD-FTS-${String(timestamp).slice(-4)}`;
  const testBoqCode2 = `STD-FTS-${String(timestamp + 1).slice(-4)}`;

  const boqCreateRes = await fetch('http://localhost:3000/api/boq/standard-library', {
    method: 'POST',
    headers: cmHeaders,
    body: JSON.stringify({
      sector: 'RETAIL',
      projectType: 'Store Fitout',
      category: testCatName,
      subcategory: testSubcatName,
      items: [
        {
          itemCode: testBoqCode1,
          standardDescription: 'Heavy Duty Full Body Vitrified Tiles 600x600mm',
          detailedSpecification: 'Kajaria / Somany heavy traffic vitrified tile with adhesive bedding',
          uom: 'SQFT',
          benchmarkRate: 145.0,
          brandMake: 'Kajaria',
        },
        {
          itemCode: testBoqCode2,
          standardDescription: 'Anti Skid Ceramic Floor Tiles 300x300mm',
          detailedSpecification: 'Matte finish anti-skid ceramic tiles for back of house',
          uom: 'SQFT',
          benchmarkRate: 85.0,
          brandMake: 'Somany',
        },
      ],
    }),
  });
  assert(boqCreateRes.status === 201, `4.5: Category Manager created standard BOQ line items (HTTP 201)`);
  const boqResData = await boqCreateRes.json();
  const createdCount = boqResData.count ?? boqResData.data?.count;
  assert(createdCount === 2, `4.6: Exactly 2 standard BOQ items created by Category Manager (got ${createdCount})`);

  // 4.5 Duplicate standard BOQ item rejection
  const dupBoqRes = await fetch('http://localhost:3000/api/boq/standard-library', {
    method: 'POST',
    headers: cmHeaders,
    body: JSON.stringify({
      sector: 'RETAIL',
      items: [
        {
          itemCode: testBoqCode1,
          standardDescription: 'Duplicate item attempt',
          category: testCatName,
          uom: 'SQFT',
        },
      ],
    }),
  });
  assert(dupBoqRes.status === 409, `4.7: Duplicate standard BOQ item code rejected with HTTP 409 Conflict`);

  // -------------------------------------------------------------
  // GROUP 5: CATEGORY MANAGER READ-ONLY RIGHTS FOR PROJECTS & COST CENTRES
  // -------------------------------------------------------------
  console.log('\n--- 5. CATEGORY MANAGER READ-ONLY ON PROJECTS & COST CENTRES ---');
  // 5.1 Category Manager CAN view projects
  const cmGetProjectsRes = await fetch('http://localhost:3000/api/projects', { headers: cmHeaders });
  assert(cmGetProjectsRes.status === 200, `5.1: Category Manager can view projects (HTTP 200)`);

  // 5.2 Category Manager CANNOT create projects (POST /api/projects -> 403 Forbidden)
  const cmPostProjectRes = await fetch('http://localhost:3000/api/projects', {
    method: 'POST',
    headers: cmHeaders,
    body: JSON.stringify({
      name: `Illegal Project Attempt ${timestamp}`,
      sector: 'RETAIL',
      projectType: 'FIT_OUT',
    }),
  });
  assert(cmPostProjectRes.status === 403, `5.2: Category Manager blocked from creating projects: HTTP 403 Forbidden`);

  // 5.3 Category Manager CAN view cost centres
  const cmGetCcRes = await fetch('http://localhost:3000/api/cost-centres', { headers: cmHeaders });
  assert(cmGetCcRes.status === 200, `5.3: Category Manager can view cost centres (HTTP 200)`);

  // 5.4 Category Manager CANNOT create cost centres (POST /api/cost-centres -> 403 Forbidden)
  const sampleProject = await prisma.project.findFirst({ where: { tenantId: tenant.id } });
  if (sampleProject) {
    const cmPostCcRes = await fetch('http://localhost:3000/api/cost-centres', {
      method: 'POST',
      headers: cmHeaders,
      body: JSON.stringify({
        projectId: sampleProject.id,
        code: `CC-ILLEGAL-${timestamp}`,
        name: 'Illegal Cost Centre Attempt',
      }),
    });
    assert(cmPostCcRes.status === 403, `5.4: Category Manager blocked from creating cost centres: HTTP 403 Forbidden`);
  }

  // -------------------------------------------------------------
  // GROUP 6: UNAUTHORIZED ROLE RESTRICTIONS & DIRECT URL/API DEFENSE
  // -------------------------------------------------------------
  console.log('\n--- 6. UNAUTHORIZED ROLE WRITE RESTRICTIONS & DIRECT-ROUTE DEFENSE ---');
  // 6.1 Project User blocked from creating Categories
  const puCatRes = await fetch('http://localhost:3000/api/masters/categories', {
    method: 'POST',
    headers: projectUserHeaders,
    body: JSON.stringify({ name: `Illegal Category PU ${timestamp}` }),
  });
  assert(puCatRes.status === 403, `6.1: Project User blocked from POST /api/masters/categories (HTTP 403)`);

  // 6.2 Project User blocked from creating Standard BOQ items
  const puBoqRes = await fetch('http://localhost:3000/api/boq/standard-library', {
    method: 'POST',
    headers: projectUserHeaders,
    body: JSON.stringify({
      sector: 'RETAIL',
      items: [{ itemCode: `STD-PU-${timestamp}`, standardDescription: 'PU Item', category: 'General', uom: 'SQFT' }],
    }),
  });
  assert(puBoqRes.status === 403, `6.2: Project User blocked from POST /api/boq/standard-library (HTTP 403)`);

  // 6.3 Viewer blocked from creating Categories
  const viewerCatRes = await fetch('http://localhost:3000/api/masters/categories', {
    method: 'POST',
    headers: viewerHeaders,
    body: JSON.stringify({ name: `Illegal Category Viewer ${timestamp}` }),
  });
  assert(viewerCatRes.status === 403, `6.3: Viewer blocked from POST /api/masters/categories (HTTP 403)`);

  // 6.4 Viewer blocked from creating Standard BOQ items
  const viewerBoqRes = await fetch('http://localhost:3000/api/boq/standard-library', {
    method: 'POST',
    headers: viewerHeaders,
    body: JSON.stringify({
      sector: 'RETAIL',
      items: [{ itemCode: `STD-VIEWER-${timestamp}`, standardDescription: 'Viewer Item', category: 'General', uom: 'SQFT' }],
    }),
  });
  assert(viewerBoqRes.status === 403, `6.4: Viewer blocked from POST /api/boq/standard-library (HTTP 403)`);

  // 6.5 Viewer blocked from creating Projects
  const viewerProjRes = await fetch('http://localhost:3000/api/projects', {
    method: 'POST',
    headers: viewerHeaders,
    body: JSON.stringify({ name: 'Viewer Project', sector: 'RETAIL', projectType: 'FIT_OUT' }),
  });
  assert(viewerProjRes.status === 403, `6.5: Viewer blocked from POST /api/projects (HTTP 403)`);

  // 6.6 Procurement User blocked from creating Categories
  const procCatRes = await fetch('http://localhost:3000/api/masters/categories', {
    method: 'POST',
    headers: procHeaders,
    body: JSON.stringify({ name: `Illegal Category Proc ${timestamp}` }),
  });
  assert(procCatRes.status === 403, `6.6: Procurement User blocked from POST /api/masters/categories (HTTP 403)`);

  // 6.7 Procurement User blocked from creating Standard BOQ items
  const procBoqRes = await fetch('http://localhost:3000/api/boq/standard-library', {
    method: 'POST',
    headers: procHeaders,
    body: JSON.stringify({
      sector: 'RETAIL',
      items: [{ itemCode: `STD-PROC-${timestamp}`, standardDescription: 'Proc Item', category: 'General', uom: 'SQFT' }],
    }),
  });
  assert(procBoqRes.status === 403, `6.7: Procurement User blocked from POST /api/boq/standard-library (HTTP 403)`);

  // -------------------------------------------------------------
  // GROUP 7: EXISTING ADMINISTRATOR ROLES CONTINUE TO WORK
  // -------------------------------------------------------------
  console.log('\n--- 7. EXISTING ADMINISTRATOR CAPABILITIES PRESERVED ---');
  // 7.1 Client Admin can create categories
  const adminCatRes = await fetch('http://localhost:3000/api/masters/categories', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      name: `Admin Category ${timestamp}`,
      code: `ADM${String(timestamp).slice(-4)}`,
    }),
  });
  assert(adminCatRes.status === 201, `7.1: Client Admin can create categories (HTTP 201)`);

  // 7.2 Client Admin can create standard BOQ items
  const adminBoqRes = await fetch('http://localhost:3000/api/boq/standard-library', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      sector: 'RETAIL',
      items: [
        {
          itemCode: `STD-ADM-${String(timestamp).slice(-4)}`,
          standardDescription: 'Admin Standard Item',
          category: `Admin Category ${timestamp}`,
          uom: 'SQFT',
        },
      ],
    }),
  });
  assert(adminBoqRes.status === 201, `7.2: Client Admin can create standard BOQ items (HTTP 201)`);

  // -------------------------------------------------------------
  // GROUP 8: PAGE ACCESS & UI-LEVEL DEFENSE INTEGRITY
  // -------------------------------------------------------------
  console.log('\n--- 8. CANONICAL PAGE & UI-LEVEL INTEGRITY ---');
  const catPage = fs.readFileSync(path.join(__dirname, '../src/app/(app)/masters/categories/page.tsx'), 'utf8');
  assert(catPage.includes('canEdit') && catPage.includes('CATEGORY_MANAGER'), '8.1: Category Creation page permits CATEGORY_MANAGER in canEdit');

  const boqPage = fs.readFileSync(path.join(__dirname, '../src/app/(app)/masters/standard-boq/page.tsx'), 'utf8');
  assert(boqPage.includes('canEdit') && boqPage.includes('CATEGORY_MANAGER'), '8.2: Standard BOQ page permits CATEGORY_MANAGER in canEdit');

  const projectsPage = fs.readFileSync(path.join(__dirname, '../src/app/(app)/projects/page.tsx'), 'utf8');
  assert(projectsPage.includes('canCreate') && projectsPage.includes('+ New Project'), '8.3: Projects page conditionally gates "+ New Project" based on canCreate');

  const ccPage = fs.readFileSync(path.join(__dirname, '../src/app/(app)/cost-centres/page.tsx'), 'utf8');
  assert(ccPage.includes('canCreate') && ccPage.includes('Create Cost Centre'), '8.4: Cost Centres page conditionally gates "Create Cost Centre" based on canCreate');

  console.log('\n============================================================');
  console.log(`🏁 TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log('============================================================\n');

  if (passedTests === totalTests) {
    console.log('✨ SUCCESS: All Category Manager Master Creation tests passed flawlessly!');
    process.exit(0);
  } else {
    console.error('💥 FAILURE: Some tests failed.');
    process.exit(1);
  }
}

run()
  .catch(err => {
    console.error('Fatal error running regression tests:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
