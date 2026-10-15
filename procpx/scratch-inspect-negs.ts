import { prisma } from './src/lib/prisma';

async function main() {
  const negs = await prisma.negotiation.findMany({
    include: {
      rounds: {
        include: { vendor: true },
        orderBy: { roundNumber: 'desc' },
      },
      rfq: true,
    },
  });

  console.log(`Found ${negs.length} negotiations.`);
  for (const n of negs) {
    console.log(`\nNeg ID: ${n.id}, RFQ: ${n.rfq?.rfqNumber} (${n.rfqId}), Status: ${n.status}, CurrentRound: ${n.currentRound}`);
    for (const r of n.rounds) {
      console.log(`  Round ${r.roundNumber} (id: ${r.id}): Vendor: ${r.vendor?.name} (${r.vendorId}), PreviousQuote: ${r.previousQuoteAmount}, CounterOffer: ${r.counterOfferAmount}, RevisedQuote: ${r.revisedQuoteAmount}, NextParty: ${r.nextResponsibleParty}, Status: ${r.status}, lineItemsJson: ${r.lineItemsJson ? r.lineItemsJson.slice(0, 80) + '...' : 'null'}`);
    }
  }

  // Check vendor Ramakrishna interiors specifically
  const vendor = await prisma.vendor.findFirst({
    where: { name: { contains: 'Ramakrishna' } },
  });
  console.log('\nRamakrishna interiors vendor ID:', vendor?.id);
  if (vendor) {
    const rfqs = await prisma.rfq.findMany({
      where: { invitedVendors: { some: { vendorId: vendor.id } } },
      select: { id: true, rfqNumber: true, status: true },
    });
    console.log('Invited RFQs:', rfqs);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
