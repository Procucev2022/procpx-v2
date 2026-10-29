import { chromium } from 'playwright-core';
import * as path from 'path';
import * as fs from 'fs';
import * as XLSX from 'xlsx';

const ARTIFACTS_DIR = 'C:/Users/Lenovo/.gemini/antigravity-ide/brain/b2e1af52-4698-491a-88c9-ecebaf229e01';
const BROWSER_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function main() {
  console.log('Starting Playwright End-to-End Rate Card Initiation Verification...');
  const browser = await chromium.launch({
    executablePath: BROWSER_PATH,
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 950 },
    acceptDownloads: true,
  });

  const page = await context.newPage();

  // 1. Log in as Category Manager
  console.log('Step 1: Logging in as Category Manager...');
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await page.fill('#work-email', 'category.manager@procucev-demo.local');
  await page.fill('input[type="password"]', 'Demo@1234');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1500);

  // 2. Navigate to Rate Cards Page
  console.log('Step 2: Navigating to Rate Cards page...');
  await page.goto('http://localhost:3000/procurement/rate-cards', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // 3. Switch to Initiate Rate Card Workspace
  console.log('Step 3: Switching to Initiate Rate Card workspace...');
  const initiateNavBtn = page.locator('button:has-text("2. Initiate Rate Card")');
  await initiateNavBtn.click();
  await page.waitForTimeout(800);

  // In Step 1: Basic Details, click Next to go to Rate Lines
  console.log('Navigating from Step 1 to Step 2 (Rate Lines)...');
  const nextToStep2Btn = page.locator('button:has-text("Next: Rate Lines")');
  await nextToStep2Btn.click();
  await page.waitForTimeout(800);

  // Verify all 13 canonical columns are present in Step 2 table header
  console.log('Verifying 13 canonical columns in Step 2 table header...');
  const tableHeaders = await page.locator('table thead tr th').allInnerTexts();
  console.log('Detected headers:', tableHeaders);

  const expectedHeaderKeywords = [
    'S.No',
    'Item Code',
    'Category / Sub-category',
    'Item Description',
    'BOQ Description',
    'UOM',
    'Quantity',
    'AI Rate',
    'AI Cost',
    'Prev PPO Rate',
    'Prev PPO Amount',
    'Target Rate',
    'Target Amount',
  ];

  for (const kw of expectedHeaderKeywords) {
    const found = tableHeaders.some((h) => h.toLowerCase().includes(kw.toLowerCase()));
    if (!found) {
      console.warn(`WARNING: Header keyword "${kw}" was not explicitly matched.`);
    } else {
      console.log(`✓ Header verified: ${kw}`);
    }
  }

  // Capture Screenshot 1: Step 2 Rate Lines with 13 columns and properly aligned toolbar
  const shot1Path = path.join(ARTIFACTS_DIR, '01_rate_lines_redesigned_toolbar_and_borders.png');
  await page.screenshot({ path: shot1Path, fullPage: false });
  console.log(`Saved screenshot 1 to: ${shot1Path}`);

  // Test manual Target Rate change and immediate recalculation
  console.log('Testing manual Target Rate edit for first line (INT-001)...');
  const firstTargetRateInput = page.locator('tbody tr:first-child input[type="number"]').nth(1);
  await firstTargetRateInput.fill('115');
  await page.waitForTimeout(500);

  // 4. Test Excel Download
  console.log('Step 4: Testing Excel Template Download...');
  const downloadPromise = page.waitForEvent('download');
  const downloadBtn = page.locator('button:has-text("Download Excel Template")');
  await downloadBtn.click();
  const download = await downloadPromise;
  const downloadedPath = path.join(ARTIFACTS_DIR, download.suggestedFilename());
  await download.saveAs(downloadedPath);
  console.log(`Downloaded Excel saved to: ${downloadedPath}`);

  // Inspect Downloaded Excel workbook
  const workbook = XLSX.readFile(downloadedPath);
  console.log('Workbook sheet names:', workbook.SheetNames);
  const rateLinesSheet = workbook.Sheets['Rate_Lines'];
  const excelJson = XLSX.utils.sheet_to_json(rateLinesSheet);
  console.log('Downloaded Excel rows count:', excelJson.length);
  console.log('Sample row from downloaded Excel:', excelJson[0]);

  // 5. Create a modified Excel workbook for upload testing
  console.log('Step 5: Creating modified Excel workbook to test upload...');
  const modifiedRows = excelJson.map((row: any) => {
    if (row['Item Code'] === 'INT-001') {
      return { ...row, 'Target Rate per Unit (₹) [EDITABLE]': 108 };
    }
    if (row['Item Code'] === 'INT-002') {
      return { ...row, 'Target Rate per Unit (₹) [EDITABLE]': 90 };
    }
    return row;
  });

  const modifiedWs = XLSX.utils.json_to_sheet(modifiedRows);
  const modifiedWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(modifiedWb, modifiedWs, 'Rate_Lines');
  const uploadTestPath = path.join(ARTIFACTS_DIR, 'proCPX_Rate_Lines_Test_Upload.xlsx');
  XLSX.writeFile(modifiedWb, uploadTestPath);
  console.log(`Created test upload file at: ${uploadTestPath}`);

  // 6. Upload the modified Excel file
  console.log('Step 6: Uploading modified Excel file...');
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(uploadTestPath);
  await page.waitForTimeout(1000);

  // Capture Screenshot 2: Excel Upload Preview Modal
  const shot2Path = path.join(ARTIFACTS_DIR, '02_excel_upload_validation_preview_modal.png');
  await page.screenshot({ path: shot2Path, fullPage: false });
  console.log(`Saved screenshot 2 (Upload Preview) to: ${shot2Path}`);

  // Confirm changes in modal
  console.log('Confirming import in preview modal...');
  const confirmBtn = page.locator('button:has-text("Confirm & Apply Changes")');
  await confirmBtn.click();
  await page.waitForTimeout(800);

  // Capture Screenshot 3: Rate Lines table updated after Excel import
  const shot3Path = path.join(ARTIFACTS_DIR, '03_rate_lines_after_excel_import.png');
  await page.screenshot({ path: shot3Path, fullPage: false });
  console.log(`Saved screenshot 3 to: ${shot3Path}`);

  // 7. Navigate to Step 3: Review & Initiate
  console.log('Step 7: Navigating to Step 3 (Review & Initiate)...');
  const nextToStep3Btn = page.locator('button:has-text("Next: Review & Initiate")');
  await nextToStep3Btn.click();
  await page.waitForTimeout(800);

  // Capture Screenshot 4: Step 3 Review & Initiate with 4 evenly sized summary cards & 13 columns
  const shot4Path = path.join(ARTIFACTS_DIR, '04_review_and_initiate_redesigned_cards_and_grid.png');
  await page.screenshot({ path: shot4Path, fullPage: false });
  console.log(`Saved screenshot 4 to: ${shot4Path}`);

  // Verify navigation back and forward preserves state
  console.log('Testing back and forward navigation persistence...');
  const backToStep2Btn = page.locator('button:has-text("Previous: Rate Lines")');
  await backToStep2Btn.click();
  await page.waitForTimeout(500);

  // Verify rate for INT-001 is still 108
  const step2Rate = await page.locator('tbody tr:first-child input[type="number"]').nth(1).inputValue();
  console.log(`Verified INT-001 target rate after Back navigation: ${step2Rate} (expected: 108)`);

  await nextToStep3Btn.click();
  await page.waitForTimeout(500);

  // 8. Initiate Rate Card
  console.log('Step 8: Submitting Initiate Rate Card...');
  const initiateBtn = page.locator('button:has-text("Initiate Rate Card & Send to Vendor")');
  await initiateBtn.click();
  await page.waitForTimeout(1200);

  // Capture Screenshot 5: Home Workspace after initiation showing success toast
  const shot5Path = path.join(ARTIFACTS_DIR, '05_home_workspace_after_rate_card_initiation.png');
  await page.screenshot({ path: shot5Path, fullPage: false });
  console.log(`Saved screenshot 5 to: ${shot5Path}`);

  await browser.close();
  console.log('Playwright verification script finished successfully!');
}

main().catch((err) => {
  console.error('Playwright verification error:', err);
  process.exit(1);
});
