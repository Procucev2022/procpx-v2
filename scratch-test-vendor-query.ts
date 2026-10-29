import { prisma } from './src/lib/prisma';

async function testVendorApi() {
  const vendor = await prisma.vendor.findFirst({
    where: { name: { contains: 'Ramakrishna' } },
  });
  if (!vendor) throw new Error('Vendor not found');
  const user = await prisma.user.findFirst({
    where: { vendorId: vendor.id },
  });
  if (!user) throw new Error('Vendor user not found');

  console.log('Testing with User:', user.name, user.id, 'Vendor:', vendor.name, vendor.id);

  // Replicate GET /api/vendor-portal/rfqs query
  const rfqs = await prisma.rfq.findMany({
    where: {
      tenantId: user.tenantId,
      invitedVendors: {
        some: { vendorId: vendor.id },
      },
    },
    include: {
      tenant: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, projectCode: true } },
      boqRevision: {
        select: {
          id: true,
          revisionNumber: true,
          boq: { select: { id: true, title: true, boqCode: true } },
        },
      },
      lines: {
        select: {
          id: true,
          description: true,
          quantity: true,
          uom: true,
          specification: true,
          category: true,
        },
      },
      invitedVendors: {
        where: { vendorId: vendor.id },
        select: {
          id: true,
          vendorId: true,
          invitedAt: true,
          invitationStatus: true,
          submissionStatus: true,
        },
      },
      quotes: {
        where: { vendorId: vendor.id },
        orderBy: { quoteVersion: 'desc' },
        select: {
          id: true,
          vendorId: true,
          quoteNumber: true,
          quoteVersion: true,
          totalQuoteAmount: true,
          totalBaseAmount: true,
          taxAmount: true,
          status: true,
          submittedAt: true,
          updatedAt: true,
          validUntil: true,
          commercialTerms: true,
          lines: true,
        },
      },
      negotiations: {
        include: {
          rounds: {
            where: { vendorId: vendor.id },
            orderBy: { roundNumber: 'desc' },
          },
        },
      },
      ppos: {
        where: { vendorId: vendor.id },
        select: {
          id: true,
          ppoNumber: true,
          status: true,
          vendorStatus: true,
          totalValue: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      messages: {
        where: {
          OR: [{ vendorId: vendor.id }, { vendorId: null }],
        },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Fetched ${rfqs.length} RFQs for vendor`);
  for (const r of rfqs) {
    const activeNegotiation = r.negotiations[0] || null;
    const latestRound = activeNegotiation?.rounds[0] || null;
    console.log({
      rfqNumber: r.rfqNumber,
      status: r.status,
      negsCount: r.negotiations.length,
      activeNegotiationRoundsCount: activeNegotiation?.rounds?.length,
      latestRound: latestRound ? {
        id: latestRound.id,
        roundNumber: latestRound.roundNumber,
        counterOfferAmount: latestRound.counterOfferAmount,
        revisedQuoteAmount: latestRound.revisedQuoteAmount,
        nextResponsibleParty: latestRound.nextResponsibleParty,
        hasLineItemsJson: Boolean(latestRound.lineItemsJson),
        lineItemsJson: latestRound.lineItemsJson
      } : null,
    });
  }
}

testVendorApi().catch(console.error).finally(() => prisma.$disconnect());
