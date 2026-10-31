// scripts/check-kundanahalli.ts
import { prisma } from '../src/lib/prisma';

async function check() {
  const p = await prisma.project.findFirst({
    where: { name: { contains: 'Kundanahalli' } },
    include: { costCentres: true }
  });
  console.log('Kundanahalli Project in DB:', p ? { id: p.id, name: p.name, costCentres: p.costCentres.map(c => ({ id: c.id, code: c.code, name: c.name })) } : 'NOT FOUND');
}

check().catch(console.error);
