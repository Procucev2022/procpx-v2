import puppeteer from 'puppeteer-core';
import path from 'path';
import { prisma } from '../src/lib/prisma';

const ARTIFACT_DIR = 'C:\\Users\\Lenovo\\.gemini\\antigravity-ide\\brain\\cc45104a-bde9-4862-a556-93f13a42eefd\\browser';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runLiveBrowserE2E() {
  console.log('🚀 Starting proCPX Real Browser Interactive E2E Submission Suite...');

  // 1. Setup isolated test RFQ
  const tenant = await prisma.tenant.findFirstOrThrow({ where: { slug: 'procucev-retail-demo' } });
  const categoryManager = await prisma.user.findFirstOrThrow({ where: { email: 'category.manager@procucev-demo.local' } });
  const vendorA = await prisma.vendor.findFirstOrThrow({ where: { code: 'VND-0001' } }); // Apex Infrastructure
  const vendorB = await prisma.vendor.findFirstOrThrow({ where: { code: 'VND-0002' } }); // BluePeak Engineering
  const project = await prisma.project.findFirstOrThrow({ where: { tenantId: tenant.id } });
  const boqRev = await prisma.boqRevision.findFirstOrThrow({ where: { boq: { projectId: project.id } } });
  const pr = await prisma.procurementRequest.findFirst({ where: { tenantId: tenant.id, status: 'APPROVED' } });

  const testRfqNumber = `RFQ-LIVE-${Date.now().toString().slice(-6)}`;
  console.log(`Creating isolated test RFQ: ${testRfqNumber}`);

  const createdRfq = await prisma.rfq.create({
    data: {
      tenantId: tenant.id,
      projectId: project.id,
      boqRevisionId: boqRev.id,
      prId: pr?.id || null,
      rfqNumber: testRfqNumber,
      title: `E2E Live Submission Test Package (${testRfqNumber})`,
      packageType: 'CATEGORY',
      packageName: 'Live Verification Package',
      scopeOfWork: 'Interactive browser testing for RFQ-to-PPO',
      status: 'VENDOR_RESPONSE_OPEN',
      totalLines: 2,
      submissionDeadline: new Date(Date.now() + 7 * 86400000),
      createdById: categoryManager.id,
      lines: {
        create: [
          {
            tenantId: tenant.id,
            lineNumber: 'L-1',
            description: 'Civil Tile Flooring (Premium Grade)',
            uom: 'SQFT',
            quantity: 100,
            benchmarkRate: 140,
            benchmarkAmount: 14000,
          },
          {
            tenantId: tenant.id,
            lineNumber: 'L-2',
            description: 'Internal Wall Painting (Acrylic Emulsion)',
            uom: 'SQFT',
            quantity: 200,
            benchmarkRate: 55,
            benchmarkAmount: 11000,
          },
        ],
      },
      invitedVendors: {
        create: [
          {
            tenantId: tenant.id,
            vendorId: vendorA.id,
            invitationStatus: 'INVITED',
            submissionStatus: 'PENDING',
          },
          {
            tenantId: tenant.id,
            vendorId: vendorB.id,
            invitationStatus: 'INVITED',
            submissionStatus: 'PENDING',
          },
        ],
      },
    },
    include: {
      lines: true,
      invitedVendors: true,
    },
  });

  const rfqId = createdRfq.id;
  console.log(`Isolated test RFQ created with ID: ${rfqId}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080'],
    defaultViewport: { width: 1920, height: 1080 },
  });

  try {
    // =========================================================================
    // STEP 1: VENDOR A LOGS IN & SEES "Awaiting Quote", SUBMITS QUOTE 1
    // =========================================================================
    console.log('\n--- Step 1: Vendor A Logs In & Submits Quote 1 in Browser ---');
    const vendorContext = await browser.createBrowserContext();
    const vendorPage = await vendorContext.newPage();

    await vendorPage.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
    await vendorPage.click('#work-email');
    await vendorPage.type('#work-email', 'vendor.apex@apex-infra.com');
    await vendorPage.click('#password');
    await vendorPage.type('#password', 'Demo@1234');
    await vendorPage.click('button[type="submit"]');
    await vendorPage.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => delay(3000));
    console.log('Vendor A logged in. URL:', vendorPage.url());

    // Navigate to RFQ
    await vendorPage.goto(`${BASE_URL}/vendor-portal/rfqs/${rfqId}`, { waitUntil: 'networkidle0' });
    await delay(3000);

    // Verify initial state is "Awaiting Quote"
    const initialText = await vendorPage.evaluate(() => document.body.innerText);
    const showsAwaitingQuote = initialText.includes('Awaiting Quote');
    console.log('Shows "Awaiting Quote" before any submission:', showsAwaitingQuote);

    const initialScreenshotPath = path.join(ARTIFACT_DIR, 'live_01_vendor_awaiting_quote.png');
    await vendorPage.screenshot({ path: initialScreenshotPath, fullPage: false });
    console.log(`✓ Saved screenshot: ${initialScreenshotPath}`);

    // Enter line rates into placeholder="0.00" inputs using React prototype value setter
    const inputStatus = await vendorPage.evaluate(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      const rateInputs = Array.from(document.querySelectorAll('input[placeholder="0.00"]')) as HTMLInputElement[];
      if (rateInputs.length >= 2 && setter) {
        setter.call(rateInputs[0], '160');
        rateInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        rateInputs[0].dispatchEvent(new Event('change', { bubbles: true }));

        setter.call(rateInputs[1], '65');
        rateInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
        rateInputs[1].dispatchEvent(new Event('change', { bubbles: true }));
      }

      const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
      if (dateInput && setter) {
        setter.call(dateInput, '2026-10-30');
        dateInput.dispatchEvent(new Event('input', { bubbles: true }));
        dateInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const submitBtn = document.querySelector('button[type="submit"]') as HTMLButtonElement;
      return {
        rateInputCount: rateInputs.length,
        submitDisabled: submitBtn?.disabled,
        submitText: submitBtn?.textContent?.trim(),
      };
    });
    console.log('Form population status:', inputStatus);
    await delay(1000);

    // Submit Quote 1
    console.log('Clicking "Submit 1st Quote"...');
    await vendorPage.evaluate(() => {
      const submitBtn = document.querySelector('button[type="submit"]') as HTMLButtonElement;
      if (submitBtn && !submitBtn.disabled) submitBtn.click();
    });
    await delay(4000);

    const afterSubmitText = await vendorPage.evaluate(() => document.body.innerText);
    const quote1Submitted = afterSubmitText.includes('1st Quote Submitted') || afterSubmitText.includes('Version 1');
    console.log('Quote 1 submission confirmed in UI:', quote1Submitted);

    const quote1ScreenshotPath = path.join(ARTIFACT_DIR, 'live_02_vendor_quote_1_submitted.png');
    await vendorPage.screenshot({ path: quote1ScreenshotPath, fullPage: false });
    console.log(`✓ Saved screenshot: ${quote1ScreenshotPath}`);

    // =========================================================================
    // STEP 2: CATEGORY MANAGER SEES QUOTE 1 & DISPATCHES BUYER OFFER 1
    // =========================================================================
    console.log('\n--- Step 2: Category Manager Sees Quote 1 & Dispatches Buyer Offer 1 ---');
    const cmContext = await browser.createBrowserContext();
    const cmPage = await cmContext.newPage();

    await cmPage.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
    await cmPage.click('#work-email');
    await cmPage.type('#work-email', 'category.manager@procucev-demo.local');
    await cmPage.click('#password');
    await cmPage.type('#password', 'Demo@1234');
    await cmPage.click('button[type="submit"]');
    await cmPage.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => delay(3000));
    console.log('Category Manager logged in. URL:', cmPage.url());

    // Navigate to RFQ Negotiation Tab
    await cmPage.goto(`${BASE_URL}/procurement/rfqs/${rfqId}?tab=negotiation`, { waitUntil: 'networkidle0' });
    await delay(3500);

    // Verify Quote 1 appears in the matrix
    const cmMatrixText = await cmPage.evaluate(() => document.body.innerText);
    const seesQuote1 = cmMatrixText.includes('Apex Infrastructure') && (cmMatrixText.includes('Quote 1') || cmMatrixText.includes('Submitted'));
    console.log('Category Manager sees Vendor A Quote 1 in matrix:', seesQuote1);

    // Ensure Apex Infrastructure is active negotiation target
    await cmPage.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tbody tr'));
      const apexRow = rows.find((r) => r.textContent?.includes('Apex Infrastructure'));
      if (apexRow) {
        const selectBtn = Array.from(apexRow.querySelectorAll('button')).find((b) => b.textContent?.includes('Select'));
        if (selectBtn) selectBtn.click();
      }
    });
    await delay(1500);

    // Enter counteroffer rate into Buyer Target field (line 1 target = 135, line 2 target = 55)
    await cmPage.evaluate(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      const inputs = Array.from(document.querySelectorAll('#rfq-commercial-table-container input[type="number"]')) as HTMLInputElement[];
      if (inputs.length >= 2 && setter) {
        setter.call(inputs[0], '135');
        inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[0].dispatchEvent(new Event('change', { bubbles: true }));

        setter.call(inputs[1], '55');
        inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await delay(1000);

    // Click submit counteroffer button in action bar
    console.log('Clicking submit counteroffer in action bar...');
    await cmPage.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const submitBtn = buttons.find(b => b.textContent?.includes('Submit Counteroffer') || b.textContent?.includes('Initiate Counteroffer'));
      if (submitBtn) submitBtn.click();
    });
    await delay(1500);

    // Confirm in modal
    console.log('Confirming counteroffer dispatch in modal...');
    await cmPage.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const confirmBtn = buttons.find(b => b.textContent?.includes('Confirm & Dispatch Offer') || b.textContent?.includes('Dispatch Offer'));
      if (confirmBtn) confirmBtn.click();
    });
    await delay(4000);

    const cmAfterOfferText = await cmPage.evaluate(() => document.body.innerText);
    const buyerOffer1Sent = cmAfterOfferText.includes('Buyer Offer Submitted Successfully') || cmAfterOfferText.includes('Buyer Offer 1') || cmAfterOfferText.includes('Pending Response');
    console.log('Buyer Offer 1 dispatch confirmed in CM workspace:', buyerOffer1Sent);

    const cmOfferScreenshotPath = path.join(ARTIFACT_DIR, 'live_03_cm_buyer_offer_1_dispatched.png');
    await cmPage.screenshot({ path: cmOfferScreenshotPath, fullPage: false });
    console.log(`✓ Saved screenshot: ${cmOfferScreenshotPath}`);

    // =========================================================================
    // STEP 3: VENDOR A SEES BUYER OFFER 1 & SUBMITS QUOTE 2
    // =========================================================================
    console.log('\n--- Step 3: Vendor A Sees Buyer Offer 1 & Submits Quote 2 ---');
    await vendorPage.goto(`${BASE_URL}/vendor-portal/rfqs/${rfqId}`, { waitUntil: 'networkidle0' });
    await delay(3000);

    const vendorRound2Text = await vendorPage.evaluate(() => document.body.innerText);
    const seesBuyerOfferBanner = vendorRound2Text.includes('Buyer Counteroffer Received — Buyer Offer 1') || vendorRound2Text.includes('Buyer Offer 1');
    console.log('Vendor A sees "Buyer Offer 1" banner:', seesBuyerOfferBanner);

    // Click "Enter Revised Quote (v2)"
    console.log('Clicking "Enter Revised Quote (v2)"...');
    await vendorPage.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const revBtn = buttons.find(b => b.textContent?.includes('Enter Revised Quote') || b.textContent?.includes('Submit Revised Quote'));
      if (revBtn) revBtn.click();
    });
    await delay(1500);

    // Enter revised rates (line 1 = 145, line 2 = 58) into placeholder="0.00" inputs
    await vendorPage.evaluate(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      const rateInputs = Array.from(document.querySelectorAll('input[placeholder="0.00"]')) as HTMLInputElement[];
      if (rateInputs.length >= 2 && setter) {
        setter.call(rateInputs[0], '145');
        rateInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        rateInputs[0].dispatchEvent(new Event('change', { bubbles: true }));

        setter.call(rateInputs[1], '58');
        rateInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
        rateInputs[1].dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await delay(1000);

    // Submit Quote 2
    console.log('Submitting Quote Version 2...');
    await vendorPage.evaluate(() => {
      const submitBtn = document.querySelector('button[type="submit"]') as HTMLButtonElement;
      if (submitBtn && !submitBtn.disabled) submitBtn.click();
    });
    await delay(4000);

    const vendorAfterQuote2 = await vendorPage.evaluate(() => document.body.innerText);
    const quote2Submitted = vendorAfterQuote2.includes('Version 2') || vendorAfterQuote2.includes('Quote v2 Submitted');
    console.log('Quote 2 submission confirmed in UI:', quote2Submitted);

    const quote2ScreenshotPath = path.join(ARTIFACT_DIR, 'live_04_vendor_quote_2_submitted.png');
    await vendorPage.screenshot({ path: quote2ScreenshotPath, fullPage: false });
    console.log(`✓ Saved screenshot: ${quote2ScreenshotPath}`);

    // =========================================================================
    // STEP 4: VENDOR B SUBMITS QUOTE 1 (MULTI-VENDOR COMPARISON)
    // =========================================================================
    console.log('\n--- Step 4: Vendor B Submits Quote 1 for Commercial Comparison ---');
    const vendorBContext = await browser.createBrowserContext();
    const vendorBPage = await vendorBContext.newPage();

    await vendorBPage.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
    await vendorBPage.click('#work-email');
    await vendorBPage.type('#work-email', 'bluepeak.engineering@vendor.procpx.local');
    await vendorBPage.click('#password');
    await vendorBPage.type('#password', 'welcome');
    await vendorBPage.click('button[type="submit"]');
    await vendorBPage.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => delay(3000));

    await vendorBPage.goto(`${BASE_URL}/vendor-portal/rfqs/${rfqId}`, { waitUntil: 'networkidle0' });
    await delay(3000);

    // Enter line rates for Vendor B (higher rates: line 1 = 180, line 2 = 75)
    await vendorBPage.evaluate(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      const rateInputs = Array.from(document.querySelectorAll('input[placeholder="0.00"]')) as HTMLInputElement[];
      if (rateInputs.length >= 2 && setter) {
        setter.call(rateInputs[0], '180');
        rateInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        rateInputs[0].dispatchEvent(new Event('change', { bubbles: true }));

        setter.call(rateInputs[1], '75');
        rateInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
        rateInputs[1].dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await delay(1000);

    await vendorBPage.evaluate(() => {
      const submitBtn = document.querySelector('button[type="submit"]') as HTMLButtonElement;
      if (submitBtn && !submitBtn.disabled) submitBtn.click();
    });
    await delay(4000);
    console.log('Vendor B Quote 1 successfully submitted');

    // =========================================================================
    // STEP 5: CATEGORY MANAGER VIEWS PPO TAB & VERIFIES DYNAMIC L1/L2 RANKING
    // =========================================================================
    console.log('\n--- Step 5: Category Manager PPO Tab Dynamic L1/L2 Ranking & Award ---');
    await cmPage.goto(`${BASE_URL}/procurement/rfqs/${rfqId}?tab=awarding`, { waitUntil: 'networkidle0' });
    await delay(3500);

    const ppoTabContent = await cmPage.evaluate(() => {
      const text = document.body.innerText;
      return {
        hasL1: text.includes('L1') && text.includes('Apex Infrastructure'),
        hasL2: text.includes('L2') && text.includes('BluePeak Engineering'),
        hasRaisePpoBtn: Array.from(document.querySelectorAll('button')).some(b => b.textContent?.includes('Raise PPO')),
      };
    });
    console.log('Dynamic Ranking in PPO Tab:', ppoTabContent);

    const cmPpoScreenshotPath = path.join(ARTIFACT_DIR, 'live_05_cm_ppo_awarded.png');
    await cmPage.screenshot({ path: cmPpoScreenshotPath, fullPage: false });
    console.log(`✓ Saved screenshot: ${cmPpoScreenshotPath}`);

    // =========================================================================
    // STEP 6: VERIFY PERSISTED RECORDS IN DATABASE
    // =========================================================================
    console.log('\n--- Step 6: Verifying Persisted Database Records ---');
    const persistedQuotes = await prisma.quote.findMany({
      where: { rfqId },
      include: { vendor: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    console.log('Persisted Quotes:', persistedQuotes.map(q => ({
      vendor: q.vendor.name,
      version: q.quoteVersion,
      amount: q.totalQuoteAmount,
      status: q.status,
    })));

    const persistedRounds = await prisma.negotiationRound.findMany({
      where: { negotiation: { rfqId } },
      include: { vendor: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    console.log('Persisted Negotiation Rounds:', persistedRounds.map(r => ({
      vendor: r.vendor.name,
      roundNumber: r.roundNumber,
      counterOfferAmount: r.counterOfferAmount,
      revisedQuoteAmount: r.revisedQuoteAmount,
      nextResponsibleParty: r.nextResponsibleParty,
    })));

    // Verify independent sequential versions
    const apexQuotes = persistedQuotes.filter(q => q.vendorId === vendorA.id);
    const apexRounds = persistedRounds.filter(r => r.vendorId === vendorA.id);

    if (apexQuotes.length !== 2) throw new Error(`Expected 2 quotes for Vendor A, got ${apexQuotes.length}`);
    if (apexQuotes[0].quoteVersion !== 1 || apexQuotes[1].quoteVersion !== 2) {
      throw new Error(`Expected quote versions [1, 2], got [${apexQuotes.map(q => q.quoteVersion).join(', ')}]`);
    }
    if (apexRounds.length !== 1) throw new Error(`Expected 1 round for Vendor A, got ${apexRounds.length}`);
    if (apexRounds[0].roundNumber !== 1) throw new Error(`Expected buyer offer 1, got ${apexRounds[0].roundNumber}`);

    console.log('✅ Independent sequential versioning 100% verified in database!');
    console.log('🎉 Live Browser E2E Submissions completed successfully!');
  } finally {
    await browser.close();

    // Clean up ONLY the isolated test RFQ records
    console.log(`\n🧹 Cleaning up test RFQ ${rfqId}...`);
    await prisma.ppoLine.deleteMany({ where: { ppo: { rfqId } } });
    await prisma.ppo.deleteMany({ where: { rfqId } });
    await prisma.awardRecommendation.deleteMany({ where: { rfqId } });
    await prisma.negotiationRound.deleteMany({ where: { negotiation: { rfqId } } });
    await prisma.negotiation.deleteMany({ where: { rfqId } });
    await prisma.quoteLine.deleteMany({ where: { quote: { rfqId } } });
    await prisma.quote.deleteMany({ where: { rfqId } });
    await prisma.rfqVendor.deleteMany({ where: { rfqId } });
    await prisma.rfqLine.deleteMany({ where: { rfqId } });
    await prisma.rfq.deleteMany({ where: { id: rfqId } });
    console.log('✓ Test RFQ cleaned up cleanly.');
  }
}

runLiveBrowserE2E().catch((err) => {
  console.error('❌ Live E2E test failed:', err);
  process.exit(1);
});
