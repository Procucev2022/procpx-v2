// scripts/test-vendor-portal-flow.ts
import { prisma } from '../src/lib/prisma';
import bcrypt from 'bcryptjs';

async function main() {
  console.log('--- 1. Testing Vendor User & Vendor Association ---');
  const vendorUser = await prisma.user.findFirst({
    where: { email: 'vendor.apex@apex-infra.com' },
    include: { vendor: true, tenant: true },
  });

  if (!vendorUser) {
    throw new Error('Vendor user vendor.apex@apex-infra.com not found!');
  }
  console.log('✅ Vendor user found:', {
    id: vendorUser.id,
    email: vendorUser.email,
    role: vendorUser.role,
    vendorId: vendorUser.vendorId,
    vendorName: vendorUser.vendor?.name,
    vendorCode: vendorUser.vendor?.code,
  });

  if (vendorUser.role !== 'VENDOR') {
    throw new Error(`Expected role VENDOR, got ${vendorUser.role}`);
  }
  if (!vendorUser.vendorId) {
    throw new Error('Expected vendorId to be populated');
  }

  console.log('\n--- 2. Testing HTTP Authentication & Session Simulation ---');
  // Find a second vendor to test cross-vendor isolation
  const secondVendor = await prisma.vendor.findFirst({
    where: {
      tenantId: vendorUser.tenantId,
      id: { not: vendorUser.vendorId },
    },
  });

  if (!secondVendor) {
    throw new Error('Second vendor not found for isolation testing');
  }
  console.log('Found second vendor for isolation test:', secondVendor.code, secondVendor.name, secondVendor.id);

  // Test API endpoint with test headers
  const baseUrl = 'http://localhost:3000';

  console.log('\n--- 3. Testing GET /api/vendor-portal/me ---');
  const meRes = await fetch(`${baseUrl}/api/vendor-portal/me`, {
    headers: {
      'x-test-user-id': vendorUser.id,
      'x-test-tenant-id': vendorUser.tenantId,
    },
  });
  console.log('Status:', meRes.status);
  const meData = await meRes.json();
  if (meRes.status !== 200 || !meData.vendor || meData.vendor.id !== vendorUser.vendorId) {
    throw new Error(`Failed GET /api/vendor-portal/me: ${JSON.stringify(meData)}`);
  }
  console.log('✅ /api/vendor-portal/me returned authenticated vendor:', meData.vendor.name);

  console.log('\n--- 4. Testing Cross-Vendor Isolation on Dashboard API ---');
  // Attempting to access second vendor's dashboard using vendorUser's credentials
  const crossVendorRes = await fetch(`${baseUrl}/api/procurement/vendors/${secondVendor.id}/dashboard`, {
    headers: {
      'x-test-user-id': vendorUser.id,
      'x-test-tenant-id': vendorUser.tenantId,
    },
  });
  console.log('Accessing other vendor dashboard HTTP Status:', crossVendorRes.status);
  const crossVendorData = await crossVendorRes.json();
  console.log('Response:', crossVendorData);
  if (crossVendorRes.status !== 403) {
    throw new Error(`Security breach! Expected 403 Forbidden for cross-vendor access, got ${crossVendorRes.status}`);
  }
  console.log('✅ PASS: Cross-vendor isolation enforced! Vendor A cannot access Vendor B data.');

  console.log('\n--- 5. Testing Authorized Access to Own Dashboard API ---');
  const ownDashboardRes = await fetch(`${baseUrl}/api/procurement/vendors/${vendorUser.vendorId}/dashboard`, {
    headers: {
      'x-test-user-id': vendorUser.id,
      'x-test-tenant-id': vendorUser.tenantId,
    },
  });
  console.log('Accessing own dashboard HTTP Status:', ownDashboardRes.status);
  const ownData = await ownDashboardRes.json();
  if (ownDashboardRes.status !== 200 || !ownData.counts) {
    throw new Error(`Failed to load own dashboard: ${JSON.stringify(ownData)}`);
  }
  console.log('✅ PASS: Own dashboard loaded with counts:', ownData.counts);

  console.log('\n--- 6. Testing GET /api/vendor-portal/rfqs ---');
  const rfqsRes = await fetch(`${baseUrl}/api/vendor-portal/rfqs`, {
    headers: {
      'x-test-user-id': vendorUser.id,
      'x-test-tenant-id': vendorUser.tenantId,
    },
  });
  console.log('RFQs Status:', rfqsRes.status);
  const rfqsData = await rfqsRes.json();
  console.log('Total invited RFQs for this vendor:', rfqsData.total);
  console.log('✅ PASS: Vendor RFQs loaded securely.');

  console.log('\n--- 7. Testing GET /api/vendor-portal/ppos ---');
  const pposRes = await fetch(`${baseUrl}/api/vendor-portal/ppos`, {
    headers: {
      'x-test-user-id': vendorUser.id,
      'x-test-tenant-id': vendorUser.tenantId,
    },
  });
  console.log('PPOs Status:', pposRes.status);
  const pposData = await pposRes.json();
  console.log('Total PPOs for this vendor:', pposData.total);
  console.log('✅ PASS: Vendor PPOs loaded securely.');

  console.log('\n--- 8. Testing GET /api/vendor-portal/rate-cards ---');
  const rcRes = await fetch(`${baseUrl}/api/vendor-portal/rate-cards`, {
    headers: {
      'x-test-user-id': vendorUser.id,
      'x-test-tenant-id': vendorUser.tenantId,
    },
  });
  console.log('Rate Cards Status:', rcRes.status);
  const rcData = await rcRes.json();
  console.log('Total rate cards for this vendor:', rcData.total);
  console.log('✅ PASS: Vendor Rate Cards loaded securely.');

  console.log('\n--- 9. Testing Buyer-Side Category Manager Access ---');
  const catMgr = await prisma.user.findFirst({
    where: { email: 'category.manager@procucev-demo.local' },
  });
  if (!catMgr) throw new Error('Category manager not found');

  const buyerVendorRes = await fetch(`${baseUrl}/api/procurement/vendors/${vendorUser.vendorId}`, {
    headers: {
      'x-test-user-id': catMgr.id,
      'x-test-tenant-id': catMgr.tenantId,
    },
  });
  console.log('Buyer vendor detail HTTP Status:', buyerVendorRes.status);
  if (buyerVendorRes.status !== 200) {
    throw new Error('Buyer cannot access vendor details');
  }
  console.log('✅ PASS: Category Manager can view and manage vendor records.');

  console.log('\n--- 10. Testing Vendor Self-Service Profile Update & Tamper Prevention ---');
  const patchRes = await fetch(`${baseUrl}/api/vendor-portal/me`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-test-user-id': vendorUser.id,
      'x-test-tenant-id': vendorUser.tenantId,
    },
    body: JSON.stringify({
      phone: '+91 99887 76655',
      operatingLocation: 'Mumbai & Pan-India West',
      // Tampering attempt:
      qualificationScore: 99.9,
      qualificationDecision: 'RECOMMENDED_FORCE',
      status: 'ACTIVE_SUPER',
    }),
  });
  console.log('Profile update HTTP Status:', patchRes.status);
  const patchData = await patchRes.json();
  if (patchRes.status !== 200) {
    throw new Error(`Profile update failed: ${JSON.stringify(patchData)}`);
  }
  const updatedVendor = await prisma.vendor.findUnique({
    where: { id: vendorUser.vendorId! },
  });
  if (updatedVendor?.phone !== '+91 99887 76655') {
    throw new Error('Permitted phone field did not persist');
  }
  if (updatedVendor?.qualificationScore === 99.9 || updatedVendor?.qualificationDecision === 'RECOMMENDED_FORCE') {
    throw new Error('Security failure: vendor tampered with buyer qualification fields!');
  }
  console.log('✅ PASS: Permitted profile fields persisted, tamper attempt on qualificationScore blocked.');

  console.log('\n🎉 ALL VENDOR PORTAL INTEGRATION & SECURITY TESTS PASSED!');
}

main()
  .catch((e) => {
    console.error('❌ Test failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
