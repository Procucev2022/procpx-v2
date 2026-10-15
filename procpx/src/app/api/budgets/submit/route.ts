// src/app/api/budgets/submit/route.ts - Submit Budget for Project Approver Review
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BUDGET_SUBMIT');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const { contributionId } = body;

    if (!contributionId) return apiError('Contribution ID is required.', 400);

    const contribution = await prisma.budgetContribution.findFirst({
      where: { id: contributionId, tenantId: ctx.tenantId },
      include: { boqRevision: true, boq: true, costCentre: true },
    });

    if (!contribution) return apiError('Budget contribution not found.', 404);
    if (contribution.status !== 'DRAFT') {
      return apiError(`Cannot submit contribution in state ${contribution.status}.`, 400);
    }

    const updated = await prisma.budgetContribution.update({
      where: { id: contributionId },
      data: {
        status: 'PENDING_PROJECT_APPROVAL',
        submittedAt: new Date(),
        submittedBy: ctx.userId,
      },
    });

    // Update transactions status
    await prisma.budgetTransaction.updateMany({
      where: { contributionId },
      data: { status: 'PENDING_PROJECT_APPROVAL' },
    });

    // Update BOQ revision status
    await prisma.boqRevision.update({
      where: { id: contribution.boqRevisionId },
      data: { budgetStatus: 'BUDGET_PENDING_PROJECT_APPROVAL' },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        projectId: contribution.projectId,
        entityType: 'BUDGET_CONTRIBUTION',
        entityId: contribution.id,
        action: 'BUDGET_SUBMITTED',
        description: `Budget contribution for Cost Centre ${contribution.costCentre.code} submitted for Project Approver review (₹ ${contribution.totalEstimatedValue.toLocaleString('en-IN')})`,
      },
    });

    return apiSuccess({ contribution: updated, status: 'PENDING_PROJECT_APPROVAL' });
  } catch (err: any) {
    return apiError(err.message || 'Failed to submit budget contribution.', 500);
  }
}
