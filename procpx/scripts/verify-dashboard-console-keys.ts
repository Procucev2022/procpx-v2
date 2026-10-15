import puppeteer from 'puppeteer-core';
import path from 'path';

const BASE_URL = 'http://localhost:3000';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function verifyConsoleKeys() {
  console.log('===============================================================');
  console.log('   VERIFY REACT LIST-KEY WARNING IN BROWSER CONSOLE           ');
  console.log('===============================================================');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 },
  });

  const page = await browser.newPage();
  const consoleWarnings: string[] = [];
  const consoleErrors: string[] = [];

  page.on('console', msg => {
    const text = msg.text();
    const type = msg.type();
    if (type === 'warn' || text.toLowerCase().includes('warning') || text.toLowerCase().includes('key')) {
      consoleWarnings.push(`[${type}] ${text}`);
    }
    if (type === 'error') {
      consoleErrors.push(text);
    }
  });

  async function login(email: string, password = 'Demo@1234') {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[type="email"]');
    await page.$eval('input[type="email"]', (el: any) => el.value = '');
    await page.type('input[type="email"]', email);
    await page.$eval('input[type="password"]', (el: any) => el.value = '');
    await page.type('input[type="password"]', password);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    await new Promise(r => setTimeout(r, 1000));
  }

  try {
    // 1. Verify Procurement User Dashboard (where filteredRegister is rendered)
    console.log('\nStep 1: Logging in as Procurement User (procurement.user@procucev-demo.local)...');
    await login('procurement.user@procucev-demo.local');
    console.log('  Navigating to /dashboard with console listener active...');
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    // Interact with expand/collapse to trigger re-renders
    const expandButtons = await page.$$('button[aria-label="Expand RFQs"], button[aria-label="Collapse RFQs"]');
    if (expandButtons.length > 0) {
      console.log(`  Clicking expand/collapse toggle (${expandButtons.length} found)...`);
      await expandButtons[0].click();
      await new Promise(r => setTimeout(r, 1000));
    }

    const keyWarningsProc = consoleWarnings.filter(w => w.includes('unique "key" prop') || w.includes('Each child in a list'));
    console.log(`  Key warnings detected for Procurement User: ${keyWarningsProc.length}`);

    // 2. Verify Project Approver Dashboard & Approvals Page (actions verification)
    console.log('\nStep 2: Logging in as Project Approver (project.approver@procucev-demo.local)...');
    await login('project.approver@procucev-demo.local');
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    const approverDashHtml = await page.content();
    const hasReview = approverDashHtml.includes('Review BOQ');
    const hasMessage = approverDashHtml.includes('Message');
    const hasChat = approverDashHtml.includes('Chat');
    const hasRevert = approverDashHtml.includes('Revert');
    const hasApprove = approverDashHtml.includes('Approve');
    const hasReject = approverDashHtml.includes('Reject');

    console.log('  Approver Actions on Dashboard:');
    console.log(`    - Review BOQ: ${hasReview}`);
    console.log(`    - Message:    ${hasMessage}`);
    console.log(`    - Chat:       ${hasChat}`);
    console.log(`    - Revert:     ${hasRevert}`);
    console.log(`    - Approve:    ${hasApprove}`);
    console.log(`    - Reject:     ${hasReject}`);

    // Navigate to /approvals/boq-pr
    await page.goto(`${BASE_URL}/approvals/boq-pr`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    const totalKeyWarnings = consoleWarnings.filter(w => w.includes('unique "key" prop') || w.includes('Each child in a list'));

    console.log('\n===============================================================');
    console.log('                   CONSOLE AUDIT SUMMARY                       ');
    console.log('===============================================================');
    console.log(`Total React key warnings captured across all roles: ${totalKeyWarnings.length}`);
    if (totalKeyWarnings.length > 0) {
      console.log('Warnings:');
      totalKeyWarnings.forEach(w => console.log('  ', w));
    } else {
      console.log('✓ PASS: ZERO React key warnings detected in browser console.');
    }
  } catch (err: any) {
    console.error('Audit failed:', err);
  } finally {
    await browser.close();
  }
}

verifyConsoleKeys();
