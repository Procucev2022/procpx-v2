// tests/separate-approvals-workflow.test.ts
// Automated Test Suite for Separate Approval Workflows (Project Approver & Finance Approver)
import { prisma } from '../src/lib/prisma';
import { setTestAuthContext } from '../src/lib/api-utils';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: [${testName}]`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: [${testName}] - ${details || 'Assertion failed'}`);
  }
}

async function runTestSuite() {
  console.log('========================================================================');
  console.log('🚀 PROCPX SEPARATE APPROVAL WORKFLOWS ACCEPTANCE TEST SUITE');
  console.log('   (Project Approver Profile vs Finance Approver Profile)');
  console.log('========================================================================\n');

  try {
    // 0. Setup tenant, users, project, cost centre
    const tenant = await prisma.tenant.findUnique({ where: { slug: 'procucev-retail-demo' } });
    if (!tenant) throw new Error('Demo tenant not found');

    const projectUser = await prisma.user.findFirst({
      where: { tenantId: tenant.id, role: 'PROJECT_USER' },
    });
    if (!projectUser) throw new Error('PROJECT_USER not found');

    const projectApprover = await prisma.user.findFirst({
      where: { tenantId: tenant.id, role: 'PROJECT_APPROVER' },
    });
    if (!projectApprover) throw new Error('PROJECT_APPROVER not found');

    const financeUser = await prisma.user.findFirst({
      where: { tenantId: tenant.id, role: 'FINANCE_USER' },
    });
    if (!financeUser) throw new Error('FINANCE_USER not found');

    const project = await prisma.project.findFirst({
      where: { tenantId: tenant.id, projectCode: 'CPX-P-000001' },
      include: { costCentres: true },
    });
    if (!project) throw new Error('Project not found');

    const costCentre = project.costCentres[0];
    if (!costCentre) throw new Error('Cost centre not found');

    const category = await prisma.category.findFirst({
      where: { tenantId: tenant.id },
    });
    const uom = await prisma.uomMaster.findFirst({
      where: { tenantId: tenant.id, code: 'NOS' },
    });

    // Create a dedicated test BOQ and revision for these tests
    const testBoqCode = `BOQ-WF-${Date.now().toString().slice(-6)}`;
    const testBoq = await prisma.boq.create({
      data: {
        tenantId: tenant.id,
        projectId: project.id,
        costCentreId: costCentre.id,
        boqCode: testBoqCode,
        title: 'Separate Approvals Test BOQ',
        category: 'Fitout',
        status: 'SUBMITTED',
        createdBy: projectUser.id,
      },
    });

    const testRevision = await prisma.boqRevision.create({
      data: {
        tenantId: tenant.id,
        boqId: testBoq.id,
        costCentreId: costCentre.id,
        revisionNumber: 0,
        revisionCode: 'R0',
        status: 'SUBMITTED',
        budgetStatus: 'DRAFT',
        prStatus: 'DRAFT',
        createdById: projectUser.id,
        totalLines: 2,
        validLines: 2,
      },
    });

    const line1 = await prisma.boqLine.create({
      data: {
        tenantId: tenant.id,
        boqRevisionId: testRevision.id,
        lineNumber: '1.01',
        originalDescription: 'HVAC Ducting Scope',
        categoryId: category?.id || null,
        uomId: uom?.id || null,
        quantity: 20,
        aiUnitCost: 2500,
        aiTotalCost: 50000,
      },
    });

    const line2 = await prisma.boqLine.create({
      data: {
        tenantId: tenant.id,
        boqRevisionId: testRevision.id,
        lineNumber: '1.02',
        originalDescription: 'Electrical DB Scope',
        categoryId: category?.id || null,
        uomId: uom?.id || null,
        quantity: 10,
        aiUnitCost: 3000,
        aiTotalCost: 30000,
      },
    });

    // Create a Purchase Request (PR) for this revision
    const prNumber = `PR-TEST-${Date.now().toString().slice(-6)}`;
    const testPr = await prisma.procurementRequest.create({
      data: {
        tenantId: tenant.id,
        prNumber,
        projectId: project.id,
        costCentreId: costCentre.id,
        boqId: testBoq.id,
        boqRevisionId: testRevision.id,
        title: 'HVAC & Electrical PR',
        totalEstimatedValue: 80000,
        totalLines: 2,
        status: 'PR_PENDING_PROJECT_APPROVAL',
        requestedBy: projectUser.id,
      },
    });

    await prisma.pRLine.create({
      data: {
        tenantId: tenant.id,
        prId: testPr.id,
        lineNumber: '1',
        itemDescription: 'HVAC Ducting Scope',
        category: category?.name || 'HVAC',
        uom: 'NOS',
        quantity: 20,
        estimatedRate: 2500,
        estimatedValue: 50000,
        boqLineId: line1.id,
      },
    });

    // Create a Budget Contribution via Add to Budget
    setTestAuthContext({ userId: projectUser.id, tenantId: tenant.id });
    const { POST: addToBudgetHandler } = await import('../src/app/api/boq/add-to-budget/route');
    const addBudgetReq = new Request('http://localhost:3000/api/boq/add-to-budget', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revisionId: testRevision.id }),
    });
    const addBudgetRes = await addToBudgetHandler(addBudgetReq as any);
    const addBudgetData = await addBudgetRes.json();
    if (addBudgetRes.status !== 201) {
      console.error('addBudgetRes error:', addBudgetRes.status, addBudgetData);
    }
    assert(addBudgetRes.status === 201, '0.1 Add to Budget initiated successfully');

    const contributionId = addBudgetData.contributionId;

    // -------------------------------------------------------------------------
    // CRITERION 1 & 2: Project Approver sees separate PR & Budget queues
    // -------------------------------------------------------------------------
    console.log('\n--- CRITERION 1 & 2: SEPARATE QUEUES FOR PROJECT APPROVER ---');
    setTestAuthContext({ userId: projectApprover.id, tenantId: tenant.id });
    const { GET: getApprovalsHandler } = await import('../src/app/api/approvals/route');

    // 1A. Query PR Approvals Queue
    const prQueueReq = new Request('http://localhost:3000/api/approvals?type=PR', { method: 'GET' });
    const prQueueRes = await getApprovalsHandler(prQueueReq as any);
    const prQueueJson = await prQueueRes.json();

    assert(prQueueRes.status === 200, '1.1 PR Queue query returns HTTP 200');
    assert(prQueueJson.prQueue.length > 0, '1.2 PR Queue contains pending PRs');
    assert(prQueueJson.budgetQueue.length === 0, '1.3 PR Queue does NOT mix budget contributions');
    const foundPr = prQueueJson.prQueue.find((p: any) => p.id === testPr.id);
    assert(!!foundPr, '1.4 Target test PR is in PR Queue');
    assert(foundPr.status === 'PR_PENDING_PROJECT_APPROVAL', '1.5 PR status is PR_PENDING_PROJECT_APPROVAL');

    // 1B. Query Budget Approvals Queue
    const budgetQueueReq = new Request('http://localhost:3000/api/approvals?type=BUDGET', { method: 'GET' });
    const budgetQueueRes = await getApprovalsHandler(budgetQueueReq as any);
    const budgetQueueJson = await budgetQueueRes.json();

    assert(budgetQueueRes.status === 200, '2.1 Budget Queue query returns HTTP 200');
    assert(budgetQueueJson.budgetQueue.length > 0, '2.2 Budget Queue contains pending contributions');
    assert(budgetQueueJson.prQueue.length === 0, '2.3 Budget Queue does NOT mix PRs');
    assert(budgetQueueJson.financeQueue.length === 0, '2.4 Project Approver does NOT receive Finance queue');
    const foundContrib = budgetQueueJson.budgetQueue.find((b: any) => b.id === contributionId);
    assert(!!foundContrib, '2.5 Target test contribution is in Budget Queue');
    assert(foundContrib.status === 'UNDER_APPROVAL', '2.6 Contribution status is UNDER_APPROVAL');

    // -------------------------------------------------------------------------
    // CRITERION 3: PR Approval is independent of Budget Approval
    // -------------------------------------------------------------------------
    console.log('\n--- CRITERION 3: PR APPROVAL INDEPENDENCE ---');
    setTestAuthContext({ userId: projectApprover.id, tenantId: tenant.id });
    const { POST: approvePrHandler } = await import('../src/app/api/pr/[id]/approve/route');

    const approvePrReq = new Request(`http://localhost:3000/api/pr/${testPr.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remarks: 'Technical specification approved for procurement sourcing' }),
    });

    const approvePrRes = await approvePrHandler(approvePrReq as any, { params: Promise.resolve({ id: testPr.id }) });
    const approvePrJson = await approvePrRes.json();

    assert(approvePrRes.status === 200, '3.1 PR Approval succeeded with HTTP 200');
    assert(approvePrJson.status === 'PR_RELEASED_TO_PROCUREMENT', '3.2 PR status updated to PR_RELEASED_TO_PROCUREMENT');

    // Verify budget contribution remains completely UNDER_APPROVAL (independent!)
    const contribAfterPrApprove = await prisma.budgetContribution.findUnique({
      where: { id: contributionId },
    });
    assert(contribAfterPrApprove?.status === 'UNDER_APPROVAL', '3.3 Budget contribution status UNCHANGED (remains UNDER_APPROVAL)');

    // -------------------------------------------------------------------------
    // CRITERION 4: Finance Approver restrictions
    // -------------------------------------------------------------------------
    console.log('\n--- CRITERION 4: FINANCE APPROVER PROFILE RESTRICTIONS ---');
    setTestAuthContext({ userId: financeUser.id, tenantId: tenant.id });

    // 4A. Finance user querying approvals queue gets ONLY financeQueue
    const financeQueueReq = new Request('http://localhost:3000/api/approvals?type=ALL', { method: 'GET' });
    const financeQueueRes = await getApprovalsHandler(financeQueueReq as any);
    const financeQueueJson = await financeQueueRes.json();

    assert(financeQueueRes.status === 200, '4.1 Finance approvals query returns HTTP 200');
    assert(financeQueueJson.prQueue.length === 0, '4.2 Finance Approver CANNOT view PR Approvals queue (empty)');
    assert(financeQueueJson.budgetQueue.length === 0, '4.3 Finance Approver CANNOT view Project Approver stage queue');

    // 4B. Finance Approver CANNOT approve PRs
    const financePrApproveReq = new Request(`http://localhost:3000/api/pr/${testPr.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const financePrApproveRes = await approvePrHandler(financePrApproveReq as any, { params: Promise.resolve({ id: testPr.id }) });
    assert(financePrApproveRes.status === 403, '4.4 Finance User approving PR blocked with HTTP 403 Forbidden');

    // 4C. Finance Approver CANNOT call Project Approver budget approval
    const { POST: approveBudgetHandler } = await import('../src/app/api/budgets/approve/route');
    const financeProjApproveReq = new Request('http://localhost:3000/api/budgets/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contributionId }),
    });
    const financeProjApproveRes = await approveBudgetHandler(financeProjApproveReq as any);
    assert(financeProjApproveRes.status === 403, '4.5 Finance User calling Project Approver API blocked with HTTP 403 Forbidden');

    // -------------------------------------------------------------------------
    // CRITERION 5: Finance approval available ONLY AFTER Project Approver approval
    // -------------------------------------------------------------------------
    console.log('\n--- CRITERION 5: APPROVAL SEQUENCE (NO BYPASSING) ---');
    const { POST: financeApproveHandler } = await import('../src/app/api/budgets/finance-approve/route');

    // 5A. Attempt Finance approval before Project Approver approval (bypassing attempt)
    setTestAuthContext({ userId: financeUser.id, tenantId: tenant.id });
    const prematureReq = new Request('http://localhost:3000/api/budgets/finance-approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contributionId }),
    });
    const prematureRes = await financeApproveHandler(prematureReq as any);
    assert(prematureRes.status === 400, '5.1 Finance approval before Project Approval blocked with HTTP 400 Bad Request');

    // 5B. Project Approver approves first
    setTestAuthContext({ userId: projectApprover.id, tenantId: tenant.id });
    const validProjApproveReq = new Request('http://localhost:3000/api/budgets/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contributionId, remarks: 'Project level scope endorsed' }),
    });
    const validProjApproveRes = await approveBudgetHandler(validProjApproveReq as any);
    const validProjApproveJson = await validProjApproveRes.json();

    assert(validProjApproveRes.status === 200, '5.2 Project Approver approval succeeded with HTTP 200');
    assert(validProjApproveJson.status === 'PENDING_FINANCE_APPROVAL', '5.3 Status advanced to PENDING_FINANCE_APPROVAL');

    // 5C. Now Finance Approver can approve
    setTestAuthContext({ userId: financeUser.id, tenantId: tenant.id });
    const validFinanceApproveReq = new Request('http://localhost:3000/api/budgets/finance-approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contributionId, remarks: 'Finance sanction approved' }),
    });
    const validFinanceApproveRes = await financeApproveHandler(validFinanceApproveReq as any);
    const validFinanceApproveJson = await validFinanceApproveRes.json();

    assert(validFinanceApproveRes.status === 200, '5.4 Finance Approver approval succeeded with HTTP 200');
    assert(validFinanceApproveJson.status === 'APPROVED', '5.5 Final status is APPROVED');

    // -------------------------------------------------------------------------
    // CRITERION 6: Project Budgets & Ledger show correct approval status & totals
    // -------------------------------------------------------------------------
    console.log('\n--- CRITERION 6: FINANCIAL INTEGRITY & LEDGER REFLECTION ---');
    setTestAuthContext({ userId: projectUser.id, tenantId: tenant.id });
    const { GET: getBudgetsHandler } = await import('../src/app/api/budgets/route');

    const budgetViewReq = new Request(`http://localhost:3000/api/budgets?projectId=${project.id}&costCentreId=${costCentre.id}`, {
      method: 'GET',
    });
    const budgetViewRes = await getBudgetsHandler(budgetViewReq as any);
    const budgetViewJson = await budgetViewRes.json();

    const targetCC = budgetViewJson.costCentres.find((cc: any) => cc.id === costCentre.id);
    assert(targetCC.approvedBudget >= 80000, '6.1 Approved budget includes the fully sanctioned amount', `Approved: ${targetCC.approvedBudget}`);

    const ledgerTx = budgetViewJson.transactions.find((t: any) => t.boqNumber === testBoqCode);
    assert(!!ledgerTx, '6.2 Ledger reflects transaction for test BOQ');
    assert(ledgerTx.status === 'APPROVED', '6.3 Ledger transaction status is APPROVED');

    // -------------------------------------------------------------------------
    // CRITERION 7: Enquiry, Messaging & Communication History
    // -------------------------------------------------------------------------
    console.log('\n--- CRITERION 7: ENQUIRY, MESSAGING & AUDIT HISTORY ---');
    const { GET: getMessagesHandler, POST: postMessageHandler } = await import('../src/app/api/approvals/messages/route');

    // 7A. Project Approver sends enquiry on PR
    setTestAuthContext({ userId: projectApprover.id, tenantId: tenant.id });
    const enquiryReq = new Request('http://localhost:3000/api/approvals/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prId: testPr.id,
        message: 'Please provide acoustic dB ratings for ducting line 1.01',
        type: 'ENQUIRY',
      }),
    });
    const enquiryRes = await postMessageHandler(enquiryReq as any);
    assert(enquiryRes.status === 201, '7.1 Clarification enquiry sent with HTTP 201');

    // 7B. Requester sends reply
    setTestAuthContext({ userId: projectUser.id, tenantId: tenant.id });
    const replyReq = new Request('http://localhost:3000/api/approvals/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prId: testPr.id,
        message: 'Rated at NC-35 acoustic compliance as per HVAC section spec.',
        type: 'MESSAGE',
      }),
    });
    const replyRes = await postMessageHandler(replyReq as any);
    assert(replyRes.status === 201, '7.2 Requester response sent with HTTP 201');

    // 7C. Retrieve conversation history
    const historyReq = new Request(`http://localhost:3000/api/approvals/messages?prId=${testPr.id}`, {
      method: 'GET',
    });
    const historyRes = await getMessagesHandler(historyReq as any);
    const historyJson = await historyRes.json();

    assert(historyRes.status === 200, '7.3 Conversation history fetched with HTTP 200');
    assert(historyJson.messages.length >= 2, '7.4 History contains both enquiry and response');
    const enquiryMsg = historyJson.messages.find((m: any) => m.type === 'ENQUIRY');
    assert(!!enquiryMsg && enquiryMsg.content.includes('dB ratings'), '7.5 Enquiry content preserved');

    // -------------------------------------------------------------------------
    // CRITERION 8: Permission & sequence enforcement on direct API access
    // -------------------------------------------------------------------------
    console.log('\n--- CRITERION 8: ROLE PERMISSION ENFORCEMENT ---');
    // Unauthorized Project User attempting to approve PR
    setTestAuthContext({ userId: projectUser.id, tenantId: tenant.id });
    const unauthPrReq = new Request(`http://localhost:3000/api/pr/${testPr.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const unauthPrRes = await approvePrHandler(unauthPrReq as any, { params: Promise.resolve({ id: testPr.id }) });
    assert(unauthPrRes.status === 403, '8.1 Project User attempting PR approval blocked with HTTP 403');

    // Unauthorized Project User attempting budget approval
    const unauthBudgetReq = new Request('http://localhost:3000/api/budgets/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contributionId }),
    });
    const unauthBudgetRes = await approveBudgetHandler(unauthBudgetReq as any);
    assert(unauthBudgetRes.status === 403, '8.2 Project User attempting Budget approval blocked with HTTP 403');

    // Clean up test data
    await prisma.pRLine.deleteMany({ where: { prId: testPr.id } });
    await prisma.pRApproval.deleteMany({ where: { prId: testPr.id } });
    await prisma.procurementRequest.delete({ where: { id: testPr.id } });
    await prisma.budgetTransaction.deleteMany({ where: { boqId: testBoq.id } });
    await prisma.budgetApproval.deleteMany({ where: { contributionId } });
    await prisma.budgetContribution.delete({ where: { id: contributionId } });
    await prisma.boqLine.deleteMany({ where: { boqRevisionId: testRevision.id } });
    await prisma.boqRevision.delete({ where: { id: testRevision.id } });
    await prisma.boq.delete({ where: { id: testBoq.id } });

  } catch (err: any) {
    console.error('Test Suite encountered error:', err);
    failed++;
  }

  console.log('\n========================================================================');
  console.log(` RESULTS: ${passed} PASSED / ${failed} FAILED (${passed + failed} TOTAL)`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite();
