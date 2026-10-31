import { chromium } from 'playwright-core';
import * as path from 'path';

const ARTIFACTS_DIR = 'C:/Users/Lenovo/.gemini/antigravity-ide/brain/b2e1af52-4698-491a-88c9-ecebaf229e01';
const BROWSER_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function main() {
  console.log('Starting Playwright Verification for Finalised Rate Card Details UI...');
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
  await page.click('button:has-text("Category Manager")');
  await page.waitForTimeout(500);
  await page.click('button:has-text("Sign In")');
  await page.waitForTimeout(2000);

  // 2. Navigate to Finalised Rate Card Details view
  console.log('Navigating to Finalised Rate Card Details...');
  await page.goto('http://localhost:3000/procurement/rate-cards?view=details', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Check 1: Verify single page heading
  const h1Text = await page.locator('h1').textContent();
  console.log('Page H1 Title:', h1Text?.trim());
  const duplicateHeadings = await page.locator('h2:has-text("Finalised Rate Card Details (Read Only)")').count();
  console.log('Duplicate H2 Count:', duplicateHeadings);

  // View Tab 1: Rate Card Info
  console.log('Capturing Tab 1: Rate Card Info...');
  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, '08a_finalised_tab_info.png'),
    fullPage: false,
  });

  // View Tab 2: Agreed Rates
  console.log('Capturing Tab 2: Agreed Rates...');
  await page.click('button:has-text("Agreed Rates")');
  await page.waitForTimeout(800);
  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, '08b_finalised_tab_rates.png'),
    fullPage: false,
  });

  // View Tab 3: Negotiation History
  console.log('Capturing Tab 3: Negotiation History...');
  await page.click('button:has-text("Negotiation History")');
  await page.waitForTimeout(800);
  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, '08c_finalised_tab_history.png'),
    fullPage: false,
  });

  // View Tab 4: Sign-off Timeline
  console.log('Capturing Tab 4: Sign-off Timeline...');
  await page.click('button:has-text("Sign-off Timeline")');
  await page.waitForTimeout(800);
  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, '08d_finalised_tab_signoff.png'),
    fullPage: false,
  });

  // Test LongTextCell modal on Info tab
  console.log('Testing LongTextCell modal...');
  await page.click('button:has-text("Rate Card Info")');
  await page.waitForTimeout(500);
  const inspectTrigger = page.locator('button[title="Inspect full text"]').first();
  if (await inspectTrigger.isVisible()) {
    await inspectTrigger.click();
    await page.waitForTimeout(600);
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, '08e_finalised_long_text_modal.png'),
      fullPage: false,
    });
    const closeBtn = page.locator('button:has-text("Close"), button[aria-label="Close"]').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await page.waitForTimeout(400);
    }
  }

  // Test Download Rate Card button
  console.log('Testing Download Rate Card button...');
  const downloadBtn = page.locator('button:has-text("Download Rate Card")');
  if (await downloadBtn.isVisible()) {
    await downloadBtn.click();
    await page.waitForTimeout(600);
  }

  // Test Back to Rate Cards navigation
  console.log('Testing Back navigation...');
  const backBtn = page.locator('button:has-text("Back to Rate Cards"), a:has-text("Back to Rate Cards")').first();
  if (await backBtn.isVisible()) {
    await backBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, '08f_back_to_rate_cards_home.png'),
      fullPage: false,
    });
  }

  await browser.close();
  console.log('Verification completed successfully!');
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
