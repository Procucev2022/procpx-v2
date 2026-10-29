import puppeteer from 'puppeteer-core';
import { prisma } from '../src/lib/prisma';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  let createdVendorId: string | null = null;
  let createdVendorCode: string | null = null;

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[BROWSER CONSOLE ERROR]:`, msg.text());
    }
  });

  page.on('pageerror', err => {
    console.error('[BROWSER PAGE ERROR]:', err);
  });

  page.on('response', async res => {
    if (res.status() >= 400 && res.url().includes('/api/')) {
      let body = '';
      try { body = await res.text(); } catch {}
      console.error(`[API ERROR ${res.status()} ${res.url()}]:`, body);
    }
  });

  try {
    console.log('\n============================================================');
    console.log('PART 1: TWO-STEP ONBOARDING BROWSER WORKFLOW');
    console.log('============================================================');

    console.log('\n1. Logging in as Procurement User (procurement.user@procucev-demo.local)...');
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
    await page.click('#work-email');
    await page.type('#work-email', 'procurement.user@procucev-demo.local');
    await page.click('#password');
    await page.type('#password', 'Demo@1234');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle0' });

    console.log('2. Navigating to /procurement/vendors...');
    await page.goto('http://localhost:3000/procurement/vendors', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1000));

    console.log('3. Opening Immediate Vendor Onboarding Tab...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent?.includes('Onboarding'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    console.log('4. Completing Step 1 Basic Info...');
    const testVendorName = 'Apex Global Electro-Tech Solutions Pvt Ltd';
    await page.type('input[placeholder*="Apex Infrastructure"]', testVendorName);
    await page.type('input[placeholder*="Rajesh Sharma"]', 'Vikramaditya Rao');
    await page.type('input[placeholder*="sales@apexinfra.com"]', 'vikram@apex-global.in');
    await page.type('input[placeholder*="98765"]', '+91 98888 77777');
    await page.type('input[placeholder*="Hyderabad"]', 'Bengaluru, Karnataka');

    console.log('5. Clicking "Save as Draft Profile" in Step 1...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent?.includes('Save as Draft Profile'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 2000));

    // Verify success banner and NO forbidden error
    const step1DraftResult = await page.evaluate(() => {
      const success = Array.from(document.querySelectorAll('div')).find(d => d.textContent?.includes('saved as draft'));
      const error = Array.from(document.querySelectorAll('div')).find(d => d.textContent?.includes('Forbidden'));
      return {
        successMsg: success?.textContent || null,
        errorMsg: error?.textContent || null,
      };
    });
    console.log('Step 1 Draft Save Result:', step1DraftResult);
    if (step1DraftResult.errorMsg) {
      throw new Error(`Step 1 Draft Save failed with: ${step1DraftResult.errorMsg}`);
    }
    if (!step1DraftResult.successMsg) {
      throw new Error('Step 1 Draft Save did not display success message.');
    }

    // Check DB for created draft vendor
    const draftDbVendor = await prisma.vendor.findFirst({
      where: { name: testVendorName },
    });
    console.log('Draft Vendor created in DB:', {
      id: draftDbVendor?.id,
      code: draftDbVendor?.code,
      name: draftDbVendor?.name,
      status: draftDbVendor?.onboardingStatus,
    });
    if (!draftDbVendor || draftDbVendor.onboardingStatus !== 'DRAFT') {
      throw new Error('Draft vendor not found or status not DRAFT.');
    }
    createdVendorId = draftDbVendor.id;
    createdVendorCode = draftDbVendor.code;

    console.log('\n6. Continuing to Step 2 Business Profile & Statutory Details...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent?.includes('Continue to Step 2'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // Step 5 verification: Verify that Step 2 loads without a forbidden error
    const step2LoadError = await page.evaluate(() => {
      const error = Array.from(document.querySelectorAll('div')).find(d => d.textContent?.includes('Forbidden'));
      return error?.textContent || null;
    });
    console.log('Step 2 Page Load Error:', step2LoadError ? step2LoadError : 'NONE (PASS)');
    if (step2LoadError) {
      throw new Error(`Step 2 displays Forbidden error: ${step2LoadError}`);
    }

    console.log('\n7. Entering Step 2 Business & Statutory Details...');
    await page.type('input[maxLength="15"]', '29AABCA9876C1Z3');
    await page.type('input[maxLength="10"]', 'AABCA9876C');
    await page.type('input[placeholder*="company.com"]', 'https://apex-global.in');
    await page.type('input[placeholder*="25.5"]', '42.5');
    await page.type('input[placeholder*="corporate office address"]', 'Plot 45, Electronics City Phase 1, Bengaluru');
    await page.type('textarea[placeholder*="workforce strength"]', 'HT Substation installation, 11kV cabling, cleanroom electrification');
    await page.type('textarea[placeholder*="Tata, Reliance"]', 'L&T Infotech (₹15 Cr), Infosys EC Campus (₹22 Cr)');

    console.log('\n8. Testing navigation: Back to Step 1 and forward to Step 2 to verify data persistence...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent?.includes('Back to Step 1'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 500));

    const step1NameValue = await page.evaluate(() => {
      const input = document.querySelector('input[placeholder*="Apex Infrastructure"]') as HTMLInputElement;
      return input?.value;
    });
    console.log('Step 1 Name value after navigating back:', step1NameValue);
    if (step1NameValue !== testVendorName) {
      throw new Error(`Step 1 data was lost upon navigating back! Got: ${step1NameValue}`);
    }

    // Navigate forward to Step 2 again
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent?.includes('Continue to Step 2'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 500));

    const step2GstinValue = await page.evaluate(() => {
      const input = document.querySelector('input[placeholder*="36AABCA"]') as HTMLInputElement;
      return input?.value;
    });
    console.log('Step 2 GSTIN value after navigating forward:', step2GstinValue);
    if (!step2GstinValue?.includes('29AABCA9876C1Z3')) {
      throw new Error(`Step 2 data was lost upon navigating forward! Got: ${step2GstinValue}`);
    }

    console.log('\n9. Submitting Complete Onboarding & Register...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent?.includes('Complete Onboarding'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 2500));

    const completeResult = await page.evaluate(() => {
      const success = Array.from(document.querySelectorAll('div')).find(d => d.textContent?.includes('onboarded successfully'));
      const error = Array.from(document.querySelectorAll('div')).find(d => d.textContent?.includes('Forbidden') || d.textContent?.includes('Error'));
      return {
        successMsg: success?.textContent || null,
        errorMsg: error?.textContent || null,
      };
    });
    console.log('Complete Onboarding Result:', completeResult);
    if (completeResult.errorMsg) {
      throw new Error(`Complete Onboarding failed: ${completeResult.errorMsg}`);
    }

    // Step 9 & 10 verification: Verify vendor in DB and check for duplicate creation
    const matchingVendors = await prisma.vendor.findMany({
      where: { name: testVendorName },
    });
    console.log(`Vendors in DB matching name "${testVendorName}":`, matchingVendors.length);
    if (matchingVendors.length !== 1) {
      throw new Error(`DUPLICATE VENDOR DETECTED! Found ${matchingVendors.length} records instead of 1.`);
    }

    const finalVendor = matchingVendors[0];
    console.log('Final Vendor Details in DB:', {
      id: finalVendor.id,
      code: finalVendor.code,
      name: finalVendor.name,
      gstin: finalVendor.gstin,
      pan: finalVendor.pan,
      onboardingStatus: finalVendor.onboardingStatus,
      qualificationStatus: finalVendor.qualificationStatus,
    });
    if (finalVendor.id !== createdVendorId) {
      throw new Error(`Vendor ID changed unexpectedly! Initial: ${createdVendorId}, Final: ${finalVendor.id}`);
    }
    if (finalVendor.onboardingStatus !== 'ONBOARDED') {
      throw new Error(`Expected status ONBOARDED, got: ${finalVendor.onboardingStatus}`);
    }
    if (finalVendor.gstin !== '29AABCA9876C1Z3' || finalVendor.pan !== 'AABCA9876C') {
      throw new Error('Statutory details were not saved properly on the vendor record.');
    }
    console.log('PASS: Exact vendor record updated without duplicates. Status is ONBOARDED.');

    console.log('\n10. Confirming vendor appears in Vendor Directory register...');
    await page.goto('http://localhost:3000/procurement/vendors', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1000));
    const vendorVisibleInDirectory = await page.evaluate((code: string) => {
      return document.body.textContent?.includes(code);
    }, finalVendor.code!);
    console.log(`Vendor ${finalVendor.code} visible in Directory:`, vendorVisibleInDirectory);
    if (!vendorVisibleInDirectory) {
      throw new Error(`Vendor ${finalVendor.code} not found in Directory register.`);
    }

    console.log('\n============================================================');
    console.log('PART 2: SECURITY REGRESSION TESTS');
    console.log('============================================================');

    const authHeaders = (userId: string, tenantId: string) => ({
      'Content-Type': 'application/json',
      'x-test-user-id': userId,
      'x-test-tenant-id': tenantId,
    });

    const tenantA = '5f6bc1f7-1919-4900-8fe7-44812baecdcb';
    const tenantB = 'e4ffeb1f-ae24-4e7c-a9f3-342f72705d18';

    // Users
    const procUser = await prisma.user.findFirstOrThrow({ where: { email: 'procurement.user@procucev-demo.local' } });
    const catManager = await prisma.user.findFirstOrThrow({ where: { email: 'category.manager@procucev-demo.local' } });
    const clientAdmin = await prisma.user.findFirstOrThrow({ where: { email: 'client.admin@procucev-demo.local' } });
    const superAdmin = await prisma.user.findFirstOrThrow({ where: { email: 'super.admin@procucev-demo.local' } });
    const projUser = await prisma.user.findFirstOrThrow({ where: { email: 'project.user@procucev-demo.local' } });
    const viewer = await prisma.user.findFirstOrThrow({ where: { email: 'viewer@procucev-demo.local' } });
    const vendorUser = await prisma.user.findFirstOrThrow({ where: { email: 'vendor.apex@apex-infra.com' } });
    const tenantBAdmin = await prisma.user.findFirstOrThrow({ where: { email: 'hospitality.admin@procucev-demo.local' } });

    // 2.1 Unauthorised Internal Users (PROJECT_USER, VIEWER) cannot onboard or edit vendors
    console.log('\nSecurity Check 2.1: Unauthorised internal roles must be rejected (403)');
    const projUserRes = await fetch('http://localhost:3000/api/procurement/vendors', {
      method: 'POST',
      headers: authHeaders(projUser.id, tenantA),
      body: JSON.stringify({ name: 'Unauthorized Attempt', contactPerson: 'Hacker', category: 'Civil', operatingLocation: 'BLR' }),
    });
    console.log('PROJECT_USER POST /api/procurement/vendors status:', projUserRes.status);
    if (projUserRes.status !== 403) throw new Error(`Expected 403 for PROJECT_USER, got ${projUserRes.status}`);

    const viewerRes = await fetch(`http://localhost:3000/api/procurement/vendors/${finalVendor.id}`, {
      method: 'PUT',
      headers: authHeaders(viewer.id, tenantA),
      body: JSON.stringify({ name: 'Viewer Tampering' }),
    });
    console.log('VIEWER PUT /api/procurement/vendors/[id] status:', viewerRes.status);
    if (viewerRes.status !== 403) throw new Error(`Expected 403 for VIEWER, got ${viewerRes.status}`);

    // 2.2 Authorised Internal Roles (CATEGORY_MANAGER, CLIENT_ADMIN, SUPER_ADMIN, PROCUREMENT_USER) can edit
    console.log('\nSecurity Check 2.2: Authorised internal roles can manage vendors');
    for (const u of [catManager, clientAdmin, superAdmin, procUser]) {
      const res = await fetch(`http://localhost:3000/api/procurement/vendors/${finalVendor.id}`, {
        method: 'PUT',
        headers: authHeaders(u.id, tenantA),
        body: JSON.stringify({ contactPerson: `Updated by ${u.role}` }),
      });
      console.log(`${u.role} PUT /api/procurement/vendors/[id] status:`, res.status);
      if (res.status !== 200) throw new Error(`Expected 200 for ${u.role}, got ${res.status}`);
    }

    // 2.3 Vendor Role Ownership Restrictions
    console.log('\nSecurity Check 2.3: Vendor role ownership & cross-vendor tampering protection');
    console.log('Vendor user mapped vendorId:', vendorUser.vendorId);

    // Vendor user updating their own profile -> Allowed
    if (vendorUser.vendorId) {
      const ownRes = await fetch(`http://localhost:3000/api/procurement/vendors/${vendorUser.vendorId}`, {
        method: 'PUT',
        headers: authHeaders(vendorUser.id, tenantA),
        body: JSON.stringify({ address: 'Own Updated Address' }),
      });
      console.log('VENDOR updating own profile status:', ownRes.status);
      if (ownRes.status !== 200) throw new Error(`Expected 200 for Vendor updating own profile, got ${ownRes.status}`);
    }

    // Vendor user attempting to update ANOTHER vendor's profile -> REJECTED (403)
    const otherRes = await fetch(`http://localhost:3000/api/procurement/vendors/${finalVendor.id}`, {
      method: 'PUT',
      headers: authHeaders(vendorUser.id, tenantA),
      body: JSON.stringify({ name: 'Cross Vendor Tampering' }),
    });
    console.log('VENDOR attempting to update another vendor status:', otherRes.status);
    if (otherRes.status !== 403) throw new Error(`Expected 403 for Vendor updating another vendor, got ${otherRes.status}`);

    // 2.4 Tenant Isolation Restrictions
    console.log('\nSecurity Check 2.4: Tenant isolation (cross-tenant access rejected)');
    const crossTenantRes = await fetch(`http://localhost:3000/api/procurement/vendors/${finalVendor.id}`, {
      method: 'PUT',
      headers: authHeaders(tenantBAdmin.id, tenantB),
      body: JSON.stringify({ name: 'Cross Tenant Tampering' }),
    });
    console.log('Tenant B Admin updating Tenant A vendor status:', crossTenantRes.status);
    if (crossTenantRes.status !== 404 && crossTenantRes.status !== 403) {
      throw new Error(`Expected 404 or 403 for cross-tenant update, got ${crossTenantRes.status}`);
    }

    console.log('\nALL WORKFLOW AND SECURITY VERIFICATIONS PASSED SUCCESSFULLY!');

  } finally {
    if (createdVendorId) {
      console.log('\nCleaning up test vendor record:', createdVendorId);
      await prisma.auditLog.deleteMany({ where: { entityId: createdVendorId } });
      await prisma.vendor.delete({ where: { id: createdVendorId } });
      console.log('Cleanup completed.');
    }
    await browser.close();
  }
}

main().catch(err => {
  console.error('\nTEST SUITE FAILED:', err);
  process.exit(1);
});
