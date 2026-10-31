// src/app/api/budgets/finance-reject/route.ts - Finance Budget Rejection API
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BUDGET_FINANCE_APPROVE');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const { contributionId, reason } = body;

    if (!contributionId) return apiError(UI_STRINGS.common.contributionIDIsRequired, 400);
    if (!reason || !reason.trim()) {
      return apiError(UI_STRINGS.appApiBudgetsFinanceRejectRoute.mandatoryFinanceRejectionReasonIsRequired, 400);
    }

    const contribution = await prisma.budgetContribution.findFirst({
      where: { id: contributionId, tenantId: ctx.tenantId },
      include: { boqRevision: true, boq: true, costCentre: true },
    });

    if (!contribution) return apiError(UI_STRINGS.common.budgetContributionNotFound, 404);

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
        description: interpolateUiString(UI_STRINGS.appApiBudgetsFinanceRejectRoute.budgetContributionREJECTEDByFinanceForCostCentreCodeReasonTrim, { "code": contribution.costCentre.code, "trim": reason.trim() }),
      },
    });

    return apiSuccess({ contribution: updated, status: 'REJECTED' });
  } catch (err: any) {
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.financeBudgetRejectionFailed }), 500);
  }
}
