const puppeteer = require('puppeteer-core');
const path = require('path');

async function main() {
  const artifactDir = 'C:\\Users\\Lenovo\\.gemini\\antigravity-ide\\brain\\10150d0a-bb23-426d-9f85-5bf099b06ee4';
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();

  try {
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
    await page.click('#work-email');
    await page.type('#work-email', 'category.manager@procucev-demo.local');
    await page.click('#password');
    await page.type('#password', 'Demo@1234');
    await page.click('button[type="submit"]');
    await new Promise((r) => setTimeout(r, 2000));

    await page.goto('http://localhost:3000/procurement/rfqs/new', { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 2000));

    // Step through to Step 5
    for (let s = 1; s <= 4; s++) {
      await page.evaluate((stepNum) => {
        const btn = Array.from(document.querySelectorAll('button')).find((b) =>
          b.textContent.includes('Continue to Step ' + (stepNum + 1))
        );
        if (btn) btn.click();
      }, s);
      await new Promise((r) => setTimeout(r, 1200));
    }

    // Scroll down to show checklist & bottom action bar
    await page.evaluate(() => window.scrollBy(0, 600));
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({
      path: path.join(artifactDir, 'rfq_step5_scrolled_checklist_bottombar.png'),
    });

    // Click Release RFQ to Vendors to trigger modal
    await page.evaluate(() => {
      const releaseBtn = Array.from(document.querySelectorAll('button')).find((b) =>
        b.textContent.includes('Release RFQ to Vendors')
      );
      if (releaseBtn) releaseBtn.click();
    });
    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({
      path: path.join(artifactDir, 'rfq_step5_release_confirmation_modal.png'),
    });

    console.log('Step 5 modal and scrolled checklist captured successfully!');
  } finally {
    await browser.close();
  }
}

main();
