import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Helper to consistently normalise vendor name for login username
export function normaliseVendorUsername(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export async function setupTestVendorLogins() {
  console.log('=== PROCPX TEST VENDOR LOGIN CREDENTIAL SETUP ===');

  // Requirement 7: Environment Guard
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SECURITY VIOLATION: Simplified test vendor login convention is strictly prohibited in production.');
  }

  const TEST_PASSWORD = 'welcome';
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

  // Designated Test Vendors
  const designatedVendors = [
    {
      code: 'VND-0002',
      name: 'BluePeak Engineering & MEP Solutions',
      email: 'bluepeak.engineering@vendor.procpx.local',
      role: 'VENDOR',
    },
    {
      code: 'VND-0003',
      name: 'CraftLine Interior & Retail Fixtures',
      email: 'craftline.interior@vendor.procpx.local',
      role: 'VENDOR',
    },
    {
      code: 'VND-0004',
      name: 'Zenith Retail Systems & Electrical Contracting',
      email: 'zenith.retail@vendor.procpx.local',
      role: 'VENDOR',
    },
    {
      code: 'VND-0005',
      name: 'Srinidhiinteriors',
      email: 'srinidhi.interiors@vendor.procpx.local',
      role: 'VENDOR',
    },
    {
      code: 'VND-0006',
      name: 'Ramakrishna interiors',
      email: 'ramakrishna.interiors@vendor.procpx.local',
      role: 'VENDOR',
    },
  ];

  // Inspect existing vendor logins for conflicts (Requirement 8)
  const existingUsers = await prisma.user.findMany({
    where: { role: 'VENDOR' },
    include: { vendor: true },
  });

  for (const existingUser of existingUsers) {
    if (existingUser.vendor) {
      console.log(`[EXISTING LOGIN PRESERVED] Vendor "${existingUser.vendor.name}" (${existingUser.vendor.code}) has active user "${existingUser.email}". Credentials preserved (not overwritten).`);
    }
  }

  const results = [];

  for (const item of designatedVendors) {
    const vendor = await prisma.vendor.findFirst({
      where: { code: item.code },
    });

    if (!vendor) {
      console.warn(`[WARN] Vendor with code ${item.code} not found, skipping.`);
      continue;
    }

    // Check if vendor already has a user
    const existingVendorUser = await prisma.user.findFirst({
      where: { vendorId: vendor.id },
    });

    const normUsername = normaliseVendorUsername(vendor.name);

    if (existingVendorUser) {
      console.log(`[CONFLICT NOTED] Vendor "${vendor.name}" already has active user "${existingVendorUser.email}". Preserving existing credentials.`);
      results.push({
        vendorName: vendor.name,
        vendorCode: vendor.code,
        normalisedUsername: normUsername,
        email: existingVendorUser.email,
        status: 'EXISTING_PRESERVED',
      });
      continue;
    }

    // Check if user already exists with this email
    let user = await prisma.user.findFirst({
      where: { email: item.email, tenantId: vendor.tenantId },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          tenantId: vendor.tenantId,
          vendorId: vendor.id,
          name: vendor.name,
          email: item.email,
          role: 'VENDOR',
          status: 'ACTIVE',
          passwordHash,
        },
      });
      console.log(`✓ [CREATED] Test user created for "${vendor.name}": Username="${normUsername}", Email="${item.email}", Role=VENDOR, Status=ACTIVE`);
    } else {
      console.log(`✓ [EXISTS] Test user already exists for "${vendor.name}": Username="${normUsername}", Email="${item.email}"`);
    }

    results.push({
      vendorName: vendor.name,
      vendorCode: vendor.code,
      normalisedUsername: normUsername,
      email: user.email,
      status: 'CONFIGURED',
      vendorId: vendor.id,
      tenantId: vendor.tenantId,
    });
  }

  console.log('\n--- SETUP SUMMARY ---');
  console.table(results);
  return results;
}

if (require.main === module) {
  setupTestVendorLogins()
    .catch((err) => {
      console.error('Setup failed:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
