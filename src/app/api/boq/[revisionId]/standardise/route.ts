import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { standardiseDescription, standardiseUom } from '@/lib/uom-standardise';
import { computeQualityScore, validateBoqLine } from '@/lib/boq-validate';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import { AUDIT_LOG_INSERT_AFTER_CHANGE_SQL, MAX_BOQ_BATCH_LINES } from '@/lib/d1-batch.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import { loadActiveBoqReferenceCatalog } from '@/lib/boq-reference-catalog';
import type { BoqRevisionLinesRouteContext } from '@app-types/app/api/boq/revision-lines.types';
import type { BoqLineInput } from '@app-types/lib/boq-validate.types';
import { BOQ_STANDARDISE_LINES_UPDATE_JSON_SQL, BOQ_STANDARDISE_REVISION_UPDATE_SQL } from './route.constants';

export async function POST(req: NextRequest, { params }: BoqRevisionLinesRouteContext) {
  const ctx = await requireAuth('BOQ_EDIT');
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
    if (revision.status === 'APPROVED') {
      return apiError(UI_STRINGS.appApiBoqRevisionIdStandardiseRoute.approvedBOQsAreImmutableAndCannotBeStandardisedCreateANewRevision, 400);
    }
    if (revision.lines.length > MAX_BOQ_BATCH_LINES) return apiError(UI_STRINGS.common.boqLineBatchLimitExceeded, 400);

    const referenceCatalog = await loadActiveBoqReferenceCatalog({
      tenantId: ctx.tenantId, userId: ctx.userId, route: '/api/boq/[revisionId]/standardise',
      requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray'),
    });
    if (!referenceCatalog.ok) return apiError(referenceCatalog.message, 413);
    const { uoms, categories } = referenceCatalog;

    const categoryChildrenByParentId = new Map<string, Array<{ id: string; name: string }>>();
    for (const category of categories) {
      if (!category.parentId) continue;
      const children = categoryChildrenByParentId.get(category.parentId) || [];
      children.push({ id: category.id, name: category.name });
      categoryChildrenByParentId.set(category.parentId, children);
    }

    let standardisedCount = 0;
    let uomNormalisedCount = 0;
    const nextUpdatedAt = new Date(Math.max(Date.now(), revision.updatedAt.getTime() + 1));
    const nextUpdatedAtIso = nextUpdatedAt.toISOString();
    const lineUpdates: Array<Record<string, unknown>> = [];
    const finalLines: BoqLineInput[] = [];
    let validCount = 0;
    let errorCount = 0;
    let warningCount = 0;

    for (const line of revision.lines) {
      let changed = false;
      let standardDescription = line.standardDescription;
      let uomId = line.uomId;
      let categoryId = line.categoryId;
      let subcategoryId = line.subcategoryId;
      const descriptionResult = standardiseDescription(line.originalDescription);

      if (descriptionResult.matched && descriptionResult.standardDescription !== line.standardDescription) {
        standardDescription = descriptionResult.standardDescription;
        standardisedCount += 1;
        changed = true;
      }

      const rawUom = line.uomRaw || '';
      if (rawUom) {
        const uomResult = standardiseUom(rawUom);
        const matchingUom = uoms.find((uom) => uom.code === uomResult.code);
        if (matchingUom && matchingUom.id !== line.uomId) {
          uomId = matchingUom.id;
          uomNormalisedCount += 1;
          changed = true;
        }
      }

      if (!categoryId && descriptionResult.category) {
        const matchingCategory = categories.find((category) => category.name.toLowerCase() === descriptionResult.category?.toLowerCase());
        if (matchingCategory) {
          categoryId = matchingCategory.id;
          changed = true;
          if (descriptionResult.subcategory) {
            const matchingSubcategory = (categoryChildrenByParentId.get(matchingCategory.id) || [])
              .find((child) => child.name.toLowerCase() === descriptionResult.subcategory?.toLowerCase());
            if (matchingSubcategory) subcategoryId = matchingSubcategory.id;
          }
        }
      }

      const shouldUpdate = changed || !line.standardDescription;
      const effectiveDescription = standardDescription ?? line.originalDescription;
      const validation = shouldUpdate
        ? validateBoqLine({
          originalDescription: line.originalDescription,
          standardDescription: effectiveDescription,
          uomRaw: line.uomRaw ?? undefined,
          uomId: uomId ?? undefined,
          quantity: line.quantity,
          categoryId: categoryId ?? undefined,
          lineNumber: line.lineNumber,
        })
        : null;
      const validationStatus = validation?.status ?? line.validationStatus;
      const validationMessages = validation ? JSON.stringify(validation.messages) : line.validationMessages;

      if (validationStatus === 'VALID') validCount += 1;
      else if (validationStatus === 'ERROR') errorCount += 1;
      else if (validationStatus === 'WARNING') warningCount += 1;

      if (shouldUpdate) {
        lineUpdates.push({
          id: line.id,
          standardDescription: effectiveDescription,
          uomId,
          categoryId,
          subcategoryId,
          validationStatus,
          validationMessages,
          updatedAt: nextUpdatedAtIso,
        });
      }
      finalLines.push({
        originalDescription: line.originalDescription,
        standardDescription: effectiveDescription,
        uomRaw: line.uomRaw ?? undefined,
        uomId: uomId ?? undefined,
        quantity: line.quantity,
        categoryId: categoryId ?? undefined,
      });
    }

    const qualityScore = computeQualityScore(finalLines);
    const description = interpolateUiString(
      UI_STRINGS.appApiBoqRevisionIdStandardiseRoute.bOQRevisionRevisionCodeStandardisedStandardisedCountDescriptionsStandardisedUomNormalisedCountUOMsNormalized,
      { revisionCode: revision.revisionCode, standardisedCount, uomNormalisedCount },
    );
    const auditValue = JSON.stringify({ standardisedCount, uomNormalisedCount, qualityScore });
    const results = await writeD1BatchAtomically([
      {
        sql: BOQ_STANDARDISE_LINES_UPDATE_JSON_SQL,
        values: [JSON.stringify(lineUpdates), ctx.tenantId, revisionId],
      },
      {
        sql: BOQ_STANDARDISE_REVISION_UPDATE_SQL,
        values: [validCount, errorCount, warningCount, qualityScore, nextUpdatedAt, revisionId, ctx.tenantId, revision.updatedAt, lineUpdates.length],
      },
      {
        sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
        values: [crypto.randomUUID(), ctx.tenantId, ctx.userId, revision.boq.projectId, 'BOQ_REVISION', revisionId,
          'STANDARDISE', description, null, auditValue, null, null, nextUpdatedAt],
      },
    ]);

    if (Number(results[0]?.meta?.changes ?? -1) !== lineUpdates.length
      || Number(results[1]?.meta?.changes || 0) !== 1
      || Number(results[2]?.meta?.changes || 0) !== 1) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }

    return apiSuccess({
      message: interpolateUiString(
        UI_STRINGS.appApiBoqRevisionIdStandardiseRoute.standardisationCompleteStandardisedCountDescriptionsMatchedCatalogUomNormalisedCountUOMsNormalized,
        { standardisedCount, uomNormalisedCount },
      ),
      standardisedCount,
      uomNormalisedCount,
      totalLines: finalLines.length,
      validLines: validCount,
      errorLines: errorCount,
      warningLines: warningCount,
      qualityScore,
    });
  } catch (error: unknown) {
    try {
      await writeStructuredLog('error', 'boq.standardisation_failed', {
        operation: 'standardise_boq_revision',
        route: '/api/boq/[revisionId]/standardise',
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
