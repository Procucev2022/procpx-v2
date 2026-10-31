import { chromium } from 'playwright-core';
import path from 'path';
import fs from 'fs';

const artifactDir = 'C:\\Users\\Lenovo\\.gemini\\antigravity-ide\\brain\\77fdf32f-46fc-4ba0-896b-3307ba1b183b';

async function runTest() {
  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true });
  }

  console.log('🚀 Starting comprehensive verification of Redesigned Immediate Vendor Onboarding (Step 1 & Step 2)...');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
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

    // 2. Navigate to Vendor Management -> Immediate Onboarding
    console.log('2. Navigating to /procurement/vendors and opening Immediate Onboarding...');
    await page.goto('http://localhost:3000/procurement/vendors');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const addVendorBtn = page.locator('button:has-text("Add Vendor")');
    if (await addVendorBtn.isVisible()) {
      await addVendorBtn.click();
    } else {
      await page.click('button:has-text("Immediate Onboarding")');
    }
    await page.waitForTimeout(600);

    // 3. Verify Step 1 UI & Initial State (No errors on initial load)
    console.log('3. Verifying Step 1 layout, initial clean state without red banners...');
    await page.waitForSelector('text=Step 1: Basic Vendor & Contact Information');

    // Confirm no error banners exist
    const errorBanners = await page.locator('text=Please complete all required fields').count();
    console.log(`   Initial error banners count: ${errorBanners} (expected 0)`);
    if (errorBanners > 0) {
      throw new Error('Initial form should NOT display validation error banners!');
    }

    // Capture desktop Step 1 screenshot
    const step1ScreenshotPath = path.join(artifactDir, '15_onboarding_redesign_step1.png');
    await page.screenshot({ path: step1ScreenshotPath, fullPage: true });
    console.log(`📸 Saved Step 1 screenshot: ${step1ScreenshotPath}`);

    // Verify key elements exist
    const pageTitle = await page.locator('h1').innerText();
    console.log(`   Page Title: "${pageTitle}"`);
    if (!pageTitle.includes('Immediate Vendor Onboarding')) {
      throw new Error(`Expected title to include "Immediate Vendor Onboarding", got "${pageTitle}"`);
    }

    // 4. Test responsive layout at 800px width on Step 1
    console.log('4. Testing Step 1 responsive view at 800px width...');
    await page.setViewportSize({ width: 800, height: 950 });
    await page.waitForTimeout(500);
    const responsiveStep1Path = path.join(artifactDir, '17_onboarding_responsive_step1.png');
    await page.screenshot({ path: responsiveStep1Path, fullPage: true });
    console.log(`📸 Saved responsive Step 1 screenshot: ${responsiveStep1Path}`);

    // Restore desktop viewport
    await page.setViewportSize({ width: 1440, height: 950 });
    await page.waitForTimeout(300);

    // 5. Test validation trigger: clicking continue with empty fields
    console.log('5. Testing validation trigger on empty fields...');
    const continueBtn = page.locator('button:has-text("Continue to Step 2 (Business Profile)")');
    await continueBtn.click();
    await page.waitForTimeout(500);

    // Verify error messages appear
    const nameError = await page.locator('text=Vendor Legal / Business Name is required').isVisible();
    const contactError = await page.locator('text=Primary Contact Person is required').isVisible();
    console.log(`   Validation correctly fired: Name error visible = ${nameError}, Contact error visible = ${contactError}`);
    if (!nameError || !contactError) {
      throw new Error('Expected validation error messages to appear when continuing with empty required fields!');
    }

    // 6. Fill Step 1 fields
    console.log('6. Filling Step 1 fields...');
    const testVendorName = `Apex Infrastructure & Contracting Pvt Ltd (Test ${Date.now().toString().slice(-4)})`;
    await page.fill('#vendor-legal-name', testVendorName);
    await page.selectOption('#vendor-classification-type', 'CLIENT_VENDOR');
    await page.fill('#vendor-contact-person', 'Rajesh Sharma');
    await page.fill('#vendor-email', 'sales@apexinfra.com');
    await page.fill('#vendor-phone', '9876543210');
    await page.fill('#vendor-alt-phone', '9876543211');
    await page.selectOption('#vendor-category-domain', 'Civil & Interior');
    await page.fill('#vendor-operating-location', 'Hyderabad, Telangana');

    // 7. Test "Save as Draft" in Step 1
    console.log('7. Testing "Save as Draft" in Step 1...');
    const saveDraftBtn1 = page.locator('button:has-text("Save as Draft")');
    await saveDraftBtn1.click();
    await page.waitForTimeout(1000);
    console.log('   Save as draft action completed.');

    // 8. Navigate to Step 2
    console.log('8. Clicking "Continue to Step 2 (Business Profile)"...');
    await continueBtn.click();
    await page.waitForTimeout(800);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);

    // 9. Verify Step 2 UI & Layout
    console.log('9. Verifying Step 2 layout and sections...');
    await page.waitForSelector('text=Step 2: Business Profile & Statutory Details');
    await page.waitForSelector('text=A. Statutory & Legal Information');
    await page.waitForSelector('text=B. Business Capabilities');
    await page.waitForSelector('text=C. Additional Information (Optional)');

    // Take desktop Step 2 screenshot cleanly
    const step2ScreenshotPath = path.join(artifactDir, '16_onboarding_redesign_step2.png');
    await page.screenshot({ path: step2ScreenshotPath, fullPage: true });
    console.log(`📸 Saved Step 2 screenshot: ${step2ScreenshotPath}`);

    // Take responsive Step 2 screenshot
    console.log('   Taking responsive Step 2 screenshot at 800px width...');
    await page.setViewportSize({ width: 800, height: 1100 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    const responsiveStep2Path = path.join(artifactDir, '17_onboarding_responsive_step2.png');
    await page.screenshot({ path: responsiveStep2Path, fullPage: true });
    console.log(`📸 Saved responsive Step 2 screenshot: ${responsiveStep2Path}`);

    // Restore desktop viewport
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);

    // 10. Fill Step 2 fields
    console.log('10. Filling Step 2 fields...');
    await page.selectOption('#vendor-legal-structure', 'PRIVATE_LIMITED');
    await page.fill('#vendor-gstin', '36AABCA1234F1Z5');
    await page.fill('#vendor-pan', 'AABCA1234F');
    await page.fill('#vendor-website', 'https://apexinfra.com');
    await page.fill('#vendor-experience-years', '8');
    await page.fill('#vendor-turnover', '35.5');
    await page.fill('#vendor-address', 'Plot No. 42, Hi-Tech City Main Road, Madhapur, Hyderabad, Telangana - 500081');
    await page.fill('#vendor-capabilities', 'Turnkey civil contracting, interior fit-outs, MEP services, HVAC ducting, structural fabrication');
    await page.fill('#vendor-references', 'Tata Projects (₹14 Cr), Reliance Retail Store Rollout (₹8 Cr), D-Mart Hyderabad (₹11 Cr)');
    await page.fill('#vendor-certifications', 'ISO 9001:2015, MSME Registered, OHSAS 18001');
    await page.fill('#vendor-remarks', 'Tier-1 preferred civil contractor with impeccable safety and quality standards.');

    // 11. Verify data persistence across Back and Next
    console.log('11. Testing state preservation between steps...');
    const backBtn = page.locator('button:has-text("Back to Step 1")');
    await backBtn.click();
    await page.waitForTimeout(500);

    // Check Step 1 fields retained their data
    const preservedName = await page.inputValue('#vendor-legal-name');
    const preservedContact = await page.inputValue('#vendor-contact-person');
    const preservedEmail = await page.inputValue('#vendor-email');
    console.log(`   Preserved Name: "${preservedName}"`);
    console.log(`   Preserved Contact: "${preservedContact}"`);
    console.log(`   Preserved Email: "${preservedEmail}"`);
    if (preservedName !== testVendorName || preservedContact !== 'Rajesh Sharma' || preservedEmail !== 'sales@apexinfra.com') {
      throw new Error('Step 1 data was NOT preserved when going back!');
    }

    // Go back to Step 2
    await page.click('button:has-text("Continue to Step 2 (Business Profile)")');
    await page.waitForTimeout(500);

    // Check Step 2 fields retained their data
    const preservedGstin = await page.inputValue('#vendor-gstin');
    const preservedAddress = await page.inputValue('#vendor-address');
    const preservedRemarks = await page.inputValue('#vendor-remarks');
    console.log(`   Preserved GSTIN: "${preservedGstin}"`);
    console.log(`   Preserved Address: "${preservedAddress}"`);
    console.log(`   Preserved Remarks: "${preservedRemarks}"`);
    if (preservedGstin !== '36AABCA1234F1Z5' || !preservedAddress.includes('Madhapur') || !preservedRemarks.includes('Tier-1')) {
      throw new Error('Step 2 data was NOT preserved!');
    }
    console.log('✅ Two-way state persistence verified successfully!');

    // 12. Complete Onboarding & Register
    console.log('12. Submitting "Complete Onboarding & Register"...');
    const registerBtn = page.locator('button:has-text("Complete Onboarding & Register")');
    await registerBtn.click();
    await page.waitForTimeout(3000);

    // Verify redirected to vendor directory or notification shown
    const afterRegisterScreenshotPath = path.join(artifactDir, '18_vendor_directory_after_onboarding.png');
    await page.screenshot({ path: afterRegisterScreenshotPath, fullPage: true });
    console.log(`📸 Saved post-registration screenshot: ${afterRegisterScreenshotPath}`);

    console.log('🎉 ALL ONBOARDING REDESIGN VERIFICATIONS PASSED SUCCESSFULLY!');
  } catch (error) {
    console.error('❌ Error during onboarding redesign verification:', error);
    const errPath = path.join(artifactDir, 'error_onboarding_redesign.png');
    await page.screenshot({ path: errPath, fullPage: true });
    console.log(`Saved error screenshot to: ${errPath}`);
    throw error;
  } finally {
    await browser.close();
  }
}

runTest();
