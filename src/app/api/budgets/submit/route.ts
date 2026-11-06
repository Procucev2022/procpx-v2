import { I18N_CONFIG } from '@/lib/i18n.constants';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import {
  BUDGET_AUDIT_INSERT_AFTER_TRANSITION_SQL,
  BUDGET_CONTRIBUTION_SUBMIT_SQL,
  BUDGET_REVISION_UPDATE_AFTER_AUDIT_SQL,
  BUDGET_TRANSACTIONS_UPDATE_AFTER_AUDIT_SQL,
} from '@/lib/d1-batch.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BUDGET_SUBMIT');
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

    if (!contribution) return apiError(UI_STRINGS.common.budgetContributionNotFound, 404, { route: '/api/budgets/submit', method: 'POST' });
    if (contribution.status !== 'DRAFT') {
      return apiError(interpolateUiString(UI_STRINGS.appApiBudgetsSubmitRoute.cannotSubmitContributionInStateStatus, { status: contribution.status }), 400);
    }

    const now = new Date();
    const auditId = crypto.randomUUID();
    const updated = {
      ...contribution,
      status: 'PENDING_PROJECT_APPROVAL',
      submittedAt: now,
      submittedBy: ctx.userId,
      updatedAt: now,
    };
    const description = interpolateUiString(
      UI_STRINGS.appApiBudgetsSubmitRoute.budgetContributionForCostCentreCodeSubmittedForProjectApproverReviewToLocaleString,
      { code: contribution.costCentre.code, toLocaleString: contribution.totalEstimatedValue.toLocaleString(I18N_CONFIG.defaultLocale) },
    );
    const results = await writeD1BatchAtomically([
      { sql: BUDGET_CONTRIBUTION_SUBMIT_SQL, values: [now, ctx.userId, now, contributionId, ctx.tenantId] },
      {
        sql: BUDGET_AUDIT_INSERT_AFTER_TRANSITION_SQL,
        values: [auditId, ctx.tenantId, ctx.userId, contribution.projectId, 'BUDGET_CONTRIBUTION', contribution.id,
          'BUDGET_SUBMITTED', description, JSON.stringify({ status: 'DRAFT' }), JSON.stringify({ status: 'PENDING_PROJECT_APPROVAL' }),
          null, null, now],
      },
      {
        sql: BUDGET_TRANSACTIONS_UPDATE_AFTER_AUDIT_SQL,
        values: ['PENDING_PROJECT_APPROVAL', ctx.tenantId, contributionId, auditId, ctx.tenantId],
      },
      {
        sql: BUDGET_REVISION_UPDATE_AFTER_AUDIT_SQL,
        values: ['BUDGET_PENDING_PROJECT_APPROVAL', now, contribution.boqRevisionId, ctx.tenantId, auditId, ctx.tenantId],
      },
    ]);

    if (Number(results[0]?.meta?.changes || 0) !== 1) {
      return apiError(UI_STRINGS.common.budgetContributionChangedPleaseRefresh, 409);
    }
    return apiSuccess({ contribution: updated, status: 'PENDING_PROJECT_APPROVAL' });
  } catch (error) {
    await writeStructuredLog('error', 'budget_contribution.submit_failed', {
      operation: 'submit_budget_contribution', route: '/api/budgets/submit', requestId: req.headers.get('x-request-id'),
      tenantId: ctx.tenantId, userId: ctx.userId, contributionId, durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToSubmitBudgetContribution, 500);
  }
}
