const puppeteer = require('puppeteer-core');
const path = require('path');

async function main() {
  console.log('Starting Browser Verification for Simplified RFQ Commercial Workspace...');
  const artifactDir = 'C:\\Users\\Lenovo\\.gemini\\antigravity-ide\\brain\\10150d0a-bb23-426d-9f85-5bf099b06ee4';

  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 },
  });

  const page = await browser.newPage();

  try {
    // 1. Log in as Category Manager
    console.log('Navigating to login page...');
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
    await page.click('#work-email');
    await page.type('#work-email', 'category.manager@procucev-demo.local');
    await page.click('#password');
    await page.type('#password', 'Demo@1234');
    await page.click('button[type="submit"]');
    await new Promise((r) => setTimeout(r, 2500));

    // 2. Open RFQ Commercial Workspace with quotes
    console.log('Opening RFQ Commercial Workspace...');
    await page.goto('http://localhost:3000/procurement/rfqs/RFQ-DEMO-001?zero=false', { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 2500));

    // 3. Capture Main Desktop View (DOMINATED BY COMPARISON TABLE)
    console.log('Capturing rfq_workspace_simplified_main.png...');
    await page.screenshot({
      path: path.join(artifactDir, 'rfq_workspace_simplified_main.png'),
      fullPage: false,
    });

    // Check table container visibility & dimensions
    const tableInfo = await page.evaluate(() => {
      const container = document.querySelector('#rfq-commercial-table-container');
      const table = container?.querySelector('table');
      const demoStepper = document.querySelector('.card[style*="linear-gradient"]');
      const kpiGrid = document.querySelector('.kpi-card');
      const header = document.querySelector('.card.mb-3');
      const tabs = document.querySelector('.tabs');

      return {
        hasTable: !!table,
        tableContainerHeight: container ? container.clientHeight : 0,
        tableScrollWidth: container ? container.scrollWidth : 0,
        hasOversizedDemoStepper: !!demoStepper,
        hasOversizedKpiCards: !!kpiGrid,
        hasCompactHeader: !!header,
        hasTabs: !!tabs,
      };
    });
    console.log('Table layout metrics:', tableInfo);

    // 4. Scroll table horizontally to capture vendor columns and counteroffer inputs
    console.log('Scrolling table horizontally...');
    await page.evaluate(() => {
      const container = document.querySelector('#rfq-commercial-table-container');
      if (container) {
        container.scrollLeft = 600;
      }
    });
    await new Promise((r) => setTimeout(r, 800));

    console.log('Capturing rfq_workspace_scrolled_right.png...');
    await page.screenshot({
      path: path.join(artifactDir, 'rfq_workspace_scrolled_right.png'),
      fullPage: false,
    });

    // 5. Scroll down to Commercial Terms and expand them
    console.log('Testing collapsible Commercial Terms...');
    await page.evaluate(() => {
      window.scrollBy(0, 450);
    });
    await new Promise((r) => setTimeout(r, 600));

    // Click to expand commercial terms
    await page.evaluate(() => {
      const termsToggle = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent && b.textContent.includes('Expand Terms')
      );
      if (termsToggle) termsToggle.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    console.log('Capturing rfq_workspace_commercial_terms.png...');
    await page.screenshot({
      path: path.join(artifactDir, 'rfq_workspace_commercial_terms.png'),
      fullPage: false,
    });

    // 6. Switch to Stage 2: Negotiation
    console.log('Switching to Stage 2: Negotiation...');
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      const tabBtns = Array.from(document.querySelectorAll('.tab-btn'));
      const negTab = tabBtns.find((b) => b.textContent && b.textContent.includes('2. Negotiation'));
      if (negTab) negTab.click();
    });
    await new Promise((r) => setTimeout(r, 1200));

    console.log('Capturing rfq_workspace_stage2_negotiation.png...');
    await page.screenshot({
      path: path.join(artifactDir, 'rfq_workspace_stage2_negotiation.png'),
      fullPage: false,
    });

    // 7. Switch to Stage 3: Awarding & PPO
    console.log('Switching to Stage 3: Awarding & PPO...');
    await page.evaluate(() => {
      const tabBtns = Array.from(document.querySelectorAll('.tab-btn'));
      const awardTab = tabBtns.find((b) => b.textContent && b.textContent.includes('3. Awarding'));
      if (awardTab) awardTab.click();
    });
    await new Promise((r) => setTimeout(r, 1200));

    console.log('Capturing rfq_workspace_stage3_awarding.png...');
    await page.screenshot({
      path: path.join(artifactDir, 'rfq_workspace_stage3_awarding.png'),
      fullPage: false,
    });

    // 8. Test Isolated Demo Guide Toggle (Back to Stage 1)
    console.log('Testing isolated Demo Guide toggle...');
    await page.evaluate(() => {
      const tabBtns = Array.from(document.querySelectorAll('.tab-btn'));
      const rfqTab = tabBtns.find((b) => b.textContent && b.textContent.includes('1. RFQ'));
      if (rfqTab) rfqTab.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    await page.evaluate(() => {
      const demoBtn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent && b.textContent.includes('Demo Guide')
      );
      if (demoBtn) demoBtn.click();
    });
    await new Promise((r) => setTimeout(r, 1000));

    console.log('Capturing rfq_workspace_demo_guide_opened.png...');
    await page.screenshot({
      path: path.join(artifactDir, 'rfq_workspace_demo_guide_opened.png'),
      fullPage: false,
    });

    console.log('✅ Browser verification completed successfully!');
  } catch (err) {
    console.error('❌ Browser verification failed:', err);
  } finally {
    await browser.close();
  }
}

main();
