// scripts/inspect-duplicates.ts
import { prisma } from '../src/lib/prisma';

async function check() {
  const allItems = await prisma.standardBoqItem.findMany();
  console.log(`Total StandardBoqItems: ${allItems.length}`);

  // Group by normalized description and category/UOM
  const map = new Map<string, typeof allItems>();
  for (const item of allItems) {
    const norm = item.standardDescription
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const key = `${item.category.toLowerCase()}|||${item.uom.toLowerCase()}|||${norm}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }

  const duplicates = [];
  for (const [key, items] of map.entries()) {
    if (items.length > 1) {
      duplicates.push({ key, count: items.length, items: items.map(i => ({ id: i.id, code: i.itemCode, desc: i.standardDescription, spec: i.detailedSpecification })) });
    }
  }

  console.log(`Duplicate groups found: ${duplicates.length}`);
  console.log(JSON.stringify(duplicates, null, 2));
}

check().catch(console.error);
