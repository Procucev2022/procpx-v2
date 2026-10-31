// scripts/test-http-endpoints.ts
import { prisma } from '../src/lib/prisma';

async function run() {
  console.log('=== HTTP API ENDPOINT & ROLE PERMISSION VALIDATION ===\n');

  const user = await prisma.user.findFirst({
    where: { email: 'project.user@procpx.internal' },
  });
  if (!user) throw new Error('Test user not found');

  const headers = {
    'x-test-user-id': user.id,
    'x-test-tenant-id': user.tenantId,
    'Content-Type': 'application/json',
  };

  // 1. GET /api/boq
  const listRes = await fetch('http://localhost:3000/api/boq', { headers });
  console.log(`✓ 1. GET /api/boq: HTTP status ${listRes.status}`);
  const listData = await listRes.json();
  const boqs = listData.data || listData || [];
  console.log(`     Found ${boqs.length} BOQs.`);
  if (listRes.status !== 200) throw new Error('GET /api/boq failed');

  // 2. GET /api/boq/{boqId}
  const testBoq = boqs[0];
  const singleRes = await fetch(`http://localhost:3000/api/boq/${testBoq.id}`, { headers });
  console.log(`✓ 2. GET /api/boq/${testBoq.id}: HTTP status ${singleRes.status}`);
  const singleData = await singleRes.json();
  const singleBoqCode = singleData.data?.boq?.boqCode || singleData.boq?.boqCode;
  const singleLines = singleData.data?.lines || singleData.lines || [];
  console.log(`     Loaded BOQ: ${singleBoqCode}, Lines: ${singleLines.length}`);
  if (singleRes.status !== 200) throw new Error('GET /api/boq/{boqId} failed');

  const revId = testBoq.revisions?.[0]?.id || singleData.data?.revision?.id || singleData.revision?.id;

  // 3. GET /api/boq/{revId}/lines
  const linesRes = await fetch(`http://localhost:3000/api/boq/${revId}/lines?pageSize=10`, { headers });
  console.log(`✓ 3. GET /api/boq/${revId}/lines: HTTP status ${linesRes.status}`);
  const linesData = await linesRes.json();
  console.log(`     Lines count: ${linesData.data?.length || 0}, Total: ${linesData.total || 0}`);
  if (linesRes.status !== 200) throw new Error('GET /api/boq/{revId}/lines failed');

  // 4. POST /api/boq/{revId}/lines (Add Line)
  const addRes = await fetch(`http://localhost:3000/api/boq/${revId}/lines`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      description: 'API Validation Item - Armoured Cable',
      specification: 'Heavy duty 1100V copper cable',
      uomRaw: 'MTR',
      quantity: 50,
      aiUnitCost: 180,
    }),
  });
  console.log(`✓ 4. POST /api/boq/${revId}/lines: HTTP status ${addRes.status}`);
  const addData = await addRes.json();
  const newLine = addData.data?.line || addData.line;
  if (addRes.status !== 200 && addRes.status !== 201) throw new Error('Add line failed');

  // 5. PUT /api/boq/{revId}/lines (Edit Line)
  const putRes = await fetch(`http://localhost:3000/api/boq/${revId}/lines`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      lineId: newLine.id,
      updates: { quantity: 75 },
    }),
  });
  console.log(`✓ 5. PUT /api/boq/${revId}/lines: HTTP status ${putRes.status}`);
  if (putRes.status !== 200) throw new Error('Edit line failed');

  // 6. POST /api/boq/estimate-cost (AI Cost Generation)
  const estRes = await fetch('http://localhost:3000/api/boq/estimate-cost', {
    method: 'POST',
    headers,
    body: JSON.stringify({ boqRevisionId: revId }),
  });
  console.log(`✓ 6. POST /api/boq/estimate-cost: HTTP status ${estRes.status}`);
  const estData = await estRes.json();
  const benchmarkTotal = estData.data?.totalEstimatedBenchmarkValue || estData.totalEstimatedBenchmarkValue;
  console.log(`     AI Benchmark Total Calculated: ₹ ${benchmarkTotal?.toLocaleString('en-IN')}`);
  if (estRes.status !== 200) throw new Error('AI Cost failed');

  // 7. DELETE /api/boq/{revId}/lines (Delete Line)
  const delRes = await fetch(`http://localhost:3000/api/boq/${revId}/lines?lineId=${newLine.id}`, {
    method: 'DELETE',
    headers,
  });
  console.log(`✓ 7. DELETE /api/boq/${revId}/lines: HTTP status ${delRes.status}`);
  if (delRes.status !== 200) throw new Error('Delete line failed');

  // 8. Test 403 Forbidden for VIEWER attempting BOQ_EDIT
  let viewerUser = await prisma.user.findFirst({ where: { role: 'VIEWER' } });
  if (!viewerUser) {
    viewerUser = await prisma.user.create({
      data: {
        email: 'viewer.test@procpx.internal',
        name: 'Guest Viewer',
        role: 'VIEWER',
        tenantId: user.tenantId,
        passwordHash: 'test',
      },
    });
  }

  const forbiddenRes = await fetch(`http://localhost:3000/api/boq/${revId}/lines`, {
    method: 'POST',
    headers: {
      'x-test-user-id': viewerUser.id,
      'x-test-tenant-id': viewerUser.tenantId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      description: 'Unauthorized item',
      uomRaw: 'NOS',
      quantity: 1,
    }),
  });
  console.log(`✓ 8. Role Permission Check: Viewer POST /lines returned HTTP ${forbiddenRes.status} (Expected 403 Forbidden).`);
  if (forbiddenRes.status !== 403) throw new Error(`Role test failed: expected 403, got ${forbiddenRes.status}`);

  console.log('\n================================================================');
  console.log('ALL HTTP API ENDPOINTS & ROLE CHECKS VALIDATED (PASS)');
  console.log('================================================================');
}

run().catch(e => {
  console.error('Validation Error:', e);
  process.exit(1);
});
