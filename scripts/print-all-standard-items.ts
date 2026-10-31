// scripts/print-all-standard-items.ts
import { prisma } from '../src/lib/prisma';

async function list() {
  const all = await prisma.standardBoqItem.findMany({
    orderBy: [{ category: 'asc' }, { itemCode: 'asc' }]
  });
  console.log('--- ALL STANDARD BOQ ITEMS ---');
  for (const item of all) {
    console.log(`[${item.itemCode}] (${item.category} / ${item.subcategory}) ${item.standardDescription} | ${item.uom} | Rate: ₹${item.benchmarkRate} | Spec: ${item.detailedSpecification.slice(0, 50)}...`);
  }
}
list().catch(console.error);
