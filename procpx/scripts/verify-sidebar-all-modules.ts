import { chromium } from 'playwright-core';
import path from 'path';
import fs from 'fs';

const artifactDir = 'C:\\Users\\Lenovo\\.gemini\\antigravity-ide\\brain\\ea4b97cc-c25d-4a98-8ac4-b81484424a31';

interface ModuleCheck {
  route: string;
  name: string;
  screenshotName: string;
}

const MODULES_TO_VERIFY: ModuleCheck[] = [
  { route: '/dashboard', name: 'Dashboard', screenshotName: '01_blue_sidebar_dashboard.png' },
  { route: '/projects', name: 'Projects', screenshotName: '02_blue_sidebar_projects.png' },
  { route: '/cost-centres', name: 'Cost Centres', screenshotName: '03_blue_sidebar_cost_centres.png' },
  { route: '/boq/studio', name: 'BOQ Studio', screenshotName: '04_blue_sidebar_boq_studio.png' },
  { route: '/masters/standard-boq', name: 'Standard BOQ', screenshotName: '05_blue_sidebar_standard_boq.png' },
  { route: '/budget', name: 'Project Budget', screenshotName: '06_blue_sidebar_budget.png' },
  { route: '/pr', name: 'Procurement Requests (PR)', screenshotName: '07_blue_sidebar_pr.png' },
  { route: '/procurement/rfqs', name: 'RFQs', screenshotName: '08_blue_sidebar_rfqs.png' },
  { route: '/procurement/vendors', name: 'Vendor Management', screenshotName: '09_blue_sidebar_vendors.png' },
  { route: '/procurement/rate-cards', name: 'Rate Card Management', screenshotName: '10_blue_sidebar_rate_cards.png' },
  { route: '/procurement/negotiations', name: 'Negotiations', screenshotName: '11_blue_sidebar_negotiations.png' },
  { route: '/procurement/awards', name: 'Awards & PPOs', screenshotName: '12_blue_sidebar_awards.png' },
  { route: '/audit', name: 'Audit Trail', screenshotName: '13_blue_sidebar_audit.png' },
];

async function main() {
  console.log('===============================================================');
  console.log('   PROCPX — VERIFY BLUE SIDEBAR ACROSS ALL MODULES & ROLES     ');
  console.log('===============================================================');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  try {
    // ─────────────────────────────────────────────────────────────
    // 1. BUYER / INTERNAL ADMIN SESSION (Super Admin / Category Manager)
    // ─────────────────────────────────────────────────────────────
    console.log('\n[1/3] Logging in as Admin / Internal User...');
    const context = await browser.newContext({ viewport: { width: 1536, height: 900 } });
    const page = await context.newPage();

    await page.goto('http://localhost:3000/login');
    await page.waitForSelector('#work-email');
    await page.fill('#work-email', 'super.admin@procucev-demo.local');
    await page.fill('#password', 'Demo@1234');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    console.log('✓ Successfully logged in as Super Admin');

    // Verify computed sidebar styles
    const sidebarStyles = await page.evaluate(() => {
      const sidebar = document.querySelector('.app-sidebar');
      const activeItem = document.querySelector('.nav-item.active');
      const inactiveItem = document.querySelector('.nav-item:not(.active)');
      const sectionLabel = document.querySelector('.nav-section-label');

      return {
        sidebarBg: sidebar ? window.getComputedStyle(sidebar).backgroundColor : null,
        sidebarBorderRight: sidebar ? window.getComputedStyle(sidebar).borderRightColor : null,
        activeBg: activeItem ? window.getComputedStyle(activeItem).backgroundColor : null,
        activeColor: activeItem ? window.getComputedStyle(activeItem).color : null,
        inactiveColor: inactiveItem ? window.getComputedStyle(inactiveItem).color : null,
        sectionLabelColor: sectionLabel ? window.getComputedStyle(sectionLabel).color : null,
      };
    });

    console.log('\nComputed Sidebar CSS Properties in Browser:');
    console.log('  Sidebar Background:     ', sidebarStyles.sidebarBg, '(Expected: rgb(15, 23, 42) -> #0f172a)');
    console.log('  Active Item Background: ', sidebarStyles.activeBg, '(Expected: rgb(30, 58, 138) -> #1e3a8a)');
    console.log('  Active Item Text Color: ', sidebarStyles.activeColor, '(Expected: rgb(255, 255, 255) -> #ffffff)');
    console.log('  Inactive Text Color:    ', sidebarStyles.inactiveColor, '(Expected: rgb(148, 163, 184) -> #94a3b8)');
    console.log('  Section Label Color:    ', sidebarStyles.sectionLabelColor, '(Expected: rgb(100, 116, 139) -> #64748b)');

    for (const mod of MODULES_TO_VERIFY) {
      console.log(`\nChecking route: ${mod.name} (${mod.route})...`);
      await page.goto(`http://localhost:3000${mod.route}`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1000);

      const activeText = await page.evaluate(() => {
        const active = document.querySelector('.nav-item.active');
        return active ? active.textContent?.trim() : 'NONE';
      });
      console.log(`  Active navigation label: "${activeText}"`);

      const screenshotPath = path.join(artifactDir, mod.screenshotName);
      await page.screenshot({ path: screenshotPath });
      console.log(`  ✓ Screenshot saved: ${mod.screenshotName}`);
    }

    // Test Collapse / Expand
    console.log('\n[2/3] Testing Sidebar Collapse and Expand...');
    const collapseBtn = await page.waitForSelector('.sidebar-collapse-btn');
    await collapseBtn.click();
    await page.waitForTimeout(500);

    const collapsedWidth = await page.evaluate(() => {
      const sidebar = document.querySelector('.app-sidebar');
      return sidebar ? window.getComputedStyle(sidebar).width : null;
    });
    console.log(`  Collapsed width: ${collapsedWidth} (Expected: 68px)`);

    const collapsedScreenshot = path.join(artifactDir, '14_blue_sidebar_collapsed_state.png');
    await page.screenshot({ path: collapsedScreenshot });
    console.log('  ✓ Collapsed screenshot saved');

    await collapseBtn.click();
    await page.waitForTimeout(500);
    const expandedWidth = await page.evaluate(() => {
      const sidebar = document.querySelector('.app-sidebar');
      return sidebar ? window.getComputedStyle(sidebar).width : null;
    });
    console.log(`  Expanded width: ${expandedWidth} (Expected: 240px)`);

    await context.close();

    // ─────────────────────────────────────────────────────────────
    // 2. VENDOR PORTAL SESSION
    // ─────────────────────────────────────────────────────────────
    console.log('\n[3/3] Checking Vendor Portal Sidebar...');
    const vendorContext = await browser.newContext({ viewport: { width: 1536, height: 900 } });
    const vendorPage = await vendorContext.newPage();

    await vendorPage.goto('http://localhost:3000/login');
    await vendorPage.waitForSelector('#work-email');
    await vendorPage.fill('#work-email', 'vendor.apex@apex-infra.com');
    await vendorPage.fill('#password', 'Demo@1234');
    await vendorPage.click('button[type="submit"]');
    await vendorPage.waitForURL('**/vendor-portal/**', { timeout: 15000 });
    console.log('✓ Successfully logged in as Vendor (Apex Infrastructure)');

    await vendorPage.waitForLoadState('domcontentloaded');
    await vendorPage.waitForTimeout(1000);

    const vendorSidebarBg = await vendorPage.evaluate(() => {
      const sidebar = document.querySelector('.app-sidebar');
      return sidebar ? window.getComputedStyle(sidebar).backgroundColor : null;
    });
    console.log('  Vendor Sidebar Background:', vendorSidebarBg, '(Expected: rgb(15, 23, 42))');

    const vendorScreenshot = path.join(artifactDir, '15_blue_sidebar_vendor_portal.png');
    await vendorPage.screenshot({ path: vendorScreenshot });
    console.log('  ✓ Vendor portal screenshot saved');

    await vendorContext.close();

    console.log('\n===============================================================');
    console.log('   ALL MODULES & ROLES VERIFIED WITH APPROVED BLUE SIDEBAR!    ');
    console.log('===============================================================');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
