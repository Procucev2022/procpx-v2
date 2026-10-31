import prisma from '../src/lib/prisma';


async function main() {
  const tenant = await prisma.tenant.findFirst({
    where: { slug: 'procucev-retail-demo' },
  });

  if (!tenant) {
    throw new Error('Tenant procucev-retail-demo not found');
  }

  const tenantId = tenant.id;

  // 1. Ensure vendors exist
  const vendorsData = [
    { code: 'VND-0006', name: 'Ramakrishna Interiors', categories: 'Interior Works' },
    { code: 'VND-0007', name: 'BuildRight Solutions', categories: 'Civil Works' },
    { code: 'VND-0008', name: 'ElectroMax', categories: 'Electrical' },
    { code: 'VND-0009', name: 'CoolTech HVAC', categories: 'HVAC' },
    { code: 'VND-0010', name: 'Apex Furnishers', categories: 'Furniture' },
  ];

  const vendorMap = new Map<string, string>();

  for (const v of vendorsData) {
    let existing = await prisma.vendor.findFirst({
      where: { tenantId, code: v.code },
    });
    if (!existing) {
      existing = await prisma.vendor.findFirst({
        where: { tenantId, name: { contains: v.name.split(' ')[0] } },
      });
    }
    if (!existing) {
      existing = await prisma.vendor.create({
        data: {
          tenantId,
          code: v.code,
          name: v.name,
          email: `${v.code.toLowerCase()}@vendor.procpx.local`,
          categories: v.categories,
          vendorType: 'REGULAR',
          complianceStatus: 'COMPLIANT',
          qualificationStatus: 'QUALIFIED',
          performanceScore: 92.5,
          city: 'Hyderabad',
          state: 'Telangana',
          country: 'India',
        },
      });
    }
    vendorMap.set(v.code, existing.id);
  }

  // Ensure VND-0006 has the exact name "Ramakrishna Interiors"
  const ramakrishnaId = vendorMap.get('VND-0006')!;
  await prisma.vendor.update({
    where: { id: ramakrishnaId },
    data: { name: 'Ramakrishna Interiors', code: 'VND-0006' },
  });

  // 2. Upsert the approved rate cards from the reference screenshot table
  const cardsData = [
    {
      rateCardNumber: 'RC-2026-0001',
      vendorCode: 'VND-0006',
      category: 'Interior Works',
      scope: 'Retail Store Interiors',
      title: 'Retail Store Interior Works Master Rate Card',
      itemsCount: 48,
      validFrom: new Date('2026-10-01'),
      validTo: new Date('2027-09-30'),
      status: 'APPROVED',
    },
    {
      rateCardNumber: 'RC-2026-0002',
      vendorCode: 'VND-0007',
      category: 'Civil Works',
      scope: 'Civil & Structural Works',
      title: 'Civil & Structural Works Annual Agreement',
      itemsCount: 36,
      validFrom: new Date('2026-09-15'),
      validTo: new Date('2027-09-14'),
      status: 'APPROVED',
    },
    {
      rateCardNumber: 'RC-2026-0003',
      vendorCode: 'VND-0008',
      category: 'Electrical',
      scope: 'Electrical & Lighting',
      title: 'Electrical & Lighting Maintenance Rate Card',
      itemsCount: 52,
      validFrom: new Date('2026-09-01'),
      validTo: new Date('2027-08-31'),
      status: 'APPROVED',
    },
    {
      rateCardNumber: 'RC-2026-0004',
      vendorCode: 'VND-0009',
      category: 'HVAC',
      scope: 'HVAC Supply & Installation',
      title: 'HVAC Supply & Installation Master Agreement',
      itemsCount: 28,
      validFrom: new Date('2026-08-01'),
      validTo: new Date('2027-07-31'),
      status: 'APPROVED',
    },
    {
      rateCardNumber: 'RC-2026-0005',
      vendorCode: 'VND-0010',
      category: 'Furniture',
      scope: 'Furniture Supply',
      title: 'Retail Outlet Furniture Supply Agreement',
      itemsCount: 45,
      validFrom: new Date('2026-08-10'),
      validTo: new Date('2027-08-09'),
      status: 'APPROVED',
    },
  ];

  for (const c of cardsData) {
    const vendorId = vendorMap.get(c.vendorCode)!;
    const existing = await prisma.vendorRateCard.findUnique({
      where: { tenantId_rateCardNumber: { tenantId, rateCardNumber: c.rateCardNumber } },
    });

    if (!existing) {
      await prisma.vendorRateCard.create({
        data: {
          tenantId,
          vendorId,
          rateCardNumber: c.rateCardNumber,
          title: c.title,
          category: c.category,
          scope: c.scope,
          location: 'All India',
          validFrom: c.validFrom,
          validTo: c.validTo,
          status: c.status,
          terms: 'Rates are exclusive of taxes. Valid for all retail outlets. Includes material and labour unless specified.',
          submittedBy: 'Category Manager',
          approvedBy: 'Project Approver',
          approvedAt: new Date(),
        },
      });
    }
  }

  // 3. Upsert RC-2026-0006 with the 5 exact line items and rich negotiation metadata
  const rc6Number = 'RC-2026-0006';
  let rc6 = await prisma.vendorRateCard.findUnique({
    where: { tenantId_rateCardNumber: { tenantId, rateCardNumber: rc6Number } },
    include: { items: true },
  });

  const rc6Notes = JSON.stringify({
    currentRound: 2,
    round1: {
      buyerOffer1Date: '2026-10-10T10:00:00.000Z',
      buyerOffer1Actor: 'Category Manager',
      vendorQuote1Date: '2026-10-15T14:30:00.000Z',
      vendorQuote1Actor: 'Ramakrishna Interiors',
    },
    round2: {
      buyerOffer2Date: '2026-10-18T11:00:00.000Z',
      buyerOffer2Actor: 'Category Manager',
      vendorQuote2Date: '2026-10-20T16:00:00.000Z',
      vendorQuote2Actor: 'Ramakrishna Interiors',
      vendorQuote2Remarks: 'Revised commercial offer submitted with best discount.',
    },
    buyerAccepted: {
      actor: 'Category Manager',
      timestamp: '2026-10-22T10:00:00.000Z',
      remarks: 'Commercial terms accepted based on final discount.',
    },
    vendorAccepted: {
      actor: 'Ramakrishna Interiors',
      timestamp: '2026-10-24T12:00:00.000Z',
      remarks: 'Rate card contract terms accepted.',
    },
    projectApproved: {
      actor: 'Project Approver',
      timestamp: '2026-10-25T09:30:00.000Z',
      remarks: 'Project scope and unit rates approved.',
    },
    financeApproved: {
      actor: 'Finance Approver',
      timestamp: '2026-10-25T11:00:00.000Z',
      remarks: 'Commercial governance validated. Rate card active.',
    },
  });

  const rc6Items = [
    {
      itemCode: 'INT-001',
      description: 'Gypsum False Ceiling',
      uom: 'SQFT',
      qty: 500,
      buyerTargetRate: 120,
      latestVendorQuote: 110,
      currentBuyerOffer: 105,
      vendorQuoteRate: 100, // Section 4 vendor quote
      agreedRate: 105,      // Section 5, 6, 7 agreed rate
    },
    {
      itemCode: 'INT-002',
      description: 'Vitrified Tiles 2x2 ft',
      uom: 'SQFT',
      qty: 1000,
      buyerTargetRate: 95,
      latestVendorQuote: 90,
      currentBuyerOffer: 88,
      vendorQuoteRate: 88,
      agreedRate: 88,
    },
    {
      itemCode: 'INT-003',
      description: 'Modular Partitions',
      uom: 'SQFT',
      qty: 300,
      buyerTargetRate: 350,
      latestVendorQuote: 330,
      currentBuyerOffer: 320,
      vendorQuoteRate: 315,
      agreedRate: 320,
    },
    {
      itemCode: 'INT-004',
      description: 'Wooden Carpentry',
      uom: 'SQFT',
      qty: 250,
      buyerTargetRate: 450,
      latestVendorQuote: 420,
      currentBuyerOffer: 410,
      vendorQuoteRate: 405,
      agreedRate: 410,
    },
    {
      itemCode: 'INT-005',
      description: 'Painting (Premium Emulsion)',
      uom: 'SQFT',
      qty: 2000,
      buyerTargetRate: 80,
      latestVendorQuote: 75,
      currentBuyerOffer: 72,
      vendorQuoteRate: 68,
      agreedRate: 72,
    },
  ];

  if (!rc6) {
    rc6 = await prisma.vendorRateCard.create({
      data: {
        tenantId,
        vendorId: ramakrishnaId,
        rateCardNumber: rc6Number,
        title: 'Retail Store Interior Works - FY 2026-27',
        category: 'Interior Works',
        scope: 'Interior execution including civil, false ceiling, flooring, carpentry, painting and allied works for retail outlets.',
        location: 'All India',
        validFrom: new Date('2026-10-01'),
        validTo: new Date('2027-09-30'),
        status: 'APPROVED',
        terms: 'Rates are exclusive of taxes. Valid for all retail outlets. Includes material and labour unless specified.',
        notes: rc6Notes,
        submittedBy: 'Category Manager',
        projectApprovedBy: 'Project Approver',
        projectApprovedAt: new Date('2026-10-25T09:30:00.000Z'),
        financeApprovedBy: 'Finance Approver',
        financeApprovedAt: new Date('2026-10-25T11:00:00.000Z'),
        approvedBy: 'Project Approver',
        approvedAt: new Date('2026-10-25T11:00:00.000Z'),
        items: {
          create: rc6Items.map((it) => ({
            tenantId,
            itemCode: it.itemCode,
            description: it.description,
            uom: it.uom,
            minQuantity: it.qty,
            rate: it.agreedRate,
            proposedRate: it.currentBuyerOffer,
            benchmarkRate: it.buyerTargetRate,
            historicalRate: it.buyerTargetRate,
            comparisonRef: JSON.stringify({
              buyerOffer1: it.buyerTargetRate,
              vendorQuote1: it.latestVendorQuote,
              buyerOffer2: it.currentBuyerOffer,
              vendorQuote2: it.vendorQuoteRate,
              finalAgreedRate: it.agreedRate,
              referenceQty: it.qty,
            }),
          })),
        },
      },
      include: { items: true },
    });
    console.log('Created RC-2026-0006 with 5 items.');
  } else {
    // Update items to match exact screenshot rates
    await prisma.vendorRateCard.update({
      where: { id: rc6.id },
      data: {
        title: 'Retail Store Interior Works - FY 2026-27',
        category: 'Interior Works',
        scope: 'Interior execution including civil, false ceiling, flooring, carpentry, painting and allied works for retail outlets.',
        location: 'All India',
        validFrom: new Date('2026-10-01'),
        validTo: new Date('2027-09-30'),
        status: 'APPROVED',
        terms: 'Rates are exclusive of taxes. Valid for all retail outlets. Includes material and labour unless specified.',
        notes: rc6Notes,
      },
    });

    if (rc6.items.length === 0) {
      for (const it of rc6Items) {
        await prisma.vendorRateCardItem.create({
          data: {
            tenantId,
            rateCardId: rc6.id,
            itemCode: it.itemCode,
            description: it.description,
            uom: it.uom,
            minQuantity: it.qty,
            rate: it.agreedRate,
            proposedRate: it.currentBuyerOffer,
            benchmarkRate: it.buyerTargetRate,
            historicalRate: it.buyerTargetRate,
            comparisonRef: JSON.stringify({
              buyerOffer1: it.buyerTargetRate,
              vendorQuote1: it.latestVendorQuote,
              buyerOffer2: it.currentBuyerOffer,
              vendorQuote2: it.vendorQuoteRate,
              finalAgreedRate: it.agreedRate,
              referenceQty: it.qty,
            }),
          },
        });
      }
      console.log('Populated 5 items into existing RC-2026-0006.');
    }
  }

  console.log('✅ Approved Rate Cards seeded/upserted successfully.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
