// src/app/api/budgets/reject/route.ts - Project Approver Budget Rejection API
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BUDGET_APPROVE');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const { contributionId, reason } = body;

    if (!contributionId) return apiError(UI_STRINGS.common.contributionIDIsRequired, 400, { route: '/api/budgets/reject', method: 'POST' });
    if (!reason || !reason.trim()) {
      return apiError(UI_STRINGS.common.mandatoryRejectionReasonMustBeProvided, 400, { route: '/api/budgets/reject', method: 'POST' });
    }

    const contribution = await prisma.budgetContribution.findFirst({
      where: { id: contributionId, tenantId: ctx.tenantId },
      include: { boqRevision: true, boq: true, costCentre: true },
    });

    if (!contribution) return apiError(UI_STRINGS.common.budgetContributionNotFound, 404, { route: '/api/budgets/reject', method: 'POST' });

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
        approvalLevel: 'PROJECT_APPROVER',
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

    // Clear pending amount in Cost Centre Budget record (leave approvedAmount untouched)
    const budgetRecord = await prisma.budget.findFirst({
      where: { costCentreId: contribution.costCentreId, tenantId: ctx.tenantId },
    });
    if (budgetRecord) {
      await prisma.budget.update({
        where: { id: budgetRecord.id },
        data: {
          pendingAmount: Math.max(0, budgetRecord.pendingAmount - contribution.totalEstimatedValue),
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        projectId: contribution.projectId,
        entityType: 'BUDGET_CONTRIBUTION',
        entityId: contribution.id,
        action: 'BUDGET_PROJECT_REJECTED',
        description: interpolateUiString(UI_STRINGS.appApiBudgetsRejectRoute.budgetContributionREJECTEDByProjectApproverForCostCentreCodeReasonTrim, { "code": contribution.costCentre.code, "trim": reason.trim() }),
      },
    });

    return apiSuccess({ contribution: updated, status: 'REJECTED' });
  } catch (err: any) {
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.projectBudgetRejectionFailed }), 500, { route: '/api/budgets/reject', method: 'POST', error: err });
  }
}
