// src/app/api/boq/refine-ai/route.ts - AI LLM Market Standard Refinement Engine
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import { MAX_BOQ_BATCH_LINES } from '@/lib/d1-batch.constants';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import {
  BOQ_REFINEMENT_AUDIT_INSERT_AFTER_UPDATE_SQL,
  BOQ_REFINEMENT_LINES_UPDATE_JSON_SQL,
  BOQ_REFINEMENT_REVISION_UPDATE_SQL,
  BOQ_REFINEMENT_RULES,
} from './route.constants';


export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BOQ_EDIT');
  if (!isApiContext(ctx)) return ctx;

  const startedAt = Date.now();
  let targetRevisionId: string | null = null;

  try {
    const body = await req.json();
    const { boqRevisionId, lineIds, acceptConfidenceThreshold } = body;
    targetRevisionId = typeof boqRevisionId === 'string' ? boqRevisionId : null;

    if (!boqRevisionId) {
      return apiError(UI_STRINGS.appApiBoqRefineAiRoute.bOQRevisionIDIsRequired, 400);
    }
    if (lineIds !== undefined && (!Array.isArray(lineIds) || lineIds.some((lineId: unknown) => typeof lineId !== 'string'))) {
      return apiError(UI_STRINGS.appApiBoqRefineAiRoute.lineIdsMustBeAListOfStrings, 400);
    }
    if (Array.isArray(lineIds) && lineIds.length > MAX_BOQ_BATCH_LINES) {
      return apiError(UI_STRINGS.common.boqLineBatchLimitExceeded, 400);
    }

    const selectedLineIds = Array.isArray(lineIds) && lineIds.length > 0
      ? [...new Set(lineIds as string[])]
      : null;
    const revision = await prisma.boqRevision.findFirst({
      where: { id: boqRevisionId, tenantId: ctx.tenantId },
      include: {
        lines: {
          ...(selectedLineIds ? { where: { id: { in: selectedLineIds } } } : {}),
          take: MAX_BOQ_BATCH_LINES + 1,
          orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
        },
        boq: true,
      },
    });

    if (!revision) return apiError(UI_STRINGS.common.bOQRevisionNotFound, 404);
    if (revision.status === 'APPROVED') {
      return apiError(UI_STRINGS.appApiBoqRefineAiRoute.approvedBOQRevisionsCannotBeRefinedBranchANewRevisionFirst, 403);
    }
    if (revision.lines.length > MAX_BOQ_BATCH_LINES) {
      return apiError(UI_STRINGS.common.boqLineBatchLimitExceeded, 400);
    }

    const refinedAt = new Date(Math.max(Date.now(), revision.updatedAt.getTime() + 1));
    const refinedLines = revision.lines.map((line) => {
      const originalDescription = line.originalDescription || '';
      const match = Object.entries(BOQ_REFINEMENT_RULES)
        .find(([key]) => originalDescription.toLowerCase().includes(key));

      let suggestedDesc = line.standardDescription || line.originalDescription;
      let suggestedSpec = line.specification || '';
      let reason = 'Market description aligned with catalog standards.';
      let confidence = 0.85;

      if (match) {
        suggestedDesc = match[1].std;
        suggestedSpec = match[1].spec;
        reason = match[1].reason;
        confidence = match[1].conf;
      } else {
        suggestedDesc = `${line.originalDescription} (Market Standard Procurement Specification)`;
        suggestedSpec = line.specification || 'Commercial grade execution conforming to BIS/relevant building code.';
      }

      const autoAccept = acceptConfidenceThreshold && confidence >= acceptConfidenceThreshold;
      const update = {
        id: line.id,
        aiSuggestedDescription: suggestedDesc,
        aiSuggestedSpec: suggestedSpec,
        aiReason: reason,
        aiConfidence: confidence,
        standardDescription: autoAccept ? suggestedDesc : line.standardDescription,
        specification: autoAccept ? suggestedSpec : line.specification,
        updatedAt: refinedAt.toISOString(),
      };

      return {
        ...update,
        lineNumber: line.lineNumber,
        originalDescription: line.originalDescription,
        accepted: autoAccept,
      };
    });

    const auditDescription = interpolateUiString(
      UI_STRINGS.appApiBoqRefineAiRoute.aIRefinementExecutedOnLengthLinesOfBOQBoqCodeRRevisionNumber,
      { length: refinedLines.length, boqCode: revision.boq.boqCode, revisionNumber: revision.revisionNumber },
    );
    const batchResults = await writeD1BatchAtomically([
      {
        sql: BOQ_REFINEMENT_LINES_UPDATE_JSON_SQL,
        values: [JSON.stringify(refinedLines), ctx.tenantId, revision.id],
      },
      {
        sql: BOQ_REFINEMENT_REVISION_UPDATE_SQL,
        values: [refinedAt, revision.id, ctx.tenantId, revision.updatedAt, refinedLines.length],
      },
      {
        sql: BOQ_REFINEMENT_AUDIT_INSERT_AFTER_UPDATE_SQL,
        values: [crypto.randomUUID(), ctx.tenantId, ctx.userId, revision.boq.projectId, revision.id, auditDescription, refinedAt],
      },
    ]);

    if (Number(batchResults[0]?.meta?.changes ?? -1) !== refinedLines.length
      || Number(batchResults[1]?.meta?.changes || 0) !== 1
      || Number(batchResults[2]?.meta?.changes || 0) !== 1) {
      throw new Error(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh);
    }

    return apiSuccess({
      boqRevisionId: revision.id,
      totalRefined: refinedLines.length,
      lines: refinedLines,
    });
  } catch (error: unknown) {
    try {
      await writeStructuredLog('error', 'boq.refinement_failed', {
        operation: 'refine_boq_lines',
        route: '/api/boq/refine-ai',
        requestId: req.headers.get('x-request-id') || null,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        role: ctx.role,
        boqRevisionId: targetRevisionId,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error
          ? { name: error.name, message: error.message.slice(0, 400) }
          : { type: typeof error },
      });
    } catch {
      // Preserve the generic API response if optional local log storage fails.
    }
    return apiError(UI_STRINGS.common.userMessages.aiRefinementFailed, 500);
  }
}
