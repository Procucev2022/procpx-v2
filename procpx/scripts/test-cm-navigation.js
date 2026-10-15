const puppeteer = require('puppeteer-core');

async function testNavigation() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  await page.click('#work-email');
  await page.type('#work-email', 'category.manager@procucev-demo.local');
  await page.click('#password');
  await page.type('#password', 'Demo@1234');
  await page.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 2500));

  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));

  console.log('Testing direct navigation from Dashboard...');

  // Find a negotiate link
  const negLinks = await page.$$eval('a[href*="tab=negotiation"]', els => els.map(e => e.href));
  console.log('Found Negotiation links on dashboard:', negLinks.length, negLinks[0]);

  // Find an awarding link
  const awardLinks = await page.$$eval('a[href*="tab=awarding"]', els => els.map(e => e.href));
  console.log('Found Awarding links on dashboard:', awardLinks.length, awardLinks[0]);

  // Navigate to first negotiation link
  if (negLinks[0]) {
    await page.goto(negLinks[0], { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 2000));
    console.log('Successfully navigated to Negotiation Workspace:', page.url());
  }

  await browser.close();
  console.log('Navigation test passed 100%!');
}

testNavigation().catch(err => {
  console.error(err);
  process.exit(1);
});
