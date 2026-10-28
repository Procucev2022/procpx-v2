import { chromium } from 'playwright-core';
import * as path from 'path';

const ARTIFACTS_DIR = 'C:/Users/Lenovo/.gemini/antigravity-ide/brain/b2e1af52-4698-491a-88c9-ecebaf229e01';
const BROWSER_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function main() {
  console.log('Starting Playwright Verification for Workflow Nav & Negotiation Summary Cards...');
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
  await page.waitForTimeout(400);
  await page.click('button:has-text("Sign In")');
  await page.waitForTimeout(2000);

  // 2. Navigate to negotiation view
  console.log('Navigating to Negotiation View (Stage 3)...');
  await page.goto('http://localhost:3000/procurement/rate-cards?view=negotiation', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  // Inspect Workflow Navigation elements
  const activeTabBox = await page.locator('button:has-text("Item Negotiation")').boundingBox();
  console.log('Item Negotiation (Active) Tab Dimensions:', activeTabBox);

  const completedTabBox = await page.locator('button:has-text("Home Workspace")').boundingBox();
  console.log('Home Workspace (Completed) Tab Dimensions:', completedTabBox);

  const pendingTabBox = await page.locator('button:has-text("Buyer Acceptance")').boundingBox();
  console.log('Buyer Acceptance (Pending) Tab Dimensions:', pendingTabBox);

  // Inspect 4 Summary Cards
  const targetCard = await page.locator('text=Buyer Target Total').locator('xpath=ancestor::div[contains(@class, "border")][1]').boundingBox();
  console.log('Buyer Target Total Card Dimensions:', targetCard);

  const vendorCard = await page.locator('text=Latest Vendor Quote Total').locator('xpath=ancestor::div[contains(@class, "border")][1]').boundingBox();
  console.log('Latest Vendor Quote Total Card Dimensions:', vendorCard);

  const buyerOfferCard = await page.locator('text=Current Buyer Offer Total').locator('xpath=ancestor::div[contains(@class, "border")][1]').boundingBox();
  console.log('Current Buyer Offer Total Card Dimensions:', buyerOfferCard);

  const varianceCard = await page.locator('text=Negotiated Variance').locator('xpath=ancestor::div[contains(@class, "border")][1]').boundingBox();
  console.log('Negotiated Variance Card Dimensions:', varianceCard);

  // Capture desktop screenshot of Negotiation View
  console.log('Capturing after_negotiation_view.png...');
  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, 'after_negotiation_view.png'),
    fullPage: false,
  });

  // 3. Test clicking "Buyer Acceptance" tab
  console.log('Clicking Buyer Acceptance stage tab...');
  await page.click('button:has-text("Buyer Acceptance")');
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, 'after_buyer_acceptance_view.png'),
    fullPage: false,
  });

  // 4. Test clicking "Finalised Details" tab
  console.log('Clicking Finalised Details stage tab...');
  await page.click('button:has-text("Finalised Details")');
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, 'after_finalised_details_view.png'),
    fullPage: false,
  });

  // 5. Test clicking "Home Workspace" tab
  console.log('Clicking Home Workspace stage tab...');
  await page.click('button:has-text("Home Workspace")');
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, 'after_home_workspace_view.png'),
    fullPage: false,
  });

  // 6. Test Responsive Viewport (1024x768) on Negotiation view
  console.log('Testing responsive viewport at 1024x768...');
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('http://localhost:3000/procurement/rate-cards?view=negotiation', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, 'after_negotiation_responsive_1024.png'),
    fullPage: false,
  });

  await browser.close();
  console.log('All browser verifications completed successfully!');
}

main().catch(console.error);
