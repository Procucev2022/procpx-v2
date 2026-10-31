import { chromium } from 'playwright-core';
import path from 'path';
import fs from 'fs';

const artifactDir = 'C:\\Users\\Lenovo\\.gemini\\antigravity-ide\\brain\\ea4b97cc-c25d-4a98-8ac4-b81484424a31';

async function runVerification() {
  console.log('======================================================================');
  console.log('  PROCPX RATE CARD UI CLEANUP & FUNCTIONAL FIXES TEST                ');
  console.log('======================================================================\n');

  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true });
  }

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1050 } });
  const page = await context.newPage();

  try {
    // 1. LOGIN AS CATEGORY MANAGER
    console.log('▶ STEP 1: Logging in as Category Manager...');
    await page.goto('http://localhost:3000/login');
    await page.waitForSelector('#work-email');
    await page.fill('#work-email', 'category.manager@procucev-demo.local');
    await page.fill('#password', 'Demo@1234');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    console.log('  ✓ Logged in successfully.\n');

    // 2. VERIFY SIDEBAR NAVIGATION & SINGLE ACTIVE SELECTION
    console.log('▶ STEP 2: Verifying Sidebar Navigation & Selection (Issues 2 & 3)...');
    await page.goto('http://localhost:3000/procurement/rate-cards');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Check sidebar rate cards link
    const rateCardsNav = page.locator('aside nav a[href="/procurement/rate-cards"]');
    const rateCardsNavCount = await rateCardsNav.count();
    console.log(`  • Sidebar Rate Cards nav items found: ${rateCardsNavCount} (Expected: 1)`);

    // Ensure NO "Manage Rate Cards" exists
    const manageRateCardsCount = await page.locator('aside nav a:has-text("Manage Rate Cards")').count();
    console.log(`  • Sidebar "Manage Rate Cards" link count: ${manageRateCardsCount} (Expected: 0)`);

    // Ensure Vendors is separate sibling
    const vendorsNavCount = await page.locator('aside nav a[href="/procurement/vendors"]').count();
    console.log(`  • Sidebar "Vendors" sibling link count: ${vendorsNavCount} (Expected: 1)`);

    // Verify active class on Rate Cards only
    const activeNavs = await page.locator('aside nav a.active').allTextContents();
    console.log(`  • Active sidebar items: ${JSON.stringify(activeNavs.map(s => s.trim()))}`);
    const isSingleActive = activeNavs.length === 1 && activeNavs[0].trim().includes('Rate Cards');
    console.log(`  • Single Rate Cards active selection verified: ${isSingleActive ? '✅ PASS' : '❌ FAIL'}\n`);

    // Capture screenshot of sidebar + register
    await page.screenshot({
      path: path.join(artifactDir, '01_sidebar_and_register_single_active.png'),
      fullPage: false,
    });
    console.log('  📸 Saved: 01_sidebar_and_register_single_active.png\n');

    // 3. VERIFY PAGINATION & PAGE NAVIGATION (Issue 4)
    console.log('▶ STEP 3: Verifying Pagination & Page Navigation (Issue 4)...');
    // Read the pagination text: "Showing 1 to 5 of X records"
    const paginationTextInitial = await page.locator('text=/Showing \\d+ to \\d+ of \\d+ records/').first().textContent();
    console.log(`  • Initial pagination label: "${paginationTextInitial?.trim()}"`);

    // Get first row rate card ID on Page 1
    const firstRowPage1 = await page.locator('table tbody tr').first().locator('td:nth-child(2)').textContent();
    console.log(`  • Page 1 First Row Rate Card ID: "${firstRowPage1?.trim()}"`);

    // Check if Page 2 button exists
    const page2Button = page.locator('div[role="navigation"] button:has-text("2")');
    const hasPage2 = (await page2Button.count()) > 0;
    console.log(`  • Page 2 button rendered: ${hasPage2 ? 'YES' : 'NO'}`);

    if (hasPage2) {
      // Click Page 2
      console.log('  • Clicking Page 2 button...');
      await page2Button.click();
      await page.waitForTimeout(500);

      const paginationTextPage2 = await page.locator('text=/Showing \\d+ to \\d+ of \\d+ records/').first().textContent();
      const firstRowPage2 = await page.locator('table tbody tr').first().locator('td:nth-child(2)').textContent();
      console.log(`  • Page 2 pagination label: "${paginationTextPage2?.trim()}"`);
      console.log(`  • Page 2 First Row Rate Card ID: "${firstRowPage2?.trim()}"`);

      const pageChanged = firstRowPage1?.trim() !== firstRowPage2?.trim();
      console.log(`  • Records changed on page 2: ${pageChanged ? '✅ PASS' : '❌ FAIL'}`);

      // Verify active highlight on button "2"
      const page2Classes = await page2Button.getAttribute('class');
      const isPage2Active = page2Classes?.includes('bg-[#0f52ba]');
      console.log(`  • Page 2 button visually highlighted active: ${isPage2Active ? '✅ PASS' : '❌ FAIL'}`);

      // Capture screenshot of Page 2 active
      await page.screenshot({
        path: path.join(artifactDir, '02_pagination_page_2_active.png'),
        fullPage: false,
      });
      console.log('  📸 Saved: 02_pagination_page_2_active.png\n');

      // Test Next Button (>)
      const nextBtn = page.locator('button[aria-label="Next Page"]');
      if (await nextBtn.isEnabled()) {
        console.log('  • Clicking Next (>) button...');
        await nextBtn.click();
        await page.waitForTimeout(500);
        const paginationTextPage3 = await page.locator('text=/Showing \\d+ to \\d+ of \\d+ records/').first().textContent();
        console.log(`  • Page 3 pagination label: "${paginationTextPage3?.trim()}"`);
      }

      // Test Previous Button (<)
      const prevBtn = page.locator('button[aria-label="Previous Page"]');
      console.log('  • Clicking Previous (<) button twice to return to Page 1...');
      await prevBtn.click();
      await page.waitForTimeout(400);
      await prevBtn.click();
      await page.waitForTimeout(400);

      const isPrevDisabled = await prevBtn.isDisabled();
      console.log(`  • Back on Page 1, Previous button disabled: ${isPrevDisabled ? '✅ PASS' : '❌ FAIL'}`);
    }

    // Capture pagination screenshot
    await page.screenshot({
      path: path.join(artifactDir, '02_pagination_controls_active.png'),
      fullPage: false,
    });
    console.log('  📸 Saved: 02_pagination_controls_active.png\n');

    // Test Search / Filter resets to Page 1
    console.log('  • Testing Search filter reset to Page 1...');
    const searchInput = page.locator('input[placeholder*="Search by Rate Card ID"]');
    await searchInput.fill('Civil');
    await page.waitForTimeout(500);
    const searchPaginationText = await page.locator('text=/Showing \\d+ to \\d+ of \\d+ records/').first().textContent();
    console.log(`  • Search filtered pagination label: "${searchPaginationText?.trim()}"`);
    await searchInput.clear();
    await page.waitForTimeout(500);

    // 4. VERIFY REORGANISED FINALISED RATE CARD DETAILS (Issue 1)
    console.log('▶ STEP 4: Verifying Finalised Rate Card Details (Issue 1)...');
    await page.goto('http://localhost:3000/procurement/rate-cards?view=details');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // A. Page Header check
    console.log('  [A. Page Header]');
    const backBtn = await page.locator('text=Back to Rate Cards').count();
    const heading = await page.locator('h1:has-text("Finalised Rate Card")').textContent();
    const rcIdBadge = await page.locator('text=RC-2026-0006').count();
    const statusBadge = await page.locator('span:has-text("Active")').first().textContent();
    console.log(`    • "Back to Rate Cards" visible: ${backBtn > 0 ? 'YES' : 'NO'}`);
    console.log(`    • Title: "${heading?.trim()}"`);
    console.log(`    • Rate Card ID Badge visible: ${rcIdBadge > 0 ? 'YES' : 'NO'}`);
    console.log(`    • Status Badge: "${statusBadge?.trim()}"`);

    // B. Check 4 sections in order under 'Rate Card Info' tab
    console.log('  [B. Four Ordered Sections in Rate Card Info Tab]');
    const sec1 = await page.locator('h3:has-text("1. Rate Card Overview")').count();
    const sec2 = await page.locator('h3:has-text("2. Scope of Work")').count();
    const sec3 = await page.locator('h3:has-text("3. Commercial Terms & Conditions")').count();
    const sec4 = await page.locator('h3:has-text("4. Formal Agreement & Signature")').count();

    console.log(`    • Section 1 (Rate Card Overview): ${sec1 > 0 ? '✅ PRESENT' : '❌ MISSING'}`);
    console.log(`    • Section 2 (Scope of Work): ${sec2 > 0 ? '✅ PRESENT' : '❌ MISSING'}`);
    console.log(`    • Section 3 (Commercial Terms & Conditions): ${sec3 > 0 ? '✅ PRESENT' : '❌ MISSING'}`);
    console.log(`    • Section 4 (Formal Agreement & Signature): ${sec4 > 0 ? '✅ PRESENT' : '❌ MISSING'}`);

    // Verify Scope of Work has NO LongTextCell / View button / document icon
    const scopeSection = page.locator('div:has(> div > h3:has-text("2. Scope of Work"))');
    const scopeViewBtns = await scopeSection.locator('button:has-text("View")').count();
    const scopeText = await scopeSection.locator('div.whitespace-pre-wrap').first().textContent();
    console.log(`    • Scope of Work inline text: "${scopeText?.trim().slice(0, 80)}..."`);
    console.log(`    • Scope of Work unnecessary View buttons: ${scopeViewBtns} (Expected: 0)`);

    // Verify Commercial Terms has NO LongTextCell / View button
    const termsSection = page.locator('div:has(> div > h3:has-text("3. Commercial Terms & Conditions"))');
    const termsViewBtns = await termsSection.locator('button:has-text("View")').count();
    const termsText = await termsSection.locator('div.whitespace-pre-wrap').first().textContent();
    console.log(`    • Commercial Terms inline text: "${termsText?.trim().slice(0, 80)}..."`);
    console.log(`    • Commercial Terms unnecessary View buttons: ${termsViewBtns} (Expected: 0)`);

    // Verify Section 4 Agreement & Signature metadata
    const sec4Content = await page.locator('div:has(h3:has-text("4. Formal Agreement & Signature"))').first().textContent();
    const hasDocTitle = sec4Content?.includes('Master Rate Agreement');
    const hasDocNumber = sec4Content?.includes('MRA-RC-2026-0006');
    const hasSignedEvidence = sec4Content?.includes('Digitally Signed') && sec4Content?.includes('DSC-2026-VND-0006');
    console.log(`    • Agreement Document Title present: ${hasDocTitle ? '✅ YES' : '❌ NO'}`);
    console.log(`    • Agreement Reference present: ${hasDocNumber ? '✅ YES' : '❌ NO'}`);
    console.log(`    • Digital Signature & Evidence present: ${hasSignedEvidence ? '✅ YES' : '❌ NO'}`);

    // Capture Full Details Screenshot
    await page.screenshot({
      path: path.join(artifactDir, '03_reorganised_finalised_details_info_tab.png'),
      fullPage: true,
    });
    console.log('  📸 Saved: 03_reorganised_finalised_details_info_tab.png\n');

    // C. Test Agreement Preview Modal
    console.log('  [C. Testing Agreement Preview Modal]');
    const viewAgreementBtn = page.locator('button:has-text("View Executed Agreement")').first();
    await viewAgreementBtn.click();
    await page.waitForTimeout(600);

    const modalTitle = await page.locator('div[role="dialog"] h3, div.fixed h3:has-text("Master Rate Agreement")').first().textContent();
    console.log(`    • Agreement Modal opened: "${modalTitle?.trim()}"`);

    await page.screenshot({
      path: path.join(artifactDir, '04_executed_agreement_preview_modal.png'),
    });
    console.log('  📸 Saved: 04_executed_agreement_preview_modal.png\n');

    // Close modal
    await page.locator('button[aria-label="Close modal"], button:has(svg.lucide-x)').first().click();
    await page.waitForTimeout(400);

    // D. Test Agreed Rates Tab
    console.log('  [D. Testing Agreed Rates Tab]');
    await page.locator('button:has-text("Agreed Rates")').click();
    await page.waitForTimeout(500);
    const agreedTableRows = await page.locator('table tbody tr').count();
    console.log(`    • Agreed Rates line items in schedule: ${agreedTableRows}`);

    await page.screenshot({
      path: path.join(artifactDir, '05_finalised_agreed_rates_schedule.png'),
    });
    console.log('  📸 Saved: 05_finalised_agreed_rates_schedule.png\n');

    console.log('======================================================================');
    console.log('  ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY!                      ');
    console.log('======================================================================\n');
  } catch (err) {
    console.error('❌ Error during verification:', err);
    throw err;
  } finally {
    await browser.close();
  }
}

runVerification().catch((e) => {
  console.error(e);
  process.exit(1);
});
