import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import { MAX_BOQ_BATCH_LINES } from '@/lib/d1-batch.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import type { BoqRevisionLinesRouteContext } from '@app-types/app/api/boq/revision-lines.types';
import type { BoqRevisionCopyLine } from '@app-types/app/api/boq/new-revision.types';
import {
  BOQ_NEW_REVISION_AUDIT_INSERT_SQL,
  BOQ_NEW_REVISION_COPY_LINES_JSON_SQL,
  BOQ_NEW_REVISION_INSERT_SQL,
} from './route.constants';

export async function POST(req: NextRequest, { params }: BoqRevisionLinesRouteContext) {
  const ctx = await requireAuth('BOQ_REVISION_CREATE');
  if (!isApiContext(ctx)) return ctx;
  const { revisionId } = await params;
  const startedAt = Date.now();
  let candidateRevisionNumber: number | null = null;
  let newRevisionId: string | null = null;
  let newRevisionCode: string | null = null;
  let copiedLines = 0;

  try {
    const sourceRevision = await prisma.boqRevision.findFirst({
      where: { id: revisionId, tenantId: ctx.tenantId },
      select: {
        id: true,
        tenantId: true,
        boqId: true,
        costCentreId: true,
        status: true,
        revisionCode: true,
        updatedAt: true,
        boq: { select: { projectId: true } },
        lines: {
          where: { isDeleted: false },
          take: MAX_BOQ_BATCH_LINES + 1,
          orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
          select: {
            lineNumber: true,
            originalDescription: true,
            standardDescription: true,
            specification: true,
            categoryId: true,
            subcategoryId: true,
            uomId: true,
            uomRaw: true,
            quantity: true,
            location: true,
            drawingReference: true,
            brand: true,
            model: true,
            material: true,
            grade: true,
            remarks: true,
            itemCode: true,
            validationStatus: true,
            validationMessages: true,
            benchmarkEligible: true,
          },
        },
      },
    });

    if (!sourceRevision) return apiError(UI_STRINGS.common.revisionNotFound, 404);
    if (sourceRevision.status !== 'APPROVED') {
      return apiError(UI_STRINGS.appApiBoqRevisionIdNewRevisionRoute.newRevisionsCanOnlyBeCreatedFromAnApprovedRevision, 400);
    }
    if (sourceRevision.lines.length > MAX_BOQ_BATCH_LINES) return apiError(UI_STRINGS.common.boqLineBatchLimitExceeded, 400);

    const latestRevision = await prisma.boqRevision.findFirst({
      where: { boqId: sourceRevision.boqId, tenantId: ctx.tenantId },
      orderBy: [{ revisionNumber: 'desc' }, { id: 'desc' }],
      select: { revisionNumber: true },
    });
    candidateRevisionNumber = (latestRevision?.revisionNumber ?? -1) + 1;
    newRevisionCode = `R${candidateRevisionNumber}`;
    newRevisionId = crypto.randomUUID();
    copiedLines = sourceRevision.lines.length;

    const copiedValidLines = sourceRevision.lines.filter((line) => line.validationStatus === 'VALID').length;
    const copiedErrorLines = sourceRevision.lines.filter((line) => line.validationStatus === 'ERROR').length;
    const copiedWarningLines = sourceRevision.lines.filter((line) => line.validationStatus === 'WARNING').length;
    const qualityScore = copiedLines === 0
      ? 0
      : Math.round(((copiedValidLines * 100 + copiedWarningLines * 70) / copiedLines));
    const createdAt = new Date(Math.max(Date.now(), sourceRevision.updatedAt.getTime() + 1));
    const createdAtIso = createdAt.toISOString();
    const lineCopies: BoqRevisionCopyLine[] = sourceRevision.lines.map((line) => ({
      id: crypto.randomUUID(),
      ...line,
      createdAt: createdAtIso,
      updatedAt: createdAtIso,
    }));
    const auditDescription = interpolateUiString(
      UI_STRINGS.appApiBoqRevisionIdNewRevisionRoute.newBOQRevisionNewRevCodeCreatedFromApprovedRevisionCode,
      { newRevCode: newRevisionCode, revisionCode: sourceRevision.revisionCode },
    );
    const auditValue = JSON.stringify({
      revisionCode: newRevisionCode,
      sourceRevision: sourceRevision.revisionCode,
      lines: copiedLines,
    });

    const results = await writeD1BatchAtomically([
      {
        sql: BOQ_NEW_REVISION_INSERT_SQL,
        values: [
          newRevisionId,
          candidateRevisionNumber,
          newRevisionCode,
          `Created from ${sourceRevision.revisionCode}`,
          copiedLines,
          copiedValidLines,
          copiedErrorLines,
          copiedWarningLines,
          qualityScore,
          createdAt,
          createdAt,
          createdAt,
          ctx.userId,
          sourceRevision.id,
          ctx.tenantId,
          sourceRevision.boqId,
          sourceRevision.updatedAt,
          candidateRevisionNumber,
        ],
      },
      {
        sql: BOQ_NEW_REVISION_COPY_LINES_JSON_SQL,
        values: [ctx.tenantId, newRevisionId, JSON.stringify(lineCopies), newRevisionId, ctx.tenantId],
      },
      {
        sql: BOQ_NEW_REVISION_AUDIT_INSERT_SQL,
        values: [
          newRevisionId,
          ctx.tenantId,
          newRevisionId,
          ctx.tenantId,
          copiedLines,
          crypto.randomUUID(),
          ctx.tenantId,
          ctx.userId,
          sourceRevision.boq.projectId,
          newRevisionId,
          auditDescription,
          auditValue,
          createdAt,
        ],
      },
    ]);

    if (Number(results[0]?.meta?.changes || 0) !== 1
      || Number(results[1]?.meta?.changes || 0) !== copiedLines
      || Number(results[2]?.meta?.changes || 0) !== 1) {
      throw new Error(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh);
    }

    return apiSuccess({ revisionId: newRevisionId, revisionCode: newRevisionCode, copiedLines }, 201);
  } catch (error: unknown) {
    if (newRevisionId && newRevisionCode) {
      try {
        const committedRevision = await prisma.boqRevision.findFirst({
          where: { id: newRevisionId, tenantId: ctx.tenantId },
          select: { id: true, revisionCode: true },
        });
        if (committedRevision) {
          try {
            await writeStructuredLog('warn', 'boq.revision_copy_result_recovered', {
              operation: 'copy_approved_boq_revision',
              route: '/api/boq/[revisionId]/new-revision',
              requestId: req.headers.get('x-request-id') || null,
              tenantId: ctx.tenantId,
              userId: ctx.userId,
              sourceRevisionId: revisionId,
              newRevisionId,
              copiedLines,
              durationMs: Date.now() - startedAt,
            });
          } catch {
            // Return the confirmed committed result even if optional local log storage fails.
          }
          return apiSuccess({ revisionId: committedRevision.id, revisionCode: committedRevision.revisionCode, copiedLines }, 201);
        }
      } catch {
        // Continue with the safe generic failure path if D1 cannot confirm the batch result.
      }
    }

    try {
      await writeStructuredLog('error', 'boq.revision_copy_failed', {
        operation: 'copy_approved_boq_revision',
        route: '/api/boq/[revisionId]/new-revision',
        requestId: req.headers.get('x-request-id') || null,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        role: ctx.role,
        sourceRevisionId: revisionId,
        newRevisionId,
        revisionNumber: candidateRevisionNumber,
        copiedLines,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
      });
    } catch {
      // Preserve the generic response if optional local log storage fails.
    }
    return apiError(UI_STRINGS.common.userMessages.failedToCreateBoqRecord, 500);
  }
}
