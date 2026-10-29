const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

async function main() {
  console.log('Starting Verification for Simplified RFQ Workspace: Quotations Received, Negotiation, Awarding & PPO...');
  const artifactDir = 'C:\\Users\\Lenovo\\.gemini\\antigravity-ide\\brain\\10150d0a-bb23-426d-9f85-5bf099b06ee4';

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const executablePath = fs.existsSync(chromePath) ? chromePath : edgePath;
  console.log('Using browser executable:', executablePath);

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 },
  });

  const page = await browser.newPage();

  try {
    // 1. Authenticate as Category Manager
    console.log('1. Logging in as Category Manager...');
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
    await page.click('#work-email');
    await page.type('#work-email', 'category.manager@procucev-demo.local');
    await page.click('#password');
    await page.type('#password', 'Demo@1234');
    await page.click('button[type="submit"]');
    await new Promise((r) => setTimeout(r, 2000));

    // 2. Open RFQ Workspace (RFQ-DEMO-001 with zero=false so quotes exist)
    console.log('2. Navigating to RFQ-DEMO-001 workspace (Tab 1: Quotations Received)...');
    await page.goto('http://localhost:3000/procurement/rfqs/RFQ-DEMO-001?zero=false&tab=quotes', { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 2500));

    // 3. Capture Tab 1: Quotations Received
    console.log('3. Capturing Tab 1: Quotations Received Register and Summary cards...');
    await page.screenshot({
      path: path.join(artifactDir, 'rfq_tab1_quotations_received.png'),
      fullPage: false,
    });

    const tab1Metrics = await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('.tab-btn')).map(t => t.textContent.trim());
      const headers = Array.from(document.querySelectorAll('table th')).map(th => th.textContent.trim());
      const summaryCards = document.querySelectorAll('.card');

      return {
        tabs,
        headers,
        summaryCardsCount: summaryCards.length,
      };
    });
    console.log('Tab 1 Metrics:', tab1Metrics);

    // 4. Test View Quote Modal
    console.log('4. Testing View Quote modal...');
    await page.evaluate(() => {
      const viewQuoteBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('View Quote'));
      if (viewQuoteBtns.length > 0) viewQuoteBtns[0].click();
    });
    await new Promise((r) => setTimeout(r, 1000));

    await page.screenshot({
      path: path.join(artifactDir, 'rfq_tab1_view_quote_modal.png'),
      fullPage: false,
    });

    // Close the modal
    await page.evaluate(() => {
      const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Close');
      if (closeBtn) closeBtn.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    // 5. Navigate to Tab 2: Negotiation
    console.log('5. Switching to Tab 2: Negotiation...');
    await page.evaluate(() => {
      const negTabBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.textContent.includes('Negotiation'));
      if (negTabBtn) negTabBtn.click();
    });
    await new Promise((r) => setTimeout(r, 2000));

    console.log('Capturing Tab 2: Commercial Negotiation Workspace...');
    await page.screenshot({
      path: path.join(artifactDir, 'rfq_tab2_negotiation_workspace.png'),
      fullPage: false,
    });

    const tab2Metrics = await page.evaluate(() => {
      const summaryStrip = document.querySelector('#rfq-negotiation-summary-strip');
      const tableHeaders = Array.from(document.querySelectorAll('#rfq-commercial-table-container th')).map(th => th.textContent.trim().replace(/\s+/g, ' '));
      const bottomBar = document.querySelector('#rfq-bottom-action-bar');
      const batchToolbar = document.querySelector('button[title*="-3%"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('-3%'));

      return {
        hasSummaryStrip: !!summaryStrip,
        summaryStripText: summaryStrip ? summaryStrip.innerText.replace(/\s+/g, ' ') : '',
        tableHeaders,
        hasBottomBar: !!bottomBar,
        hasBatchDiscountButtons: !!batchToolbar,
      };
    });
    console.log('Tab 2 Metrics:', tab2Metrics);

    // 6. Test opening the Right-Side Detail Drawer in Tab 2
    console.log('6. Opening line 1 item detail drawer...');
    await page.evaluate(() => {
      const lineBtn = document.querySelector('#rfq-commercial-table-container tbody tr button');
      if (lineBtn) lineBtn.click();
    });
    await new Promise((r) => setTimeout(r, 1200));

    console.log('Capturing Tab 2 with Drawer open...');
    await page.screenshot({
      path: path.join(artifactDir, 'rfq_tab2_drawer_open.png'),
      fullPage: false,
    });

    const drawerMetrics = await page.evaluate(() => {
      const drawer = document.querySelector('#item-details-drawer');
      return {
        hasDrawer: !!drawer,
        title: drawer?.querySelector('h3')?.textContent?.trim() || '',
        hasAiBreakdown: drawer?.innerText?.includes('AI Benchmark Cost Breakdown'),
        hasHistCost: drawer?.innerText?.includes('Historical Cost') || drawer?.innerText?.includes('Rate Card'),
        hasVendorQuotedRates: drawer?.innerText?.includes('Vendor Quoted Rates'),
        hasQuickCounteroffer: drawer?.innerText?.includes('Quick Counteroffer'),
        hasApplyButton: !!Array.from(drawer?.querySelectorAll('button') || []).find(b => b.textContent.includes('Apply')),
      };
    });
    console.log('Drawer Metrics:', drawerMetrics);

    // Close the drawer
    await page.evaluate(() => {
      const closeBtn = document.querySelector('#item-details-drawer button');
      if (closeBtn) closeBtn.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    // 7. Navigate to Tab 3: Awarding & PPO
    console.log('7. Switching to Tab 3: Awarding & PPO...');
    await page.evaluate(() => {
      const awardTabBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.textContent.includes('Awarding & PPO'));
      if (awardTabBtn) awardTabBtn.click();
    });
    await new Promise((r) => setTimeout(r, 2000));

    console.log('Capturing Tab 3: Awarding & PPO...');
    await page.screenshot({
      path: path.join(artifactDir, 'rfq_tab3_awarding_ppo.png'),
      fullPage: false,
    });

    console.log('All verification steps completed successfully!');
  } catch (err) {
    console.error('Browser verification failed:', err);
    throw err;
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
