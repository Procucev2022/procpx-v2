import { I18N_CONFIG } from '@/lib/i18n.constants';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import {
  BUDGET_AGGREGATE_FINANCE_APPROVE_UPSERT_SQL,
  BUDGET_APPROVAL_INSERT_AFTER_AUDIT_SQL,
  BUDGET_AUDIT_INSERT_AFTER_TRANSITION_SQL,
  BUDGET_CONTRIBUTION_FINANCE_APPROVE_SQL,
  BUDGET_REVISION_UPDATE_AFTER_AUDIT_SQL,
  BUDGET_TRANSACTIONS_UPDATE_AFTER_AUDIT_SQL,
} from '@/lib/d1-batch.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BUDGET_FINANCE_APPROVE');
  if (!isApiContext(ctx)) return ctx;

  const startedAt = Date.now();
  let contributionId: string | undefined;
  try {
    const body = await req.json();
    contributionId = typeof body?.contributionId === 'string' ? body.contributionId : undefined;
    if (!contributionId) return apiError(UI_STRINGS.common.contributionIDIsRequired, 400);

    const contribution = await prisma.budgetContribution.findFirst({
      where: { id: contributionId, tenantId: ctx.tenantId },
      include: { boqRevision: true, boq: true, costCentre: true },
    });
    if (!contribution) return apiError(UI_STRINGS.common.budgetContributionNotFound, 404);
    if (contribution.status !== 'PENDING_FINANCE_APPROVAL' && contribution.status !== 'PROJECT_APPROVED') {
      return apiError(interpolateUiString(UI_STRINGS.appApiBudgetsFinanceApproveRoute.cannotFinanceApproveBudgetInStateStatusMustBeApprovedByProjectApproverFirst, { status: contribution.status }), 400);
    }

    const now = new Date();
    const auditId = crypto.randomUUID();
    const approvalId = crypto.randomUUID();
    const remarks = typeof body.remarks === 'string' && body.remarks ? body.remarks : 'Capex financial budget allocation validated and sanctioned.';
    const description = interpolateUiString(
      UI_STRINGS.appApiBudgetsFinanceApproveRoute.budgetContributionSanctionedAndAPPROVEDByFinanceForCostCentreCodeToLocaleString,
      { code: contribution.costCentre.code, toLocaleString: contribution.acceptedEstimatedValue.toLocaleString(I18N_CONFIG.defaultLocale) },
    );
    const results = await writeD1BatchAtomically([
      { sql: BUDGET_CONTRIBUTION_FINANCE_APPROVE_SQL, values: [now, ctx.userId, now, contributionId, ctx.tenantId] },
      {
        sql: BUDGET_AUDIT_INSERT_AFTER_TRANSITION_SQL,
        values: [auditId, ctx.tenantId, ctx.userId, contribution.projectId, 'BUDGET_CONTRIBUTION', contribution.id,
          'BUDGET_FINANCE_APPROVED', description, JSON.stringify({ status: contribution.status }), JSON.stringify({ status: 'APPROVED' }),
          null, null, now],
      },
      {
        sql: BUDGET_APPROVAL_INSERT_AFTER_AUDIT_SQL,
        values: [approvalId, ctx.tenantId, contributionId, 'FINANCE', ctx.userId, 'APPROVED', remarks, now, auditId, ctx.tenantId],
      },
      { sql: BUDGET_TRANSACTIONS_UPDATE_AFTER_AUDIT_SQL, values: ['APPROVED', ctx.tenantId, contributionId, auditId, ctx.tenantId] },
      { sql: BUDGET_REVISION_UPDATE_AFTER_AUDIT_SQL, values: ['BUDGET_APPROVED', now, contribution.boqRevisionId, ctx.tenantId, auditId, ctx.tenantId] },
      {
        sql: BUDGET_AGGREGATE_FINANCE_APPROVE_UPSERT_SQL,
        values: [crypto.randomUUID(), ctx.tenantId, contribution.projectId, contribution.costCentreId,
          contribution.acceptedEstimatedValue, contribution.acceptedEstimatedValue, now, now, ctx.userId,
          auditId, ctx.tenantId, contribution.totalEstimatedValue],
      },
    ]);
    if (Number(results[0]?.meta?.changes || 0) !== 1) {
      return apiError(UI_STRINGS.common.budgetContributionChangedPleaseRefresh, 409);
    }

    return apiSuccess({
      contribution: { ...contribution, status: 'APPROVED', financeApprovedAt: now, financeApprovedBy: ctx.userId, updatedAt: now },
      status: 'APPROVED',
      approvedAmount: contribution.acceptedEstimatedValue,
    });
  } catch (error) {
    await writeStructuredLog('error', 'budget_contribution.finance_approval_failed', {
      operation: 'finance_approve_budget_contribution', route: '/api/budgets/finance-approve', requestId: req.headers.get('x-request-id'),
      tenantId: ctx.tenantId, userId: ctx.userId, contributionId, durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.financeBudgetApprovalFailed, 500);
  }
}
