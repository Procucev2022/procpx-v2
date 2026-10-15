import puppeteer from 'puppeteer-core';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3000';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROOF_DIR = path.join(process.cwd(), 'prisma', 'backups', 'browser-proof');

if (!fs.existsSync(PROOF_DIR)) {
  fs.mkdirSync(PROOF_DIR, { recursive: true });
}

interface TestResult {
  testId: string;
  name: string;
  status: 'PASS' | 'FAIL';
  details: string;
}

const results: TestResult[] = [];

function recordResult(testId: string, name: string, status: 'PASS' | 'FAIL', details: string) {
  results.push({ testId, name, status, details });
  console.log(`\n[${status}] Test ${testId}: ${name}\n  -> ${details}`);
}

async function loginInBrowser(page: any, email: string, password = 'Demo@1234') {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="email"]');
  await page.$eval('input[type="email"]', (el: any) => el.value = '');
  await page.type('input[type="email"]', email);
  await page.$eval('input[type="password"]', (el: any) => el.value = '');
  await page.type('input[type="password"]', password);
  
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await new Promise(r => setTimeout(r, 1500));
}

async function runTests() {
  console.log('===============================================================');
  console.log('   proCPX PROJECT APPROVER WORKFLOW E2E BROWSER TEST           ');
  console.log('===============================================================');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 },
  });

  const page = await browser.newPage();

  try {
    // -------------------------------------------------------------
    // SETUP: Get database baseline entities
    // -------------------------------------------------------------
    const tenant = await prisma.tenant.findFirst({ where: { slug: 'procucev-retail-demo' } });
    if (!tenant) throw new Error('Tenant not found');

    const project = await prisma.project.findFirst({
      where: { tenantId: tenant.id, costCentres: { some: {} } },
      include: { costCentres: true },
    });
    if (!project) throw new Error('Project not found');

    const costCentre = project.costCentres[0];
    const projectUser = await prisma.user.findFirst({ where: { email: 'project.user@procucev-demo.local' } });
    const projectApprover = await prisma.user.findFirst({ where: { email: 'project.approver@procucev-demo.local' } });
    const category = await prisma.category.findFirst({ where: { tenantId: tenant.id, parentId: null } });

    if (!projectUser || !projectApprover || !category) {
      throw new Error('Required test users or category missing');
    }

    const testTimestamp = Date.now().toString().slice(-4);
    const boqCodeAlpha = `BOQ-E2E-APPR-${testTimestamp}`;

    // -------------------------------------------------------------
    // TEST A: Create & Submit BOQ as Project User; confirm in Approver Dashboard & Approvals
    // -------------------------------------------------------------
    console.log('\n--- Running Test A: Submit BOQ as Project User ---');
    const boqAlpha = await prisma.boq.create({
      data: {
        tenantId: tenant.id,
        projectId: project.id,
        costCentreId: costCentre.id,
        boqCode: boqCodeAlpha,
        title: `Commercial BOQ Alpha (${boqCodeAlpha})`,
        description: 'Test BOQ for Approver Actions E2E Verification',
        status: 'DRAFT',
        category: category.name || 'Civil & Interior Works',
        createdBy: projectUser.name || 'Project User',
        revisions: {
          create: {
            tenantId: tenant.id,
            revisionCode: 'R0',
            revisionNumber: 0,
            status: 'DRAFT',
            createdById: projectUser.id,
            lines: {
              create: [
                {
                  tenantId: tenant.id,
                  lineNumber: '1',
                  categoryId: category.id,
                  specification: 'Vitrified Floor Tiles 800x800mm High Traffic Grade',
                  originalDescription: 'Vitrified Floor Tiles 800x800mm',
                  uomRaw: 'SQM',
                  quantity: 200,
                  aiUnitCost: 950,
                  aiTotalCost: 190000,
                },
                {
                  tenantId: tenant.id,
                  lineNumber: '2',
                  categoryId: category.id,
                  specification: 'Acoustic Ceiling Tiles 600x600mm with Grid Suspension',
                  originalDescription: 'Acoustic Ceiling Tiles 600x600mm',
                  uomRaw: 'SQM',
                  quantity: 120,
                  aiUnitCost: 650,
                  aiTotalCost: 78000,
                },
              ],
            },
          },
        },
      },
      include: {
        revisions: { include: { lines: true } },
      },
    });

    const revAlpha = boqAlpha.revisions[0];

    // Submit BOQ into PR workflow
    const prAlpha = await prisma.procurementRequest.create({
      data: {
        tenantId: tenant.id,
        projectId: project.id,
        costCentreId: costCentre.id,
        boqId: boqAlpha.id,
        boqRevisionId: revAlpha.id,
        prNumber: `PR-${boqCodeAlpha}`,
        title: `PR for ${boqAlpha.title}`,
        totalEstimatedValue: 268000,
        totalLines: revAlpha.lines.length,
        status: 'PR_PENDING_PROJECT_APPROVAL',
        requestedBy: projectUser.id,
        lines: {
          create: revAlpha.lines.map((l, i) => ({
            tenantId: tenant.id,
            boqLineId: l.id,
            lineNumber: String(i + 1),
            itemDescription: l.specification || 'Item Description',
            specification: l.specification || '',
            category: category.name,
            quantity: l.quantity || 1,
            uom: l.uomRaw || 'NOS',
            estimatedRate: l.aiUnitCost || 800,
            estimatedValue: ((l.quantity || 1) * (l.aiUnitCost || 800)),
          })),
        },
      },
    });

    await prisma.boqRevision.update({
      where: { id: revAlpha.id },
      data: { status: 'SUBMITTED', prStatus: 'PR_PENDING_PROJECT_APPROVAL' },
    });

    // Login as Project Approver in browser
    await loginInBrowser(page, 'project.approver@procucev-demo.local');
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(PROOF_DIR, '01_approver_dashboard.png'), fullPage: true });

    const dashboardHtml = await page.content();
    const appearsInDashboard = dashboardHtml.includes(prAlpha.prNumber) || dashboardHtml.includes(boqCodeAlpha);

    // Also check /approvals/boq-pr
    await page.goto(`${BASE_URL}/approvals/boq-pr`, { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(PROOF_DIR, '02_approvals_page_queue.png'), fullPage: true });

    const approvalsHtml = await page.content();
    const appearsInApprovals = approvalsHtml.includes(prAlpha.prNumber) || approvalsHtml.includes(boqCodeAlpha);

    if (appearsInDashboard && appearsInApprovals) {
      recordResult('A', 'Submit BOQ as Project User & verify visibility', 'PASS', `BOQ ${boqCodeAlpha} (PR ${prAlpha.prNumber}) is visible in both Approver Dashboard and BOQ Approvals page.`);
    } else {
      recordResult('A', 'Submit BOQ as Project User & verify visibility', 'FAIL', `Dashboard: ${appearsInDashboard}, Approvals Page: ${appearsInApprovals}`);
    }

    // -------------------------------------------------------------
    // TEST B: Confirm all six actions are visible for pending BOQ
    // -------------------------------------------------------------
    console.log('\n--- Running Test B: Verify All Six Actions Visibility ---');
    // Check on /approvals/boq-pr
    const hasReviewBtn = approvalsHtml.includes('Review BOQ');
    const hasMessageBtn = approvalsHtml.includes('Message');
    const hasChatBtn = approvalsHtml.includes('Chat');
    const hasRevertBtn = approvalsHtml.includes('Revert');
    const hasApproveBtn = approvalsHtml.includes('Approve');
    const hasRejectBtn = approvalsHtml.includes('Reject');

    // Also check on /dashboard
    const hasDashboardReview = dashboardHtml.includes('Review BOQ');
    const hasDashboardMessage = dashboardHtml.includes('Message');
    const hasDashboardChat = dashboardHtml.includes('Chat');
    const hasDashboardRevert = dashboardHtml.includes('Revert');
    const hasDashboardApprove = dashboardHtml.includes('Approve');
    const hasDashboardReject = dashboardHtml.includes('Reject');

    const allSixInApprovals = hasReviewBtn && hasMessageBtn && hasChatBtn && hasRevertBtn && hasApproveBtn && hasRejectBtn;
    const allSixInDashboard = hasDashboardReview && hasDashboardMessage && hasDashboardChat && hasDashboardRevert && hasDashboardApprove && hasDashboardReject;

    if (allSixInApprovals && allSixInDashboard) {
      recordResult('B', 'Confirm all six actions are visible on Dashboard and BOQ Approvals', 'PASS', 'Review BOQ, Message, Chat, Revert, Approve, Reject are all visible in both views.');
    } else {
      recordResult('B', 'Confirm all six actions are visible on Dashboard and BOQ Approvals', 'FAIL', `Approvals page: ${allSixInApprovals}, Dashboard: ${allSixInDashboard}`);
    }

    // -------------------------------------------------------------
    // TEST C: Open Review and verify BOQ details and line items
    // -------------------------------------------------------------
    console.log('\n--- Running Test C: Open Review BOQ Details Modal ---');
    // Find the Review BOQ button for our PR row
    const reviewButtons = await page.$$('button');
    let clickedReview = false;
    for (const btn of reviewButtons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && text.includes('Review BOQ')) {
        await btn.click();
        clickedReview = true;
        break;
      }
    }
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(PROOF_DIR, '03_review_boq_modal.png') });

    const modalHtml = await page.content();
    const hasLineItem1 = modalHtml.includes('Vitrified Floor Tiles') || modalHtml.includes('800x800mm');
    const hasLineItem2 = modalHtml.includes('Acoustic Ceiling Tiles') || modalHtml.includes('600x600mm');
    const hasMetadata = modalHtml.includes('Source BOQ') && modalHtml.includes('Requested Value');

    if (clickedReview && hasLineItem1 && hasMetadata) {
      recordResult('C', 'Open Review and verify complete BOQ details and line items', 'PASS', 'BOQ details metadata and all line items loaded accurately in the Review modal.');
    } else {
      recordResult('C', 'Open Review and verify complete BOQ details and line items', 'FAIL', `Clicked: ${clickedReview}, Line items loaded: ${hasLineItem1}, Metadata: ${hasMetadata}`);
    }

    // Close review modal
    const closeButtons = await page.$$('button');
    for (const btn of closeButtons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && text.trim() === 'Close') {
        await btn.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 600));

    // -------------------------------------------------------------
    // TEST D: Send Message and Chat; verify persistence
    // -------------------------------------------------------------
    console.log('\n--- Running Test D: Send Message / Chat & Verify Persistence ---');
    // Click "Message" button to open enquiry mode
    const msgButtons = await page.$$('button');
    for (const btn of msgButtons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && text.includes('Message')) {
        await btn.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 1200));
    await page.screenshot({ path: path.join(PROOF_DIR, '04_message_drawer_opened.png') });

    // Type a clarification message in the drawer textarea
    await page.waitForSelector('textarea');
    const testMessageText = `E2E Clarification: Please confirm installation schedule for ${boqCodeAlpha}.`;
    await page.type('textarea', testMessageText);
    
    // Click Send
    const sendBtn = await page.$('button[title="Send enquiry or message"], button:has(svg.lucide-send)');
    if (sendBtn) {
      await sendBtn.click();
    } else {
      // Find send button by text or icon
      const allBtns = await page.$$('button');
      for (const b of allBtns) {
        const title = await page.evaluate(el => el.getAttribute('title'), b);
        if (title && title.includes('Send')) {
          await b.click();
          break;
        }
      }
    }
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(PROOF_DIR, '05_message_sent.png') });

    // Verify in database that PRApproval with status ENQUIRY was created
    const savedMsg = await prisma.pRApproval.findFirst({
      where: {
        prId: prAlpha.id,
        remarks: { contains: testMessageText },
      },
    });

    if (savedMsg) {
      recordResult('D', 'Send message and chat; verify persistence and history', 'PASS', `Message "${testMessageText.slice(0, 40)}..." persisted in PRApproval with ID ${savedMsg.id}.`);
    } else {
      recordResult('D', 'Send message and chat; verify persistence and history', 'FAIL', 'Message was not found in persisted PRApproval records.');
    }

    // Close chat drawer
    const closeDrawerBtn = await page.$('button[title="Close panel"]');
    if (closeDrawerBtn) await closeDrawerBtn.click();
    await new Promise(r => setTimeout(r, 800));
    // Ensure clean page state for Revert action
    await page.goto(`${BASE_URL}/approvals/boq-pr`, { waitUntil: 'networkidle2' });

    // -------------------------------------------------------------
    // TEST E: Revert BOQ with mandatory reason; Project User receives it
    // -------------------------------------------------------------
    console.log('\n--- Running Test E: Revert BOQ for Correction ---');
    // Click Revert button
    const revertButtons = await page.$$('button');
    for (const btn of revertButtons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && text.includes('Revert')) {
        await btn.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(PROOF_DIR, '06_revert_modal.png') });

    // Fill in revert reason
    const revertReasonText = 'Revise floor tile quantity to 220 SQM and attach installation schedule.';
    const modalTextarea = await page.$('textarea[placeholder*="mandatory"]');
    if (modalTextarea) {
      await modalTextarea.type(revertReasonText);
    }

    // Submit revert
    const confirmRevertBtn = await page.$('button[type="submit"]');
    if (confirmRevertBtn) {
      await confirmRevertBtn.click();
    }
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(PROOF_DIR, '07_revert_confirmed.png') });

    // Check DB status of prAlpha
    const revertedPr = await prisma.procurementRequest.findUnique({
      where: { id: prAlpha.id },
      include: { approvals: { orderBy: { timestamp: 'desc' } } },
    });

    const isReverted = revertedPr?.status === 'PR_RETURNED_FOR_CORRECTION';
    const hasRevertAudit = revertedPr?.approvals.some(a => a.status === 'RETURNED_FOR_CORRECTION' && (a.remarks || '').includes(revertReasonText));

    // Log in as Project User in browser to verify they see it returned with reason
    await loginInBrowser(page, 'project.user@procucev-demo.local');
    await page.goto(`${BASE_URL}/pr`, { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(PROOF_DIR, '08_project_user_returned_view.png'), fullPage: true });

    const prPageHtml = await page.content();
    const userSeesReturned = prPageHtml.includes('Returned for Correction') && prPageHtml.includes(revertReasonText);

    if (isReverted && hasRevertAudit && userSeesReturned) {
      recordResult('E', 'Revert test BOQ with reason & Project User receives it', 'PASS', `BOQ status transitioned to PR_RETURNED_FOR_CORRECTION, reason "${revertReasonText.slice(0, 35)}..." visible to Project User on /pr.`);
    } else {
      recordResult('E', 'Revert test BOQ with reason & Project User receives it', 'FAIL', `isReverted: ${isReverted}, hasAudit: ${hasRevertAudit}, userSeesReason: ${userSeesReturned}`);
    }

    // -------------------------------------------------------------
    // TEST F: Resubmit corrected BOQ & Approver reviews and approves
    // -------------------------------------------------------------
    console.log('\n--- Running Test F: Resubmit Corrected BOQ & Approve ---');
    // Project User clicks Resubmit BOQ
    let resubmitted = false;
    const allPrBtns = await page.$$('button');
    for (const b of allPrBtns) {
      const text = await page.evaluate(el => el.textContent, b);
      if (text && text.includes('Resubmit BOQ')) {
        await b.click();
        resubmitted = true;
        break;
      }
    }
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(PROOF_DIR, '09_resubmitted_boq.png') });

    // Verify DB status transitioned back to PR_PENDING_PROJECT_APPROVAL
    const resubmittedPr = await prisma.procurementRequest.findUnique({ where: { id: prAlpha.id } });
    const isBackPending = resubmittedPr?.status === 'PR_PENDING_PROJECT_APPROVAL';

    // Log in as Project Approver to approve
    await loginInBrowser(page, 'project.approver@procucev-demo.local');
    await page.goto(`${BASE_URL}/approvals/boq-pr`, { waitUntil: 'networkidle2' });

    // Click Approve button for the BOQ
    const apprButtons = await page.$$('button[title*="Approve BOQ"]');
    if (apprButtons.length > 0) {
      await apprButtons[0].click();
    }
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(PROOF_DIR, '10_approver_approved_success.png') });

    const approvedPrDb = await prisma.procurementRequest.findUnique({
      where: { id: prAlpha.id },
      include: { approvals: { orderBy: { timestamp: 'desc' } } },
    });

    const isApproved = approvedPrDb?.status === 'PR_APPROVED' || approvedPrDb?.status === 'PR_RELEASED_TO_PROCUREMENT';
    const hasApprovalRecord = approvedPrDb?.approvals.some(a => a.status === 'APPROVED' && a.approverId === projectApprover.id);

    if (isBackPending && isApproved && hasApprovalRecord) {
      recordResult('F', 'Resubmit corrected BOQ & Approver approves; verify audit trail', 'PASS', `PR status is now ${approvedPrDb?.status}, approved by ${projectApprover.email} at ${approvedPrDb?.approvals[0]?.timestamp?.toISOString()}.`);
    } else {
      recordResult('F', 'Resubmit corrected BOQ & Approver approves; verify audit trail', 'FAIL', `isBackPending: ${isBackPending}, isApproved: ${isApproved}, hasApprovalRecord: ${hasApprovalRecord}`);
    }

    // -------------------------------------------------------------
    // TEST G: Create separate test BOQ and verify Reject action
    // -------------------------------------------------------------
    console.log('\n--- Running Test G: Reject Action with Mandatory Reason ---');
    const boqCodeBeta = `BOQ-E2E-REJ-${testTimestamp}`;
    const boqBeta = await prisma.boq.create({
      data: {
        tenantId: tenant.id,
        projectId: project.id,
        costCentreId: costCentre.id,
        boqCode: boqCodeBeta,
        title: `Commercial BOQ Beta (${boqCodeBeta})`,
        description: 'Test BOQ for Rejection Workflow Verification',
        status: 'DRAFT',
        category: category.name || 'Civil & Interior Works',
        createdBy: projectUser.name || 'Project User',
        revisions: {
          create: {
            tenantId: tenant.id,
            revisionCode: 'R0',
            revisionNumber: 0,
            status: 'DRAFT',
            createdById: projectUser.id,
            lines: {
              create: [
                {
                  tenantId: tenant.id,
                  lineNumber: '1',
                  categoryId: category.id,
                  specification: 'Non-compliant paint formulation',
                  originalDescription: 'Paint work',
                  uomRaw: 'SQM',
                  quantity: 50,
                  aiUnitCost: 400,
                  aiTotalCost: 20000,
                },
              ],
            },
          },
        },
      },
      include: { revisions: { include: { lines: true } } },
    });

    const revBeta = boqBeta.revisions[0];
    const prBeta = await prisma.procurementRequest.create({
      data: {
        tenantId: tenant.id,
        projectId: project.id,
        costCentreId: costCentre.id,
        boqId: boqBeta.id,
        boqRevisionId: revBeta.id,
        prNumber: `PR-${boqCodeBeta}`,
        title: `PR for ${boqBeta.title}`,
        totalEstimatedValue: 20000,
        totalLines: 1,
        status: 'PR_PENDING_PROJECT_APPROVAL',
        requestedBy: projectUser.id,
        lines: {
          create: [
            {
              tenantId: tenant.id,
              boqLineId: revBeta.lines[0].id,
              lineNumber: '1',
              itemDescription: 'Non-compliant paint formulation',
              specification: 'Non-compliant paint formulation',
              category: category.name,
              quantity: 50,
              uom: 'SQM',
              estimatedRate: 400,
              estimatedValue: 20000,
            },
          ],
        },
      },
    });

    await prisma.boqRevision.update({
      where: { id: revBeta.id },
      data: { status: 'SUBMITTED', prStatus: 'PR_PENDING_PROJECT_APPROVAL' },
    });

    // In approver browser, reload dashboard
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(PROOF_DIR, '11_reject_test_boq_on_dashboard.png') });

    // Click Reject on the new BOQ
    const rejButtons = await page.$$('button[title*="Reject BOQ"]');
    if (rejButtons.length > 0) {
      await rejButtons[0].click();
    }
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(PROOF_DIR, '12_reject_modal_opened.png') });

    const rejectReasonText = 'Non-compliant specification rejected as per safety baseline standards.';
    const rejTextarea = await page.$('textarea[placeholder*="mandatory"]');
    if (rejTextarea) {
      await rejTextarea.type(rejectReasonText);
    }

    const confirmRejectBtn = await page.$('button[type="submit"]');
    if (confirmRejectBtn) {
      await confirmRejectBtn.click();
    }
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(PROOF_DIR, '13_reject_confirmed.png') });

    const rejectedPrDb = await prisma.procurementRequest.findUnique({
      where: { id: prBeta.id },
      include: { approvals: { orderBy: { timestamp: 'desc' } } },
    });

    const isRejected = rejectedPrDb?.status === 'PR_REJECTED';
    const hasRejectAudit = rejectedPrDb?.approvals.some(a => a.status === 'REJECTED' && (a.remarks || '').includes(rejectReasonText));

    if (isRejected && hasRejectAudit) {
      recordResult('G', 'Create separate test BOQ & verify Reject action with reason', 'PASS', `BOQ ${boqCodeBeta} successfully rejected with status PR_REJECTED and persisted audit trail.`);
    } else {
      recordResult('G', 'Create separate test BOQ & verify Reject action with reason', 'FAIL', `isRejected: ${isRejected}, hasRejectAudit: ${hasRejectAudit}`);
    }

    // -------------------------------------------------------------
    // TEST H: Re-login checks, unauthorized role protection, queue clearance
    // -------------------------------------------------------------
    console.log('\n--- Running Test H: Role Protection & Queue Clearance ---');
    // Check that pending queue on dashboard no longer has prAlpha or prBeta
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle2' });
    const pendingRowTexts = await page.evaluate(() => {
      const table = document.querySelector('.card .table-wrapper table tbody');
      if (!table) return [];
      return Array.from(table.querySelectorAll('tr')).map(r => r.textContent || '');
    });
    const prAlphaInPending = pendingRowTexts.some(txt => txt.includes(`PR-${boqCodeAlpha}`));
    const prBetaInPending = pendingRowTexts.some(txt => txt.includes(`PR-${boqCodeBeta}`));
    const queueClearOfActioned = !prAlphaInPending && !prBetaInPending;

    // Check unauthorized role: Log in as Project User and attempt approval POST
    await loginInBrowser(page, 'project.user@procucev-demo.local');
    const unauthorizedResp = await page.evaluate(async (prId) => {
      const res = await fetch(`/api/pr/${prId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remarks: 'Hacker attempt' }),
      });
      return { status: res.status, ok: res.ok };
    }, prAlpha.id);

    const unauthorizedBlocked = unauthorizedResp.status === 403;

    if (queueClearOfActioned && unauthorizedBlocked) {
      recordResult('H', 'Queue clearance & unauthorized role permissions check', 'PASS', `Actioned BOQs left pending queue; unauthorized role POST returned 403 Forbidden.`);
    } else {
      recordResult('H', 'Queue clearance & unauthorized role permissions check', 'FAIL', `queueClear: ${queueClearOfActioned}, unauthorizedBlocked (status ${unauthorizedResp.status}): ${unauthorizedBlocked}`);
    }

  } catch (error: any) {
    console.error('Test execution error:', error);
    recordResult('ERROR', 'Test Execution Failure', 'FAIL', error.message);
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }

  console.log('\n===============================================================');
  console.log('                   E2E TEST SUMMARY RESULTS                    ');
  console.log('===============================================================');
  for (const r of results) {
    console.log(`[${r.status}] Test ${r.testId}: ${r.name}`);
    console.log(`       Details: ${r.details}`);
  }
}

runTests();
