// src/app/api/budgets/approve/route.ts - Project Approver Budget Approval API
import { I18N_CONFIG } from '@/lib/i18n.constants';
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
    const { contributionId, remarks } = body;

    if (!contributionId) return apiError(UI_STRINGS.common.contributionIDIsRequired, 400);

    const contribution = await prisma.budgetContribution.findFirst({
      where: { id: contributionId, tenantId: ctx.tenantId },
      include: { boqRevision: true, boq: true, costCentre: true },
    });

    if (!contribution) return apiError(UI_STRINGS.common.budgetContributionNotFound, 404);
    if (contribution.status !== 'PENDING_PROJECT_APPROVAL' && contribution.status !== 'UNDER_APPROVAL') {
      return apiError(interpolateUiString(UI_STRINGS.appApiBudgetsApproveRoute.cannotApproveContributionInStateStatusExpectedUnderApproval, { "status": contribution.status }), 400);
    }

    // Record Project Approval log
    await prisma.budgetApproval.create({
      data: {
        tenantId: ctx.tenantId,
        contributionId,
        approvalLevel: 'PROJECT_APPROVER',
        approverId: ctx.userId,
        status: 'APPROVED',
        reason: remarks || 'Project level scope and commercial estimate approved.',
        timestamp: new Date(),
      },
    });

    const nextStatus = (body.directApprove && (ctx.role === 'SUPER_ADMIN' || ctx.role === 'CLIENT_ADMIN'))
      ? 'APPROVED'
      : 'PENDING_FINANCE_APPROVAL';

    const updated = await prisma.budgetContribution.update({
      where: { id: contributionId },
      data: {
        status: nextStatus,
        projectApprovedAt: new Date(),
        projectApprovedBy: ctx.userId,
      },
    });

    await prisma.budgetTransaction.updateMany({
      where: { contributionId },
      data: { status: nextStatus },
    });

    // Update BOQ revision budget status
    await prisma.boqRevision.update({
      where: { id: contribution.boqRevisionId },
      data: {
        budgetStatus: nextStatus === 'APPROVED' ? 'BUDGET_APPROVED' : 'BUDGET_UNDER_FINANCE_APPROVAL',
      },
    });

    // Only update approvedAmount if fully approved (e.g. direct admin approval)
    if (nextStatus === 'APPROVED') {
      const budgetRecord = await prisma.budget.findFirst({
        where: { costCentreId: contribution.costCentreId, tenantId: ctx.tenantId },
      });
      if (budgetRecord) {
        await prisma.budget.update({
          where: { id: budgetRecord.id },
          data: {
            approvedAmount: budgetRecord.approvedAmount + contribution.acceptedEstimatedValue,
            pendingAmount: Math.max(0, budgetRecord.pendingAmount - contribution.totalEstimatedValue),
            status: 'APPROVED',
          },
        });
      } else {
        await prisma.budget.create({
          data: {
            tenantId: ctx.tenantId,
            projectId: contribution.projectId,
            costCentreId: contribution.costCentreId,
            totalAmount: contribution.acceptedEstimatedValue,
            approvedAmount: contribution.acceptedEstimatedValue,
            pendingAmount: 0,
            status: 'APPROVED',
            createdBy: ctx.userId,
          },
        });
      }
    }

    await prisma.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        projectId: contribution.projectId,
        entityType: 'BUDGET_CONTRIBUTION',
        entityId: contribution.id,
        action: 'BUDGET_PROJECT_APPROVED',
        description: interpolateUiString(UI_STRINGS.appApiBudgetsApproveRoute.budgetContributionApprovedByProjectApproverForCostCentreCodeToLocaleStringMovedToAPPROVED, { "code": contribution.costCentre.code, "toLocaleString": contribution.acceptedEstimatedValue.toLocaleString(I18N_CONFIG.defaultLocale) }),
      },
    });

    return apiSuccess({
      contribution: updated,
      status: nextStatus,
      message: UI_STRINGS.appApiBudgetsApproveRoute.budgetContributionApprovedByProjectApprover,
    });
  } catch (err: any) {
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.projectBudgetApprovalFailed }), 500);
  }
}
