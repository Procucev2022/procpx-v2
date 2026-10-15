// src/app/api/budgets/finance-reject/route.ts - Finance Budget Rejection API
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BUDGET_FINANCE_APPROVE');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const { contributionId, reason } = body;

    if (!contributionId) return apiError('Contribution ID is required.', 400);
    if (!reason || !reason.trim()) {
      return apiError('Mandatory finance rejection reason is required.', 400);
    }

    const contribution = await prisma.budgetContribution.findFirst({
      where: { id: contributionId, tenantId: ctx.tenantId },
      include: { boqRevision: true, boq: true, costCentre: true },
    });

    if (!contribution) return apiError('Budget contribution not found.', 404);

    const updated = await prisma.budgetContribution.update({
      where: { id: contributionId },
      data: {
        status: 'REJECTED',
        rejectionReason: reason.trim(),
      },
    });

    await prisma.budgetApproval.create({
      data: {
        tenantId: ctx.tenantId,
        contributionId,
        approvalLevel: 'FINANCE',
        approverId: ctx.userId,
        status: 'REJECTED',
        reason: reason.trim(),
        timestamp: new Date(),
      },
    });

    await prisma.budgetTransaction.updateMany({
      where: { contributionId },
      data: { status: 'REJECTED' },
    });

    await prisma.boqRevision.update({
      where: { id: contribution.boqRevisionId },
      data: { budgetStatus: 'BUDGET_REJECTED' },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        projectId: contribution.projectId,
        entityType: 'BUDGET_CONTRIBUTION',
        entityId: contribution.id,
        action: 'BUDGET_FINANCE_REJECTED',
        description: `Budget contribution REJECTED by Finance for Cost Centre ${contribution.costCentre.code}. Reason: ${reason.trim()}`,
      },
    });

    return apiSuccess({ contribution: updated, status: 'REJECTED' });
  } catch (err: any) {
    return apiError(err.message || 'Finance budget rejection failed.', 500);
  }
}
