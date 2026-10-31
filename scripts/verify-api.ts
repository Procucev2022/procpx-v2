// scripts/verify-api.ts
import { prisma } from '../src/lib/prisma';

async function main() {
  const user = await prisma.user.findFirst({ where: { role: 'PROCUREMENT_USER' } });
  if (!user) throw new Error('No procurement user');
  console.log('Procurement User ID:', user.id);

  const res = await fetch('http://localhost:3000/api/dashboard', {
    headers: {
      'x-test-user-id': user.id,
    },
  });
  const data = await res.json();
  console.log('Status code:', res.status);
  console.log('Role returned:', data.role);
  console.log('Summary Cards:', JSON.stringify(data.summaryCards, null, 2));
  console.log('PR Register count:', data.prRegister?.length);
  if (data.prRegister?.length > 0) {
    const firstPr = data.prRegister[0];
    console.log('First PR in register:', {
      prNumber: firstPr.prNumber,
      description: firstPr.description,
      costCentre: firstPr.costCentre,
      category: firstPr.category,
      requestedValue: firstPr.requestedValue,
      prApprovalStatus: firstPr.prApprovalStatus,
      sourcingStage: firstPr.sourcingStage,
      rfqCount: firstPr.rfqCount,
      rfqs: firstPr.rfqs?.map((r: any) => ({
        rfqNumber: r.rfqNumber,
        description: r.description,
        vendorInvitationProgress: r.vendorInvitationProgress,
        quotationStage: r.quotationStage,
        negotiationStage: r.negotiationStage,
        awardStatus: r.awardStatus,
        ppoStatus: r.ppoStatus,
      })),
    });
  }
}

main().catch(console.error);
