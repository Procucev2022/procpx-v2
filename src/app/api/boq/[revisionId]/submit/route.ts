import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import {
  AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
  BOQ_REVISION_SUBMIT_UPDATE_SQL,
  BOQ_UPDATE_STATUS_AFTER_AUDIT_SQL,
  PROJECT_UPDATE_STATUS_AFTER_AUDIT_SQL,
} from '@/lib/d1-batch.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';

export async function POST(req: NextRequest, { params }: { params: Promise<{ revisionId: string }> }) {
  const ctx = await requireAuth('BOQ_SUBMIT');
  if (!isApiContext(ctx)) return ctx;
  const { revisionId } = await params;
  const startedAt = Date.now();

  try {
    const revision = await prisma.boqRevision.findFirst({
      where: { id: revisionId, tenantId: ctx.tenantId },
      include: { boq: true },
    });
    if (!revision) return apiError(UI_STRINGS.common.revisionNotFound, 404);
    if (revision.status !== 'DRAFT') {
      return apiError(interpolateUiString(UI_STRINGS.appApiBoqRevisionIdSubmitRoute.cannotSubmitABOQInStatusStatus, { status: revision.status }));
    }
    if (revision.errorLines > 0) {
      return apiError(interpolateUiString(UI_STRINGS.appApiBoqRevisionIdSubmitRoute.bOQCannotBeSubmittedBecauseErrorLinesLinesContainErrors, { errorLines: revision.errorLines }));
    }

    const now = new Date();
    const auditId = crypto.randomUUID();
    const statements = [
      { sql: BOQ_REVISION_SUBMIT_UPDATE_SQL, values: [now, now, revisionId, ctx.tenantId, ctx.tenantId] },
      {
        sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
        values: [auditId, ctx.tenantId, ctx.userId, revision.boq.projectId, 'BOQ_REVISION', revisionId,
          'SUBMIT', interpolateUiString(UI_STRINGS.appApiBoqRevisionIdSubmitRoute.bOQRevisionRevisionCodeSubmittedForApproval, { revisionCode: revision.revisionCode }),
          JSON.stringify({ status: 'DRAFT' }), JSON.stringify({ status: 'SUBMITTED' }), null, null, now],
      },
      { sql: BOQ_UPDATE_STATUS_AFTER_AUDIT_SQL, values: ['SUBMITTED', now, revision.boqId, ctx.tenantId, auditId, ctx.tenantId] },
      { sql: PROJECT_UPDATE_STATUS_AFTER_AUDIT_SQL, values: ['BOQ_REVIEW', now, revision.boq.projectId, ctx.tenantId, auditId, ctx.tenantId] },
    ];
    const results = await writeD1BatchAtomically(statements);
    if (Number(results[0]?.meta?.changes || 0) !== 1) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }
    return apiSuccess({ message: UI_STRINGS.appApiBoqRevisionIdSubmitRoute.bOQSubmittedForApproval, revisionCode: revision.revisionCode });
  } catch (error) {
    await writeStructuredLog('error', 'boq.revision_submit_failed', {
      operation: 'submit_boq_revision', route: '/api/boq/[revisionId]/submit',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId, revisionId,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToSubmitBoq, 500);
  }
}
