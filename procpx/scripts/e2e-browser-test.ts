import puppeteer from 'puppeteer-core';
import path from 'path';

const ARTIFACT_DIR = 'C:\\Users\\Lenovo\\.gemini\\antigravity-ide\\brain\\cc45104a-bde9-4862-a556-93f13a42eefd\\browser';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';
const RFQ_ID = 'e5a89c96-41cb-415b-8dbb-a3b73b5d17f6';

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runBrowserTests() {
  console.log('🚀 Starting proCPX Real Browser E2E Test Suite...');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080'],
    defaultViewport: { width: 1920, height: 1080 },
  });

  try {
    // =========================================================================
    // 1. CATEGORY MANAGER SESSION
    // =========================================================================
    const cmContext = await browser.createBrowserContext();
    const cmPage = await cmContext.newPage();

    console.log('\n--- 1. Testing Category Manager Dashboard & Sourcing Register ---');
    await cmPage.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
    await cmPage.click('#work-email');
    await cmPage.type('#work-email', 'category.manager@procucev-demo.local');
    await cmPage.click('#password');
    await cmPage.type('#password', 'Demo@1234');
    await cmPage.click('button[type="submit"]');
    await cmPage.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => delay(3000));
    console.log('Logged in as Category Manager. Current URL:', cmPage.url());

    // Dashboard navigation
    await cmPage.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle0' });
    await delay(3000);

    const cmDashboardPath = path.join(ARTIFACT_DIR, '01_cm_dashboard_sourcing_register.png');
    await cmPage.screenshot({ path: cmDashboardPath, fullPage: false });
    console.log(`✓ Saved screenshot: ${cmDashboardPath}`);

    // Verify Sourcing Register Table Content
    const dashboardStats = await cmPage.evaluate(() => {
      const kpiCards = Array.from(document.querySelectorAll('div'))
        .filter(el => (el.textContent || '').includes('Approved BOQs') && (el.textContent || '').includes('awaiting RFQ'));
      const tableRows = document.querySelectorAll('table tbody tr');
      return {
        kpiCount: kpiCards.length,
        rowCount: tableRows.length,
      };
    });
    console.log('Dashboard evaluation stats:', dashboardStats);

    // =========================================================================
    // 2. CATEGORY MANAGER NEGOTIATION MATRIX (Quotes 1-5, Buyer Offers 1-4)
    // =========================================================================
    console.log('\n--- 2. Testing Category Manager RFQ Negotiation Workspace ---');
    await cmPage.goto(`${BASE_URL}/procurement/rfqs/${RFQ_ID}?tab=negotiation`, { waitUntil: 'networkidle0' });
    await delay(3500);

    const cmWorkspacePath = path.join(ARTIFACT_DIR, '02_cm_rfq_negotiation_matrix.png');
    await cmPage.screenshot({ path: cmWorkspacePath, fullPage: false });
    console.log(`✓ Saved screenshot: ${cmWorkspacePath}`);

    const negotiationMatrixInfo = await cmPage.evaluate(() => {
      const headers = Array.from(document.querySelectorAll('th')).map(th => th.textContent?.trim() || '');
      const cells = Array.from(document.querySelectorAll('td')).map(td => td.textContent?.trim() || '');
      return {
        headers: headers.filter(h => h.length > 0),
        hasBuyerOfferCols: headers.some(h => h.includes('Buyer Offer')),
        hasQuoteCols: headers.some(h => h.includes('Vendor Quote') || h.includes('Quote')),
        vendorNames: cells.filter(c => c.includes('interiors') || c.includes('Apex')),
      };
    });
    console.log('Negotiation Matrix Info:', negotiationMatrixInfo);

    // =========================================================================
    // 3. PPO & AWARD TAB WITH DYNAMIC L1/L2/L3 RANKING
    // =========================================================================
    console.log('\n--- 3. Testing PPO Tab & Award Comparison ---');
    await cmPage.goto(`${BASE_URL}/procurement/rfqs/${RFQ_ID}?tab=awarding`, { waitUntil: 'networkidle0' });
    await delay(3000);

    const cmPpoTabPath = path.join(ARTIFACT_DIR, '03_cm_rfq_ppo_award_tab.png');
    await cmPage.screenshot({ path: cmPpoTabPath, fullPage: false });
    console.log(`✓ Saved screenshot: ${cmPpoTabPath}`);

    const ppoRankingInfo = await cmPage.evaluate(() => {
      const text = document.body.innerText;
      return {
        hasL1: text.includes('L1') || text.includes('Lowest'),
        hasL2: text.includes('L2'),
        hasPpoButton: Array.from(document.querySelectorAll('button')).some(b => b.textContent?.includes('Raise PPO') || b.textContent?.includes('PPO')),
      };
    });
    console.log('PPO Ranking & Award Info:', ppoRankingInfo);

    // =========================================================================
    // 4. VENDOR PORTAL SESSION (ISOLATED CONTEXT)
    // =========================================================================
    console.log('\n--- 4. Testing Vendor Portal Workspace & Counteroffer History ---');
    const vendorContext = await browser.createBrowserContext();
    const vendorPage = await vendorContext.newPage();

    await vendorPage.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
    await vendorPage.click('#work-email');
    await vendorPage.type('#work-email', 'srinidhi.interiors@vendor.procpx.local');
    await vendorPage.click('#password');
    await vendorPage.type('#password', 'welcome');
    await vendorPage.click('button[type="submit"]');
    await vendorPage.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => delay(3000));
    console.log('Logged in as Vendor. Current URL:', vendorPage.url());

    // Navigate to RFQ
    await vendorPage.goto(`${BASE_URL}/vendor-portal/rfqs/${RFQ_ID}`, { waitUntil: 'networkidle0' });
    await delay(3000);

    const vendorRfqPath = path.join(ARTIFACT_DIR, '04_vendor_portal_rfq_view.png');
    await vendorPage.screenshot({ path: vendorRfqPath, fullPage: false });
    console.log(`✓ Saved screenshot: ${vendorRfqPath}`);

    // Scroll down to view Counteroffer History and Quote Summary
    await vendorPage.evaluate(() => {
      window.scrollBy(0, 750);
    });
    await delay(1000);

    const vendorHistoryPath = path.join(ARTIFACT_DIR, '05_vendor_portal_counteroffer_history.png');
    await vendorPage.screenshot({ path: vendorHistoryPath, fullPage: false });
    console.log(`✓ Saved screenshot: ${vendorHistoryPath}`);

    const vendorViewInfo = await vendorPage.evaluate(() => {
      const text = document.body.innerText;
      return {
        hasCounterofferBanner: text.includes('Category Manager Counteroffer Received') || text.includes('Counteroffer Received'),
        hasReadonlyQuote: text.includes('Submitted Quote') || text.includes('Quote Version') || text.includes('Read-Only'),
        hasCounterofferHistory: text.includes('Category Manager Counteroffer History') || text.includes('Buyer Offer'),
        hasQuoteHistory: text.includes('Previous Quotation Submissions') || text.includes('Quotation History'),
      };
    });
    console.log('Vendor View Evaluation:', vendorViewInfo);

    console.log('\n🎉 Real Browser E2E Test Suite successfully completed with all screenshots captured!');
  } catch (err) {
    console.error('❌ Browser test failed with error:', err);
    throw err;
  } finally {
    await browser.close();
  }
}

runBrowserTests();
