import prisma from '../src/lib/prisma';


function mapRfqStage(rfq: any): string {
  if (!rfq) return 'Approved BOQ — Awaiting RFQ';
  if (rfq.ppos?.length > 0 || rfq.status === 'AWARDED') return 'PPO Created';
  const hasApprovedAward = rfq.awards?.some((a: any) => a.status === 'APPROVED');
  if (hasApprovedAward || rfq.status === 'APPROVED') return 'Award Approved';
  const hasPendingAward = rfq.awards?.some((a: any) => a.status === 'PENDING_APPROVAL');
  if (hasPendingAward || rfq.status === 'AWARD_RECOMMENDED') return 'Award Pending Approval';
  if (rfq.status === 'FINAL_RATE_LOCKED') return 'Rates Locked';
  if (rfq.status === 'NEGOTIATION' || (rfq.negotiations?.[0]?.rounds?.length || 0) > 0) return 'Negotiation';
  if (rfq.status === 'RESPONSE_CLOSED' || rfq.status === 'COMPARISON' || (rfq.quotes?.length || 0) > 0) return 'Quotation Comparison';
  if (rfq.status === 'VENDOR_RESPONSE_OPEN' || rfq.status === 'RELEASED') return 'RFQ Issued / Awaiting Quotations';
  if (rfq.status === 'DRAFT') return 'RFQ Preparation';
  if (rfq.status === 'CANCELLED') return 'Closed / Cancelled';
  return 'RFQ Preparation';
}

function derivePendingAction(rfq: any): { pendingAction: string; nextResponsibleParty: string } {
  if (rfq.ppos?.length > 0) {
    const ppo = rfq.ppos[0];
    if (ppo.status === 'ACCEPTED' || ppo.status === 'APPROVED') return { pendingAction: 'Order Confirmed & Active', nextResponsibleParty: 'VENDOR' };
    return { pendingAction: `PPO ${ppo.status} — Awaiting Vendor Acceptance`, nextResponsibleParty: 'VENDOR' };
  }
  if (rfq.status === 'AWARDED') {
    return { pendingAction: 'Issue PPO / Contract', nextResponsibleParty: 'BUYER' };
  }
  const hasApprovedAward = rfq.awards?.some((a: any) => a.status === 'APPROVED');
  if (hasApprovedAward) {
    return { pendingAction: 'Generate Purchase Order (PPO)', nextResponsibleParty: 'BUYER' };
  }
  const hasPendingAward = rfq.awards?.some((a: any) => a.status === 'PENDING_APPROVAL');
  if (hasPendingAward || rfq.status === 'AWARD_RECOMMENDED') {
    return { pendingAction: 'Award Sanction Approval Pending', nextResponsibleParty: 'APPROVER' };
  }
  if (rfq.status === 'FINAL_RATE_LOCKED') {
    return { pendingAction: 'Submit Award Recommendation', nextResponsibleParty: 'BUYER' };
  }
  const latestRound = rfq.negotiations?.[0]?.rounds?.[0];
  if (latestRound) {
    if (latestRound.nextResponsibleParty === 'VENDOR' || latestRound.status === 'ROUND_ACTIVE') {
      return { pendingAction: 'Vendor Revision / Counter-Response Pending', nextResponsibleParty: 'VENDOR' };
    }
    if (latestRound.nextResponsibleParty === 'BUYER' || latestRound.status === 'REVISED_SUBMITTED') {
      return { pendingAction: 'Buyer Review & Counteroffer / Rate Lock', nextResponsibleParty: 'BUYER' };
    }
  }
  if (rfq.status === 'NEGOTIATION') {
    return { pendingAction: 'Commercial Negotiation Active', nextResponsibleParty: 'BUYER' };
  }
  if ((rfq.quotes?.length || 0) > 0) {
    return { pendingAction: 'Quotation Comparison & Baseline Evaluation', nextResponsibleParty: 'BUYER' };
  }
  if (rfq.status === 'RELEASED' || rfq.status === 'VENDOR_RESPONSE_OPEN') {
    return { pendingAction: 'Awaiting Vendor Bid Submission', nextResponsibleParty: 'VENDOR' };
  }
  if (rfq.status === 'DRAFT') {
    return { pendingAction: 'Release RFQ to Vendors', nextResponsibleParty: 'BUYER' };
  }
  return { pendingAction: 'Awaiting Action', nextResponsibleParty: 'BUYER' };
}

async function main() {
  const tenant = await prisma.tenant.findFirst();
  const tenantId = tenant!.id;

  const approvedRevisions = await prisma.boqRevision.findMany({
    where: { tenantId, status: 'APPROVED' },
    include: {
      boq: {
        include: {
          project: { select: { id: true, projectCode: true, name: true, location: true, city: true } },
          costCentre: { select: { id: true, code: true, name: true } },
        },
      },
      lines: {
        where: { isDeleted: false },
        include: {
          category: { select: { id: true, name: true } },
          uom: { select: { id: true, code: true } },
        },
      },
      rfqs: {
        include: {
          invitedVendors: { include: { vendor: { select: { id: true, name: true, code: true } } } },
          quotes: {
            include: { vendor: { select: { id: true, name: true } } },
            orderBy: { totalQuoteAmount: 'asc' },
          },
          negotiations: {
            include: {
              rounds: {
                include: { vendor: { select: { id: true, name: true } } },
                orderBy: { roundNumber: 'desc' },
              },
            },
          },
          awards: {
            include: { recommendedVendor: { select: { id: true, name: true } } },
          },
          ppos: {
            select: { id: true, ppoNumber: true, status: true, totalValue: true, createdAt: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { approvedAt: 'desc' },
  });

  const boqRegister = approvedRevisions.map(rev => {
    const categories = Array.from(new Set(rev.lines.map(l => l.category?.name).filter(Boolean)));
    const benchmarkVal = rev.lines.reduce((s, l) => s + ((l.quantity || 0) * ((l as any).benchmarkRate || 100)), 0);

    const formattedRfqs = rev.rfqs.map(rfq => {
      const quotesCount = rfq.quotes?.length || 0;
      const invitedCount = rfq.invitedVendors?.length || 0;
      const { pendingAction, nextResponsibleParty } = derivePendingAction(rfq);
      const stage = mapRfqStage(rfq);

      const lowestQuote = rfq.quotes[0];
      const comparisonStatus = quotesCount > 0
        ? `L1: ${lowestQuote.vendor?.name || 'Vendor'} (₹${lowestQuote.totalQuoteAmount?.toLocaleString('en-IN')})`
        : (rfq.status === 'RELEASED' || rfq.status === 'VENDOR_RESPONSE_OPEN' ? 'Awaiting Bids' : 'No Quotes Yet');

      const rounds = rfq.negotiations?.[0]?.rounds || [];
      const negotiationRound = rfq.status === 'FINAL_RATE_LOCKED'
        ? 'Rates Locked'
        : (rounds.length > 0 ? `Round ${rounds[0].roundNumber} (${rounds[0].status?.replace(/_/g, ' ') || 'Active'})` : (rfq.status === 'NEGOTIATION' ? 'Round 1 Active' : '—'));

      const awardStatus = rfq.awards?.some((a: any) => a.status === 'APPROVED')
        ? 'Approved'
        : (rfq.awards?.some((a: any) => a.status === 'PENDING_APPROVAL')
          ? 'Pending Approval'
          : (rfq.status === 'AWARD_RECOMMENDED' ? 'Award Recommended' : (rfq.status === 'AWARDED' ? 'Awarded' : 'Not Prepared')));

      const ppoStatus = rfq.ppos?.length > 0
        ? `${rfq.ppos[0].ppoNumber} (${rfq.ppos[0].status})`
        : (rfq.status === 'AWARDED' || awardStatus === 'Approved' ? 'PPO Pending' : '—');

      return {
        id: rfq.id,
        rfqNumber: rfq.rfqNumber,
        title: rfq.title || rfq.packageName || 'Package',
        packageName: rfq.packageName,
        status: rfq.status,
        stage,
        vendorInvitationProgress: `${quotesCount} submitted / ${invitedCount} invited`,
        invitedCount,
        quotesCount,
        quoteStatus: quotesCount > 0 ? `${quotesCount} Quote${quotesCount > 1 ? 's' : ''} Received` : 'Awaiting Bids',
        comparisonStatus,
        negotiationRound,
        pendingAction,
        nextResponsibleParty,
        awardStatus,
        recommendedVendor: rfq.awards?.[0]?.recommendedVendor?.name || null,
        ppoStatus,
        orderStatus: rfq.ppos?.[0]?.status || '—',
        estimatedBenchmarkValue: rfq.estimatedBenchmarkValue || 0,
        lastUpdated: rfq.updatedAt || rfq.createdAt,
        openUrl: `/procurement/rfqs/${rfq.id}`,
        negotiationUrl: `/procurement/rfqs/${rfq.id}?tab=negotiation`,
        awardingUrl: `/procurement/rfqs/${rfq.id}?tab=awarding`,
        ppoUrl: rfq.ppos?.[0] ? `/procurement/ppos/${rfq.ppos[0].id}` : `/procurement/rfqs/${rfq.id}?tab=awarding`,
      };
    });

    let overallStage = 'Approved BOQ — Awaiting RFQ';
    if (formattedRfqs.some(r => r.stage === 'PPO Created')) overallStage = 'PPO Created';
    else if (formattedRfqs.some(r => r.stage === 'Award Approved')) overallStage = 'Award Approved';
    else if (formattedRfqs.some(r => r.stage === 'Award Pending Approval')) overallStage = 'Award Pending Approval';
    else if (formattedRfqs.some(r => r.stage === 'Rates Locked')) overallStage = 'Rates Locked';
    else if (formattedRfqs.some(r => r.stage === 'Negotiation')) overallStage = 'Negotiation';
    else if (formattedRfqs.some(r => r.stage === 'Quotation Comparison')) overallStage = 'Quotation Comparison';
    else if (formattedRfqs.some(r => r.stage.includes('Awaiting Quotations'))) overallStage = 'RFQ Issued / Awaiting Quotations';
    else if (formattedRfqs.length > 0) overallStage = 'RFQ Preparation';

    return {
      id: rev.id,
      boqId: rev.boq.id,
      boqCode: rev.boq.boqCode,
      title: rev.boq.title || `${rev.boq.project.name} — Commercial Baseline`,
      projectName: rev.boq.project.name,
      projectCode: rev.boq.project.projectCode,
      costCentre: rev.boq.costCentre ? `${rev.boq.costCentre.code} - ${rev.boq.costCentre.name}` : 'General',
      category: categories.join(', ') || 'General',
      approvedRevision: rev.revisionCode,
      revisionId: rev.id,
      projectId: rev.boq.project.id,
      approvedAt: rev.approvedAt,
      totalLines: rev.lines.length,
      benchmarkValue: benchmarkVal,
      rfqCount: formattedRfqs.length,
      overallStage,
      canCreateRfq: true,
      createRfqUrl: `/procurement/rfqs/new?revisionId=${rev.id}&projectId=${rev.boq.project.id}`,
      rfqs: formattedRfqs,
    };
  });

  console.log(`Generated boqRegister with ${boqRegister.length} records.`);
  boqRegister.forEach(b => {
    console.log(`[BOQ ${b.boqCode}] ${b.title} | ${b.projectName} | Stage: ${b.overallStage} | RFQs: ${b.rfqCount}`);
    b.rfqs.forEach(r => {
      console.log(`   -> [${r.rfqNumber}] ${r.title} | Stage: ${r.stage} | Neg: ${r.negotiationRound} | Pending: ${r.pendingAction} (${r.nextResponsibleParty}) | PPO: ${r.ppoStatus}`);
    });
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
