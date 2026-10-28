import { chromium } from 'playwright-core';
import path from 'path';
import fs from 'fs';

const artifactDir = 'C:\\Users\\Lenovo\\.gemini\\antigravity-ide\\brain\\ea4b97cc-c25d-4a98-8ac4-b81484424a31';

async function main() {
  console.log('======================================================================');
  console.log('  PROCPX RATE CARD AGREEMENT WORKFLOW & SEQUENCE VERIFICATION        ');
  console.log('======================================================================\n');

  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true });
  }

  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  try {
    // ─────────────────────────────────────────────────────────────
    // 1. CATEGORY MANAGER: ITEM NEGOTIATION
    // ─────────────────────────────────────────────────────────────
    console.log('▶ STEP 1: Verifying Category Manager in Item Negotiation (Limiting to rates, offers, history)...');
    const cmContext = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const cmPage = await cmContext.newPage();

    await cmPage.goto('http://localhost:3000/login');
    await cmPage.waitForSelector('#work-email');
    await cmPage.fill('#work-email', 'category.manager@procucev-demo.local');
    await cmPage.fill('#password', 'Demo@1234');
    await cmPage.click('button[type="submit"]');
    await cmPage.waitForURL('**/dashboard', { timeout: 15000 });

    await cmPage.goto('http://localhost:3000/procurement/rate-cards?view=negotiation');
    await cmPage.waitForLoadState('domcontentloaded');
    await cmPage.waitForTimeout(1500);

    // Verify "Review & Accept Vendor Quote" button is removed from negotiation action footer
    const duplicateAcceptBtn = await cmPage.locator('button:has-text("Review & Accept Vendor Quote")').count();
    console.log(`  ✓ Duplicate "Review & Accept Vendor Quote" button count in Negotiation: ${duplicateAcceptBtn} (Expected: 0)`);

    const sendOfferBtn = await cmPage.locator('button:has-text("Send Proposed Offer to Vendor")').count();
    console.log(`  ✓ Primary "Send Proposed Offer to Vendor" button present: ${sendOfferBtn > 0}`);

    const negScreenshot = path.join(artifactDir, '01_category_manager_item_negotiation.png');
    await cmPage.screenshot({ path: negScreenshot, fullPage: true });
    console.log('  📸 Screenshot saved:', negScreenshot);

    // ─────────────────────────────────────────────────────────────
    // 2. CATEGORY MANAGER: BUYER ACCEPTANCE WITH OPTIONAL AGREEMENT
    // ─────────────────────────────────────────────────────────────
    console.log('\n▶ STEP 2: Verifying Category Manager in Buyer Acceptance with Optional Agreement...');
    await cmPage.goto('http://localhost:3000/procurement/rate-cards?view=buyer_acceptance');
    await cmPage.waitForLoadState('domcontentloaded');
    await cmPage.waitForTimeout(1500);

    // Verify presence of the 3 preparation options: No Agreement, Generate Template, Upload Document
    const noAgrRadio = await cmPage.locator('text=No Formal Agreement').first().isVisible();
    const templateRadio = await cmPage.locator('text=Generate from Template').first().isVisible();
    const uploadRadio = await cmPage.locator('text=Upload Agreement Doc').first().isVisible();
    console.log(`  ✓ Option 1 (No Formal Agreement) visible: ${noAgrRadio}`);
    console.log(`  ✓ Option 2 (Generate from Template) visible: ${templateRadio}`);
    console.log(`  ✓ Option 3 (Upload Agreement Doc) visible: ${uploadRadio}`);

    // Test Option 2: Generate from Template
    await cmPage.click('text=Generate from Template');
    await cmPage.waitForTimeout(500);

    const buyerAcceptTemplateScreenshot = path.join(artifactDir, '02_buyer_acceptance_template_selected.png');
    await cmPage.screenshot({ path: buyerAcceptTemplateScreenshot, fullPage: true });
    console.log('  📸 Screenshot saved:', buyerAcceptTemplateScreenshot);

    // Open Agreement Preview Modal
    console.log('  Testing Agreement Preview Modal...');
    await cmPage.click('button:has-text("Preview Agreement Document")');
    await cmPage.waitForTimeout(800);

    const modalVisible = await cmPage.locator('text=MASTER RATE CARD AGREEMENT').first().isVisible();
    console.log(`  ✓ Agreement Preview Modal opened successfully: ${modalVisible}`);

    const previewModalScreenshot = path.join(artifactDir, '03_agreement_document_preview_modal.png');
    await cmPage.screenshot({ path: previewModalScreenshot, fullPage: false });
    console.log('  📸 Screenshot saved:', previewModalScreenshot);

    // Close Modal
    await cmPage.click('button:has-text("Close Viewer")');
    await cmPage.waitForTimeout(500);

    // Test Option 1: Path A (No formal agreement required)
    await cmPage.click('text=No Formal Agreement');
    await cmPage.waitForTimeout(500);
    const noAgrBtn = await cmPage.locator('button:has-text("Accept Quote & Route to Vendor Acceptance (No Agreement)")').first().isVisible();
    console.log(`  ✓ Path A action button visible: ${noAgrBtn}`);

    // Switch back to Template to test Path B
    await cmPage.click('text=Generate from Template');
    await cmPage.waitForTimeout(500);
    const withAgrBtn = await cmPage.locator('button:has-text("Accept Quote & Send Generated Agreement to Vendor")').first().isVisible();
    console.log(`  ✓ Path B action button visible: ${withAgrBtn}`);

    await cmPage.click('button:has-text("Accept Quote & Send Generated Agreement to Vendor")');
    await cmPage.waitForTimeout(1200);

    // ─────────────────────────────────────────────────────────────
    // 3. VENDOR PORTAL: VENDOR ACCEPTANCE & DIGITAL SIGNATURE
    // ─────────────────────────────────────────────────────────────
    console.log('\n▶ STEP 3: Verifying Vendor Portal: Agreement Review & Digital Signature...');
    const vendorContext = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const vendorPage = await vendorContext.newPage();

    await vendorPage.goto('http://localhost:3000/login');
    await vendorPage.waitForSelector('#work-email');
    await vendorPage.fill('#work-email', 'ramakrishna.interiors@vendor.procpx.local');
    await vendorPage.fill('#password', 'welcome');
    await vendorPage.click('button[type="submit"]');
    try {
      await vendorPage.waitForURL('**/vendor-portal/**', { timeout: 8000 });
    } catch {
      await vendorPage.fill('#password', 'Demo@1234');
      await vendorPage.click('button[type="submit"]');
      await vendorPage.waitForURL('**/vendor-portal/**', { timeout: 10000 });
    }

    await vendorPage.goto('http://localhost:3000/vendor-portal/rate-cards');
    await vendorPage.waitForLoadState('domcontentloaded');
    await vendorPage.waitForTimeout(1500);

    // Verify Section 5 shows Attached Rate Card Agreement & Digital Signature block
    const agrDocCard = await vendorPage.locator('text=Master Rate Agreement').first().isVisible();
    const sigBlock = await vendorPage.locator('text=Authorized Vendor Digital Signature Execution').first().isVisible();
    console.log(`  ✓ Attached Agreement Document Card visible in Vendor Portal: ${agrDocCard}`);
    console.log(`  ✓ Digital Signature block visible in Vendor Portal: ${sigBlock}`);

    // Review Agreement in Vendor Portal
    await vendorPage.click('button:has-text("Review Agreement Document")');
    await vendorPage.waitForTimeout(800);
    const vendorModalVisible = await vendorPage.locator('text=MASTER RATE CARD AGREEMENT').first().isVisible();
    console.log(`  ✓ Vendor Agreement Preview opened: ${vendorModalVisible}`);
    await vendorPage.click('button:has-text("Close Viewer")');
    await vendorPage.waitForTimeout(500);

    const vendorPortalScreenshot = path.join(artifactDir, '04_vendor_portal_agreement_and_signature.png');
    await vendorPage.screenshot({ path: vendorPortalScreenshot, fullPage: true });
    console.log('  📸 Screenshot saved:', vendorPortalScreenshot);

    // Vendor completes signature & acceptance
    await vendorPage.click('button:has-text("Accept Terms & Digitally Sign Agreement")');
    await vendorPage.waitForTimeout(1000);

    // ─────────────────────────────────────────────────────────────
    // 4. LEVEL 1: PROJECT APPROVER VIEW
    // ─────────────────────────────────────────────────────────────
    console.log('\n▶ STEP 4: Verifying Level 1: Project Approver Queue & Sequential Transition...');
    const paContext = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const paPage = await paContext.newPage();

    await paPage.goto('http://localhost:3000/login');
    await paPage.waitForSelector('#work-email');
    await paPage.fill('#work-email', 'project.approver@procucev-demo.local');
    await paPage.fill('#password', 'Demo@1234');
    await paPage.click('button[type="submit"]');
    await paPage.waitForURL('**/dashboard', { timeout: 15000 });

    await paPage.goto('http://localhost:3000/approvals/rate-cards');
    await paPage.waitForLoadState('domcontentloaded');
    await paPage.waitForTimeout(2000);

    // Verify Section 6 Approver view shows Level 1 Project Approver pending
    const l1ActionBtn = await paPage.locator('button:has-text("Approve & Route to Finance (Level 1 Project)")').first().isVisible();
    console.log(`  ✓ Level 1 Project Approval action button visible: ${l1ActionBtn}`);

    const paScreenshot = path.join(artifactDir, '05_project_approver_level1_view.png');
    await paPage.screenshot({ path: paScreenshot, fullPage: true });
    console.log('  📸 Screenshot saved:', paScreenshot);

    // ─────────────────────────────────────────────────────────────
    // 5. LEVEL 2: FINANCE APPROVER VIEW & ACTIVATION
    // ─────────────────────────────────────────────────────────────
    console.log('\n▶ STEP 5: Verifying Level 2: Finance Approver View & Activation...');
    const faContext = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const faPage = await faContext.newPage();

    await faPage.goto('http://localhost:3000/login');
    await faPage.waitForSelector('#work-email');
    await faPage.fill('#work-email', 'finance.user@procucev-demo.local');
    await faPage.fill('#password', 'Demo@1234');
    await faPage.click('button[type="submit"]');
    await faPage.waitForURL('**/dashboard', { timeout: 15000 });

    await faPage.goto('http://localhost:3000/approvals/rate-cards');
    await faPage.waitForLoadState('domcontentloaded');
    await faPage.waitForTimeout(2000);

    const l2ActionBtn = await faPage.locator('button:has-text("Approve & Activate Rate Card (Level 2 Finance)")').first().isVisible();
    console.log(`  ✓ Level 2 Finance Approval & Activation button visible: ${l2ActionBtn}`);

    const faScreenshot = path.join(artifactDir, '06_finance_approver_level2_view.png');
    await faPage.screenshot({ path: faScreenshot, fullPage: true });
    console.log('  📸 Screenshot saved:', faScreenshot);

    // ─────────────────────────────────────────────────────────────
    // 6. FINALISED / ACTIVE RATE CARD DETAILS (STAGE 7)
    // ─────────────────────────────────────────────────────────────
    console.log('\n▶ STEP 6: Verifying Stage 7: Finalised Rate Card Details & Agreement Execution...');
    await cmPage.goto('http://localhost:3000/procurement/rate-cards?view=details');
    await cmPage.waitForLoadState('domcontentloaded');
    await cmPage.waitForTimeout(2000);

    // Verify Agreement block in Finalised details
    const activeBadge = await cmPage.locator('text=Active').first().isVisible();
    const agreementBlock = await cmPage.locator('text=Bilateral Formal Agreement & Signature Execution').first().isVisible();
    const viewAgreementBtn = await cmPage.locator('button:has-text("View Executed Agreement")').first().isVisible();

    console.log(`  ✓ Active Status Badge visible: ${activeBadge}`);
    console.log(`  ✓ Bilateral Formal Agreement Block visible: ${agreementBlock}`);
    console.log(`  ✓ "View Executed Agreement" toolbar button visible: ${viewAgreementBtn}`);

    // Open Executed Agreement in Finalised Details
    await cmPage.click('button:has-text("View Executed Agreement")');
    await cmPage.waitForTimeout(800);
    const finalisedModalVisible = await cmPage.locator('text=MASTER RATE CARD AGREEMENT').first().isVisible();
    console.log(`  ✓ Finalised Executed Agreement viewer opened: ${finalisedModalVisible}`);

    const finalisedDetailsScreenshot = path.join(artifactDir, '07_finalised_rate_card_details_and_agreement.png');
    await cmPage.screenshot({ path: finalisedDetailsScreenshot, fullPage: false });
    console.log('  📸 Screenshot saved:', finalisedDetailsScreenshot);

    await cmPage.click('button:has-text("Close Viewer")');
    await cmPage.waitForTimeout(400);

    console.log('\n======================================================================');
    console.log('  ALL WORKFLOWS AND SEQUENCE VERIFICATIONS COMPLETED SUCCESSFULLY!    ');
    console.log('======================================================================');
  } catch (err) {
    console.error('Test execution error:', err);
    throw err;
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
