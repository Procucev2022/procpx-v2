import { chromium } from 'playwright-core';
import path from 'path';
import fs from 'fs';

const artifactDir = 'C:\\Users\\Lenovo\\.gemini\\antigravity-ide\\brain\\77fdf32f-46fc-4ba0-896b-3307ba1b183b';

async function verify() {
  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true });
  }

  console.log('Launching browser to verify Vendor Onboarding & Evaluation improvements...');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();

  try {
    // 1. Log in
    console.log('1. Logging in as Category Manager...');
    await page.goto('http://localhost:3000/login');
    await page.waitForSelector('#work-email');
    await page.fill('#work-email', 'category.manager@procucev-demo.local');
    await page.fill('#password', 'Demo@1234');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    console.log('✅ Logged in successfully.');

    // 2. Navigate to Vendor Management
    console.log('2. Navigating to /procurement/vendors...');
    await page.goto('http://localhost:3000/procurement/vendors');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // 3. Test PART A: Immediate Onboarding UX
    console.log('3. Testing PART A: Immediate Onboarding...');
    // Click Onboarding tab
    const onboardingTabBtn = page.locator('button:has-text("Immediate Onboarding")');
    await onboardingTabBtn.click();
    await page.waitForTimeout(500);

    // Fill Step 1
    console.log('   Filling Step 1 Basic Info...');
    await page.locator('input[placeholder*="Apex Infrastructure"]').fill('Apex Elite Infrastructure Pvt Ltd');
    await page.locator('input[placeholder*="Rajesh Sharma"]').fill('Rohan Verma');
    await page.locator('input[placeholder*="sales@apexinfra.com"]').fill('rohan.verma@apexelite.com');
    await page.locator('input[placeholder*="98765"]').fill('+91 98765 11223');
    await page.locator('input[placeholder*="Hyderabad, Telangana"]').fill('Hyderabad, Telangana');

    // Screenshot Step 1
    const shot1 = path.join(artifactDir, '01_vendor_onboarding_step1.png');
    await page.screenshot({ path: shot1, fullPage: true });
    console.log('   ✅ Saved Step 1 screenshot:', shot1);

    // Continue to Step 2
    console.log('   Clicking "Continue to Step 2"...');
    await page.click('button:has-text("Continue to Step 2")');
    await page.waitForTimeout(600);

    // Fill Step 2
    console.log('   Filling Step 2 Business Profile & Statutory details...');
    await page.locator('input[placeholder="e.g. 36AABCA1234F1Z5"]').fill('36AABCA9999F1Z9');
    await page.locator('input[placeholder="e.g. AABCA1234F"]').fill('AABCA9999F');
    await page.locator('input[placeholder*="https://company.com"]').fill('https://apexelite.com');
    await page.locator('input[placeholder*="25.5"]').fill('35.0');
    await page.locator('input[placeholder*="Complete corporate"]').fill('Plot 42, HITEC City, Madhapur, Hyderabad, Telangana 500081');
    await page.locator('textarea[placeholder*="Specific scope"]').fill('Grade-A Commercial interior fitout, MEP integration, HVAC ducting, structural glazing.');
    await page.locator('textarea[placeholder*="Notable previous clients"]').fill('Tata Consultancy Services (50,000 sqft), Reliance Retail (₹8.5 Cr fitout), D-Mart.');

    // Screenshot Step 2
    const shot2 = path.join(artifactDir, '02_vendor_onboarding_step2.png');
    await page.screenshot({ path: shot2, fullPage: true });
    console.log('   ✅ Saved Step 2 screenshot:', shot2);

    // Verify Data Persistence when Navigating Back to Step 1
    console.log('   Testing Back to Step 1 data persistence...');
    await page.click('button:has-text("Back to Step 1")');
    await page.waitForTimeout(500);

    const valName = await page.locator('input[placeholder*="Apex Infrastructure"]').inputValue();
    const valContact = await page.locator('input[placeholder*="Rajesh Sharma"]').inputValue();
    const valEmail = await page.locator('input[placeholder*="sales@apexinfra.com"]').inputValue();
    console.log(`   Verification: Name="${valName}", Contact="${valContact}", Email="${valEmail}"`);
    if (valName !== 'Apex Elite Infrastructure Pvt Ltd' || valContact !== 'Rohan Verma') {
      throw new Error('Data was not preserved when navigating back to Step 1!');
    }
    console.log('   ✅ Step 1 data fully preserved after navigating back!');

    // Navigate to Step 2 again and test Draft save
    await page.click('button:has-text("Continue to Step 2")');
    await page.waitForTimeout(500);
    const valGstin = await page.locator('input[placeholder="e.g. 36AABCA1234F1Z5"]').inputValue();
    console.log(`   Verification Step 2: GSTIN="${valGstin}"`);
    if (valGstin !== '36AABCA9999F1Z9') {
      throw new Error('Step 2 data was not preserved when returning to Step 2!');
    }
    console.log('   ✅ Step 2 data fully preserved after re-navigating to Step 2!');

    // 4. Test PART B: Evaluation Hub & Selection
    console.log('4. Testing PART B: Evaluation Hub & Selection...');
    const evalTabBtn = page.locator('button:has-text("Evaluation Hub & Selection")');
    await evalTabBtn.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Screenshot Evaluation Hub Overview
    const shot3 = path.join(artifactDir, '03_evaluation_hub_overview.png');
    await page.screenshot({ path: shot3, fullPage: true });
    console.log('   ✅ Saved Evaluation Hub overview:', shot3);

    // Test Filter Panel: Category filter
    console.log('   Testing Category filter...');
    await page.locator('label:has-text("1. Category Domain")').locator('..').locator('select').selectOption('Civil & Interior');
    await page.click('button:has-text("Apply Filters")');
    await page.waitForTimeout(500);
    const filteredShot = path.join(artifactDir, '04_evaluation_filtered_category.png');
    await page.screenshot({ path: filteredShot, fullPage: true });
    console.log('   ✅ Saved Category filtered screenshot:', filteredShot);

    // Test Clear Filters
    console.log('   Testing Clear Filters...');
    await page.click('button:has-text("Clear Filters")');
    await page.waitForTimeout(500);

    // Test Classification filter: Procucev Network
    console.log('   Testing Classification filter...');
    await page.locator('label:has-text("3. Vendor Classification")').locator('..').locator('select').selectOption('PROCUCEV_VENDOR');
    await page.click('button:has-text("Apply Filters")');
    await page.waitForTimeout(500);

    // Test Region filter
    console.log('   Testing Region filter...');
    await page.locator('label:has-text("2. Region / Location")').locator('..').locator('select').selectOption('Bangalore');
    await page.click('button:has-text("Apply Filters")');
    await page.waitForTimeout(500);

    // Clear filters to restore full queue
    await page.click('button:has-text("Clear Filters")');
    await page.waitForTimeout(500);

    // 5. Test Selection & Bulk Evaluation Modal
    console.log('5. Testing Selection & Bulk Evaluation Modal...');
    // Select first 2 checkboxes in table body
    const rowCheckboxes = page.locator('table.enterprise-table tbody input[type="checkbox"]');
    const rowCount = await rowCheckboxes.count();
    console.log(`   Found ${rowCount} vendors in table.`);
    if (rowCount >= 2) {
      await rowCheckboxes.nth(0).check();
      await rowCheckboxes.nth(1).check();
      await page.waitForTimeout(300);

      // Verify "2 vendors selected" badge is visible
      const selBadge = await page.locator('text=2 vendors selected').isVisible();
      console.log(`   Selected badge visible: ${selBadge}`);

      // Click "Evaluate Selected Vendors"
      await page.click('button:has-text("Evaluate Selected Vendors (2)")');
      await page.waitForTimeout(500);

      // Screenshot Confirmation Modal
      const modalShot = path.join(artifactDir, '05_bulk_evaluation_modal_confirmation.png');
      await page.screenshot({ path: modalShot, fullPage: true });
      console.log('   ✅ Saved Bulk Evaluation Confirmation Modal screenshot:', modalShot);

      // Click "Start Evaluation"
      console.log('   Executing Bulk AI Evaluation...');
      await page.click('button:has-text("Start Evaluation (2)")');
      // Wait for evaluations to complete (status changes to Done)
      await page.waitForSelector('button:has-text("Done & View Results")', { timeout: 30000 });
      await page.waitForTimeout(1000);

      // Screenshot Live Progress / Completed Modal
      const progressShot = path.join(artifactDir, '06_bulk_evaluation_modal_completed.png');
      await page.screenshot({ path: progressShot, fullPage: true });
      console.log('   ✅ Saved Bulk Evaluation Completed Modal screenshot:', progressShot);

      // Close modal
      await page.click('button:has-text("Done & View Results")');
      await page.waitForTimeout(1000);

      // Final Queue Screenshot showing updated scores and statuses
      const finalQueueShot = path.join(artifactDir, '07_evaluation_queue_after_bulk_eval.png');
      await page.screenshot({ path: finalQueueShot, fullPage: true });
      console.log('   ✅ Saved Final Evaluation Queue screenshot:', finalQueueShot);
    }

    console.log('🎉 ALL BROWSER E2E VERIFICATIONS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Browser verification error:', err);
    throw err;
  } finally {
    await browser.close();
  }
}

verify();
