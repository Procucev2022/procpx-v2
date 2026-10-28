import { prisma } from '../src/lib/prisma';

async function main() {
  const revisions = await prisma.boqRevision.findMany({
    where: {
      OR: [
        { status: 'APPROVED' },
        { prStatus: { in: ['PR_APPROVED', 'PR_RELEASED_TO_PROCUREMENT'] } },
        { prs: { some: { status: { in: ['PR_APPROVED', 'PR_RELEASED_TO_PROCUREMENT'] } } } },
        { boq: { status: 'APPROVED' } },
      ],
    },
    include: {
      boq: {
        include: {
          project: { select: { id: true, name: true, projectCode: true } },
          costCentre: { select: { id: true, code: true, name: true } },
        },
      },
      costCentre: { select: { id: true, code: true, name: true } },
      lines: {
        where: { isDeleted: false },
        select: { id: true, quantity: true, aiUnitCost: true },
      },
      rfqs: {
        select: { id: true, rfqNumber: true, status: true },
      },
      prs: {
        where: { status: { in: ['PR_APPROVED', 'PR_RELEASED_TO_PROCUREMENT'] } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  // Map each unique BOQ to its authoritative approved revision
  const boqMap = new Map<string, any>();
  for (const r of revisions) {
    const existing = boqMap.get(r.boq.id);
    if (!existing) {
      boqMap.set(r.boq.id, r);
    } else {
      // Revisions with actual lines must always take precedence over 0-line revisions
      if (r.lines.length > 0 && existing.lines.length === 0) {
        boqMap.set(r.boq.id, r);
      } else if (existing.lines.length > 0 && r.lines.length === 0) {
        // keep existing
      } else if (r.rfqs.length > existing.rfqs.length) {
        boqMap.set(r.boq.id, r);
      } else if (r.revisionNumber > existing.revisionNumber) {
        boqMap.set(r.boq.id, r);
      }
    }
  }

  const boqRfqsMap = new Map<string, any[]>();
  for (const r of revisions) {
    const list = boqRfqsMap.get(r.boq.id) || [];
    for (const rfq of r.rfqs) {
      if (!list.some(x => x.id === rfq.id)) {
        list.push(rfq);
      }
    }
    boqRfqsMap.set(r.boq.id, list);
  }

  // Helper to map RFQ status to concise Procurement Stage
  const mapConciseStage = (rfqs: any[]): string => {
    if (!rfqs || rfqs.length === 0) return 'Awaiting RFQ';
    if (rfqs.some(r => r.ppos?.length > 0 || r.status === 'AWARDED')) return 'PPO';
    if (rfqs.some(r => r.awards?.some((a: any) => a.status === 'APPROVED') || r.awards?.some((a: any) => a.status === 'PENDING_APPROVAL') || r.status === 'AWARD_RECOMMENDED')) {
      return 'Award';
    }
    if (rfqs.some(r => r.status === 'NEGOTIATION' || r.status === 'FINAL_RATE_LOCKED' || (r.negotiations?.[0]?.rounds?.length || 0) > 0)) {
      return 'Negotiation';
    }
    if (rfqs.some(r => r.status === 'COMPARISON' || r.status === 'RESPONSE_CLOSED' || (r.quotes?.length || 0) > 0)) {
      return 'Quotations';
    }
    if (rfqs.some(r => r.status === 'RELEASED' || r.status === 'VENDOR_RESPONSE_OPEN')) {
      return 'RFQ Issued';
    }
    return 'Awaiting RFQ';
  };

  const boqRegister: any[] = [];
  for (const [id, r] of Array.from(boqMap.entries())) {
    const rfqs = boqRfqsMap.get(r.boq.id) || [];
    const stage = mapConciseStage(rfqs);
    const costCentreCode = r.costCentre?.code || r.boq?.costCentre?.code || '—';
    const amount = r.lines.reduce((s: number, l: any) => s + (l.quantity || 0) * (l.aiUnitCost || 0), 0) || r.prs[0]?.totalEstimatedValue || 0;
    const linesCount = r.lines.length || r.prs[0]?.lines?.length || 0;

    boqRegister.push({
      date: r.approvedAt || r.submittedAt || r.createdAt,
      boqNumber: r.boq.boqCode,
      description: r.boq.title || r.boq.description || `${r.boq.project.name} Commercial Baseline`,
      items: linesCount,
      costCentre: costCentreCode,
      amount,
      stage,
      rfqCount: rfqs.length,
    });
  }

  console.log(`Generated boqRegister with ${boqRegister.length} records.`);
  console.log('Stage distribution:');
  const stageCounts: Record<string, number> = {};
  for (const b of boqRegister) {
    stageCounts[b.stage] = (stageCounts[b.stage] || 0) + 1;
  }
  console.log(stageCounts);
  console.log('Sample 5 records:', JSON.stringify(boqRegister.slice(0, 5), null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
