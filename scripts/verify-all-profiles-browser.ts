import { chromium } from 'playwright-core';
import path from 'path';
import fs from 'fs';

const artifactDir = 'C:\\Users\\Lenovo\\.gemini\\antigravity-ide\\brain\\b2e1af52-4698-491a-88c9-ecebaf229e01';

async function main() {
  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true });
  }

  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  // ─────────────────────────────────────────────────────────────
  // PROFILE 1: CATEGORY MANAGER
  // ─────────────────────────────────────────────────────────────
  console.log('1. Verifying Category Manager on /procurement/rate-cards...');
  const cmContext = await browser.newContext({ viewport: { width: 1700, height: 1100 } });
  const cmPage = await cmContext.newPage();

  await cmPage.goto('http://localhost:3000/login');
  await cmPage.waitForSelector('#work-email');
  await cmPage.fill('#work-email', 'category.manager@procucev-demo.local');
  await cmPage.fill('#password', 'Demo@1234');
  await cmPage.click('button[type="submit"]');
  await cmPage.waitForURL('**/dashboard', { timeout: 15000 });

  await cmPage.goto('http://localhost:3000/procurement/rate-cards');
  await cmPage.waitForLoadState('networkidle');
  await cmPage.waitForTimeout(2000);

  const cmScreenshot = path.join(artifactDir, '01_category_manager_rate_cards_full_view.png');
  await cmPage.screenshot({ path: cmScreenshot, fullPage: true });
  console.log('Saved:', cmScreenshot);

  // ─────────────────────────────────────────────────────────────
  // PROFILE 2: VENDOR
  // ─────────────────────────────────────────────────────────────
  console.log('2. Verifying Vendor on /vendor-portal/rate-cards...');
  const vendorContext = await browser.newContext({ viewport: { width: 1700, height: 1000 } });
  const vendorPage = await vendorContext.newPage();

  await vendorPage.goto('http://localhost:3000/login');
  await vendorPage.waitForSelector('#work-email');
  await vendorPage.fill('#work-email', 'ramakrishna.interiors@vendor.procpx.local');
  await vendorPage.fill('#password', 'welcome');
  await vendorPage.click('button[type="submit"]');
  try {
    await vendorPage.waitForURL('**/vendor-portal/**', { timeout: 8000 });
  } catch {
    await vendorPage.fill('#password', 'Demo@1234');
    await vendorPage.click('button[type="submit"]');
    await vendorPage.waitForURL('**/vendor-portal/**', { timeout: 10000 });
  }

  await vendorPage.goto('http://localhost:3000/vendor-portal/rate-cards');
  await vendorPage.waitForLoadState('networkidle');
  await vendorPage.waitForTimeout(2000);

  const vendorScreenshot = path.join(artifactDir, '02_vendor_rate_cards_view.png');
  await vendorPage.screenshot({ path: vendorScreenshot, fullPage: true });
  console.log('Saved:', vendorScreenshot);

  // ─────────────────────────────────────────────────────────────
  // PROFILE 3: PROJECT APPROVER
  // ─────────────────────────────────────────────────────────────
  console.log('3. Verifying Project Approver on /approvals/rate-cards...');
  const paContext = await browser.newContext({ viewport: { width: 1700, height: 1000 } });
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

  const paScreenshot = path.join(artifactDir, '03_project_approver_rate_cards_view.png');
  await paPage.screenshot({ path: paScreenshot, fullPage: true });
  console.log('Saved:', paScreenshot);

  // ─────────────────────────────────────────────────────────────
  // PROFILE 4: FINANCE APPROVER
  // ─────────────────────────────────────────────────────────────
  console.log('4. Verifying Finance Approver on /approvals/rate-cards...');
  const faContext = await browser.newContext({ viewport: { width: 1700, height: 1000 } });
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

  const faScreenshot = path.join(artifactDir, '04_finance_approver_rate_cards_view.png');
  await faPage.screenshot({ path: faScreenshot, fullPage: true });
  console.log('Saved:', faScreenshot);

  console.log('✅ All 4 profiles verified successfully!');
  await browser.close();
}

main().catch((err) => {
  console.error('Browser verification failed:', err);
  process.exit(1);
});
