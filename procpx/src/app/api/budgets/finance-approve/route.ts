// src/app/api/budgets/finance-approve/route.ts - Finance Budget Approval API
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BUDGET_FINANCE_APPROVE');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const { contributionId, remarks } = body;

    if (!contributionId) return apiError('Contribution ID is required.', 400);

    const contribution = await prisma.budgetContribution.findFirst({
      where: { id: contributionId, tenantId: ctx.tenantId },
      include: { boqRevision: true, boq: true, costCentre: true },
    });

    if (!contribution) return apiError('Budget contribution not found.', 404);
    if (contribution.status !== 'PENDING_FINANCE_APPROVAL' && contribution.status !== 'PROJECT_APPROVED') {
      return apiError(`Cannot finance-approve budget in state ${contribution.status}. Must be approved by Project Approver first.`, 400);
    }

    // Record Finance Approval Log
    await prisma.budgetApproval.create({
      data: {
        tenantId: ctx.tenantId,
        contributionId,
        approvalLevel: 'FINANCE',
        approverId: ctx.userId,
        status: 'APPROVED',
        reason: remarks || 'Capex financial budget allocation validated and sanctioned.',
        timestamp: new Date(),
      },
    });

    const updated = await prisma.budgetContribution.update({
      where: { id: contributionId },
      data: {
        status: 'APPROVED',
        financeApprovedAt: new Date(),
        financeApprovedBy: ctx.userId,
      },
    });

    // Mark transactions as APPROVED
    await prisma.budgetTransaction.updateMany({
      where: { contributionId },
      data: { status: 'APPROVED' },
    });

    // Mark BOQ Revision budget status as BUDGET_APPROVED
    await prisma.boqRevision.update({
      where: { id: contribution.boqRevisionId },
      data: { budgetStatus: 'BUDGET_APPROVED' },
    });

    // Update or create aggregate Budget record for Cost Centre
    const budgetRecord = await prisma.budget.findFirst({
      where: { costCentreId: contribution.costCentreId, tenantId: ctx.tenantId },
    });

    if (budgetRecord) {
      await prisma.budget.update({
        where: { id: budgetRecord.id },
        data: {
          totalAmount: budgetRecord.totalAmount + contribution.acceptedEstimatedValue,
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
          status: 'APPROVED',
          createdBy: ctx.userId,
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
        action: 'BUDGET_FINANCE_APPROVED',
        description: `Budget contribution sanctioned and APPROVED by Finance for Cost Centre ${contribution.costCentre.code} (₹ ${contribution.acceptedEstimatedValue.toLocaleString('en-IN')})`,
      },
    });

    return apiSuccess({
      contribution: updated,
      status: 'APPROVED',
      approvedAmount: contribution.acceptedEstimatedValue,
    });
  } catch (err: any) {
    return apiError(err.message || 'Finance budget approval failed.', 500);
  }
}
