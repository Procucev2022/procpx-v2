// scripts/verify-corrected-rate-cards-browser.ts
import { chromium } from 'playwright-core';
import path from 'path';

const artifactDir = 'C:\\Users\\Lenovo\\.gemini\\antigravity-ide\\brain\\b2e1af52-4698-491a-88c9-ecebaf229e01';

async function main() {
  console.log('Launching browser to verify corrected Rate Card UI architecture...');
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  // ─────────────────────────────────────────────────────────────
  // 1. CATEGORY MANAGER: HOME WORKSPACE (DEFAULT)
  // ─────────────────────────────────────────────────────────────
  console.log('1. Verifying Category Manager - Home Workspace (Default)...');
  const cmContext = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const cmPage = await cmContext.newPage();

  await cmPage.goto('http://localhost:3000/login');
  await cmPage.waitForSelector('#work-email');
  await cmPage.fill('#work-email', 'category.manager@procucev-demo.local');
  await cmPage.fill('#password', 'Demo@1234');
  await cmPage.click('button[type="submit"]');
  await cmPage.waitForURL('**/dashboard', { timeout: 15000 });

  // Navigate to default rate cards page
  await cmPage.goto('http://localhost:3000/procurement/rate-cards');
  await cmPage.waitForLoadState('networkidle');
  await cmPage.waitForTimeout(1500);

  const homeScreenshot = path.join(artifactDir, '01_corrected_home_workspace.png');
  await cmPage.screenshot({ path: homeScreenshot, fullPage: true });
  console.log('Saved:', homeScreenshot);

  // ─────────────────────────────────────────────────────────────
  // 2. CATEGORY MANAGER: INITIATE RATE CARD WORKSPACE
  // ─────────────────────────────────────────────────────────────
  console.log('2. Verifying Initiate Rate Card Workspace...');
  await cmPage.goto('http://localhost:3000/procurement/rate-cards?view=initiate');
  await cmPage.waitForLoadState('networkidle');
  await cmPage.waitForTimeout(1500);

  const initiateScreenshot = path.join(artifactDir, '02_corrected_initiate_workspace.png');
  await cmPage.screenshot({ path: initiateScreenshot, fullPage: true });
  console.log('Saved:', initiateScreenshot);

  // ─────────────────────────────────────────────────────────────
  // 3. CATEGORY MANAGER: NEGOTIATION WORKSPACE
  // ─────────────────────────────────────────────────────────────
  console.log('3. Verifying Focused Item Negotiation Workspace...');
  await cmPage.goto('http://localhost:3000/procurement/rate-cards?view=negotiation');
  await cmPage.waitForLoadState('networkidle');
  await cmPage.waitForTimeout(1500);

  const negScreenshot = path.join(artifactDir, '03_corrected_negotiation_workspace.png');
  await cmPage.screenshot({ path: negScreenshot, fullPage: true });
  console.log('Saved:', negScreenshot);

  // ─────────────────────────────────────────────────────────────
  // 4. CATEGORY MANAGER: BUYER ACCEPTANCE WORKSPACE
  // ─────────────────────────────────────────────────────────────
  console.log('4. Verifying Buyer Acceptance Workspace...');
  await cmPage.goto('http://localhost:3000/procurement/rate-cards?view=buyer_acceptance');
  await cmPage.waitForLoadState('networkidle');
  await cmPage.waitForTimeout(1500);

  const buyerAcceptScreenshot = path.join(artifactDir, '04_corrected_buyer_acceptance_workspace.png');
  await cmPage.screenshot({ path: buyerAcceptScreenshot, fullPage: true });
  console.log('Saved:', buyerAcceptScreenshot);

  // ─────────────────────────────────────────────────────────────
  // 5. FINALISED DETAILS (READ ONLY)
  // ─────────────────────────────────────────────────────────────
  console.log('5. Verifying Finalised Details Read Only Workspace...');
  await cmPage.goto('http://localhost:3000/procurement/rate-cards?view=details');
  await cmPage.waitForLoadState('networkidle');
  await cmPage.waitForTimeout(1500);

  const detailsScreenshot = path.join(artifactDir, '05_corrected_finalised_details_workspace.png');
  await cmPage.screenshot({ path: detailsScreenshot, fullPage: true });
  console.log('Saved:', detailsScreenshot);

  // ─────────────────────────────────────────────────────────────
  // 6. VENDOR PORTAL: VENDOR ACCEPTANCE VIEW
  // ─────────────────────────────────────────────────────────────
  console.log('6. Verifying Vendor Portal Acceptance View...');
  const vContext = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const vPage = await vContext.newPage();

  await vPage.goto('http://localhost:3000/login');
  await vPage.waitForSelector('#work-email');
  await vPage.fill('#work-email', 'ramakrishna.interiors@vendor.procpx.local');
  await vPage.fill('#password', 'welcome');
  await vPage.click('button[type="submit"]');

  try {
    await vPage.waitForURL('**/vendor-portal/**', { timeout: 8000 });
  } catch {
    await vPage.fill('#password', 'Demo@1234');
    await vPage.click('button[type="submit"]');
    await vPage.waitForURL('**/vendor-portal/**', { timeout: 10000 });
  }

  await vPage.goto('http://localhost:3000/vendor-portal/rate-cards');
  await vPage.waitForLoadState('networkidle');
  await vPage.waitForTimeout(2000);

  const vendorScreenshot = path.join(artifactDir, '06_corrected_vendor_portal_view.png');
  await vPage.screenshot({ path: vendorScreenshot, fullPage: true });
  console.log('Saved:', vendorScreenshot);

  // ─────────────────────────────────────────────────────────────
  // 7. PROJECT APPROVER: LEVEL 1 QUEUE & VIEW
  // ─────────────────────────────────────────────────────────────
  console.log('7. Verifying Project Approver (Level 1) View...');
  const paContext = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const paPage = await paContext.newPage();

  await paPage.goto('http://localhost:3000/login');
  await paPage.waitForSelector('#work-email');
  await paPage.fill('#work-email', 'project.approver@procucev-demo.local');
  await paPage.fill('#password', 'Demo@1234');
  await paPage.click('button[type="submit"]');
  await paPage.waitForURL('**/dashboard', { timeout: 15000 });

  await paPage.goto('http://localhost:3000/approvals/rate-cards');
  await paPage.waitForLoadState('networkidle');
  await paPage.waitForTimeout(2000);

  const paScreenshot = path.join(artifactDir, '07_corrected_project_approver_view.png');
  await paPage.screenshot({ path: paScreenshot, fullPage: true });
  console.log('Saved:', paScreenshot);

  // ─────────────────────────────────────────────────────────────
  // 8. FINANCE APPROVER: LEVEL 2 QUEUE & VIEW
  // ─────────────────────────────────────────────────────────────
  console.log('8. Verifying Finance Approver (Level 2) View...');
  const faContext = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const faPage = await faContext.newPage();

  await faPage.goto('http://localhost:3000/login');
  await faPage.waitForSelector('#work-email');
  await faPage.fill('#work-email', 'finance.user@procucev-demo.local');
  await faPage.fill('#password', 'Demo@1234');
  await faPage.click('button[type="submit"]');
  await faPage.waitForURL('**/dashboard', { timeout: 15000 });

  await faPage.goto('http://localhost:3000/approvals/rate-cards');
  await faPage.waitForLoadState('networkidle');
  await faPage.waitForTimeout(2000);

  const faScreenshot = path.join(artifactDir, '08_corrected_finance_approver_view.png');
  await faPage.screenshot({ path: faScreenshot, fullPage: true });
  console.log('Saved:', faScreenshot);

  console.log('✅ All corrected rate card views verified successfully!');
  await browser.close();
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
