import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { validateBoqLine, summarizeIssues } from '@/lib/boq-validate';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import { AUDIT_LOG_INSERT_AFTER_CHANGE_SQL, MAX_BOQ_BATCH_LINES } from '@/lib/d1-batch.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import { loadActiveBoqReferenceCatalog } from '@/lib/boq-reference-catalog';
import type { BoqRevisionLinesRouteContext } from '@app-types/app/api/boq/revision-lines.types';
import type { BoqLineInput } from '@app-types/lib/boq-validate.types';
import { BOQ_VALIDATE_LINES_UPDATE_JSON_SQL, BOQ_VALIDATE_REVISION_UPDATE_SQL } from './route.constants';

export async function POST(req: NextRequest, { params }: BoqRevisionLinesRouteContext) {
  const ctx = await requireAuth('BOQ_VALIDATE');
  if (!isApiContext(ctx)) return ctx;
  const { revisionId } = await params;
  const startedAt = Date.now();

  try {
    const revision = await prisma.boqRevision.findFirst({
      where: { id: revisionId, tenantId: ctx.tenantId },
      include: {
        lines: {
          where: { isDeleted: false },
          take: MAX_BOQ_BATCH_LINES + 1,
          orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
        },
        boq: true,
      },
    });
    if (!revision) return apiError(UI_STRINGS.common.revisionNotFound, 404);
    if (revision.lines.length > MAX_BOQ_BATCH_LINES) return apiError(UI_STRINGS.common.boqLineBatchLimitExceeded, 400);

    const lineNumberCounts: Record<string, number> = {};
    for (const line of revision.lines) {
      if (line.lineNumber) lineNumberCounts[line.lineNumber] = (lineNumberCounts[line.lineNumber] || 0) + 1;
    }

    const referenceCatalog = await loadActiveBoqReferenceCatalog({
      tenantId: ctx.tenantId, userId: ctx.userId, route: '/api/boq/[revisionId]/validate',
      requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray'),
    }, { categories: false, uoms: true });
    if (!referenceCatalog.ok) return apiError(referenceCatalog.message, 413);
    const validUoms = referenceCatalog.uoms;
    const validUomIds = new Set(validUoms.map((uom) => uom.id));
    const validationInputs: BoqLineInput[] = revision.lines.map((line) => ({
      originalDescription: line.originalDescription,
      standardDescription: line.standardDescription ?? undefined,
      uomRaw: line.uomRaw ?? undefined,
      uomId: line.uomId ?? undefined,
      quantity: line.quantity,
      categoryId: line.categoryId ?? undefined,
      lineNumber: line.lineNumber,
      isDuplicate: (lineNumberCounts[line.lineNumber] || 0) > 1,
      isInvalidUom: Boolean(line.uomId) && !validUomIds.has(line.uomId || ''),
    }));
    const validations = validationInputs.map((input) => validateBoqLine(input));
    const validCount = validations.filter((validation) => validation.status === 'VALID').length;
    const errorCount = validations.filter((validation) => validation.status === 'ERROR').length;
    const warningCount = validations.filter((validation) => validation.status === 'WARNING').length;
    const issueSummary = summarizeIssues(validationInputs);
    const nextUpdatedAt = new Date(Math.max(Date.now(), revision.updatedAt.getTime() + 1));
    const lineUpdates = revision.lines.map((line, index) => ({
      id: line.id,
      validationStatus: validations[index].status,
      validationMessages: JSON.stringify(validations[index].messages),
      updatedAt: nextUpdatedAt.toISOString(),
    }));
    const description = interpolateUiString(
      UI_STRINGS.appApiBoqRevisionIdValidateRoute.bOQRevisionRevisionCodeValidatedScoreQualityScoreErrorCountErrorsWarnCountWarnings,
      { revisionCode: revision.revisionCode, qualityScore: issueSummary.qualityScore, errorCount, warnCount: warningCount },
    );
    const auditValue = JSON.stringify({ qualityScore: issueSummary.qualityScore, validCount, errorCount, warningCount, issues: issueSummary });
    const results = await writeD1BatchAtomically([
      {
        sql: BOQ_VALIDATE_LINES_UPDATE_JSON_SQL,
        values: [JSON.stringify(lineUpdates), ctx.tenantId, revisionId],
      },
      {
        sql: BOQ_VALIDATE_REVISION_UPDATE_SQL,
        values: [lineUpdates.length, validCount, errorCount, warningCount, issueSummary.qualityScore, nextUpdatedAt,
          revisionId, ctx.tenantId, revision.updatedAt, lineUpdates.length],
      },
      {
        sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
        values: [crypto.randomUUID(), ctx.tenantId, ctx.userId, revision.boq.projectId, 'BOQ_REVISION', revisionId,
          'VALIDATE', description, null, auditValue, null, null, nextUpdatedAt],
      },
    ]);

    if (Number(results[0]?.meta?.changes ?? -1) !== lineUpdates.length
      || Number(results[1]?.meta?.changes || 0) !== 1
      || Number(results[2]?.meta?.changes || 0) !== 1) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }

    return apiSuccess({
      qualityScore: issueSummary.qualityScore,
      totalLines: lineUpdates.length,
      validLines: validCount,
      errorLines: errorCount,
      warningLines: warningCount,
      issues: issueSummary,
    });
  } catch (error: unknown) {
    try {
      await writeStructuredLog('error', 'boq.validation_failed', {
        operation: 'validate_boq_revision',
        route: '/api/boq/[revisionId]/validate',
        requestId: req.headers.get('x-request-id') || null,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        role: ctx.role,
        boqRevisionId: revisionId,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
      });
    } catch {
      // Preserve the generic response if optional local log storage fails.
    }
    return apiError(UI_STRINGS.common.userMessages.failedToUpdateBoq, 500);
  }
}

export async function GET(req: NextRequest, { params }: BoqRevisionLinesRouteContext) {
  const ctx = await requireAuth('BOQ_VIEW');
  if (!isApiContext(ctx)) return ctx;
  const { revisionId } = await params;
  const startedAt = Date.now();

  try {
    const revision = await prisma.boqRevision.findFirst({
      where: { id: revisionId, tenantId: ctx.tenantId },
      include: {
        lines: {
          where: { isDeleted: false },
          include: { category: true, subcategory: true, uom: true },
          take: MAX_BOQ_BATCH_LINES + 1,
          orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
        },
        boq: { include: { project: true, costCentre: true } },
      },
    });

    let selectedRevision = revision;
    if (!selectedRevision) {
      const boqRecord = await prisma.boq.findFirst({
        where: { id: revisionId, tenantId: ctx.tenantId },
        include: {
          project: true,
          costCentre: true,
          revisions: {
            orderBy: [{ revisionNumber: 'desc' }, { id: 'desc' }],
            take: 1,
            include: {
              lines: {
                where: { isDeleted: false },
                include: { category: true, subcategory: true, uom: true },
                take: MAX_BOQ_BATCH_LINES + 1,
                orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
              },
            },
          },
        },
      });
      if (boqRecord?.revisions[0]) selectedRevision = { ...boqRecord.revisions[0], boq: boqRecord };
    }

    if (!selectedRevision) return apiError(UI_STRINGS.common.revisionNotFound, 404);
    if (selectedRevision.lines.length > MAX_BOQ_BATCH_LINES) return apiError(UI_STRINGS.common.boqLineBatchLimitExceeded, 400);
    return apiSuccess({
      revision: selectedRevision,
      lines: selectedRevision.lines,
      qualityScore: selectedRevision.qualityScore,
      totalLines: selectedRevision.totalLines || selectedRevision.lines.length,
      validLines: selectedRevision.validLines,
      warningLines: selectedRevision.warningLines,
      errorLines: selectedRevision.errorLines,
    });
  } catch (error: unknown) {
    try {
      await writeStructuredLog('error', 'boq.validation_read_failed', {
        operation: 'read_boq_validation',
        route: '/api/boq/[revisionId]/validate',
        requestId: req.headers.get('x-request-id') || null,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        role: ctx.role,
        boqRevisionId: revisionId,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
      });
    } catch {
      // Preserve the generic response if optional local log storage fails.
    }
    return apiError(UI_STRINGS.common.userMessages.failedToUpdateBoq, 500);
  }
}
