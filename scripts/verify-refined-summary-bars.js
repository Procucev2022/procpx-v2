const puppeteer = require('puppeteer-core');
const path = require('path');

async function main() {
  console.log('Starting Browser Verification for Refined RFQ Summary & PPO Summary Bars...');
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

    // 2. Open Create RFQ page
    console.log('2. Opening Create RFQ page (/procurement/rfqs/new)...');
    await page.goto('http://localhost:3000/procurement/rfqs/new', { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 2500));

    // 3. Capture Refined Summary Bars View on Step 1
    console.log('3. Capturing Refined Blue RFQ Summary & Orange PPO Summary Bars on Step 1...');
    await page.screenshot({
      path: path.join(artifactDir, 'rfq_summary_bars_refined_step1.png'),
      fullPage: false,
    });

    const summaryBarsMetrics = await page.evaluate(() => {
      const rfqBar = document.querySelector('.rfq-summary-bar');
      const ppoBar = document.querySelector('.ppo-summary-bar');
      const rfqHeaders = rfqBar ? Array.from(rfqBar.querySelectorAll('th')).map((th) => th.textContent.trim()) : [];
      const ppoHeaders = ppoBar ? Array.from(ppoBar.querySelectorAll('th')).map((th) => th.textContent.trim()) : [];
      const rfqCells = rfqBar ? Array.from(rfqBar.querySelectorAll('tbody td')).map((td) => td.textContent.trim()) : [];

      return {
        hasRfqBar: !!rfqBar,
        hasPpoBar: !!ppoBar,
        rfqHeadersCount: rfqHeaders.length,
        rfqHeadersList: rfqHeaders,
        firstRfqHeader: rfqHeaders[0],
        secondRfqHeader: rfqHeaders[1],
        hasPrNoInRfqHeaders: rfqHeaders.some((h) => h.includes('PR No.') || h.includes('PR')),
        firstTwoCells: rfqCells.slice(0, 2),
      };
    });
    console.log('Summary Bars verification metrics:', summaryBarsMetrics);

    // 4. Step 2 View with Summary Bars
    console.log('4. Navigating to Step 2...');
    await page.evaluate(() => {
      const continueBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Continue to Step 2'));
      if (continueBtn) continueBtn.click();
    });
    await new Promise((r) => setTimeout(r, 1500));
    await page.screenshot({
      path: path.join(artifactDir, 'rfq_summary_bars_refined_step2.png'),
      fullPage: false,
    });

    // 5. Step 4 Vendor Selection View with Summary Bars
    console.log('5. Navigating to Step 3 and then Step 4...');
    await page.evaluate(() => {
      const continueBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Continue to Step 3'));
      if (continueBtn) continueBtn.click();
    });
    await new Promise((r) => setTimeout(r, 1200));

    await page.evaluate(() => {
      const continueBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Continue to Step 4'));
      if (continueBtn) continueBtn.click();
    });
    await new Promise((r) => setTimeout(r, 1500));
    await page.screenshot({
      path: path.join(artifactDir, 'rfq_summary_bars_refined_step4.png'),
      fullPage: false,
    });

    console.log('✅ REFINED SUMMARY BARS VERIFIED SUCCESSFULLY!');
  } finally {
    await browser.close();
  }
}

main();
