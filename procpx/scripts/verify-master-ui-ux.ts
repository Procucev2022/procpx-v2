import { chromium } from 'playwright-core';
import * as path from 'path';
import * as fs from 'fs';

const ARTIFACTS_DIR = 'C:/Users/Lenovo/.gemini/antigravity-ide/brain/b2e1af52-4698-491a-88c9-ecebaf229e01';
const BROWSER_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function main() {
  console.log('Starting Playwright Verification for Rate Card Management Master UI/UX Standardisation...');
  const browser = await chromium.launch({
    executablePath: BROWSER_PATH,
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 950 },
  });

  const page = await context.newPage();

  // 1. Log in as Category Manager
  console.log('Logging in as Category Manager...');
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await page.fill('#work-email', 'category.manager@procucev-demo.local');
  await page.fill('input[type="password"]', 'Demo@1234');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1500);

  // 2. View 1: Rate Card Home
  console.log('Capturing View 1: Rate Card Home...');
  await page.goto('http://localhost:3000/procurement/rate-cards', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, '01_pilot_rate_card_home.png'),
    fullPage: false,
  });

  // Test LongTextCell modal on Home
  console.log('Testing LongTextCell inspection modal...');
  const viewDetailsTrigger = page.locator('button[title="Inspect full text"], button:has-text("Inspect"), span:has-text("View")').first();
  if (await viewDetailsTrigger.isVisible()) {
    await viewDetailsTrigger.click();
    await page.waitForTimeout(600);
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, '02_pilot_long_text_modal.png'),
      fullPage: false,
    });
    // Close modal
    const closeBtn = page.locator('button:has-text("Close"), button[aria-label="Close"]').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await page.waitForTimeout(500);
    }
  }

  // 3. View 2: Initiate Rate Card - Step 1: Basic Details
  console.log('Capturing View 2: Initiate Rate Card - Step 1: Basic Details...');
  await page.goto('http://localhost:3000/procurement/rate-cards?view=initiate', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, '03_pilot_step1_basic_details.png'),
    fullPage: false,
  });

  // Step 2: Rate Lines
  console.log('Capturing View 3: Initiate Rate Card - Step 2: Rate Lines...');
  const nextToStep2Btn = page.locator('button:has-text("Continue to Rate Lines")').first();
  await nextToStep2Btn.click();
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, '04_pilot_step2_rate_lines.png'),
    fullPage: false,
  });

  // Open LongTextCell modal on Rate Lines
  const rateLineModalTrigger = page.locator('button[title="Inspect full text"]').first();
  if (await rateLineModalTrigger.isVisible()) {
    await rateLineModalTrigger.click();
    await page.waitForTimeout(600);
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, '04b_pilot_rate_line_long_text_modal.png'),
      fullPage: false,
    });
    const closeBtn = page.locator('button:has-text("Close"), button[aria-label="Close"]').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await page.waitForTimeout(400);
    }
  }

  // Step 3: Review & Initiate
  console.log('Capturing View 4: Initiate Rate Card - Step 3: Review & Initiate...');
  const nextToStep3Btn = page.locator('button:has-text("Continue to Review & Initiate")').first();
  await nextToStep3Btn.click();
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, '05_pilot_step3_review_and_initiate.png'),
    fullPage: false,
  });

  // 4. View 5: Negotiation Workspace
  console.log('Capturing View 5: Negotiation Workspace...');
  await page.goto('http://localhost:3000/procurement/rate-cards?view=negotiation', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, '06_pilot_negotiation_workspace.png'),
    fullPage: false,
  });

  // 5. View 6: Buyer Acceptance Workspace
  console.log('Capturing View 6: Buyer Acceptance Workspace...');
  await page.goto('http://localhost:3000/procurement/rate-cards?view=buyer_acceptance', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, '07_pilot_buyer_acceptance_workspace.png'),
    fullPage: false,
  });

  // 6. View 7: Finalised Rate Card Details
  console.log('Capturing View 7: Finalised Rate Card Details...');
  await page.goto('http://localhost:3000/procurement/rate-cards?view=details', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, '08_pilot_finalised_rate_card_details.png'),
    fullPage: false,
  });

  // 7. View 8: Approvals Queue
  console.log('Capturing View 8: Approvals Rate Cards Queue...');
  await page.goto('http://localhost:3000/approvals/rate-cards', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, '09_pilot_approvals_rate_cards.png'),
    fullPage: false,
  });

  await browser.close();
  console.log('Verification completed successfully! All screenshots saved to artifacts directory.');
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
