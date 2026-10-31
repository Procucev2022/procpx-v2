// scripts/check-item-sectors.ts
import { prisma } from '../src/lib/prisma';

async function check() {
  const items = await prisma.standardBoqItem.findMany();
  for (const i of items) {
    console.log(`[${i.itemCode}] sector: "${i.sector}" | cat: "${i.category}" | desc: "${i.standardDescription.slice(0, 30)}"`);
  }
}
check().catch(console.error);
