import { I18N_CONFIG } from '@/lib/i18n.constants';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import { isD1BatchWithinLimits, writeD1BatchAtomically } from '@/lib/d1-batch';
import {
  BUDGET_AGGREGATE_PENDING_UPSERT_SQL,
  BUDGET_CONTRIBUTION_ASSERT_AFTER_UPSERT_SQL,
  BUDGET_AUDIT_INSERT_AFTER_TRANSITION_SQL,
  BUDGET_CONTRIBUTION_BOQ_UPDATE_AFTER_AUDIT_SQL,
  BUDGET_CONTRIBUTION_CREATE_UNDER_APPROVAL_SQL,
  BUDGET_CONTRIBUTION_RESUBMIT_SQL,
  BUDGET_CONTRIBUTION_REVISION_UPDATE_AFTER_AUDIT_SQL,
  BUDGET_TRANSACTION_INSERT_AFTER_AUDIT_SQL,
  BUDGET_TRANSACTION_SUPERSEDE_AFTER_AUDIT_SQL,
  MAX_D1_BATCH_STATEMENTS,
} from '@/lib/d1-batch.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import type { BudgetCategoryTotal } from '@app-types/app/api/boq/add-to-budget.types';
import type { BudgetContributionLineAggregateRow } from '@app-types/lib/budget-contribution-lines.types';
import { getBudgetContributionLineAggregate } from '@/lib/budget-contribution-lines';
import { BUDGET_TRANSACTION_SUPERSEDED_STATUS } from '@/lib/budget-transaction-status.constants';

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BUDGET_CREATE');
  if (!isApiContext(ctx)) return ctx;

  const startedAt = Date.now();
  let requestedRevisionId: string | undefined;
  try {
    const body = await req.json();
    const boqRevisionId = typeof body?.boqRevisionId === 'string'
      ? body.boqRevisionId
      : typeof body?.revisionId === 'string' ? body.revisionId : undefined;
    requestedRevisionId = boqRevisionId;
    const boqId = typeof body?.boqId === 'string' ? body.boqId : undefined;
    const requestedCostCentreId = typeof body?.costCentreId === 'string' ? body.costCentreId : undefined;
    const requestedProjectId = typeof body?.projectId === 'string' ? body.projectId : undefined;

    if (!boqRevisionId && !boqId) return apiError(UI_STRINGS.common.bOQRevisionIDOrBOQIDIsRequired, 400);

    let revision: any = null;
    if (boqRevisionId) {
      revision = await prisma.boqRevision.findFirst({
        where: { id: boqRevisionId, tenantId: ctx.tenantId },
        select: {
          id: true,
          boqId: true,
          revisionCode: true,
          costCentreId: true,
          boq: { select: { id: true, boqCode: true, projectId: true, costCentreId: true } },
        },
      });
    }
    if (!revision && boqId) {
      const boqRecord = await prisma.boq.findFirst({
        where: { id: boqId, tenantId: ctx.tenantId },
        select: {
          id: true,
          boqCode: true,
          projectId: true,
          costCentreId: true,
          revisions: {
            orderBy: { revisionNumber: 'desc' }, take: 1,
            select: { id: true, boqId: true, revisionCode: true, costCentreId: true },
          },
        },
      });
      if (boqRecord?.revisions.length) revision = { ...boqRecord.revisions[0], boq: boqRecord };
    }
    if (!revision) return apiError(UI_STRINGS.common.bOQRevisionNotFound, 404);

    const targetProjectId = requestedProjectId || revision.boq.projectId;
    const targetCostCentreId = requestedCostCentreId || revision.costCentreId || revision.boq.costCentreId;
    if (!targetCostCentreId) return apiError(UI_STRINGS.appApiBoqAddToBudgetRoute.aValidCostCentreIsRequiredToAllocateBudget, 400);

    const costCentre = await prisma.costCentre.findFirst({
      where: { id: targetCostCentreId, projectId: targetProjectId, tenantId: ctx.tenantId },
    });
    if (!costCentre) return apiError(UI_STRINGS.common.costCentreNotFoundForThisProject, 404);

    const lineAggregate = await getBudgetContributionLineAggregate(
      (query) => prisma.$queryRaw<BudgetContributionLineAggregateRow[]>(query),
      revision.id,
      ctx.tenantId,
      UI_STRINGS.common.general,
    );
    if (lineAggregate.missingQuantityLines > 0) {
      return apiError(interpolateUiString(
        UI_STRINGS.appApiBoqAddToBudgetRoute.lengthBOQLineValue2RequireQuantityBeforeThisBOQCanBeAddedToBudget,
        { length: lineAggregate.missingQuantityLines, value2: lineAggregate.missingQuantityLines > 1 ? 's' : '' },
      ), 400);
    }
    if (lineAggregate.totalLines === 0) return apiError(UI_STRINGS.common.budgetNeedsAtLeastOneLine, 400);
    if (lineAggregate.invalidCostLines > 0) return apiError(UI_STRINGS.common.userMessages.failedToAddBoqToBudget, 400);

    const totalEstimated = lineAggregate.totalEstimated;
    const categoryTotals = new Map<string, BudgetCategoryTotal>(lineAggregate.categories.map((category) => [
      category.categoryName,
      { amount: category.amount, quantity: category.quantity, firstLineId: category.firstLineId },
    ]));

    const existingContribution = await prisma.budgetContribution.findFirst({
      where: { tenantId: ctx.tenantId, boqRevisionId: revision.id },
    });
    if (existingContribution && ['UNDER_APPROVAL', 'PENDING_PROJECT_APPROVAL', 'PENDING_FINANCE_APPROVAL', 'PROJECT_APPROVED'].includes(existingContribution.status)) {
      const transactionWhere = {
        tenantId: ctx.tenantId,
        contributionId: existingContribution.id,
        status: { not: BUDGET_TRANSACTION_SUPERSEDED_STATUS },
      };
      const [firstTransaction, transactionsCount] = await Promise.all([
        prisma.budgetTransaction.findFirst({
          where: transactionWhere,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { transactionCode: true },
        }),
        prisma.budgetTransaction.count({ where: transactionWhere }),
      ]);
      return apiSuccess({
        success: true,
        alreadySubmitted: true,
        contributionId: existingContribution.id,
        transactionCode: firstTransaction?.transactionCode || `BTX-${existingContribution.id.substring(0, 8)}`,
        totalAmount: existingContribution.totalEstimatedValue,
        status: existingContribution.status,
        costCentre: { id: costCentre.id, code: costCentre.code, name: costCentre.name },
        transactionsCount,
        message: interpolateUiString(UI_STRINGS.common.budgetContributionAlreadyInStatus, { status: existingContribution.status }),
      }, 200);
    }
    if (existingContribution?.status === 'APPROVED') {
      return apiError(interpolateUiString(
        UI_STRINGS.appApiBoqAddToBudgetRoute.bOQBoqCodeHasAlreadyBeenApprovedInBudgetForCostCentreCode,
        { boqCode: revision.boq.boqCode, code: costCentre.code },
      ), 400);
    }
    if (existingContribution && !['DRAFT', 'REJECTED'].includes(existingContribution.status)) {
      return apiError(interpolateUiString(UI_STRINGS.common.budgetContributionAlreadyInStatus, { status: existingContribution.status }), 409);
    }

    const statementOverhead = existingContribution ? 7 : 6;
    if (categoryTotals.size + statementOverhead > MAX_D1_BATCH_STATEMENTS) {
      return apiError(UI_STRINGS.common.budgetContributionHasTooManyCategories, 400);
    }

    const now = new Date();
    const auditId = crypto.randomUUID();
    const contributionId = existingContribution?.id || crypto.randomUUID();
    const contributionStatus = existingContribution?.status || 'DRAFT';
    const action = existingContribution ? 'BUDGET_CONTRIBUTION_RESUBMITTED' : 'BUDGET_CONTRIBUTION_CREATED';
    const description = interpolateUiString(
      UI_STRINGS.appApiBoqAddToBudgetRoute.bOQBoqCodeRevisionCodeAllocatedToCostCentreCodeWithStatusUnderApprovalValueToLocaleString,
      { boqCode: revision.boq.boqCode, revisionCode: revision.revisionCode, code: costCentre.code,
        toLocaleString: totalEstimated.toLocaleString(I18N_CONFIG.defaultLocale) },
    );
    const batch = existingContribution
      ? [{
        sql: BUDGET_CONTRIBUTION_RESUBMIT_SQL,
        values: [targetProjectId, targetCostCentreId, totalEstimated, totalEstimated, now, ctx.userId, now,
          contributionId, ctx.tenantId],
      }]
      : [{
        sql: BUDGET_CONTRIBUTION_CREATE_UNDER_APPROVAL_SQL,
        values: [contributionId, ctx.tenantId, targetProjectId, targetCostCentreId, revision.boqId, revision.id,
          totalEstimated, totalEstimated, now, ctx.userId, now, now, ctx.userId, ctx.tenantId, revision.id],
      }];
    const auditOldValue = existingContribution ? JSON.stringify({ status: contributionStatus }) : null;
    const auditNewValue = JSON.stringify({ contributionId, boqCode: revision.boq.boqCode,
      revisionCode: revision.revisionCode, totalEstimated, transactionCount: categoryTotals.size, status: 'UNDER_APPROVAL' });
    batch.push({
      sql: BUDGET_AUDIT_INSERT_AFTER_TRANSITION_SQL,
      values: [auditId, ctx.tenantId, ctx.userId, targetProjectId, 'BUDGET_CONTRIBUTION', contributionId,
        action, description, auditOldValue, auditNewValue, null, null, now],
    });
    if (existingContribution) {
      batch.push({ sql: BUDGET_TRANSACTION_SUPERSEDE_AFTER_AUDIT_SQL, values: [ctx.tenantId, contributionId, auditId, ctx.tenantId] });
    }
    const transactionStart = batch.length;
    for (const [categoryName, category] of categoryTotals.entries()) {
      const lineRate = category.quantity > 0 ? Math.round((category.amount / category.quantity) * 100) / 100 : null;
      batch.push({
        sql: BUDGET_TRANSACTION_INSERT_AFTER_AUDIT_SQL,
        values: [crypto.randomUUID(), ctx.tenantId, ctx.tenantId, targetProjectId, targetCostCentreId, revision.boqId,
          revision.id, category.firstLineId, contributionId, categoryName, Math.round(category.amount * 100) / 100,
          category.quantity, lineRate, `BOQ ${revision.boq.boqCode} ${revision.revisionCode} - ${categoryName}`,
          ctx.userId, now, now, auditId, ctx.tenantId],
      });
    }
    batch.push({
      sql: BUDGET_CONTRIBUTION_REVISION_UPDATE_AFTER_AUDIT_SQL,
      values: [targetCostCentreId, now, revision.id, ctx.tenantId, auditId, ctx.tenantId],
    });
    batch.push({
      sql: BUDGET_CONTRIBUTION_BOQ_UPDATE_AFTER_AUDIT_SQL,
      values: [targetCostCentreId, now, revision.boqId, ctx.tenantId, auditId, ctx.tenantId],
    });
    batch.push({
      sql: BUDGET_AGGREGATE_PENDING_UPSERT_SQL,
      values: [crypto.randomUUID(), ctx.tenantId, targetProjectId, targetCostCentreId, totalEstimated, totalEstimated,
        now, now, ctx.userId, auditId, ctx.tenantId],
    });
    batch.push({
      sql: BUDGET_CONTRIBUTION_ASSERT_AFTER_UPSERT_SQL,
      values: [
        contributionId, ctx.tenantId, revision.id, targetProjectId, targetCostCentreId,
        auditId, ctx.tenantId, contributionId,
        ctx.tenantId, contributionId, targetProjectId, targetCostCentreId, revision.boqId, revision.id,
        categoryTotals.size,
        revision.id, ctx.tenantId, revision.boqId, targetCostCentreId,
        revision.boqId, ctx.tenantId, targetCostCentreId,
        ctx.tenantId, targetCostCentreId, targetProjectId, totalEstimated,
      ],
    });

    if (!isD1BatchWithinLimits(batch)) {
      return apiError(UI_STRINGS.common.budgetContributionHasTooManyCategories, 400);
    }

    const results = await writeD1BatchAtomically(batch);
    if (Number(results[0]?.meta?.changes || 0) !== 1) {
      return apiError(UI_STRINGS.common.budgetContributionChangedPleaseRefresh, 409);
    }
    const firstTransactionCode = results[transactionStart]?.results?.[0]?.transactionCode;

    return apiSuccess({
      success: true,
      contributionId,
      transactionCode: typeof firstTransactionCode === 'string' ? firstTransactionCode : `BTX-${contributionId.substring(0, 8)}`,
      totalAmount: totalEstimated,
      status: 'UNDER_APPROVAL',
      costCentre: { id: costCentre.id, code: costCentre.code, name: costCentre.name },
      transactionsCount: categoryTotals.size,
      message: interpolateUiString(
        UI_STRINGS.appApiBoqAddToBudgetRoute.bOQBoqCodeSuccessfullyAllocatedToBudgetForCostCentreCodeWithStatusUnderApproval,
        { boqCode: revision.boq.boqCode, code: costCentre.code },
      ),
    }, 201);
  } catch (error) {
    await writeStructuredLog('error', 'budget_contribution.create_failed', {
      operation: 'allocate_boq_to_budget', route: '/api/boq/add-to-budget', requestId: req.headers.get('x-request-id'),
      tenantId: ctx.tenantId, userId: ctx.userId, boqRevisionId: requestedRevisionId, durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToAddBoqToBudget, 500);
  }
}
