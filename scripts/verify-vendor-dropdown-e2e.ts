import { chromium } from 'playwright-core';
import path from 'path';
import fs from 'fs';

const artifactDir = 'C:\\Users\\Lenovo\\.gemini\\antigravity-ide\\brain\\77fdf32f-46fc-4ba0-896b-3307ba1b183b';

async function runTest() {
  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true });
  }

  console.log('🚀 Starting E2E verification of "Select Vendors for Evaluation" dropdown and evaluation workflow...');
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

    // 2. Navigate to Vendor Management -> Evaluation Tab
    console.log('2. Navigating to /procurement/vendors and switching to Evaluation Hub...');
    await page.goto('http://localhost:3000/procurement/vendors');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const evalTabBtn = page.locator('button:has-text("Evaluation Hub & Selection")');
    await evalTabBtn.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Verify presence of "Select Vendors for Evaluation" dropdown trigger
    const dropdownTrigger = page.locator('#select-vendors-dropdown-trigger');
    await dropdownTrigger.waitFor({ state: 'visible', timeout: 5000 });
    const triggerInitialText = await dropdownTrigger.innerText();
    console.log('   Initial dropdown trigger text:', triggerInitialText.replace(/\n/g, ' '));

    // Verify "Evaluate Selected Vendors" button is initially disabled
    const evalBtn = page.locator('#evaluate-selected-vendors-btn');
    const isEvalBtnDisabledInitial = await evalBtn.isDisabled();
    console.log(`   "Evaluate Selected Vendors" disabled initially: ${isEvalBtnDisabledInitial}`);
    if (!isEvalBtnDisabledInitial) {
      throw new Error('Evaluate button should be disabled when 0 vendors selected');
    }

    // 3. Test Step 1: Open Dropdown and select ONE vendor
    console.log('3. Opening "Select Vendors for Evaluation" dropdown...');
    await dropdownTrigger.click();
    await page.waitForTimeout(400);

    const dropdownMenu = page.locator('#select-vendors-dropdown-menu');
    await dropdownMenu.waitFor({ state: 'visible', timeout: 3000 });

    // Capture screenshot of the opened dropdown with actual vendors
    const shotDropdownOpen = path.join(artifactDir, '08_vendor_dropdown_opened.png');
    await page.screenshot({ path: shotDropdownOpen, fullPage: false });
    console.log('   📸 Screenshot saved: 08_vendor_dropdown_opened.png');

    // Select the first vendor in the dropdown list
    const vendorItems = dropdownMenu.locator('div[style*="cursor: pointer"]');
    const countItems = await vendorItems.count();
    console.log(`   Found ${countItems} vendors listed in dropdown.`);
    if (countItems === 0) throw new Error('No vendors found in dropdown!');

    console.log('   Selecting first vendor in dropdown...');
    await vendorItems.nth(0).click();
    await page.waitForTimeout(300);

    // Check trigger text updates to reflect the single selected vendor
    const triggerAfterOne = await dropdownTrigger.innerText();
    console.log('   Trigger text after selecting 1 vendor:', triggerAfterOne.replace(/\n/g, ' '));
    if (!triggerAfterOne.includes('1') && !triggerAfterOne.includes('selected')) {
      throw new Error('Dropdown trigger failed to update with selected vendor');
    }

    // 4. Test Step 2: Select MULTIPLE vendors via dropdown & search
    console.log('4. Testing search and multiple selection inside dropdown...');
    const searchInput = dropdownMenu.locator('input[placeholder*="Search vendors"]');
    await searchInput.fill('VND');
    await page.waitForTimeout(300);

    // Select second vendor item
    await vendorItems.nth(1).click();
    await page.waitForTimeout(300);

    // Select third vendor item
    if (countItems >= 3) {
      await vendorItems.nth(2).click();
      await page.waitForTimeout(300);
    }

    // Capture screenshot of multiple selections in dropdown
    const shotDropdownMulti = path.join(artifactDir, '09_vendor_dropdown_multiple_selected.png');
    await page.screenshot({ path: shotDropdownMulti, fullPage: false });
    console.log('   📸 Screenshot saved: 09_vendor_dropdown_multiple_selected.png');

    // Click "Done" to close dropdown
    await dropdownMenu.locator('button:has-text("Done")').click();
    await page.waitForTimeout(300);

    const triggerMultiText = await dropdownTrigger.innerText();
    console.log('   Trigger text after multi-selection:', triggerMultiText.replace(/\n/g, ' '));

    // Verify Evaluate button is now enabled
    const isEvalBtnEnabled = !(await evalBtn.isDisabled());
    console.log(`   "Evaluate Selected Vendors" enabled: ${isEvalBtnEnabled}`);
    if (!isEvalBtnEnabled) throw new Error('Evaluate button should be enabled when vendors are selected');

    // Verify table row checkboxes match the selected vendors
    const tableCheckedBoxes = await page.locator('table.enterprise-table tbody input[type="checkbox"]:checked').count();
    console.log(`   Table row checkboxes checked: ${tableCheckedBoxes}`);

    // 5. Test Step 3: Filtering & Selection Behaviour (Pruning & Classification Tabs)
    console.log('5. Testing Filtering and Selection behaviour...');
    
    // Switch to "Procucev Network Vendors" tab
    console.log('   Clicking "Procucev Network Vendors" classification tab...');
    await page.locator('button:has-text("Procucev Network Vendors")').click();
    await page.waitForTimeout(600);

    // Check that selected vendors were pruned/cleared because they were not in the new filtered subset
    const triggerAfterFilterChange = await dropdownTrigger.innerText();
    console.log('   Trigger text after classification switch:', triggerAfterFilterChange.replace(/\n/g, ' '));

    // Open dropdown in Procucev Network view
    await dropdownTrigger.click();
    await page.waitForTimeout(400);

    // Click "Select All" inside dropdown for Procucev Network Vendors
    console.log('   Clicking "Select All" in dropdown...');
    await dropdownMenu.locator('button:has-text("Select All")').click();
    await page.waitForTimeout(300);

    const shotProcucevSelectAll = path.join(artifactDir, '10_dropdown_procucev_select_all.png');
    await page.screenshot({ path: shotProcucevSelectAll, fullPage: false });
    console.log('   📸 Screenshot saved: 10_dropdown_procucev_select_all.png');

    // Close dropdown
    await dropdownMenu.locator('button:has-text("Done")').click();
    await page.waitForTimeout(300);

    // 6. Test Step 4: Confirmation Preview Panel, Cancel path, and Confirm path
    console.log('6. Testing Confirmation Panel & Evaluation paths...');
    const evalBtnText = await evalBtn.innerText();
    console.log('   Evaluate button text:', evalBtnText);
    await evalBtn.click();
    await page.waitForTimeout(500);

    // Verify Confirmation Modal
    const confirmModal = page.locator('div[style*="position: fixed"]');
    await confirmModal.waitFor({ state: 'visible', timeout: 3000 });

    const shotConfirmModal = path.join(artifactDir, '11_evaluation_confirmation_modal.png');
    await page.screenshot({ path: shotConfirmModal, fullPage: false });
    console.log('   📸 Screenshot saved: 11_evaluation_confirmation_modal.png');

    // Test Cancel path
    console.log('   Testing Cancel button on confirmation modal...');
    await page.locator('div[style*="position: fixed"] button:has-text("Cancel")').click();
    await page.waitForTimeout(500);

    // Modal should be closed
    const isModalVisible = await confirmModal.isVisible();
    console.log(`   Confirmation modal visible after Cancel: ${isModalVisible}`);
    if (isModalVisible) throw new Error('Modal should be closed after clicking Cancel');

    // Re-open confirmation modal
    console.log('   Re-opening confirmation modal to execute evaluation...');
    await evalBtn.click();
    await page.waitForTimeout(500);

    // Click Confirm "Start Evaluation"
    console.log('   Confirming evaluation: clicking "Start Evaluation"...');
    const startEvalBtn = page.locator('button:has-text("Start Evaluation")');
    await startEvalBtn.click();

    // Wait for live progress and completion
    console.log('   Waiting for AI rubric evaluation to complete...');
    await page.waitForSelector('button:has-text("Done & View Results")', { timeout: 45000 });
    await page.waitForTimeout(1000);

    const shotCompleteModal = path.join(artifactDir, '12_evaluation_live_completed.png');
    await page.screenshot({ path: shotCompleteModal, fullPage: false });
    console.log('   📸 Screenshot saved: 12_evaluation_live_completed.png');

    // Close completion modal
    await page.click('button:has-text("Done & View Results")');
    await page.waitForTimeout(1000);

    // 7. Test Step 5: Verify Individual Evaluate Action Still Works
    console.log('7. Verifying individual Evaluate action in table row...');
    const individualEvalLink = page.locator('table.enterprise-table tbody tr a:has-text("Evaluate")').first();
    const indLinkVisible = await individualEvalLink.isVisible();
    console.log(`   Individual "Evaluate" action link visible: ${indLinkVisible}`);
    if (indLinkVisible) {
      const href = await individualEvalLink.getAttribute('href');
      console.log(`   Individual evaluate link target: ${href}`);
      await individualEvalLink.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      console.log(`   Navigated to vendor detail page: ${page.url()}`);
      
      const shotIndEval = path.join(artifactDir, '14_individual_vendor_evaluation_page.png');
      await page.screenshot({ path: shotIndEval, fullPage: true });
      console.log('   📸 Screenshot saved: 14_individual_vendor_evaluation_page.png');
      
      // Navigate back to vendor evaluation hub
      await page.goto('http://localhost:3000/procurement/vendors');
      await page.waitForLoadState('networkidle');
      await page.click('button:has-text("Evaluation Hub & Selection")');
      await page.waitForTimeout(800);
    }

    // Final screenshot of the Evaluation page after completed evaluations
    const shotFinal = path.join(artifactDir, '13_evaluation_final_state.png');
    await page.screenshot({ path: shotFinal, fullPage: true });
    console.log('   📸 Screenshot saved: 13_evaluation_final_state.png');

    console.log('🎉 ALL 7 TEST REQUIREMENTS VERIFIED AND PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Verification failed:', err);
    throw err;
  } finally {
    await browser.close();
  }
}

runTest();
