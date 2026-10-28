import { chromium } from 'playwright-core';

const BROWSER_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function main() {
  const browser = await chromium.launch({ executablePath: BROWSER_PATH, headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 950 } })).newPage();

  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await page.click('button:has-text("Category Manager")');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Sign In")');
  await page.waitForTimeout(1500);

  await page.goto('http://localhost:3000/procurement/rate-cards?view=negotiation', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const cardInfo = await page.evaluate(() => {
    // find all cards in SummaryCardGrid
    const grid = document.querySelector('.grid.items-stretch');
    if (!grid) return { error: 'grid not found' };
    const cards = Array.from(grid.children);
    return cards.map(c => {
      const el = c as HTMLElement;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return {
        text: el.innerText.replace(/\n/g, ' | '),
        className: el.className,
        width: rect.width,
        height: rect.height,
        paddingTop: style.paddingTop,
        paddingBottom: style.paddingBottom,
        paddingLeft: style.paddingLeft,
        paddingRight: style.paddingRight,
        border: style.border,
      };
    });
  });

  console.log('Evaluated Cards:', JSON.stringify(cardInfo, null, 2));

  const navInfo = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Workflow Navigation"]');
    if (!nav) return { error: 'nav not found' };
    const rect = nav.getBoundingClientRect();
    const buttons = Array.from(nav.querySelectorAll('button')).map(b => {
      const btn = b as HTMLElement;
      const bRect = btn.getBoundingClientRect();
      return {
        text: btn.innerText.replace(/\n/g, ' '),
        width: bRect.width,
        height: bRect.height,
      };
    });
    return { navRect: rect, buttons };
  });

  console.log('Evaluated Nav:', JSON.stringify(navInfo, null, 2));

  await browser.close();
}

main().catch(console.error);
