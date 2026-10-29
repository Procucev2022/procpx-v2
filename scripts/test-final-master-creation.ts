// scripts/test-final-master-creation.ts
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/lib/prisma';

async function run() {
  console.log('================================================================');
  console.log(' PROCPX — FINAL ADDITION TO MASTER CREATION VALIDATION');
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

  // -------------------------------------------------------------
  // TEST GROUP 1: SIDEBAR MASTER CREATION (4 ENTRIES)
  // -------------------------------------------------------------
  console.log('--- TEST GROUP 1: SIDEBAR MASTER CREATION (4 ENTRIES) ---');
  const sidebarPath = path.join(__dirname, '../src/components/Sidebar.tsx');
  const sidebarCode = fs.readFileSync(sidebarPath, 'utf8');

  const projectUserNav = sidebarCode
    .split('{/* ROLE 2: PROJECT USER NAVIGATION */}')[1]
    ?.split('{/* ROLE 3: PROJECT APPROVER NAVIGATION */}')[0] || '';

  assert(projectUserNav.includes('MASTER CREATION'), 'Project User sidebar has "MASTER CREATION" heading');

  // Accurately isolate MASTER CREATION section up to the next section label (BOQ)
  const masterSection = projectUserNav.split('MASTER CREATION')[1]?.split('nav-section-label">BOQ</div>')[0] || '';

  assert(masterSection.includes('/projects') && masterSection.includes('Projects'), 'Entry 1: Projects (/projects) is present');
  assert(masterSection.includes('/cost-centres') && masterSection.includes('Cost Centres'), 'Entry 2: Cost Centres (/cost-centres) is present');
  assert(masterSection.includes('/masters/standard-boq') && masterSection.includes('Standard BOQ Creation'), 'Entry 3: Standard BOQ Creation (/masters/standard-boq) is present');
  assert(masterSection.includes('/masters/categories') && masterSection.includes('Category Creation'), 'Entry 4: Category Creation (/masters/categories) is present');

  // Verify Category Manager sidebar contains MASTER CREATION with 4 modules
  const categoryManagerNav = sidebarCode
    .split('{/* ROLE 5: CATEGORY MANAGER NAVIGATION */}')[1]
    ?.split('{/* ROLE 6: ADMIN / SUPER ADMIN / OTHER ROLES */}')[0] || '';

  assert(categoryManagerNav.includes('MASTER CREATION'), 'Category Manager sidebar has "MASTER CREATION" heading');
  const cmMasterSection = categoryManagerNav.split('MASTER CREATION')[1]?.split('nav-section-label">VENDOR GOVERNANCE</div>')[0] || '';
  assert(cmMasterSection.includes('/projects') && cmMasterSection.includes('Projects'), 'Category Manager Entry 1: Projects (/projects) is present');
  assert(cmMasterSection.includes('/cost-centres') && cmMasterSection.includes('Cost Centres'), 'Category Manager Entry 2: Cost Centres (/cost-centres) is present');
  assert(cmMasterSection.includes('/masters/standard-boq') && cmMasterSection.includes('Standard BOQ Creation'), 'Category Manager Entry 3: Standard BOQ Creation (/masters/standard-boq) is present');
  assert(cmMasterSection.includes('/masters/categories') && cmMasterSection.includes('Category Creation'), 'Category Manager Entry 4: Category Creation (/masters/categories) is present');

  // Verify Admin sidebar also includes them
  const adminNav = (sidebarCode.split('{/* ROLE 6: ADMIN / SUPER ADMIN / OTHER ROLES */}')[1] ||
    sidebarCode.split('{/* ROLE 5: ADMIN / SUPER ADMIN / OTHER ROLES */}')[1] || '');
  assert(adminNav.includes('/masters/standard-boq') && adminNav.includes('/masters/categories'), 'Admin sidebar also provides access to Standard BOQ & Category Creation');

  // -------------------------------------------------------------
  // TEST GROUP 2: CATEGORY CREATION & DUPLICATE PREVENTION
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: CATEGORY CREATION & DUPLICATE PREVENTION ---');
  const projectUser = await prisma.user.findFirst({
    where: { email: 'project.user@procpx.internal' },
  });
  if (!projectUser) throw new Error('Test project user not found');

  // Find or provision an authorized admin/category manager in the SAME tenant
  let adminUser = await prisma.user.findFirst({
    where: {
      tenantId: projectUser.tenantId,
      role: { in: ['CLIENT_ADMIN', 'SUPER_ADMIN', 'CATEGORY_MANAGER'] },
    },
  });

  if (!adminUser) {
    adminUser = await prisma.user.create({
      data: {
        tenantId: projectUser.tenantId,
        name: 'Category Master Admin',
        email: `category.admin.${Date.now()}@procpx.internal`,
        passwordHash: projectUser.passwordHash,
        role: 'CATEGORY_MANAGER',
        status: 'ACTIVE',
      },
    });
  }

  const adminHeaders = {
    'x-test-user-id': adminUser.id,
    'x-test-tenant-id': adminUser.tenantId,
    'Content-Type': 'application/json',
  };

  const projectUserHeaders = {
    'x-test-user-id': projectUser.id,
    'x-test-tenant-id': projectUser.tenantId,
    'Content-Type': 'application/json',
  };

  const testCategoryName = `Acoustic Paneling & Finishes ${Date.now()}`;
  const testCategoryCode = `APF${String(Date.now()).slice(-4)}`;

  // 2.1 Authorized user creates new top-level category
  const createCatRes = await fetch('http://localhost:3000/api/masters/categories', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      name: testCategoryName,
      code: testCategoryCode,
    }),
  });
  assert(createCatRes.status === 201, `Admin created new category "${testCategoryName}" (HTTP 201)`);
  const createCatData = await createCatRes.json();
  const createdCat = createCatData.data || createCatData;
  assert(createdCat?.name === testCategoryName, `Created category verified: ID=${createdCat?.id}, Code=${createdCat?.code}`);

  // 2.2 Authorized user creates subcategory
  const testSubcatName = `Fabric Acoustic Wall Panels ${Date.now()}`;
  const createSubcatRes = await fetch('http://localhost:3000/api/masters/categories', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      name: testSubcatName,
      code: `${testCategoryCode}-FAB`,
      parentId: createdCat.id,
    }),
  });
  assert(createSubcatRes.status === 201, `Admin created subcategory "${testSubcatName}" under "${testCategoryName}" (HTTP 201)`);

  // 2.3 Duplicate category name prevention
  const dupCatRes = await fetch('http://localhost:3000/api/masters/categories', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      name: testCategoryName,
      code: `DIFF${Date.now()}`,
    }),
  });
  assert(dupCatRes.status === 409, `Duplicate category name correctly rejected with HTTP 409 Conflict (Status: ${dupCatRes.status})`);

  // 2.4 Duplicate category code prevention
  const dupCodeRes = await fetch('http://localhost:3000/api/masters/categories', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      name: `Different Name ${Date.now()}`,
      code: testCategoryCode,
    }),
  });
  assert(dupCodeRes.status === 409, `Duplicate category code correctly rejected with HTTP 409 Conflict (Status: ${dupCodeRes.status})`);

  // 2.5 Verify categories returned in GET for Project User
  const getCatsRes = await fetch('http://localhost:3000/api/masters/categories', {
    headers: projectUserHeaders,
  });
  assert(getCatsRes.status === 200, 'GET /api/masters/categories returns 200 for Project User');
  const catsPayload = await getCatsRes.json();
  const catsList = catsPayload.data || catsPayload || [];
  const foundCat = catsList.find((c: any) => c.name === testCategoryName);
  assert(!!foundCat, `New category "${testCategoryName}" appears in Category Master GET`);
  assert(foundCat?.children?.some((ch: any) => ch.name === testSubcatName), 'Subcategory is linked in parent-child hierarchy');

  // -------------------------------------------------------------
  // TEST GROUP 3: STANDARD BOQ CREATION & DUPLICATE PREVENTION
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: STANDARD BOQ CREATION & DUPLICATE PREVENTION ---');
  const testItemCode1 = `STD-APF-${String(Date.now()).slice(-4)}`;
  const testItemCode2 = `STD-APF-${String(Date.now() + 1).slice(-4)}`;

  // 3.1 Authorized user creates multiple standard BOQ line items
  const createStdRes = await fetch('http://localhost:3000/api/boq/standard-library', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      sector: 'RETAIL',
      projectType: 'Store Fitout',
      category: testCategoryName,
      subcategory: testSubcatName,
      items: [
        {
          itemCode: testItemCode1,
          standardDescription: 'Fabric Wrapped Sound Absorbing Acoustic Wall Panel 25mm',
          detailedSpecification: 'Density 96 kg/m3 with acoustically transparent woven fabric finish',
          uom: 'SQFT',
          benchmarkRate: 285.50,
          brandMake: 'Anutone / Saint Gobain',
        },
        {
          itemCode: testItemCode2,
          standardDescription: 'Perforated Acoustic Wooden Ceiling Tile 600x600',
          detailedSpecification: '12mm MDF core with natural veneer finish and black acoustic fleece backing',
          uom: 'SQFT',
          benchmarkRate: 420.00,
          brandMake: 'Armstrong / Knauf',
        },
      ],
    }),
  });

  assert(createStdRes.status === 201, `Admin created 2 standard BOQ line items (HTTP 201)`);
  const stdResData = await createStdRes.json();
  const createdCount = stdResData.count ?? stdResData.data?.count;
  assert(createdCount === 2, `Count of created items = 2 (got ${createdCount})`);

  // 3.2 Duplicate itemCode prevention
  const dupItemRes = await fetch('http://localhost:3000/api/boq/standard-library', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      sector: 'RETAIL',
      projectType: 'Store Fitout',
      category: testCategoryName,
      items: [
        {
          itemCode: testItemCode1, // Already exists!
          standardDescription: 'Another panel description',
          uom: 'SQFT',
        },
      ],
    }),
  });
  assert(dupItemRes.status === 409, `Duplicate standard item code correctly rejected with HTTP 409 Conflict (Status: ${dupItemRes.status})`);

  // 3.3 Verify items appear in Standard BOQ Master for Project User
  const getStdRes = await fetch(`http://localhost:3000/api/boq/standard-library?category=${encodeURIComponent(testCategoryName)}`, {
    headers: projectUserHeaders,
  });
  assert(getStdRes.status === 200, 'GET /api/boq/standard-library returns 200 for Project User');
  const stdPayload = await getStdRes.json();
  const stdItems = stdPayload.data || stdPayload || [];
  assert(stdItems.some((it: any) => it.itemCode === testItemCode1), `Item ${testItemCode1} found in Standard BOQ Master`);
  assert(stdItems.some((it: any) => it.itemCode === testItemCode2), `Item ${testItemCode2} found in Standard BOQ Master`);

  // -------------------------------------------------------------
  // TEST GROUP 4: DOWNLOAD STANDARD BOQ INTEGRATION
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: DOWNLOAD STANDARD BOQ INTEGRATION ---');
  // 4.1 Download Standard BOQ including the new category
  const downloadUrl = `http://localhost:3000/api/boq/standard/download?sector=RETAIL&categories=${encodeURIComponent(testCategoryName)}`;
  const dlRes = await fetch(downloadUrl, { headers: projectUserHeaders });
  assert(dlRes.status === 200, `Download Standard BOQ successfully generated Excel workbook (HTTP 200)`);
  assert(
    Boolean(dlRes.headers.get('content-type')?.includes('spreadsheet') || dlRes.headers.get('content-type')?.includes('octet-stream')),
    'Download response contains spreadsheet content-type'
  );

  // -------------------------------------------------------------
  // TEST GROUP 5: ROLE PERMISSIONS (PROJECT USER READ-ONLY GUARD)
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 5: ROLE PERMISSIONS & SECURITY GUARD ---');
  // 5.1 Project User attempting to POST new category -> MUST BE FORBIDDEN (403)
  const projUserCatRes = await fetch('http://localhost:3000/api/masters/categories', {
    method: 'POST',
    headers: projectUserHeaders,
    body: JSON.stringify({
      name: `Illegal Category by Project User ${Date.now()}`,
    }),
  });
  assert(projUserCatRes.status === 403, `Project User blocked from creating categories: HTTP 403 Forbidden (Status: ${projUserCatRes.status})`);

  // 5.2 Project User attempting to POST new standard BOQ item -> MUST BE FORBIDDEN (403)
  const projUserStdRes = await fetch('http://localhost:3000/api/boq/standard-library', {
    method: 'POST',
    headers: projectUserHeaders,
    body: JSON.stringify({
      sector: 'RETAIL',
      items: [
        {
          itemCode: `STD-ILLEGAL-${Date.now()}`,
          standardDescription: 'Illegal item',
          category: 'General',
          uom: 'NOS',
        },
      ],
    }),
  });
  assert(projUserStdRes.status === 403, `Project User blocked from creating standard BOQ items: HTTP 403 Forbidden (Status: ${projUserStdRes.status})`);

  // -------------------------------------------------------------
  // TEST GROUP 6: CANONICAL PAGES & PRESERVED ROUTES
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 6: CANONICAL PAGES & PRESERVED ROUTES ---');
  const catPageExists = fs.existsSync(path.join(__dirname, '../src/app/(app)/masters/categories/page.tsx'));
  assert(catPageExists, 'Canonical page exists: /masters/categories');

  const stdPageExists = fs.existsSync(path.join(__dirname, '../src/app/(app)/masters/standard-boq/page.tsx'));
  assert(stdPageExists, 'Canonical page exists: /masters/standard-boq');

  const oldRedirectCode = fs.readFileSync(path.join(__dirname, '../src/app/(app)/boq/standard-library/page.tsx'), 'utf8');
  assert(oldRedirectCode.includes('/masters/standard-boq'), 'Old route /boq/standard-library redirects to canonical /masters/standard-boq');

  console.log('\n================================================================');
  console.log(` RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log('================================================================\n');

  if (passedTests === totalTests) {
    console.log('SUCCESS: All acceptance tests passed! Master Creation consolidated and verified.');
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
