// tests/boq-revision-concurrency-unique.test.ts
// Comprehensive Test Suite: Resilient BOQ Revision Creation & Concurrency Safety
import { prisma } from '../src/lib/prisma';
import { createNextBoqRevision, getHighestRevisionNumber } from '../src/lib/boq-revision-utils';

async function run() {
  console.log('============================================================');
  console.log('🧪 RUNNING BOQ REVISION CONCURRENCY & UNIQUE CONSTRAINT SUITE');
  console.log('============================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, desc: string) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ PASS: ${desc}`);
      passedTests++;
    } else {
      console.error(`  ❌ FAIL: ${desc}`);
      process.exitCode = 1;
    }
  }

  // Find tenant and project
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) throw new Error('Tenant not found');

  const project = await prisma.project.findFirst({ where: { tenantId: tenant.id } });
  if (!project) throw new Error('Project not found');

  const user = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: { in: ['PROJECT_USER', 'CLIENT_ADMIN', 'SUPER_ADMIN'] } },
  });
  if (!user) throw new Error('Authorized user not found');

  const authHeaders = {
    'x-test-user-id': user.id,
    'x-test-tenant-id': tenant.id,
  };

  const dummyExcelCsv = 'Line No,Item Description,Category,UOM,Quantity\n1,Wall Tiles 300x300,Finishes,SQFT,250\n2,Floor Screed 50mm,Civil,SQFT,250';

  // -------------------------------------------------------------
  // TEST 1: FIRST REVISION OF A NEW BOQ
  // -------------------------------------------------------------
  console.log('--- TEST 1: FIRST REVISION OF A NEW BOQ ---');
  const fd1 = new FormData();
  fd1.append('projectId', project.id);
  const blob1 = new Blob([dummyExcelCsv], { type: 'text/csv' });
  fd1.append('file', blob1, 'test_boq_initial.csv');

  const res1 = await fetch('http://localhost:3000/api/boq/upload', {
    method: 'POST',
    headers: authHeaders,
    body: fd1,
  });

  assert(res1.status === 201, `1.1: Uploading initial BOQ succeeds with HTTP 201 (Status: ${res1.status})`);
  const data1 = await res1.json();
  const boqId1 = data1.data?.boqId || data1.boqId;
  const revCode1 = data1.data?.revisionCode || data1.revisionCode;
  const revId1 = data1.data?.revisionId || data1.revisionId;

  assert(Boolean(boqId1), `1.2: New BOQ ID generated: ${boqId1}`);
  assert(revCode1 === 'R0', `1.3: First revision code is R0 (got ${revCode1})`);

  const initialRevRecord = await prisma.boqRevision.findUnique({ where: { id: revId1 } });
  assert(initialRevRecord?.revisionNumber === 0, '1.4: Initial revisionNumber in database is strictly 0');
  assert(initialRevRecord?.boqId === boqId1, '1.5: Revision is properly scoped to boqId');

  // -------------------------------------------------------------
  // TEST 2: SECOND AND SUBSEQUENT REVISIONS OF THE SAME BOQ
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: SECOND AND SUBSEQUENT REVISIONS OF THE SAME BOQ ---');
  // First, simulate lines added to R0 so it is not an empty draft
  await prisma.boqRevision.update({
    where: { id: revId1 },
    data: { totalLines: 2, status: 'APPROVED' },
  });

  // Upload revision 2 (R1) for the same BOQ
  const fd2 = new FormData();
  fd2.append('projectId', project.id);
  fd2.append('boqId', boqId1);
  const blob2 = new Blob([dummyExcelCsv + '\n3,Paint 2 coats,Finishes,SQFT,500'], { type: 'text/csv' });
  fd2.append('file', blob2, 'test_boq_rev1.csv');

  const res2 = await fetch('http://localhost:3000/api/boq/upload', {
    method: 'POST',
    headers: authHeaders,
    body: fd2,
  });

  assert(res2.status === 201, `2.1: Second revision upload succeeds with HTTP 201 (Status: ${res2.status})`);
  const data2 = await res2.json();
  const revCode2 = data2.data?.revisionCode || data2.revisionCode;
  const revId2 = data2.data?.revisionId || data2.revisionId;
  assert(revCode2 === 'R1', `2.2: Second revision code is R1 (got ${revCode2})`);

  const revRecord2 = await prisma.boqRevision.findUnique({ where: { id: revId2 } });
  assert(revRecord2?.revisionNumber === 1, '2.3: Second revisionNumber is strictly 1');

  // Create third revision (R2) via new-revision branching API
  await prisma.boqRevision.update({
    where: { id: revId2 },
    data: { status: 'APPROVED' },
  });

  const res3 = await fetch(`http://localhost:3000/api/boq/${revId2}/new-revision`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
  });

  assert(res3.status === 201, `2.4: Third revision creation from approved R1 succeeds (HTTP 201)`);
  const data3 = await res3.json();
  const revCode3 = data3.data?.revisionCode || data3.revisionCode;
  const revId3 = data3.data?.revisionId || data3.revisionId;
  assert(revCode3 === 'R2', `2.5: Third revision code is R2 (got ${revCode3})`);

  const revRecord3 = await prisma.boqRevision.findUnique({ where: { id: revId3 } });
  assert(revRecord3?.revisionNumber === 2, '2.6: Third revisionNumber is strictly 2');

  // Verify all 3 revisions exist for boqId1
  const allRevsBoq1 = await prisma.boqRevision.findMany({
    where: { boqId: boqId1 },
    orderBy: { revisionNumber: 'asc' },
  });
  assert(allRevsBoq1.length === 3, '2.7: All 3 revisions (R0, R1, R2) preserved without deletion or overwrite');
  assert(
    allRevsBoq1.map(r => r.revisionNumber).join(',') === '0,1,2',
    '2.8: Revision sequence is continuous and ordered (0, 1, 2)'
  );

  // -------------------------------------------------------------
  // TEST 3: REVISIONS OF TWO DIFFERENT BOQS (ISOLATED NUMBERING)
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: REVISIONS OF TWO DIFFERENT BOQS ---');
  // Create BOQ 2
  const fdBoqB = new FormData();
  fdBoqB.append('projectId', project.id);
  const blobB = new Blob(['Line No,Description\n1,Distinct BOQ B Item'], { type: 'text/csv' });
  fdBoqB.append('file', blobB, 'boq_b_initial.csv');

  const resBoqB = await fetch('http://localhost:3000/api/boq/upload', {
    method: 'POST',
    headers: authHeaders,
    body: fdBoqB,
  });

  assert(resBoqB.status === 201, `3.1: Distinct BOQ B initial upload succeeds (HTTP 201)`);
  const dataB = await resBoqB.json();
  const boqIdB = dataB.data?.boqId || dataB.boqId;
  const revCodeB = dataB.data?.revisionCode || dataB.revisionCode;
  assert(boqIdB !== boqId1, '3.2: BOQ B has a distinct unique ID');
  assert(revCodeB === 'R0', `3.3: BOQ B starts at R0 independently of BOQ 1's R2 (got ${revCodeB})`);

  // Add R1 to BOQ B
  await prisma.boqRevision.updateMany({
    where: { boqId: boqIdB },
    data: { status: 'APPROVED', totalLines: 1 },
  });

  const fdBoqB2 = new FormData();
  fdBoqB2.append('projectId', project.id);
  fdBoqB2.append('boqId', boqIdB);
  fdBoqB2.append('file', new Blob(['Line No,Description\n1,Item 1\n2,Item 2'], { type: 'text/csv' }), 'boq_b_rev1.csv');

  const resBoqB2 = await fetch('http://localhost:3000/api/boq/upload', {
    method: 'POST',
    headers: authHeaders,
    body: fdBoqB2,
  });
  const dataB2 = await resBoqB2.json();
  const revCodeB2 = dataB2.data?.revisionCode || dataB2.revisionCode;
  assert(revCodeB2 === 'R1', `3.4: BOQ B advances to R1 without colliding with BOQ 1 (got ${revCodeB2})`);

  // -------------------------------------------------------------
  // TEST 4: RE-UPLOADING THE SAME FILE (SAFE DRAFT REUSE)
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: RE-UPLOADING THE SAME FILE ---');
  // Create a clean BOQ in draft
  const fdClean = new FormData();
  fdClean.append('projectId', project.id);
  const identicalBlob = new Blob(['Line No,Description\n1,Identical Content A\n2,Identical Content B'], { type: 'text/csv' });
  fdClean.append('file', identicalBlob, 'reupload_test.csv');

  const resReupload1 = await fetch('http://localhost:3000/api/boq/upload', {
    method: 'POST',
    headers: authHeaders,
    body: fdClean,
  });
  assert(resReupload1.status === 201, '4.1: Initial upload of test file succeeds');
  const dataRe1 = await resReupload1.json();
  const reuploadBoqId = dataRe1.data?.boqId || dataRe1.boqId;
  const reuploadRevId = dataRe1.data?.revisionId || dataRe1.revisionId;

  // Re-upload the exact same file to the same boqId
  const fdReupload2 = new FormData();
  fdReupload2.append('projectId', project.id);
  fdReupload2.append('boqId', reuploadBoqId);
  fdReupload2.append('file', identicalBlob, 'reupload_test.csv');

  const resReupload2 = await fetch('http://localhost:3000/api/boq/upload', {
    method: 'POST',
    headers: authHeaders,
    body: fdReupload2,
  });

  assert(resReupload2.status === 201, `4.2: Re-uploading same file succeeds without unique key error (HTTP ${resReupload2.status})`);
  const dataRe2 = await resReupload2.json();
  const secondRevId = dataRe2.data?.revisionId || dataRe2.revisionId;
  assert(secondRevId === reuploadRevId, '4.3: Safely reused/updated the existing draft revision instead of creating duplicate');

  // -------------------------------------------------------------
  // TEST 5: DOUBLE-CLICK OR REPEATED RAPID SUBMISSION
  // -------------------------------------------------------------
  console.log('\n--- TEST 5: DOUBLE-CLICK OR REPEATED SUBMISSION ---');
  const fdDc1 = new FormData();
  fdDc1.append('projectId', project.id);
  fdDc1.append('boqId', reuploadBoqId);
  const dcBlob = new Blob(['Line No,Description\n1,Rapid Content'], { type: 'text/csv' });
  fdDc1.append('file', dcBlob, 'rapid_click.csv');

  const fdDc2 = new FormData();
  fdDc2.append('projectId', project.id);
  fdDc2.append('boqId', reuploadBoqId);
  fdDc2.append('file', dcBlob, 'rapid_click.csv');

  // Trigger both nearly simultaneously
  const [dcRes1, dcRes2] = await Promise.all([
    fetch('http://localhost:3000/api/boq/upload', { method: 'POST', headers: authHeaders, body: fdDc1 }),
    fetch('http://localhost:3000/api/boq/upload', { method: 'POST', headers: authHeaders, body: fdDc2 }),
  ]);

  assert(dcRes1.status === 201, `5.1: Rapid request 1 succeeded with HTTP ${dcRes1.status}`);
  assert(dcRes2.status === 201, `5.2: Rapid request 2 succeeded with HTTP ${dcRes2.status}`);

  // -------------------------------------------------------------
  // TEST 6: TWO CONCURRENT REVISION REQUESTS FOR THE SAME BOQ
  // -------------------------------------------------------------
  console.log('\n--- TEST 6: TWO CONCURRENT REVISION REQUESTS FOR THE SAME BOQ ---');
  // Use createNextBoqRevision directly with concurrent executions
  const [concurRevA, concurRevB] = await Promise.all([
    createNextBoqRevision({
      boqId: boqId1,
      tenantId: tenant.id,
      createdById: user.id,
      notes: 'Concurrent Worker Alpha',
    }),
    createNextBoqRevision({
      boqId: boqId1,
      tenantId: tenant.id,
      createdById: user.id,
      notes: 'Concurrent Worker Beta',
    }),
  ]);

  assert(Boolean(concurRevA && concurRevB), '6.1: Both concurrent revision creations resolved successfully');
  assert(concurRevA.id !== concurRevB.id, '6.2: Concurrent revisions have distinct IDs');
  assert(
    concurRevA.revisionNumber !== concurRevB.revisionNumber,
    `6.3: Revision numbers are strictly unique: Worker Alpha=${concurRevA.revisionNumber}, Worker Beta=${concurRevB.revisionNumber}`
  );
  assert(
    Math.abs(concurRevA.revisionNumber - concurRevB.revisionNumber) === 1,
    '6.4: Revisions were allocated adjacent sequential numbers'
  );

  // -------------------------------------------------------------
  // TEST 7: FAILED UPLOAD FOLLOWED BY A RETRY
  // -------------------------------------------------------------
  console.log('\n--- TEST 7: FAILED UPLOAD FOLLOWED BY A RETRY ---');
  // Attempt invalid upload with bad file extension
  const badFd = new FormData();
  badFd.append('projectId', project.id);
  badFd.append('file', new Blob(['Bad file'], { type: 'text/plain' }), 'invalid_file.txt');

  const failRes = await fetch('http://localhost:3000/api/boq/upload', {
    method: 'POST',
    headers: authHeaders,
    body: badFd,
  });
  assert(failRes.status === 400, `7.1: Invalid upload correctly rejected with HTTP 400 (Status: ${failRes.status})`);

  // Retry with valid file
  const retryFd = new FormData();
  retryFd.append('projectId', project.id);
  retryFd.append('file', new Blob(['Line No,Description\n1,Clean Retry Line'], { type: 'text/csv' }), 'retry_success.csv');

  const retryRes = await fetch('http://localhost:3000/api/boq/upload', {
    method: 'POST',
    headers: authHeaders,
    body: retryFd,
  });
  assert(retryRes.status === 201, `7.2: Follow-up retry after failure succeeds with HTTP 201 (Status: ${retryRes.status})`);

  // -------------------------------------------------------------
  // TEST 8: DATABASE SCHEMA CONSTRAINT & DATA INTEGRITY
  // -------------------------------------------------------------
  console.log('\n--- 8. DATABASE INTEGRITY & CONSTRAINT PRESERVATION ---');
  // Attempt to manually insert a duplicate (boqId, revisionNumber) to verify database constraint is actively protecting integrity
  let caughtConstraintError = false;
  try {
    await prisma.boqRevision.create({
      data: {
        tenantId: tenant.id,
        boqId: boqId1,
        revisionNumber: initialRevRecord!.revisionNumber, // 0 -> already exists!
        revisionCode: 'R0',
        createdById: user.id,
      },
    });
  } catch (err: any) {
    if (err?.code === 'P2002' || (err?.message && err.message.includes('Unique constraint failed'))) {
      caughtConstraintError = true;
    }
  }

  assert(
    caughtConstraintError,
    '8.1: Unique constraint @@unique([boqId, revisionNumber]) is ACTIVE and protected database from direct duplicate insertion'
  );

  console.log('\n============================================================');
  console.log(`🏁 TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log('============================================================\n');

  if (passedTests === totalTests) {
    console.log('✨ SUCCESS: All BOQ revision concurrency and unique constraint tests passed flawlessly!');
    process.exit(0);
  } else {
    console.error('💥 FAILURE: Some tests failed.');
    process.exit(1);
  }
}

run()
  .catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
