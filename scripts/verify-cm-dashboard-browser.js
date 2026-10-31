const puppeteer = require('puppeteer-core');
const path = require('path');

async function main() {
  console.log('Launching Chrome for Category Manager Gateway verification...');
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080'],
    defaultViewport: { width: 1920, height: 1080 },
  });

  const page = await browser.newPage();

  // 1. Log in as Category Manager
  console.log('Navigating to login page...');
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  await page.click('#work-email');
  await page.type('#work-email', 'category.manager@procucev-demo.local');
  await page.click('#password');
  await page.type('#password', 'Demo@1234');
  console.log('Submitting login credentials...');
  await page.click('button[type="submit"]');

  await new Promise((r) => setTimeout(r, 3000));
  console.log('Current URL after login:', page.url());

  // 2. Ensure we are on Dashboard
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 3000));

  // 3. Screenshot Category Manager Dashboard Gateway
  const artifactDir = 'C:\\Users\\Lenovo\\.gemini\\antigravity-ide\\brain\\10150d0a-bb23-426d-9f85-5bf099b06ee4';
  const gatewayPath = path.join(artifactDir, 'cm_dashboard_sourcing_gateway.png');
  await page.screenshot({ path: gatewayPath, fullPage: false });
  console.log('Captured cm_dashboard_sourcing_gateway.png');

  // 4. Scroll down slightly and capture expanded BOQ lifecycle
  await page.evaluate(() => {
    window.scrollBy(0, 400);
  });
  await new Promise((r) => setTimeout(r, 1000));
  const expandedPath = path.join(artifactDir, 'cm_dashboard_boq_lifecycle_expanded.png');
  await page.screenshot({ path: expandedPath, fullPage: false });
  console.log('Captured cm_dashboard_boq_lifecycle_expanded.png');

  // 5. Verify Sidebar entries on the page
  const sidebarItems = await page.evaluate(() => {
    const navItems = Array.from(document.querySelectorAll('.app-sidebar .nav-item'));
    return navItems.map((el) => el.textContent?.trim());
  });
  console.log('Category Manager Sidebar items:', JSON.stringify(sidebarItems, null, 2));

  // 6. Verify that other role (Vendor Portal) remains unaffected
  console.log('Checking Vendor Portal login and sidebar...');
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  // Clear and type vendor credentials
  await page.evaluate(() => {
    const emailEl = document.querySelector('#work-email');
    if (emailEl) (emailEl).value = '';
    const passEl = document.querySelector('#password');
    if (passEl) (passEl).value = '';
  });
  await page.click('#work-email');
  await page.type('#work-email', 'vendor.apex@apex-infra.com');
  await page.click('#password');
  await page.type('#password', 'Demo@1234');
  await page.click('button[type="submit"]');
  await new Promise((r) => setTimeout(r, 3000));
  console.log('Vendor logged in URL:', page.url());

  const vendorSidebarItems = await page.evaluate(() => {
    const navItems = Array.from(document.querySelectorAll('.app-sidebar .nav-item'));
    return navItems.map((el) => el.textContent?.trim());
  });
  console.log('Vendor Sidebar items:', JSON.stringify(vendorSidebarItems, null, 2));

  const vendorPath = path.join(artifactDir, 'vendor_portal_sidebar_unaffected.png');
  await page.screenshot({ path: vendorPath, fullPage: false });
  console.log('Captured vendor_portal_sidebar_unaffected.png');

  await browser.close();
  console.log('Browser verification completed successfully!');
}

main().catch((err) => {
  console.error('Browser verification failed:', err);
  process.exit(1);
});
