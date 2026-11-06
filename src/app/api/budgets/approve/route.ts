import { I18N_CONFIG } from '@/lib/i18n.constants';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import {
  BUDGET_AGGREGATE_PROJECT_APPROVE_UPSERT_SQL,
  BUDGET_APPROVAL_INSERT_AFTER_AUDIT_SQL,
  BUDGET_AUDIT_INSERT_AFTER_TRANSITION_SQL,
  BUDGET_CONTRIBUTION_PROJECT_APPROVE_SQL,
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
    if (!contributionId) return apiError(UI_STRINGS.common.contributionIDIsRequired, 400);

    const contribution = await prisma.budgetContribution.findFirst({
      where: { id: contributionId, tenantId: ctx.tenantId },
      include: { boqRevision: true, boq: true, costCentre: true },
    });
    if (!contribution) return apiError(UI_STRINGS.common.budgetContributionNotFound, 404);
    if (contribution.status !== 'PENDING_PROJECT_APPROVAL' && contribution.status !== 'UNDER_APPROVAL') {
      return apiError(interpolateUiString(UI_STRINGS.appApiBudgetsApproveRoute.cannotApproveContributionInStateStatusExpectedUnderApproval, { status: contribution.status }), 400);
    }

    const nextStatus = body.directApprove && (ctx.role === 'SUPER_ADMIN' || ctx.role === 'CLIENT_ADMIN')
      ? 'APPROVED'
      : 'PENDING_FINANCE_APPROVAL';
    const now = new Date();
    const auditId = crypto.randomUUID();
    const approvalId = crypto.randomUUID();
    const remarks = typeof body.remarks === 'string' && body.remarks ? body.remarks : 'Project level scope and commercial estimate approved.';
    const description = interpolateUiString(
      UI_STRINGS.appApiBudgetsApproveRoute.budgetContributionApprovedByProjectApproverForCostCentreCodeToLocaleStringMovedToAPPROVED,
      { code: contribution.costCentre.code, toLocaleString: contribution.acceptedEstimatedValue.toLocaleString(I18N_CONFIG.defaultLocale) },
    );
    const batch = [
      { sql: BUDGET_CONTRIBUTION_PROJECT_APPROVE_SQL, values: [nextStatus, now, ctx.userId, now, contributionId, ctx.tenantId] },
      {
        sql: BUDGET_AUDIT_INSERT_AFTER_TRANSITION_SQL,
        values: [auditId, ctx.tenantId, ctx.userId, contribution.projectId, 'BUDGET_CONTRIBUTION', contribution.id,
          'BUDGET_PROJECT_APPROVED', description, JSON.stringify({ status: contribution.status }), JSON.stringify({ status: nextStatus }),
          null, null, now],
      },
      {
        sql: BUDGET_APPROVAL_INSERT_AFTER_AUDIT_SQL,
        values: [approvalId, ctx.tenantId, contributionId, 'PROJECT_APPROVER', ctx.userId, 'APPROVED', remarks, now, auditId, ctx.tenantId],
      },
      { sql: BUDGET_TRANSACTIONS_UPDATE_AFTER_AUDIT_SQL, values: [nextStatus, ctx.tenantId, contributionId, auditId, ctx.tenantId] },
      {
        sql: BUDGET_REVISION_UPDATE_AFTER_AUDIT_SQL,
        values: [nextStatus === 'APPROVED' ? 'BUDGET_APPROVED' : 'BUDGET_UNDER_FINANCE_APPROVAL', now,
          contribution.boqRevisionId, ctx.tenantId, auditId, ctx.tenantId],
      },
    ];
    if (nextStatus === 'APPROVED') {
      batch.push({
        sql: BUDGET_AGGREGATE_PROJECT_APPROVE_UPSERT_SQL,
        values: [crypto.randomUUID(), ctx.tenantId, contribution.projectId, contribution.costCentreId,
          contribution.acceptedEstimatedValue, contribution.acceptedEstimatedValue, now, now, ctx.userId, auditId,
          ctx.tenantId, contribution.totalEstimatedValue],
      });
    }
    const results = await writeD1BatchAtomically(batch);
    if (Number(results[0]?.meta?.changes || 0) !== 1) {
      return apiError(UI_STRINGS.common.budgetContributionChangedPleaseRefresh, 409);
    }

    return apiSuccess({
      contribution: { ...contribution, status: nextStatus, projectApprovedAt: now, projectApprovedBy: ctx.userId, updatedAt: now },
      status: nextStatus,
      message: UI_STRINGS.appApiBudgetsApproveRoute.budgetContributionApprovedByProjectApprover,
    });
  } catch (error) {
    await writeStructuredLog('error', 'budget_contribution.project_approval_failed', {
      operation: 'approve_budget_contribution', route: '/api/budgets/approve', requestId: req.headers.get('x-request-id'),
      tenantId: ctx.tenantId, userId: ctx.userId, contributionId, durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.projectBudgetApprovalFailed, 500);
  }
}
