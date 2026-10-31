// scripts/seed-showcase-rfq.ts
import prisma from '../src/lib/prisma';


async function seedShowcase() {
  const rfqId = '79490844-3600-4c7d-9254-901520b36449'; // RFQ-2026-000004
  const rfq = await prisma.rfq.findUnique({
    where: { id: rfqId },
    include: {
      lines: true,
      quotes: { include: { vendor: true } },
      project: true,
      tenant: true,
    },
  });

  if (!rfq) {
    console.error('RFQ-2026-000004 not found');
    return;
  }

  const tenantId = rfq.tenantId;
  const projectId = rfq.projectId;
  const l1Quote = rfq.quotes.find((q) => q.quoteNumber === 'QTE-2026-000003');
  const l2Quote = rfq.quotes.find((q) => q.quoteNumber === 'QTE-2026-000002');

  if (!l1Quote || !l2Quote) {
    console.error('Quotes not found');
    return;
  }

  const craftlineVendorId = l1Quote.vendorId;
  const apexVendorId = l2Quote.vendorId;
  const line1 = rfq.lines[0];
  const line2 = rfq.lines[1];

  console.log('Seeding QuoteLines for L1 and L2 quotes...');
  // 1. Delete and recreate QuoteLines
  await prisma.quoteLine.deleteMany({
    where: { quoteId: { in: [l1Quote.id, l2Quote.id] } },
  });

  // CraftLine Lines
  await prisma.quoteLine.create({
    data: {
      tenantId,
      quoteId: l1Quote.id,
      rfqLineId: line1.id,
      unitRate: 88000,
      taxPercent: 18,
      discountPercent: 0,
      lineTotal: 264000,
      remarks: 'Compliant with specified teak laminate finish',
    },
  });

  await prisma.quoteLine.create({
    data: {
      tenantId,
      quoteId: l1Quote.id,
      rfqLineId: line2.id,
      unitRate: 41360,
      taxPercent: 18,
      discountPercent: 0,
      lineTotal: 1034000,
      remarks: 'Heavy-duty cold-rolled steel with powder coating',
    },
  });

  // Apex Lines
  await prisma.quoteLine.create({
    data: {
      tenantId,
      quoteId: l2Quote.id,
      rfqLineId: line1.id,
      unitRate: 94000,
      taxPercent: 18,
      discountPercent: 0,
      lineTotal: 282000,
      remarks: 'Standard factory finish',
    },
  });

  await prisma.quoteLine.create({
    data: {
      tenantId,
      quoteId: l2Quote.id,
      rfqLineId: line2.id,
      unitRate: 44416,
      taxPercent: 18,
      discountPercent: 0,
      lineTotal: 1110400,
      remarks: 'Standard shelving sections',
    },
  });

  // 2. Negotiation Container & Rounds
  console.log('Seeding Negotiation Rounds...');
  let negotiation = await prisma.negotiation.findFirst({
    where: { rfqId },
  });

  if (!negotiation) {
    negotiation = await prisma.negotiation.create({
      data: {
        tenantId,
        rfqId,
        currentRound: 2,
        status: 'RESOLVED',
        targetSavingsPercent: 7.94,
        bestQuoteAmount: 1195000,
      },
    });
  } else {
    await prisma.negotiation.update({
      where: { id: negotiation.id },
      data: {
        currentRound: 2,
        status: 'RESOLVED',
        bestQuoteAmount: 1195000,
      },
    });
  }

  // Clear previous rounds
  await prisma.negotiationRound.deleteMany({
    where: { negotiationId: negotiation.id },
  });

  // Round 1
  await prisma.negotiationRound.create({
    data: {
      tenantId,
      negotiationId: negotiation.id,
      vendorId: craftlineVendorId,
      roundNumber: 1,
      previousQuoteAmount: 1298000,
      targetPrice: 1180000,
      counterOfferAmount: 1180000,
      revisedQuoteAmount: 1220000,
      savingsAmount: 78000,
      savingsPercent: 6.01,
      status: 'REVISED_SUBMITTED',
      notes: 'Initial counter-offer dispatched requesting volume discount on 25 gondola shelving units.',
    },
  });

  // Round 2
  await prisma.negotiationRound.create({
    data: {
      tenantId,
      negotiationId: negotiation.id,
      vendorId: craftlineVendorId,
      roundNumber: 2,
      previousQuoteAmount: 1220000,
      targetPrice: 1195000,
      counterOfferAmount: 1195000,
      revisedQuoteAmount: 1195000,
      savingsAmount: 103000,
      savingsPercent: 7.94,
      status: 'RESOLVED',
      notes: 'Final commercial rates agreed at ₹1,195,000 with inclusive site delivery and 12-month DLP.',
    },
  });

  // 3. Update RFQ Status & Locked Rates
  console.log('Locking final commercial rates...');
  await prisma.rfq.update({
    where: { id: rfqId },
    data: {
      status: 'AWARDED',
      finalLockedAt: new Date(),
    },
  });

  // 4. Award Recommendation
  console.log('Seeding Award Recommendation...');
  await prisma.awardRecommendation.deleteMany({
    where: { rfqId },
  });

  const award = await prisma.awardRecommendation.create({
    data: {
      tenantId,
      rfqId,
      recommendedVendorId: craftlineVendorId,
      originalQuoteAmount: 1298000,
      finalNegotiatedAmount: 1195000,
      benchmarkAmount: 1205000,
      totalSavingsAmount: 103000,
      savingsPercent: 7.94,
      technicalStatus: 'COMPLIANT',
      commercialStatus: 'BEST_VALUE',
      justification:
        'L1 lowest evaluated commercial offer. Fully compliant with store design specifications and quality brand list. Commercial negotiation achieved ₹1,03,000 (7.9%) discount below original bid and ₹10,000 below approved project benchmark.',
      status: 'APPROVED',
      submittedById: rfq.createdById,
      submittedAt: new Date(Date.now() - 86400000),
      approvedById: rfq.createdById,
      approvedAt: new Date(),
      approvalRemarks:
        'Commercial award recommendation approved by Finance. Savings verified against approved budget. Cleared for Purchase Order generation.',
    },
  });

  // 5. Purchase Order (PPO)
  console.log('Seeding Purchase Order (PPO)...');
  await prisma.ppoLine.deleteMany({
    where: { ppo: { rfqId } },
  });
  await prisma.ppo.deleteMany({
    where: { rfqId },
  });

  const ppo = await prisma.ppo.create({
    data: {
      tenantId,
      projectId,
      boqId: rfq.boqRevisionId,
      boqRevisionId: rfq.boqRevisionId,
      rfqId,
      vendorId: craftlineVendorId,
      awardRecommendationId: award.id,
      ppoNumber: 'PPO-2026-000006',
      title: 'Commercial Purchase Order for Checkout Counters & Display Shelving',
      totalValue: 1195000,
      currency: 'INR',
      status: 'ISSUED',
      deliveryTerms: 'Free Delivery to Bengaluru Store Site within 21 days from PPO date',
      paymentTerms: '30 days net from certified progressive invoice and site inspection',
      taxDetails: 'GST 18% extra as applicable',
      issuedAt: new Date(),
      createdById: rfq.createdById,
    },
  });

  // PPO Lines
  await prisma.ppoLine.create({
    data: {
      tenantId,
      ppoId: ppo.id,
      projectId,
      vendorId: craftlineVendorId,
      rfqLineId: line1.id,
      lineNumber: '1',
      itemDescription: 'Checkout Cashier Counters',
      specification: 'Teak laminate finish, stainless steel edges, dual cash drawers',
      category: 'Furniture',
      uom: 'NOS',
      orderedQuantity: 3,
      orderedUnitRate: 85000,
      orderedAmount: 255000,
      taxAmount: 45900,
      totalOrderValue: 300900,
      status: 'ORDERED',
    },
  });

  await prisma.ppoLine.create({
    data: {
      tenantId,
      ppoId: ppo.id,
      projectId,
      vendorId: craftlineVendorId,
      rfqLineId: line2.id,
      lineNumber: '2',
      itemDescription: 'Display Gondola Shelving (1.8m)',
      specification: 'Heavy-duty cold-rolled steel, multi-tier adjustable shelves',
      category: 'Furniture',
      uom: 'NOS',
      orderedQuantity: 25,
      orderedUnitRate: 37600,
      orderedAmount: 940000,
      taxAmount: 169200,
      totalOrderValue: 1109200,
      status: 'ORDERED',
    },
  });

  console.log('✅ Successfully seeded comprehensive showcase for RFQ-2026-000004!');
}

seedShowcase()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
