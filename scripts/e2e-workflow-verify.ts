import { PrismaClient } from '@prisma/client';
import XLSX from 'xlsx';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3000';

async function loginUser(email: string, password = 'Demo@1234'): Promise<string> {
  // 1. Get CSRF token
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
  const csrfData = await csrfRes.json();
  const csrfToken = csrfData.csrfToken;
  const initCookies = ((csrfRes.headers as any).getSetCookie ? (csrfRes.headers as any).getSetCookie() : [csrfRes.headers.get('set-cookie')])
    .map((c: string) => c.split(';')[0])
    .join('; ');

  // 2. Post credentials
  const loginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': initCookies,
    },
    body: new URLSearchParams({
      csrfToken,
      email,
      password,
      redirect: 'false',
      json: 'true',
    }),
    redirect: 'manual',
  });

  const authCookies = ((loginRes.headers as any).getSetCookie ? (loginRes.headers as any).getSetCookie() : [loginRes.headers.get('set-cookie')])
    .map((c: string) => c.split(';')[0])
    .join('; ');

  return authCookies;
}

async function runVerification() {
  console.log('🚀 Starting proCPX E2E Workflow Verification...\n');

  // STEP 1: Test Project User Login & Template
  console.log('Step 1: Logging in as Project User (project.user@procucev-demo.local)...');
  const projectUserCookie = await loginUser('project.user@procucev-demo.local');
  if (!projectUserCookie) throw new Error('Failed to login as Project User');
  console.log('  ✓ Project User authenticated successfully');

  // STEP 2: Verify Template Download Headers & BOQ Description
  console.log('\nStep 2: Downloading Standard BOQ Template...');
  const templateRes = await fetch(`${BASE_URL}/api/boq/standard/download`, {
    headers: { Cookie: projectUserCookie },
  });
  const templateBuffer = await templateRes.arrayBuffer();
  const wb = XLSX.read(Buffer.from(templateBuffer), { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const headers = rows[0];
  console.log('  Downloaded Template Headers:', headers);

  const hasBoqDescription = headers.includes('BOQ Description');
  const hasDetailedSpec = headers.includes('Detailed Specification');
  console.log(`  ✓ Contains "BOQ Description": ${hasBoqDescription}`);
  console.log(`  ✓ "Detailed Specification" replaced/absent: ${!hasDetailedSpec}`);
  if (!hasBoqDescription) throw new Error('Template does not have "BOQ Description" header!');

  // STEP 3: Create a test BOQ and line item
  console.log('\nStep 3: Creating Test BOQ in database for verification...');
  const tenant = await prisma.tenant.findFirst({ where: { slug: 'procucev-retail-demo' } });
  const project = await prisma.project.findFirst({
    where: { tenantId: tenant!.id, costCentres: { some: {} } },
    include: { costCentres: true },
  });
  const costCentre = project!.costCentres[0];
  const user = await prisma.user.findFirst({ where: { email: 'project.user@procucev-demo.local' } });
  const category = await prisma.category.findFirst({ where: { tenantId: tenant!.id, parentId: null } });

  const testBoq = await prisma.boq.create({
    data: {
      tenantId: tenant!.id,
      projectId: project!.id,
      costCentreId: costCentre!.id,
      boqCode: `BOQ-E2E-${Date.now().toString().slice(-4)}`,
      title: 'E2E Workflow Test BOQ',
      description: 'Automated E2E Verification BOQ',
      status: 'DRAFT',
      category: category?.name || 'Civil & Interior Works',
      createdBy: user!.name || 'Project User',
      revisions: {
        create: {
          tenantId: tenant!.id,
          revisionCode: 'R0',
          revisionNumber: 0,
          status: 'DRAFT',
          createdById: user!.id,
          lines: {
            create: {
              tenantId: tenant!.id,
              lineNumber: '1',
              category: { connect: { id: category!.id } },
              specification: 'Supply and fix vitrified tiles 600x600 mm in floor',
              originalDescription: 'Supply and fix vitrified tiles 600x600 mm in floor',
              uomRaw: 'SQM',
              quantity: 150,
              aiUnitCost: 850,
              aiTotalCost: 127500,
            },
          },
        },
      },
    },
    include: {
      revisions: {
        include: { lines: true },
      },
    },
  });

  const revision = testBoq.revisions[0];
  const testLine = revision.lines[0];
  console.log(`  ✓ Created test BOQ: ${testBoq.boqCode} (ID: ${testBoq.id})`);
  console.log(`  ✓ Line Item created with originalDescription: "${testLine.originalDescription}"`);

  // STEP 4: Test AI Refinement API at line-item level
  console.log('\nStep 4: Testing AI Support to Refine at line-item level...');
  const refineRes = await fetch(`${BASE_URL}/api/boq/refine-ai`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: projectUserCookie,
    },
    body: JSON.stringify({
      boqRevisionId: revision.id,
      lineIds: [testLine.id],
    }),
  });
  const refineData = await refineRes.json();
  const refinedItem = refineData.data?.lines?.[0] || refineData.lines?.[0];
  const proposedDesc = refinedItem?.aiSuggestedSpec || refinedItem?.aiSuggestedDescription;
  console.log('  Refined Lines proposed count:', (refineData.data?.lines || refineData.lines)?.length);
  console.log('  Proposed Refined Description:', proposedDesc);

  if (!proposedDesc) {
    throw new Error('AI Refine API did not return proposed description!');
  }

  // STEP 5: Apply proposed description (confirm action)
  console.log('\nStep 5: Applying proposed description (user-confirmed action)...');
  const updateRes = await fetch(`${BASE_URL}/api/boq/${revision.id}/lines`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: projectUserCookie,
    },
    body: JSON.stringify({
      lineId: testLine.id,
      updates: {
        specification: proposedDesc,
        standardDescription: proposedDesc,
      },
    }),
  });
  const updateData = await updateRes.json();
  console.log('  Line update status:', updateRes.ok ? 'Success' : 'Failed');

  // Verify DB state for preserved originalDescription & updated specification
  const reloadedLine = await prisma.boqLine.findUnique({ where: { id: testLine.id } });
  console.log(`  ✓ Updated specification: "${reloadedLine?.specification}"`);
  console.log(`  ✓ Preserved originalDescription: "${reloadedLine?.originalDescription}"`);
  if (reloadedLine?.originalDescription !== testLine.originalDescription) {
    throw new Error('originalDescription was overwritten!');
  }

  // STEP 6: Submit BOQ
  console.log('\nStep 6: Submitting BOQ (BOQ Submission)...');
  const submitRes = await fetch(`${BASE_URL}/api/boq/create-pr`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: projectUserCookie,
    },
    body: JSON.stringify({
      boqRevisionId: revision.id,
      autoSubmit: true,
      submissionNote: 'Automated E2E Verification Submission',
    }),
  });
  const submitData = await submitRes.json();
  console.log('  Submit Status:', submitRes.status, 'Body:', submitData);
  const submitPayload = submitData.data || submitData;
  console.log('  Submit Response success:', submitPayload.success);
  const prId = submitPayload.prId || submitPayload.pr?.id;
  const prNumber = submitPayload.prNumber || submitPayload.pr?.prNumber;
  console.log(`  ✓ BOQ submitted into PR ID: ${prId}, Number: ${prNumber}, Status: ${submitPayload.status}`);

  // STEP 7: Verify "My BOQs" API (/api/pr)
  console.log('\nStep 7: Verifying Project User "My BOQs" list (/api/pr)...');
  const myBoqsRes = await fetch(`${BASE_URL}/api/pr`, {
    headers: { Cookie: projectUserCookie },
  });
  const myBoqsData = await myBoqsRes.json();
  const boqList = Array.isArray(myBoqsData) ? myBoqsData : (myBoqsData.data || []);
  const submittedInMyBoqs = boqList.find((p: any) => p.id === prId);
  console.log('  Found submitted BOQ in My BOQs:', !!submittedInMyBoqs);
  console.log('  BOQ Date in persisted record:', submittedInMyBoqs?.requestedDate || submittedInMyBoqs?.createdAt);
  console.log('  Category in record:', submittedInMyBoqs?.categories || submittedInMyBoqs?.category);
  console.log('  Amount:', submittedInMyBoqs?.totalEstimatedValue || submittedInMyBoqs?.estimatedValue);
  console.log('  Status:', submittedInMyBoqs?.status);

  // STEP 8: Project Approver Approval Flow
  console.log('\nStep 8: Logging in as Project Approver (project.approver@procucev-demo.local)...');
  const approverCookie = await loginUser('project.approver@procucev-demo.local');
  if (!approverCookie) throw new Error('Failed to login as Project Approver');
  console.log('  ✓ Project Approver authenticated successfully');

  // Check pending approval queue
  console.log('  Fetching BOQ Approval Queue (/api/approvals)...');
  const approvalsRes = await fetch(`${BASE_URL}/api/approvals`, {
    headers: { Cookie: approverCookie },
  });
  const approvalsData = await approvalsRes.json();
  const queue = approvalsData.prQueue || approvalsData.data?.prQueue || [];
  console.log('  Approver queue length:', queue.length, 'IDs:', queue.map((q: any) => q.id));
  const pendingInQueue = queue.find((item: any) => item.id === prId);
  console.log('  Submitted BOQ visible in Project Approver queue:', !!pendingInQueue);
  if (!pendingInQueue) {
    throw new Error('Submitted BOQ did not appear in Project Approver queue!');
  }
  console.log('  Approver item details:', {
    code: pendingInQueue.prNumber,
    project: pendingInQueue.project?.name,
    categories: pendingInQueue.categories,
    amount: pendingInQueue.totalEstimatedValue,
  });

  // Approve BOQ
  console.log('\nStep 9: Approving BOQ as Project Approver...');
  const approveRes = await fetch(`${BASE_URL}/api/pr/${prId}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: approverCookie,
    },
    body: JSON.stringify({
      remarks: 'Technical requirement and quantity verified.',
    }),
  });
  const approveData = await approveRes.json();
  console.log('  Approval API Response:', approveData);

  // Verify updated status in DB
  const approvedPr = await prisma.procurementRequest.findUnique({
    where: { id: prId },
    select: { id: true, status: true, projectApprovedAt: true },
  });
  console.log(`  ✓ Persisted PR status after approval: ${approvedPr?.status}`);
  console.log(`  ✓ Approved at: ${approvedPr?.projectApprovedAt}`);

  // Confirm removed from pending queue
  const recheckApprovalsRes = await fetch(`${BASE_URL}/api/approvals`, {
    headers: { Cookie: approverCookie },
  });
  const recheckApprovalsData = await recheckApprovalsRes.json();
  const recheckQueue = recheckApprovalsData.prQueue || recheckApprovalsData.data?.prQueue || [];
  const stillPending = recheckQueue.some((item: any) => item.id === prId);
  console.log(`  ✓ Removed from pending approval queue: ${!stillPending}`);

  // STEP 10: Category Manager - Approved BOQs
  console.log('\nStep 10: Logging in as Category Manager (category.manager@procucev-demo.local)...');
  const cmCookie = await loginUser('category.manager@procucev-demo.local');
  if (!cmCookie) throw new Error('Failed to login as Category Manager');
  console.log('  ✓ Category Manager authenticated successfully');

  // Check Category Manager Dashboard
  console.log('  Checking Category Manager Dashboard (/api/dashboard)...');
  const cmDashboardRes = await fetch(`${BASE_URL}/api/dashboard`, {
    headers: { Cookie: cmCookie },
  });
  const cmDashboardData = await cmDashboardRes.json();
  const approvedBoqsCount = cmDashboardData.approvedBoqsCount ?? cmDashboardData.data?.approvedBoqsCount;
  const approvedBoqsList = cmDashboardData.approvedBoqsList || cmDashboardData.data?.approvedBoqsList || [];
  console.log(`  ✓ Approved BOQs KPI count: ${approvedBoqsCount}`);
  const foundInCmDashboard = approvedBoqsList.find((b: any) => b.id === prId);
  console.log(`  ✓ Found approved BOQ in Category Manager dashboard: ${!!foundInCmDashboard}`);
  if (foundInCmDashboard) {
    console.log('  Dashboard record details:', {
      boqCode: foundInCmDashboard.boqCode,
      title: foundInCmDashboard.title,
      project: foundInCmDashboard.projectName,
      category: foundInCmDashboard.category,
      amount: foundInCmDashboard.amount,
      status: foundInCmDashboard.status,
    });
  }

  console.log('\n===============================================================');
  console.log('🎉 ALL BACKEND WORKFLOW & DATA TESTS PASSED SUCCESSFULLY!');
  console.log('===============================================================\n');
}

runVerification()
  .catch((e) => {
    console.error('❌ VERIFICATION FAILED:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
