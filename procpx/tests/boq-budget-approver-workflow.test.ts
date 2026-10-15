// tests/boq-budget-approver-workflow.test.ts
// Comprehensive Automated Test Suite for BOQ Budget Contribution & Project Approver Approval Workflow

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
  console.log('🚀 PROCPX BOQ BUDGET CONTRIBUTION & APPROVER WORKFLOW ACCEPTANCE SUITE');
  console.log('========================================================================\n');

  try {
    // Setup / retrieve tenant, users, and project
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

    const project = await prisma.project.findFirst({
      where: { tenantId: tenant.id, projectCode: 'CPX-P-000001' },
      include: { costCentres: true },
    });
    if (!project) throw new Error('Project CPX-P-000001 not found');

    const costCentre = project.costCentres[0];
    if (!costCentre) throw new Error('Cost centre not found');

    // Retrieve or create a test BOQ with non-zero lines and categories for this workflow test
    const categoryCivil = await prisma.category.findFirst({
      where: { tenantId: tenant.id, name: 'Civil & Interior' },
    });
    const categoryElec = await prisma.category.findFirst({
      where: { tenantId: tenant.id, name: 'Electrical & Automation' },
    });
    const uomNos = await prisma.uomMaster.findFirst({
      where: { tenantId: tenant.id, code: 'NOS' },
    });

    const boqCode = `BOQ-TEST-${Date.now().toString().slice(-6)}`;
    const testBoq = await prisma.boq.create({
      data: {
        tenantId: tenant.id,
        projectId: project.id,
        costCentreId: costCentre.id,
        boqCode,
        title: 'Workflow Test BOQ',
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
        createdById: projectUser.id,
        totalLines: 2,
        validLines: 2,
      },
    });

    await prisma.boqLine.create({
      data: {
        tenantId: tenant.id,
        boqRevisionId: testRevision.id,
        lineNumber: '1.01',
        originalDescription: 'Vitrified Floor Tiles',
        categoryId: categoryCivil?.id || null,
        uomId: uomNos?.id || null,
        quantity: 100,
        aiUnitCost: 250,
        aiTotalCost: 25000,
      },
    });

    await prisma.boqLine.create({
      data: {
        tenantId: tenant.id,
        boqRevisionId: testRevision.id,
        lineNumber: '2.01',
        originalDescription: 'LED Recessed Downlights',
        categoryId: categoryElec?.id || null,
        uomId: uomNos?.id || null,
        quantity: 50,
        aiUnitCost: 300,
        aiTotalCost: 15000,
      },
    });

    const expectedTotal = 40000;

    // -------------------------------------------------------------------------
    // TEST 1: Add to Budget creates contribution and transactions with status Under Approval
    // -------------------------------------------------------------------------
    console.log('--- TEST 1: ADD TO BUDGET (UNDER APPROVAL) ---');
    setTestAuthContext({ userId: projectUser.id, tenantId: tenant.id });
    const { POST: addToBudgetHandler } = await import('../src/app/api/boq/add-to-budget/route');

    const addReq = new Request('http://localhost:3000/api/boq/add-to-budget', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        boqRevisionId: testRevision.id,
        costCentreId: costCentre.id,
      }),
    });

    const addRes = await addToBudgetHandler(addReq as any);
    const addData = await addRes.json();

    assert(addRes.status === 201, '1.1 HTTP 201 response', `Received status ${addRes.status}`);
    assert(addData.status === 'UNDER_APPROVAL', '1.2 Status is UNDER_APPROVAL in response', `Received ${addData.status}`);

    const contribRecord = await prisma.budgetContribution.findFirst({
      where: { boqRevisionId: testRevision.id },
      include: { transactions: true },
    });
    assert(!!contribRecord, '1.3 Contribution record created in database');
    assert(contribRecord?.status === 'UNDER_APPROVAL', '1.4 Contribution database status is UNDER_APPROVAL', `Status: ${contribRecord?.status}`);
    assert(contribRecord?.totalEstimatedValue === expectedTotal, '1.5 Total estimated value calculated correctly', `Value: ${contribRecord?.totalEstimatedValue}`);
    assert((contribRecord?.transactions.length || 0) >= 2, '1.6 Category transactions created for each category', `Count: ${contribRecord?.transactions.length}`);

    const allTxUnderApproval = contribRecord?.transactions.every(t => t.status === 'UNDER_APPROVAL');
    assert(allTxUnderApproval === true, '1.7 All budget transactions have status UNDER_APPROVAL');

    // -------------------------------------------------------------------------
    // TEST 2: Repeated submission prevents duplicate contributions
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: DUPLICATE PREVENTION ON REPEATED SUBMISSION ---');
    setTestAuthContext({ userId: projectUser.id, tenantId: tenant.id });
    const repeatReq = new Request('http://localhost:3000/api/boq/add-to-budget', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        boqRevisionId: testRevision.id,
        costCentreId: costCentre.id,
      }),
    });

    const repeatRes = await addToBudgetHandler(repeatReq as any);
    const repeatData = await repeatRes.json();

    assert(repeatRes.status === 200, '2.1 Repeated submission returns HTTP 200 idempotent');
    assert(repeatData.alreadySubmitted === true, '2.2 Response marks alreadySubmitted as true');
    assert(repeatData.status === 'UNDER_APPROVAL', '2.3 Response preserves status UNDER_APPROVAL');

    const totalContribs = await prisma.budgetContribution.count({
      where: { boqRevisionId: testRevision.id },
    });
    assert(totalContribs === 1, '2.4 Exactly one contribution exists (no duplicate contribution created)', `Count: ${totalContribs}`);

    const totalTxs = await prisma.budgetTransaction.count({
      where: { contributionId: contribRecord!.id },
    });
    assert(totalTxs === contribRecord!.transactions.length, '2.5 Exactly the same number of transactions exist (no duplicate transactions)', `Count: ${totalTxs}`);

    // -------------------------------------------------------------------------
    // TEST 3: Project Budget API shows pending contribution under correct CC & Category
    // Approved budget totals remain unchanged before approval
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: PROJECT BUDGET VIEW BEFORE APPROVAL ---');
    setTestAuthContext({ userId: projectUser.id, tenantId: tenant.id });
    const { GET: getBudgetsHandler } = await import('../src/app/api/budgets/route');

    const budgetReq = new Request(`http://localhost:3000/api/budgets?projectId=${project.id}&costCentreId=${costCentre.id}`, {
      method: 'GET',
    });

    const budgetRes = await getBudgetsHandler(budgetReq as any);
    const budgetJson = await budgetRes.json();

    assert(budgetRes.status === 200, '3.1 Budget listing returns HTTP 200');

    const targetCC = budgetJson.costCentres.find((cc: any) => cc.id === costCentre.id);
    assert(!!targetCC, '3.2 Target Cost Centre found in budget response');
    assert(targetCC.pendingBudget >= expectedTotal, '3.3 Pending budget reflects the pending contribution', `Pending: ${targetCC.pendingBudget}`);

    // Category check
    const pendingCat = targetCC.categories.find((cat: any) => cat.status === 'UNDER_APPROVAL');
    assert(!!pendingCat, '3.4 Category status is UNDER_APPROVAL while awaiting approval');
    assert(pendingCat.pendingBudget > 0, '3.5 Category shows pendingBudget > 0');

    // -------------------------------------------------------------------------
    // TEST 4: Approvals Queue API routes to Project Approver
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: APPROVALS QUEUE ROUTING ---');
    setTestAuthContext({ userId: projectApprover.id, tenantId: tenant.id });
    const { GET: getApprovalsHandler } = await import('../src/app/api/approvals/route');

    const queueReq = new Request('http://localhost:3000/api/approvals?type=BUDGET', {
      method: 'GET',
    });

    const queueRes = await getApprovalsHandler(queueReq as any);
    const queueJson = await queueRes.json();

    const queuedContrib = queueJson.budgetQueue.find((q: any) => q.id === contribRecord!.id);
    assert(!!queuedContrib, '4.1 Contribution appears in Project Approver budget queue');
    assert(queuedContrib.boqRevision?.id === testRevision.id, '4.2 Preserves reference to BOQ revision');

    // -------------------------------------------------------------------------
    // TEST 5: Permission Enforcement - Project User CANNOT approve
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: PERMISSION ENFORCEMENT ---');
    setTestAuthContext({ userId: projectUser.id, tenantId: tenant.id }); // Project User has NO BUDGET_APPROVE
    const { POST: approveBudgetHandler } = await import('../src/app/api/budgets/approve/route');

    const unauthorizedReq = new Request('http://localhost:3000/api/budgets/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contributionId: contribRecord!.id,
        remarks: 'Attempt by unauthorised user',
      }),
    });

    const unauthorizedRes = await approveBudgetHandler(unauthorizedReq as any);
    assert(unauthorizedRes.status === 403, '5.1 Unauthorised user approval blocked with HTTP 403 Forbidden', `Status: ${unauthorizedRes.status}`);

    // -------------------------------------------------------------------------
    // TEST 6: Project Approver Approval updates contribution & transactions to Approved
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: PROJECT APPROVER APPROVAL ---');
    setTestAuthContext({ userId: projectApprover.id, tenantId: tenant.id }); // Authorized Project Approver
    const approveReq = new Request('http://localhost:3000/api/budgets/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contributionId: contribRecord!.id,
        remarks: 'Approved by project approver test',
      }),
    });

    const approveRes = await approveBudgetHandler(approveReq as any);
    const approveData = await approveRes.json();

    assert(approveRes.status === 200, '6.1 Project Approver approval returns HTTP 200');
    assert(approveData.status === 'PENDING_FINANCE_APPROVAL', '6.2 Pending Finance Approval status in response');

    // Finance User completes final approval
    const financeUser = await prisma.user.findFirst({
      where: { tenantId: tenant.id, role: 'FINANCE_USER' },
    });
    if (!financeUser) throw new Error('Finance user not found');

    setTestAuthContext({ userId: financeUser.id, tenantId: tenant.id });
    const { POST: financeApproveHandler } = await import('../src/app/api/budgets/finance-approve/route');
    const fApproveReq = new Request('http://localhost:3000/api/budgets/finance-approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contributionId: contribRecord!.id,
        remarks: 'Sanctioned by Finance User test',
      }),
    });
    const fApproveRes = await financeApproveHandler(fApproveReq as any);
    const fApproveData = await fApproveRes.json();
    assert(fApproveRes.status === 200, '6.2b Finance Approver approval returns HTTP 200');
    assert(fApproveData.status === 'APPROVED', '6.2c Final status is APPROVED');

    const updatedContrib = await prisma.budgetContribution.findUnique({
      where: { id: contribRecord!.id },
      include: { transactions: true, approvals: true },
    });
    assert(updatedContrib?.status === 'APPROVED', '6.3 Database status updated to APPROVED');
    assert(!!updatedContrib?.projectApprovedAt, '6.4 projectApprovedAt timestamp is recorded');
    assert(updatedContrib?.projectApprovedBy === projectApprover.id, '6.5 projectApprovedBy records approver ID');

    const updatedTxs = updatedContrib?.transactions || [];
    const allTxsApproved = updatedTxs.every(t => t.status === 'APPROVED');
    assert(allTxsApproved === true, '6.6 All transactions updated to APPROVED without creating duplicates');
    assert(updatedTxs.length === contribRecord!.transactions.length, '6.7 Transaction count preserved (no duplicate transactions)');

    // -------------------------------------------------------------------------
    // TEST 7: Project Budget View after Approval shows Approved category budget
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: PROJECT BUDGET VIEW AFTER APPROVAL ---');
    setTestAuthContext({ userId: projectUser.id, tenantId: tenant.id });
    const afterApproveReq = new Request(`http://localhost:3000/api/budgets?projectId=${project.id}&costCentreId=${costCentre.id}`, {
      method: 'GET',
    });
    const afterApproveRes = await getBudgetsHandler(afterApproveReq as any);
    const afterApproveJson = await afterApproveRes.json();

    const afterApproveCC = afterApproveJson.costCentres.find((cc: any) => cc.id === costCentre.id);
    assert(afterApproveCC.approvedBudget >= expectedTotal, '7.1 Approved budget includes the approved contribution', `Approved: ${afterApproveCC.approvedBudget}`);

    // -------------------------------------------------------------------------
    // TEST 8: Budget Transaction Ledger shows status and traceability
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 8: BUDGET TRANSACTION LEDGER TRACEABILITY ---');
    const ledgerTxs = afterApproveJson.transactions.filter((t: any) => t.boqNumber === boqCode);
    assert(ledgerTxs.length >= 2, '8.1 Ledger contains transactions with matching BOQ number');

    const firstLedgerTx = ledgerTxs[0];
    assert(firstLedgerTx.status === 'APPROVED', '8.2 Ledger transaction status is APPROVED');
    assert(firstLedgerTx.boqRevision === 'R0', '8.3 Ledger transaction references BOQ Revision');
    assert(!!firstLedgerTx.submitter, '8.4 Submitter is preserved in transaction');
    assert(firstLedgerTx.approver === projectApprover.id, '8.5 Approver ID is preserved in transaction');
    assert(!!firstLedgerTx.approvedAt, '8.6 Approval date is preserved in transaction');

    // -------------------------------------------------------------------------
    // TEST 9: Budget Rejection Workflow with Mandatory Rejection Reason
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 9: REJECTION WORKFLOW ---');
    // Create a 2nd BOQ to test rejection
    const rejectBoqCode = `BOQ-REJ-${Date.now().toString().slice(-6)}`;
    const rejectBoq = await prisma.boq.create({
      data: {
        tenantId: tenant.id,
        projectId: project.id,
        costCentreId: costCentre.id,
        boqCode: rejectBoqCode,
        title: 'Rejection Test BOQ',
        category: 'Fitout',
        status: 'SUBMITTED',
        createdBy: projectUser.id,
      },
    });

    const rejectRevision = await prisma.boqRevision.create({
      data: {
        tenantId: tenant.id,
        boqId: rejectBoq.id,
        costCentreId: costCentre.id,
        revisionNumber: 0,
        revisionCode: 'R0',
        status: 'SUBMITTED',
        createdById: projectUser.id,
        totalLines: 1,
        validLines: 1,
      },
    });

    await prisma.boqLine.create({
      data: {
        tenantId: tenant.id,
        boqRevisionId: rejectRevision.id,
        lineNumber: '1.01',
        originalDescription: 'Plumbing Works',
        categoryId: categoryCivil?.id || null,
        uomId: uomNos?.id || null,
        quantity: 10,
        aiUnitCost: 1000,
        aiTotalCost: 10000,
      },
    });

    // Add to Budget
    setTestAuthContext({ userId: projectUser.id, tenantId: tenant.id });
    const addRejectReq = new Request('http://localhost:3000/api/boq/add-to-budget', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        boqRevisionId: rejectRevision.id,
        costCentreId: costCentre.id,
      }),
    });
    const addRejectRes = await addToBudgetHandler(addRejectReq as any);
    const addRejectData = await addRejectRes.json();
    assert(addRejectRes.status === 201, '9.1 Rejection test BOQ added with HTTP 201');

    // Record baseline approved budget before rejection
    const preRejectReq = new Request(`http://localhost:3000/api/budgets?projectId=${project.id}&costCentreId=${costCentre.id}`, {
      method: 'GET',
    });
    const preRejectRes = await getBudgetsHandler(preRejectReq as any);
    const preRejectJson = await preRejectRes.json();
    const approvedBudgetPreReject = preRejectJson.costCentres.find((cc: any) => cc.id === costCentre.id).approvedBudget;

    // Reject without reason should fail
    setTestAuthContext({ userId: projectApprover.id, tenantId: tenant.id });
    const { POST: rejectBudgetHandler } = await import('../src/app/api/budgets/reject/route');
    const rejectNoReasonReq = new Request('http://localhost:3000/api/budgets/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contributionId: addRejectData.contributionId,
        reason: '',
      }),
    });
    const rejectNoReasonRes = await rejectBudgetHandler(rejectNoReasonReq as any);
    assert(rejectNoReasonRes.status === 400, '9.2 Rejection without reason rejected with HTTP 400');

    // Reject with reason
    const rejectionReason = 'Rates exceed commercial benchmark for plumbing.';
    const rejectReq = new Request('http://localhost:3000/api/budgets/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contributionId: addRejectData.contributionId,
        reason: rejectionReason,
      }),
    });
    const rejectRes = await rejectBudgetHandler(rejectReq as any);
    const rejectData = await rejectRes.json();
    assert(rejectRes.status === 200, '9.3 Rejection succeeded with HTTP 200');
    assert(rejectData.status === 'REJECTED', '9.4 Status is REJECTED');

    const rejectedContrib = await prisma.budgetContribution.findUnique({
      where: { id: addRejectData.contributionId },
      include: { transactions: true },
    });
    assert(rejectedContrib?.status === 'REJECTED', '9.5 Contribution status in DB is REJECTED');
    assert(rejectedContrib?.rejectionReason === rejectionReason, '9.6 Rejection reason captured in DB');

    const allRejectedTxs = rejectedContrib?.transactions.every(t => t.status === 'REJECTED');
    assert(allRejectedTxs === true, '9.7 Transactions retained with status REJECTED');

    // Verify approved budget totals remained unchanged
    setTestAuthContext({ userId: projectUser.id, tenantId: tenant.id });
    const postRejectReq = new Request(`http://localhost:3000/api/budgets?projectId=${project.id}&costCentreId=${costCentre.id}`, {
      method: 'GET',
    });
    const postRejectRes = await getBudgetsHandler(postRejectReq as any);
    const postRejectJson = await postRejectRes.json();
    const approvedBudgetPostReject = postRejectJson.costCentres.find((cc: any) => cc.id === costCentre.id).approvedBudget;

    assert(approvedBudgetPreReject === approvedBudgetPostReject, '9.8 Approved budget totals remain completely unchanged after rejection', `Pre: ${approvedBudgetPreReject}, Post: ${approvedBudgetPostReject}`);

    // Cleanup test BOQs
    await prisma.budgetTransaction.deleteMany({
      where: { boqId: { in: [testBoq.id, rejectBoq.id] } },
    });
    await prisma.budgetApproval.deleteMany({
      where: { contributionId: { in: [contribRecord!.id, addRejectData.contributionId] } },
    });
    await prisma.budgetContribution.deleteMany({
      where: { id: { in: [contribRecord!.id, addRejectData.contributionId] } },
    });
    await prisma.boqLine.deleteMany({
      where: { boqRevisionId: { in: [testRevision.id, rejectRevision.id] } },
    });
    await prisma.boqRevision.deleteMany({
      where: { id: { in: [testRevision.id, rejectRevision.id] } },
    });
    await prisma.boq.deleteMany({
      where: { id: { in: [testBoq.id, rejectBoq.id] } },
    });

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
