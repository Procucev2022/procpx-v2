import { prisma } from '../src/lib/prisma';

async function main() {
  const rfq = await prisma.rfq.findUnique({
    where: { id: '79490844-3600-4c7d-9254-901520b36449' },
    include: { lines: true, project: true },
  });

  if (!rfq) {
    console.error('RFQ not found');
    return;
  }

  let pr = await prisma.procurementRequest.findFirst({
    where: { prNumber: 'PR-2026-000004' },
  });

  if (!pr) {
    const costCentre =
      (await prisma.costCentre.findFirst({ where: { projectId: rfq.projectId } })) ||
      (await prisma.costCentre.findFirst({ where: { tenantId: rfq.tenantId } }));

    const boqRev = await prisma.boqRevision.findUnique({
      where: { id: rfq.boqRevisionId },
      include: { boq: true },
    });

    pr = await prisma.procurementRequest.create({
      data: {
        tenantId: rfq.tenantId,
        projectId: rfq.projectId,
        costCentreId: costCentre!.id,
        boqId: boqRev!.boqId,
        boqRevisionId: rfq.boqRevisionId,
        prNumber: 'PR-2026-000004',
        title: 'Checkout Counters & Retail Display Shelving Package',
        purpose: 'Store checkout & customer display equipment for Express Grocery Mart',
        totalEstimatedValue: 1205000,
        totalLines: 2,
        status: 'PR_RELEASED_TO_PROCUREMENT',
        requestedBy: 'Store Operations Lead',
        projectApprovedBy: 'Project Approver',
        projectApprovedAt: new Date(),
        releasedBy: 'Project Approver',
        releasedAt: new Date(),
        lines: {
          create: rfq.lines.map((l, idx) => ({
            tenantId: rfq.tenantId,
            lineNumber: String(idx + 1),
            itemDescription: l.description,
            specification: l.specification || 'Commercial grade standard store fixtures',
            category: l.category || 'Furniture',
            uom: l.uom || 'NOS',
            quantity: l.quantity,
            estimatedRate: l.benchmarkRate || 0,
            estimatedValue: l.benchmarkAmount || 0,
          })),
        },
      },
    });
  }

  await prisma.rfq.update({
    where: { id: rfq.id },
    data: { prId: pr.id },
  });

  // Also update PPO if needed
  await prisma.ppo.updateMany({
    where: { rfqId: rfq.id },
    data: { prId: pr.id },
  });

  console.log('✅ Linked RFQ-2026-000004 and PPO-2026-000006 to PR-2026-000004!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
