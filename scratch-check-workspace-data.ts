import { prisma } from './src/lib/prisma';

async function testWorkspaceData() {
  const vendor = await prisma.vendor.findFirst({
    where: { name: { contains: 'Ramakrishna' } },
  });
  if (!vendor) return;

  const rfq = await prisma.rfq.findFirst({
    where: {
      rfqNumber: 'RFQ-2026-000011',
    },
    include: {
      lines: true,
      quotes: {
        where: { vendorId: vendor.id },
        orderBy: { quoteVersion: 'desc' },
        include: { lines: true },
      },
      negotiations: {
        include: {
          rounds: {
            where: { vendorId: vendor.id },
            orderBy: { roundNumber: 'desc' },
          },
        },
      },
    },
  });

  if (!rfq) return;

  console.log('RFQ Lines count:', rfq.lines.length);
  for (const l of rfq.lines) {
    console.log(`Line ID: ${l.id}, LineNum: ${l.lineNumber}, Desc: ${l.description}, Qty: ${l.quantity}, UOM: ${l.uom}`);
  }

  console.log('\nQuotes count:', rfq.quotes.length);
  for (const q of rfq.quotes) {
    console.log(`Quote ${q.quoteNumber} (v${q.quoteVersion}): total=${q.totalQuoteAmount}, lines count=${q.lines.length}`);
    for (const ql of q.lines) {
      console.log(`  rfqLineId: ${ql.rfqLineId}, unitRate: ${ql.unitRate}, lineTotal: ${ql.lineTotal}`);
    }
  }

  console.log('\nNegotiation Rounds count for vendor:', rfq.negotiations[0]?.rounds?.length);
  const activeNeg = rfq.negotiations[0];
  const latestRound = activeNeg?.rounds[0];
  console.log('Latest Round:', {
    roundNumber: latestRound?.roundNumber,
    counterOfferAmount: latestRound?.counterOfferAmount,
    revisedQuoteAmount: latestRound?.revisedQuoteAmount,
    nextResponsibleParty: latestRound?.nextResponsibleParty,
    lineItemsJson: latestRound?.lineItemsJson,
    notes: latestRound?.notes,
    createdAt: latestRound?.createdAt,
  });
}

testWorkspaceData().catch(console.error).finally(() => prisma.$disconnect());
