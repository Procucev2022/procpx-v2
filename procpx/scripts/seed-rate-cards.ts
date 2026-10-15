// scripts/seed-rate-cards.ts - Seed vendor rate cards for Tenant A
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Vendor Rate Cards...');

  const tenant = await prisma.tenant.findUnique({
    where: { slug: 'procucev-retail-demo' },
  });
  if (!tenant) throw new Error('Tenant procucev-retail-demo not found');

  const apex = await prisma.vendor.findFirst({
    where: { tenantId: tenant.id, code: 'VND-0001' },
  });
  const zenith = await prisma.vendor.findFirst({
    where: { tenantId: tenant.id, code: 'VND-0004' },
  });
  const bluepeak = await prisma.vendor.findFirst({
    where: { tenantId: tenant.id, code: 'VND-0002' },
  });

  if (!apex || !zenith || !bluepeak) {
    throw new Error('Vendors VND-0001, VND-0004, or VND-0002 not found');
  }

  // 1. APPROVED & ACTIVE Rate Card for Apex (Civil & Interior)
  const rc1 = await prisma.vendorRateCard.upsert({
    where: {
      tenantId_rateCardNumber: {
        tenantId: tenant.id,
        rateCardNumber: 'VRC-2026-000001',
      },
    },
    update: {
      status: 'APPROVED',
      validFrom: new Date('2026-01-01'),
      validTo: new Date('2026-12-31'),
    },
    create: {
      tenantId: tenant.id,
      vendorId: apex.id,
      rateCardNumber: 'VRC-2026-000001',
      title: 'Annual Civil & Interior Master Rate Agreement 2026',
      category: 'Civil & Interior',
      status: 'APPROVED',
      validFrom: new Date('2026-01-01'),
      validTo: new Date('2026-12-31'),
      currency: 'INR',
      terms: 'Net 30 days payment, 12 months warranty, pan-India retail sites',
      approvedBy: 'Category Manager',
      approvedAt: new Date('2026-01-05'),
      notes: 'Pre-negotiated corporate rate contract for all store fitout works',
      items: {
        create: [
          {
            tenantId: tenant.id,
            itemCode: 'RC-CIV-001',
            description: '600 x 600 mm vitrified floor tile, commercial-grade',
            specification: 'Commercial heavy-duty vitrified tile, double charged, anti-skid',
            category: 'Civil & Interior',
            subcategory: 'Flooring',
            uom: 'SQFT',
            rate: 118,
            minQuantity: 100,
            location: 'Pan-India',
          },
          {
            tenantId: tenant.id,
            itemCode: 'RC-CIV-002',
            description: 'Acoustic Wall Cladding Panels',
            specification: 'Fabric wrapped acoustic panels NRC 0.85 fire-rated',
            category: 'Civil & Interior',
            subcategory: 'Gypsum Partition',
            uom: 'SQFT',
            rate: 285,
            minQuantity: 50,
            location: 'Pan-India',
          },
          {
            tenantId: tenant.id,
            itemCode: 'RC-CIV-003',
            description: 'Gypsum False Ceiling with Metal Framing',
            specification: '12.5mm moisture resistant gypsum board with GI framework',
            category: 'Civil & Interior',
            subcategory: 'False Ceiling',
            uom: 'SQFT',
            rate: 108,
            minQuantity: 200,
            location: 'Pan-India',
          },
          {
            tenantId: tenant.id,
            itemCode: 'RC-CIV-004',
            description: 'Heavy Duty Commercial Vinyl Flooring',
            specification: '2mm heterogeneous vinyl sheet with PUR surface protection',
            category: 'Civil & Interior',
            subcategory: 'Flooring',
            uom: 'SQFT',
            rate: 92,
            minQuantity: 100,
            location: 'Pan-India',
          },
        ],
      },
    },
  });

  // 2. EXPIRED Rate Card for Zenith (Electrical) - for testing expired validation
  const rc2 = await prisma.vendorRateCard.upsert({
    where: {
      tenantId_rateCardNumber: {
        tenantId: tenant.id,
        rateCardNumber: 'VRC-2025-000002',
      },
    },
    update: {
      status: 'EXPIRED',
      validFrom: new Date('2025-01-01'),
      validTo: new Date('2025-12-31'),
    },
    create: {
      tenantId: tenant.id,
      vendorId: zenith.id,
      rateCardNumber: 'VRC-2025-000002',
      title: 'Previous Year Electrical Supply Rate Card (Expired)',
      category: 'Electrical',
      status: 'EXPIRED',
      validFrom: new Date('2025-01-01'),
      validTo: new Date('2025-12-31'),
      currency: 'INR',
      terms: 'Expired pricing contract — needs revision',
      approvedBy: 'Category Manager',
      approvedAt: new Date('2025-01-02'),
      notes: 'Expired agreement for electrical supplies',
      items: {
        create: [
          {
            tenantId: tenant.id,
            itemCode: 'RC-ELE-001',
            description: '63A 4P MCCB',
            specification: '63A 4-pole MCCB 25kA breaking capacity',
            category: 'Electrical',
            subcategory: 'DB Panel',
            uom: 'NOS',
            rate: 7400,
            minQuantity: 1,
            location: 'Pan-India',
          },
        ],
      },
    },
  });

  // 3. APPROVED Active Rate Card for BluePeak (Electrical) - partial scope
  const rc3 = await prisma.vendorRateCard.upsert({
    where: {
      tenantId_rateCardNumber: {
        tenantId: tenant.id,
        rateCardNumber: 'VRC-2026-000003',
      },
    },
    update: {
      status: 'APPROVED',
      validFrom: new Date('2026-01-01'),
      validTo: new Date('2026-12-31'),
    },
    create: {
      tenantId: tenant.id,
      vendorId: bluepeak.id,
      rateCardNumber: 'VRC-2026-000003',
      title: 'MEP & Cable Distribution Annual Contract',
      category: 'Electrical',
      status: 'APPROVED',
      validFrom: new Date('2026-01-01'),
      validTo: new Date('2026-12-31'),
      currency: 'INR',
      terms: 'Ex-site delivery, 15 days credit',
      approvedBy: 'Category Manager',
      approvedAt: new Date('2026-01-10'),
      notes: 'Approved cable and tray rates',
      items: {
        create: [
          {
            tenantId: tenant.id,
            itemCode: 'RC-ELE-002',
            description: '2.5 sq mm FRLS Copper Wire',
            specification: '1100V grade multi-strand copper wire',
            category: 'Electrical',
            subcategory: 'Wiring',
            uom: 'RMT',
            rate: 28,
            minQuantity: 500,
            location: 'Pan-India',
          },
        ],
      },
    },
  });

  console.log(`  ✓ Rate Card 1 (Apex): ${rc1.rateCardNumber} - ${rc1.status}`);
  console.log(`  ✓ Rate Card 2 (Zenith): ${rc2.rateCardNumber} - ${rc2.status}`);
  console.log(`  ✓ Rate Card 3 (BluePeak): ${rc3.rateCardNumber} - ${rc3.status}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
