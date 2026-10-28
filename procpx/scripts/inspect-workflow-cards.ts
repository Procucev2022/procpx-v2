import { chromium } from 'playwright-core';
import * as path from 'path';

const ARTIFACTS_DIR = 'C:/Users/Lenovo/.gemini/antigravity-ide/brain/b2e1af52-4698-491a-88c9-ecebaf229e01';
const BROWSER_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function main() {
  console.log('Inspecting current workflow nav and summary cards...');
  const browser = await chromium.launch({
    executablePath: BROWSER_PATH,
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 950 },
  });

  const page = await context.newPage();

  // Log in as Category Manager
  console.log('Logging in...');
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await page.click('button:has-text("Category Manager")');
  await page.waitForTimeout(400);
  await page.click('button:has-text("Sign In")');
  await page.waitForTimeout(2000);

  // Navigate to negotiation view
  console.log('Navigating to negotiation view...');
  await page.goto('http://localhost:3000/procurement/rate-cards?view=negotiation', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  // Capture current state before fixes
  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, 'before_negotiation_view.png'),
    fullPage: false,
  });

  // Measure Workflow navigation and summary cards
  const navBox = await page.locator('div:has(> button:has-text("Home Workspace"))').first().boundingBox();
  console.log('Workflow Nav container box:', navBox);

  const stageBtn = await page.locator('button:has-text("Item Negotiation")').boundingBox();
  console.log('Item Negotiation button box:', stageBtn);

  const cardBoxes = await page.locator('div:has(> span:has-text("Buyer Target Total"))').all();
  for (const c of cardBoxes) {
    console.log('Card box:', await c.boundingBox());
  }

  // Also inspect the 4 cards
  const cards = await page.locator('text=Buyer Target Total').locator('xpath=ancestor::div[contains(@class, "border")][1]').boundingBox();
  console.log('Buyer Target Total Card Box:', cards);

  await browser.close();
  console.log('Inspection complete.');
}

main().catch(console.error);
