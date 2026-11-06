import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import {
  BUDGET_AGGREGATE_PENDING_DECREMENT_SQL,
  BUDGET_APPROVAL_INSERT_AFTER_AUDIT_SQL,
  BUDGET_AUDIT_INSERT_AFTER_TRANSITION_SQL,
  BUDGET_CONTRIBUTION_PROJECT_REJECT_SQL,
  BUDGET_REVISION_UPDATE_AFTER_AUDIT_SQL,
  BUDGET_TRANSACTIONS_UPDATE_AFTER_AUDIT_SQL,
} from '@/lib/d1-batch.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BUDGET_APPROVE');
  if (!isApiContext(ctx)) return ctx;

  const startedAt = Date.now();
  let contributionId: string | undefined;
  try {
    const body = await req.json();
    contributionId = typeof body?.contributionId === 'string' ? body.contributionId : undefined;
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (!contributionId) return apiError(UI_STRINGS.common.contributionIDIsRequired, 400);
    if (!reason) return apiError(UI_STRINGS.common.mandatoryRejectionReasonMustBeProvided, 400);

    const contribution = await prisma.budgetContribution.findFirst({
      where: { id: contributionId, tenantId: ctx.tenantId },
      include: { boqRevision: true, boq: true, costCentre: true },
    });
    if (!contribution) return apiError(UI_STRINGS.common.budgetContributionNotFound, 404);
    if (contribution.status !== 'PENDING_PROJECT_APPROVAL' && contribution.status !== 'UNDER_APPROVAL') {
      return apiError(interpolateUiString(UI_STRINGS.common.cannotRejectContributionInStateStatus, { status: contribution.status }), 400);
    }

    const now = new Date();
    const auditId = crypto.randomUUID();
    const approvalId = crypto.randomUUID();
    const description = interpolateUiString(
      UI_STRINGS.appApiBudgetsRejectRoute.budgetContributionREJECTEDByProjectApproverForCostCentreCodeReasonTrim,
      { code: contribution.costCentre.code, trim: reason },
    );
    const results = await writeD1BatchAtomically([
      { sql: BUDGET_CONTRIBUTION_PROJECT_REJECT_SQL, values: [reason, now, contributionId, ctx.tenantId] },
      {
        sql: BUDGET_AUDIT_INSERT_AFTER_TRANSITION_SQL,
        values: [auditId, ctx.tenantId, ctx.userId, contribution.projectId, 'BUDGET_CONTRIBUTION', contribution.id,
          'BUDGET_PROJECT_REJECTED', description, JSON.stringify({ status: contribution.status }), JSON.stringify({ status: 'REJECTED' }),
          null, null, now],
      },
      {
        sql: BUDGET_APPROVAL_INSERT_AFTER_AUDIT_SQL,
        values: [approvalId, ctx.tenantId, contributionId, 'PROJECT_APPROVER', ctx.userId, 'REJECTED', reason, now, auditId, ctx.tenantId],
      },
      { sql: BUDGET_TRANSACTIONS_UPDATE_AFTER_AUDIT_SQL, values: ['REJECTED', ctx.tenantId, contributionId, auditId, ctx.tenantId] },
      { sql: BUDGET_REVISION_UPDATE_AFTER_AUDIT_SQL, values: ['BUDGET_REJECTED', now, contribution.boqRevisionId, ctx.tenantId, auditId, ctx.tenantId] },
      {
        sql: BUDGET_AGGREGATE_PENDING_DECREMENT_SQL,
        values: [contribution.totalEstimatedValue, now, ctx.tenantId, contribution.projectId, contribution.costCentreId, auditId, ctx.tenantId],
      },
    ]);
    if (Number(results[0]?.meta?.changes || 0) !== 1) {
      return apiError(UI_STRINGS.common.budgetContributionChangedPleaseRefresh, 409);
    }

    return apiSuccess({ contribution: { ...contribution, status: 'REJECTED', rejectionReason: reason, updatedAt: now }, status: 'REJECTED' });
  } catch (error) {
    await writeStructuredLog('error', 'budget_contribution.project_rejection_failed', {
      operation: 'reject_budget_contribution', route: '/api/budgets/reject', requestId: req.headers.get('x-request-id'),
      tenantId: ctx.tenantId, userId: ctx.userId, contributionId, durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.projectBudgetRejectionFailed, 500);
  }
}
