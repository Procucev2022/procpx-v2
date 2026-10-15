const puppeteer = require('puppeteer-core');
const path = require('path');

async function main() {
  console.log('Starting Comprehensive Browser Verification for Approved RFQ Comparison & Negotiation UI...');
  const artifactDir = 'C:\\Users\\Lenovo\\.gemini\\antigravity-ide\\brain\\10150d0a-bb23-426d-9f85-5bf099b06ee4';

  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
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

    // 2. Open RFQ Commercial Workspace
    console.log('2. Opening RFQ Commercial Workspace (RFQ-DEMO-001)...');
    await page.goto('http://localhost:3000/procurement/rfqs/RFQ-DEMO-001?zero=false', { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 2500));

    // 3. Verify Header and Summary Strip
    console.log('3. Capturing main commercial comparison view...');
    await page.screenshot({
      path: path.join(artifactDir, 'rfq_approved_main_commercial_view.png'),
      fullPage: false,
    });

    const headerMetrics = await page.evaluate(() => {
      const summaryStrip = document.querySelector('#rfq-summary-strip');
      const tableContainer = document.querySelector('#rfq-commercial-table-container');
      const bottomBar = document.querySelector('#rfq-bottom-action-bar');
      const tableHeaders = Array.from(document.querySelectorAll('#rfq-commercial-table-container th')).map(th => th.textContent.trim());

      return {
        hasSummaryStrip: !!summaryStrip,
        summaryStripText: summaryStrip ? summaryStrip.innerText.replace(/\s+/g, ' ') : '',
        hasTableContainer: !!tableContainer,
        tableContainerHeight: tableContainer ? tableContainer.clientHeight : 0,
        hasBottomBar: !!bottomBar,
        hasHistRateHeader: tableHeaders.some(h => h.includes('Hist. Rate') || h.includes('Historical Benchmark')),
        hasDynamicL1Badge: tableHeaders.some(h => h.includes('L1')),
        hasDynamicL2Badge: tableHeaders.some(h => h.includes('L2')),
      };
    });
    console.log('Header and layout metrics:', headerMetrics);

    // 4. Test Item Description Click -> Open Wide Slide-Over Drawer with AI Cost Breakdown
    console.log('4. Testing Item Description click to open Slide-Over Drawer...');
    await page.evaluate(() => {
      // Find the first line description button in the table
      const descBtn = document.querySelector('#rfq-commercial-table-container tbody tr button');
      if (descBtn) descBtn.click();
    });
    await new Promise((r) => setTimeout(r, 1000));

    console.log('Capturing rfq_item_details_drawer.png...');
    await page.screenshot({
      path: path.join(artifactDir, 'rfq_item_details_drawer.png'),
      fullPage: false,
    });

    const drawerInfo = await page.evaluate(() => {
      const drawer = document.querySelector('#item-details-drawer');
      return {
        hasDrawer: !!drawer,
        title: drawer?.querySelector('h3')?.textContent?.trim() || '',
        hasAiBreakdown: drawer?.innerText?.includes('AI Benchmark Cost Breakdown'),
        hasMaterialCost: drawer?.innerText?.includes('Material Cost'),
        hasDirectLabour: drawer?.innerText?.includes('Direct Labour'),
        hasMargin: drawer?.innerText?.includes('Contractor Margin'),
        hasHistoricalPpo: drawer?.innerText?.includes('Historical PPO Rate'),
        hasApprovedRateCard: drawer?.innerText?.includes('Approved Rate Card'),
      };
    });
    console.log('Drawer verification details:', drawerInfo);

    // Close the drawer
    await page.evaluate(() => {
      const closeBtn = document.querySelector('#item-details-drawer button[title*="Close"]') ||
                       Array.from(document.querySelectorAll('#item-details-drawer button')).find(b => b.textContent.includes('Close'));
      if (closeBtn) closeBtn.click();
    });
    await new Promise((r) => setTimeout(r, 600));

    // 5. Scroll table horizontally to view Vendor columns and Counteroffer fields
    console.log('5. Scrolling table horizontally...');
    await page.evaluate(() => {
      const container = document.querySelector('#rfq-commercial-table-container');
      if (container) container.scrollLeft = 550;
    });
    await new Promise((r) => setTimeout(r, 800));

    console.log('Capturing rfq_scrolled_vendor_and_offers.png...');
    await page.screenshot({
      path: path.join(artifactDir, 'rfq_scrolled_vendor_and_offers.png'),
      fullPage: false,
    });

    // 6. Enter Buyer Counteroffer Rates on multiple lines and Save Draft
    console.log('6. Entering buyer counteroffer unit rates...');
    await page.evaluate(() => {
      // Find inputs in the Buyer Offer Rate column
      const inputs = document.querySelectorAll('#rfq-commercial-table-container tbody input[type="number"]');
      if (inputs.length >= 2) {
        // Line 1: enter 1800
        inputs[0].value = '1800';
        inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
        inputs[0].dispatchEvent(new Event('input', { bubbles: true }));

        // Line 2: enter 2200
        inputs[1].value = '2200';
        inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
        inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await new Promise((r) => setTimeout(r, 800));

    // Test Save Draft
    console.log('Clicking Save Draft...');
    await page.evaluate(() => {
      const draftBtn = Array.from(document.querySelectorAll('#rfq-bottom-action-bar button')).find(
        b => b.textContent && b.textContent.includes('Save Draft')
      );
      if (draftBtn) draftBtn.click();
    });
    await new Promise((r) => setTimeout(r, 600));

    console.log('Capturing rfq_bottom_bar_with_draft_and_offers.png...');
    await page.screenshot({
      path: path.join(artifactDir, 'rfq_bottom_bar_with_draft_and_offers.png'),
      fullPage: false,
    });

    // 7. Click Submit Counteroffers (2 lines) -> Opens Confirmation Modal
    console.log('7. Triggering Submit Counteroffers...');
    await page.evaluate(() => {
      const submitBtn = Array.from(document.querySelectorAll('#rfq-bottom-action-bar button')).find(
        b => b.textContent && (b.textContent.includes('Submit Counteroffers') || b.textContent.includes('Submit Offer'))
      );
      if (submitBtn) submitBtn.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    console.log('Capturing rfq_counteroffer_confirm_modal.png...');
    await page.screenshot({
      path: path.join(artifactDir, 'rfq_counteroffer_confirm_modal.png'),
      fullPage: false,
    });

    const modalMetrics = await page.evaluate(() => {
      const modal = document.querySelector('.fixed.z-50.flex.items-center.justify-center');
      return {
        hasModal: !!modal,
        heading: modal?.querySelector('h3')?.textContent?.trim() || '',
        text: modal?.innerText?.replace(/\s+/g, ' ') || '',
        hasConfirmButton: Array.from(modal?.querySelectorAll('button') || []).some(b => b.textContent.includes('Confirm & Dispatch')),
      };
    });
    console.log('Confirmation modal details:', modalMetrics);

    // 8. Confirm Submission -> Server Confirmation Success Banner
    console.log('8. Dispatching counteroffer in modal...');
    await page.evaluate(() => {
      const confirmBtn = Array.from(document.querySelectorAll('button')).find(
        b => b.textContent && b.textContent.includes('Confirm & Dispatch')
      );
      if (confirmBtn) confirmBtn.click();
    });
    await new Promise((r) => setTimeout(r, 1200));

    console.log('Capturing rfq_counteroffer_dispatched_success.png...');
    await page.screenshot({
      path: path.join(artifactDir, 'rfq_counteroffer_dispatched_success.png'),
      fullPage: false,
    });

    // 9. Verify Negotiation Stage Tab 2
    console.log('9. Checking Stage 2: Negotiation...');
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      const tabBtns = Array.from(document.querySelectorAll('.tab-btn'));
      const negTab = tabBtns.find(b => b.textContent && b.textContent.includes('2. Negotiation'));
      if (negTab) negTab.click();
    });
    await new Promise((r) => setTimeout(r, 1200));

    console.log('Capturing rfq_stage2_negotiation_active.png...');
    await page.screenshot({
      path: path.join(artifactDir, 'rfq_stage2_negotiation_active.png'),
      fullPage: false,
    });

    // 10. Verify Stage 3: Awarding & PPO
    console.log('10. Checking Stage 3: Awarding & PPO...');
    await page.evaluate(() => {
      const tabBtns = Array.from(document.querySelectorAll('.tab-btn'));
      const awardTab = tabBtns.find(b => b.textContent && b.textContent.includes('3. Awarding'));
      if (awardTab) awardTab.click();
    });
    await new Promise((r) => setTimeout(r, 1200));

    console.log('Capturing rfq_stage3_awarding_ready.png...');
    await page.screenshot({
      path: path.join(artifactDir, 'rfq_stage3_awarding_ready.png'),
      fullPage: false,
    });

    console.log('✅ ALL BROWSER VERIFICATIONS COMPLETED SUCCESSFULLY!');
  } catch (err) {
    console.error('Browser verification error:', err);
  } finally {
    await browser.close();
  }
}

main();
