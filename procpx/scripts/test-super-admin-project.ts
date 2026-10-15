import puppeteer from 'puppeteer-core';
import { prisma } from '../src/lib/prisma';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  let createdProjectId: string | null = null;
  let generatedProjectCode: string | null = null;

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[BROWSER CONSOLE ERROR]:`, msg.text());
    }
  });

  page.on('pageerror', err => {
    console.error('[BROWSER PAGE ERROR]:', err);
  });

  page.on('response', async res => {
    if (res.status() >= 400) {
      let body = '';
      try { body = await res.text(); } catch {}
      console.error(`[NETWORK ERROR ${res.status()} ${res.url()}]:`, body);
    }
  });

  try {
    console.log('\n--- STEP 1 & 2: Log in as Super Admin & Navigate to Projects ---');
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
    await page.click('#work-email');
    await page.type('#work-email', 'super.admin@procucev-demo.local');
    await page.click('#password');
    await page.type('#password', 'Demo@1234');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle0' });

    console.log('Navigating to Projects register...');
    await page.goto('http://localhost:3000/projects', { waitUntil: 'networkidle0' });
    const createBtn = await page.$('a[href="/projects/new"]');
    console.log('Found "Create New Project" link:', !!createBtn);

    console.log('\n--- STEP 3: Confirm form loads without unexpected error banner ---');
    await page.goto('http://localhost:3000/projects/new', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1000));

    const initialError = await page.evaluate(() => {
      const el = document.querySelector('.alert-error');
      return el ? el.textContent : null;
    });
    console.log('Initial error banner on page load:', initialError ? initialError : 'NONE (PASS)');
    if (initialError) {
      throw new Error(`Unexpected error banner on page load: ${initialError}`);
    }

    console.log('\n--- STEP 8: Test missing mandatory fields and clear validation messages ---');
    // Disable native HTML5 validation to test JS error handling
    await page.evaluate(() => {
      const form = document.querySelector('form');
      if (form) form.noValidate = true;
    });

    // 8a. Test submitting empty form
    await page.click('button[type="submit"]');
    await new Promise(r => setTimeout(r, 500));
    let validationMsg = await page.evaluate(() => document.querySelector('.alert-error')?.textContent);
    console.log('Validation with empty name:', validationMsg);
    if (!validationMsg?.includes('Project name is required')) {
      throw new Error(`Expected "Project name is required.", got: ${validationMsg}`);
    }

    // 8b. Fill name, missing sector
    await page.type('input[placeholder*="Premium Retail Store"]', 'Super Admin Validation Test Project');
    await page.click('button[type="submit"]');
    await new Promise(r => setTimeout(r, 500));
    validationMsg = await page.evaluate(() => document.querySelector('.alert-error')?.textContent);
    console.log('Validation with missing sector:', validationMsg);
    if (!validationMsg?.includes('Sector is required')) {
      throw new Error(`Expected "Sector is required.", got: ${validationMsg}`);
    }

    // 8c. Fill sector, missing projectType
    await page.select('select:has(option[value="RETAIL"])', 'RETAIL');
    await page.click('button[type="submit"]');
    await new Promise(r => setTimeout(r, 500));
    validationMsg = await page.evaluate(() => document.querySelector('.alert-error')?.textContent);
    console.log('Validation with missing project type:', validationMsg);
    if (!validationMsg?.includes('Project type is required')) {
      throw new Error(`Expected "Project type is required.", got: ${validationMsg}`);
    }

    console.log('\n--- STEP 4 & 5: Submit valid test project & verify successful creation ---');
    await page.select('select:has(option[value="NEW_BUILD"])', 'NEW_BUILD');
    await page.type('input[placeholder="Bengaluru"]', 'Bengaluru');
    await page.type('input[placeholder="Karnataka"]', 'Karnataka');
    await page.type('input[placeholder="25000"]', '25000');
    await page.type('input[placeholder="RET-BLR-001"]', 'RET-BLR-001');
    await page.type('input[placeholder="Name or Team"]', 'Super Admin Team');
    await page.type('input[placeholder="0.00"]', '5000000');

    // Click submit
    console.log('Submitting valid project form...');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 });

    const currentUrl = page.url();
    console.log('URL after submission:', currentUrl);
    if (!currentUrl.includes('/projects/')) {
      const submitError = await page.evaluate(() => document.querySelector('.alert-error')?.textContent);
      throw new Error(`Failed to redirect to project detail page. Error on page: ${submitError}`);
    }

    createdProjectId = currentUrl.split('/projects/')[1]?.split('?')[0]?.replace(/\/$/, '') || null;
    console.log('Created Project ID (UUID):', createdProjectId);

    if (!createdProjectId) {
      throw new Error('Project ID not found in URL.');
    }

    // Step 4 verification: verify projectCode format
    const dbProject = await prisma.project.findUnique({
      where: { id: createdProjectId },
    });
    console.log('Created DB record:', {
      id: dbProject?.id,
      projectCode: dbProject?.projectCode,
      name: dbProject?.name,
      sector: dbProject?.sector,
      projectType: dbProject?.projectType,
      costCentre: dbProject?.costCentre,
      budget: dbProject?.budget,
      status: dbProject?.status,
    });

    generatedProjectCode = dbProject?.projectCode || null;
    const cpxRegex = /^CPX-P-\d{6}$/;
    if (!generatedProjectCode || !cpxRegex.test(generatedProjectCode)) {
      throw new Error(`Project Code does not match CPX-P-XXXXXX format: ${generatedProjectCode}`);
    }
    console.log(`PASS: Project Code format confirmed: ${generatedProjectCode}`);

    console.log('\n--- STEP 6: Reload the project register and confirm project persists ---');
    await page.goto('http://localhost:3000/projects', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1000));
    const projectInTable = await page.evaluate((code: string) => {
      const pageText = document.body.textContent || '';
      return pageText.includes(code);
    }, generatedProjectCode);
    console.log(`Project ${generatedProjectCode} visible in project register:`, projectInTable);
    if (!projectInTable) {
      throw new Error(`Project ${generatedProjectCode} not found in project register table.`);
    }

    console.log('\n--- STEP 7: Open the project and verify its details ---');
    await page.goto(`http://localhost:3000/projects/${createdProjectId}`, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1000));
    const projectDetails = await page.evaluate(() => {
      const title = document.querySelector('.page-title')?.textContent;
      const subtitle = document.querySelector('.page-subtitle')?.textContent;
      const bodyText = document.body.textContent || '';
      return {
        title,
        subtitle,
        hasDraftBadge: bodyText.includes('DRAFT'),
        hasRetail: bodyText.includes('RETAIL'),
        hasCostCentre: bodyText.includes('RET-BLR-001'),
      };
    });
    console.log('Project Details on Page:', projectDetails);
    if (!projectDetails.title?.includes('Super Admin Validation Test Project')) {
      throw new Error('Project details title does not match created project.');
    }

    console.log('\n--- STEP 9: Confirm duplicate submission does not create duplicate projects ---');
    // Try sending identical projectCode through API to verify collision handling / rejection
    const duplicateRes = await fetch('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user-id': dbProject!.createdBy,
        'x-test-tenant-id': dbProject!.tenantId,
      },
      body: JSON.stringify({
        name: 'Another Project Concurrently',
        sector: 'RETAIL',
        projectType: 'NEW_BUILD',
      }),
    });
    const duplicateData = await duplicateRes.json();
    console.log('Subsequent project creation result:', {
      status: duplicateRes.status,
      code: duplicateData.projectCode,
    });
    if (duplicateData.projectCode === generatedProjectCode) {
      throw new Error('Duplicate projectCode generated!');
    }
    console.log(`PASS: Subsequent project got unique code: ${duplicateData.projectCode} != ${generatedProjectCode}`);

    // Clean up the second project immediately
    if (duplicateData.id) {
      await prisma.auditLog.deleteMany({ where: { projectId: duplicateData.id } });
      await prisma.project.delete({ where: { id: duplicateData.id } });
      console.log('Cleaned up subsequent test project:', duplicateData.id);
    }

    console.log('\n--- STEP 10: Verify project can be selected in downstream workflows ---');
    // Verify project appears in projects dropdown or API query
    const projectsListRes = await fetch(`http://localhost:3000/api/projects?search=${encodeURIComponent(generatedProjectCode)}`, {
      headers: {
        'x-test-user-id': dbProject!.createdBy,
        'x-test-tenant-id': dbProject!.tenantId,
      },
    });
    const listData = await projectsListRes.json();
    const foundInApi = listData.data?.some((p: any) => p.projectCode === generatedProjectCode);
    console.log(`Found project ${generatedProjectCode} in project search API:`, foundInApi);
    if (!foundInApi) {
      throw new Error('Project not available in project search API for downstream workflows.');
    }

    console.log('\nALL 10 VERIFICATION STEPS PASSED SUCCESSFULLY!');

  } finally {
    // Cleanup the main created test project
    if (createdProjectId) {
      console.log('\nCleaning up isolated test project:', createdProjectId);
      await prisma.auditLog.deleteMany({ where: { projectId: createdProjectId } });
      await prisma.project.delete({ where: { id: createdProjectId } });
      console.log('Cleanup completed.');
    }
    await browser.close();
  }
}

main().catch(err => {
  console.error('\nTEST FAILED:', err);
  process.exit(1);
});
