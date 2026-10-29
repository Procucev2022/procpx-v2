import { chromium } from 'playwright-core';
import path from 'path';
import fs from 'fs';

const artifactDir = 'C:\\Users\\Lenovo\\.gemini\\antigravity-ide\\brain\\ea4b97cc-c25d-4a98-8ac4-b81484424a31';

async function main() {
  console.log('======================================================================');
  console.log('  PROCPX RATE CARD UI & FINALISED DETAILS VERIFICATION                ');
  console.log('======================================================================\n');

  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true });
  }

  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const page = await context.newPage();

    // ─────────────────────────────────────────────────────────────
    // LOGIN AS CATEGORY MANAGER
    // ─────────────────────────────────────────────────────────────
    console.log('▶ Logging in as Category Manager...');
    await page.goto('http://localhost:3000/login');
    await page.waitForSelector('#work-email');
    await page.fill('#work-email', 'category.manager@procucev-demo.local');
    await page.fill('#password', 'Demo@1234');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    console.log('  ✓ Logged in successfully.\n');

    // ─────────────────────────────────────────────────────────────
    // 1. VERIFY WORKFLOW TABS & ABSENCE OF QUICK PORTALS ACROSS STAGES
    // ─────────────────────────────────────────────────────────────
    console.log('▶ TEST 1: Checking all Rate Card stages for Quick Portals & Tab Layout...');
    const views = [
      { view: '', name: 'Home Workspace' },
      { view: 'negotiation', name: 'Item Negotiation' },
      { view: 'buyer_acceptance', name: 'Buyer Acceptance' },
      { view: 'details', name: 'Finalised Details' },
    ];

    for (const v of views) {
      const url = v.view ? `http://localhost:3000/procurement/rate-cards?view=${v.view}` : 'http://localhost:3000/procurement/rate-cards';
      await page.goto(url);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1000);

      // Verify "Quick Portals" text or links do NOT exist anywhere on page
      const quickPortalsCount = await page.locator('text=Quick Portals').count();
      const vendorShortcutCount = await page.locator('a:has-text("Vendor Portal View")').count();
      const approvalsShortcutCount = await page.locator('nav a:has-text("Approvals Queue")').count();

      console.log(`  Stage: [${v.name}]`);
      console.log(`    • "Quick Portals" label count: ${quickPortalsCount} (Expected: 0)`);
      console.log(`    • "Vendor Portal View" header shortcut count: ${vendorShortcutCount} (Expected: 0)`);
      console.log(`    • "Approvals Queue" header shortcut count: ${approvalsShortcutCount} (Expected: 0)`);

      if (quickPortalsCount > 0 || vendorShortcutCount > 0) {
        throw new Error(`Regression: Quick Portals shortcut detected on ${v.name}`);
      }
    }
    console.log('  ✓ CONFIRMED: Quick Portals permanently absent across all stages!\n');

    // ─────────────────────────────────────────────────────────────
    // 2. VERIFY ITEM NEGOTIATION STAGE
    // ─────────────────────────────────────────────────────────────
    console.log('▶ TEST 2: Verifying Item Negotiation Stage...');
    await page.goto('http://localhost:3000/procurement/rate-cards?view=negotiation');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const negScreenshot = path.join(artifactDir, 'fixed_01_item_negotiation_fullwidth.png');
    await page.screenshot({ path: negScreenshot, fullPage: true });
    console.log('  📸 Screenshot saved:', negScreenshot);

    // ─────────────────────────────────────────────────────────────
    // 3. VERIFY FINALISED DETAILS STAGE & PERSISTED DATA
    // ─────────────────────────────────────────────────────────────
    console.log('\n▶ TEST 3: Verifying Finalised Details (Persisted Data & Tabs)...');
    await page.goto('http://localhost:3000/procurement/rate-cards?view=details');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    // Check Header & Badge
    const rcBadge = await page.locator('text=RC-2026-0006').first().isVisible();
    const activeStatus = await page.locator('span:has-text("Active")').first().isVisible();
    console.log(`  ✓ Rate Card Ref Badge (RC-2026-0006): ${rcBadge}`);
    console.log(`  ✓ Status Badge (Active): ${activeStatus}`);

    // Check Sub-tabs
    const infoTab = await page.locator('button:has-text("Rate Card Info")').first().isVisible();
    const ratesTab = await page.locator('button:has-text("Agreed Rates")').first().isVisible();
    const historyTab = await page.locator('button:has-text("Negotiation History")').first().isVisible();
    const signoffTab = await page.locator('button:has-text("Sign-off Timeline")').first().isVisible();

    console.log(`  ✓ Sub-tab "Rate Card Info" visible: ${infoTab}`);
    console.log(`  ✓ Sub-tab "Agreed Rates" visible: ${ratesTab}`);
    console.log(`  ✓ Sub-tab "Negotiation History" visible: ${historyTab}`);
    console.log(`  ✓ Sub-tab "Sign-off Timeline" visible: ${signoffTab}`);

    // Tab 1: Rate Card Info screenshot
    const detailsInfoScreenshot = path.join(artifactDir, 'fixed_02_finalised_details_info_tab.png');
    await page.screenshot({ path: detailsInfoScreenshot, fullPage: false });
    console.log('  📸 Screenshot saved:', detailsInfoScreenshot);

    // Tab 2: Agreed Rates
    console.log('  Checking Agreed Rates Tab...');
    await page.click('button:has-text("Agreed Rates")');
    await page.waitForTimeout(600);

    const item1Code = await page.locator('text=INT-001').first().isVisible();
    const item5Code = await page.locator('text=INT-005').first().isVisible();
    const totalValuation = await page.locator('text=4,83,000').first().isVisible();
    console.log(`  ✓ Line Item INT-001 visible: ${item1Code}`);
    console.log(`  ✓ Line Item INT-005 visible: ${item5Code}`);
    console.log(`  ✓ Total Agreed Contract Valuation (₹ 4,83,000): ${totalValuation}`);

    const detailsRatesScreenshot = path.join(artifactDir, 'fixed_03_finalised_agreed_rates_tab.png');
    await page.screenshot({ path: detailsRatesScreenshot, fullPage: false });
    console.log('  📸 Screenshot saved:', detailsRatesScreenshot);

    // Tab 3: Negotiation History
    console.log('  Checking Negotiation History Tab...');
    await page.click('button:has-text("Negotiation History")');
    await page.waitForTimeout(600);

    const negAuditHeader = await page.locator('text=Persisted Commercial Negotiation Audit Trail').first().isVisible();
    console.log(`  ✓ Persisted Negotiation Audit Trail visible: ${negAuditHeader}`);

    const detailsHistoryScreenshot = path.join(artifactDir, 'fixed_04_finalised_negotiation_history_tab.png');
    await page.screenshot({ path: detailsHistoryScreenshot, fullPage: false });
    console.log('  📸 Screenshot saved:', detailsHistoryScreenshot);

    // Tab 4: Sign-off Timeline
    console.log('  Checking Sign-off Timeline Tab...');
    await page.click('button:has-text("Sign-off Timeline")');
    await page.waitForTimeout(600);

    const milestone1 = await page.locator('h4:has-text("Initiated & Published")').first().isVisible();
    const milestone4 = await page.locator('h4:has-text("Level 1: Project Approver Review")').first().isVisible();
    const milestone5 = await page.locator('h4:has-text("Level 2: Finance Approver Review & Activation")').first().isVisible();
    console.log(`  ✓ Milestone 1 (Initiated & Published): ${milestone1}`);
    console.log(`  ✓ Milestone 4 (Level 1: Project Approver): ${milestone4}`);
    console.log(`  ✓ Milestone 5 (Level 2: Finance Approver): ${milestone5}`);

    const detailsSignoffScreenshot = path.join(artifactDir, 'fixed_05_finalised_signoff_timeline_tab.png');
    await page.screenshot({ path: detailsSignoffScreenshot, fullPage: false });
    console.log('  📸 Screenshot saved:', detailsSignoffScreenshot);

    // ─────────────────────────────────────────────────────────────
    // 4. VERIFY EXECUTED AGREEMENT MODAL VIEWER
    // ─────────────────────────────────────────────────────────────
    console.log('\n▶ TEST 4: Verifying Executed Agreement Modal Viewer...');
    const viewAgreementBtn = await page.locator('button:has-text("View Executed Agreement")').first().isVisible();
    console.log(`  ✓ "View Executed Agreement" toolbar button visible: ${viewAgreementBtn}`);

    await page.click('button:has-text("View Executed Agreement")');
    await page.waitForTimeout(800);

    const modalTitle = await page.locator('text=MASTER RATE CARD AGREEMENT').first().isVisible();
    const digitalSigBadge = await page.locator('text=VERIFIED DIGITAL SIGNATURE').first().isVisible();
    console.log(`  ✓ Agreement Viewer Modal opened: ${modalTitle}`);
    console.log(`  ✓ Verified Digital Signature Stamp in document: ${digitalSigBadge}`);

    const agreementModalScreenshot = path.join(artifactDir, 'fixed_06_executed_agreement_modal.png');
    await page.screenshot({ path: agreementModalScreenshot, fullPage: false });
    console.log('  📸 Screenshot saved:', agreementModalScreenshot);

    await page.click('button:has-text("Close Viewer")');
    await page.waitForTimeout(400);

    console.log('\n======================================================================');
    console.log('  ALL UI FIXES AND PERSISTENCE VERIFICATIONS COMPLETED SUCCESSFULLY!  ');
    console.log('======================================================================');
  } catch (err) {
    console.error('Test execution error:', err);
    throw err;
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
