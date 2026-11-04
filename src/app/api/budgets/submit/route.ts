// src/app/api/budgets/submit/route.ts - Submit Budget for Project Approver Review
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BUDGET_SUBMIT');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const { contributionId } = body;

    if (!contributionId) return apiError(UI_STRINGS.common.contributionIDIsRequired, 400, { route: '/api/budgets/submit', method: 'POST' });

    const contribution = await prisma.budgetContribution.findFirst({
      where: { id: contributionId, tenantId: ctx.tenantId },
      include: { boqRevision: true, boq: true, costCentre: true },
    });

    if (!contribution) return apiError(UI_STRINGS.common.budgetContributionNotFound, 404, { route: '/api/budgets/submit', method: 'POST' });
    if (contribution.status !== 'DRAFT') {
      return apiError(interpolateUiString(UI_STRINGS.appApiBudgetsSubmitRoute.cannotSubmitContributionInStateStatus, { "status": contribution.status }), 400, { route: '/api/budgets/submit', method: 'POST' });
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
        description: interpolateUiString(UI_STRINGS.appApiBudgetsSubmitRoute.budgetContributionForCostCentreCodeSubmittedForProjectApproverReviewToLocaleString, { "code": contribution.costCentre.code, "toLocaleString": contribution.totalEstimatedValue.toLocaleString(I18N_CONFIG.defaultLocale) }),
      },
    });

    return apiSuccess({ contribution: updated, status: 'PENDING_PROJECT_APPROVAL' });
  } catch (err: any) {
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.failedToSubmitBudgetContribution }), 500, { route: '/api/budgets/submit', method: 'POST', error: err });
  }
}
