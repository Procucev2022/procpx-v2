// scripts/inspect-kundanahalli-details.ts
import { prisma } from '../src/lib/prisma';

async function check() {
  const p = await prisma.project.findFirst({
    where: { name: { contains: 'Kundanahalli' } },
    include: { costCentres: true }
  });
  console.log(JSON.stringify(p, null, 2));
}

check().catch(console.error);
