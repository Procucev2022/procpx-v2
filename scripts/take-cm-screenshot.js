const puppeteer = require('puppeteer-core');
const path = require('path');

async function capture() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080'],
    defaultViewport: { width: 1920, height: 1080 }
  });

  const page = await browser.newPage();
  console.log('Navigating to login page...');
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });

  // Clear and type credentials
  await page.click('#work-email');
  await page.type('#work-email', 'category.manager@procucev-demo.local');
  await page.click('#password');
  await page.type('#password', 'Demo@1234');

  console.log('Clicking Sign In button...');
  await page.click('button[type="submit"]');

  // Wait for login request to complete
  await new Promise(r => setTimeout(r, 3500));
  console.log('Current URL after login attempt:', page.url());

  // Navigate to RFQ Workspace
  console.log('Navigating to RFQ workspace...');
  await page.goto('http://localhost:3000/procurement/rfqs/RFQ-DEMO-001?demo=true', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 3500));
  console.log('RFQ page loaded:', page.url());

  const artifactPath = path.join(
    'C:\\Users\\Lenovo\\.gemini\\antigravity-ide\\brain\\10150d0a-bb23-426d-9f85-5bf099b06ee4',
    'rfq_negotiation_table_authenticated.png'
  );

  await page.screenshot({ path: artifactPath, fullPage: false });
  console.log('Screenshot saved to:', artifactPath);

  // Scroll horizontal table to the right to capture the final columns
  const tableContainer = await page.$('#rfq-commercial-table-container');
  if (tableContainer) {
    await page.evaluate(el => {
      el.scrollLeft = el.scrollWidth;
    }, tableContainer);
    await new Promise(r => setTimeout(r, 1500));

    const scrolledPath = path.join(
      'C:\\Users\\Lenovo\\.gemini\\antigravity-ide\\brain\\10150d0a-bb23-426d-9f85-5bf099b06ee4',
      'rfq_negotiation_table_scrolled_right.png'
    );
    await page.screenshot({ path: scrolledPath, fullPage: false });
    console.log('Scrolled right screenshot saved to:', scrolledPath);
  } else {
    console.log('Table container #rfq-commercial-table-container not found on page');
  }

  // Click "Simulate 3 Received Quotes" or "Load Full Walkthrough" button to see populated numbers
  try {
    const simulateBtn = await page.$('button ::-p-text(Simulate 3 Received Quotes)') || await page.$('button:has-text("Simulate 3 Received Quotes")');
    if (simulateBtn) {
      console.log('Clicking Simulate 3 Received Quotes...');
      await simulateBtn.click();
      await new Promise(r => setTimeout(r, 2000));
    } else {
      // Try finding by text in page evaluate
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.textContent && b.textContent.includes('Simulate 3 Received Quotes'));
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 2000));
    }

    // Scroll back to middle to show AI rate and populated vendor rates side by side
    if (tableContainer) {
      await page.evaluate(el => {
        el.scrollLeft = 250;
      }, tableContainer);
      await new Promise(r => setTimeout(r, 1000));
    }

    const populatedPath = path.join(
      'C:\\Users\\Lenovo\\.gemini\\antigravity-ide\\brain\\10150d0a-bb23-426d-9f85-5bf099b06ee4',
      'rfq_negotiation_table_with_quotes.png'
    );
    await page.screenshot({ path: populatedPath, fullPage: false });
    console.log('Populated quotes screenshot saved to:', populatedPath);
  } catch (err) {
    console.error('Error simulating quotes:', err);
  }

  await browser.close();
}

capture().catch(err => {
  console.error('Capture error:', err);
  process.exit(1);
});
