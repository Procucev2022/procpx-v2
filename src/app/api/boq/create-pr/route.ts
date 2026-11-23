// src/app/api/boq/create-pr/route.ts - Create Procurement Request (PR) from BOQ
import type { D1BatchInputStatement } from '@app-types/lib/d1-batch.types';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import {
  MAX_PR_BATCH_LINES,
  PROCUREMENT_REQUEST_AUDIT_INSERT_AFTER_BOQ_UPDATE_SQL,
  PROCUREMENT_REQUEST_BOQ_UPDATE_AFTER_REVISION_SQL,
  PROCUREMENT_REQUEST_INSERT_IF_VALID_SQL,
  PROCUREMENT_REQUEST_LINE_INSERT_AFTER_PARENT_SQL,
  PROCUREMENT_REQUEST_REVISION_UPDATE_AFTER_ALL_LINES_SQL,
} from '@/lib/d1-batch.constants';
import { isD1BatchWithinLimits, toBulkPrLineInsertStatements, writeD1BatchAtomically } from '@/lib/d1-batch';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { isUserAuthorizedForProject } from '@/lib/project-auth';
import { MAX_D1_QUERY_FILTER_VALUES } from '@/lib/d1-query.constants';
import { readSelectedPrBoqLines } from '@/lib/pr-line-selection';
import type { SelectedPrBoqLine } from '@app-types/lib/pr-line-selection.types';


export async function POST(req: NextRequest) {
  const ctx = await requireAuth('PR_CREATE');
  if (!isApiContext(ctx)) return ctx;

  const startedAt = Date.now();
  let requestBoqRevisionId: string | undefined;
  let requestBoqId: string | undefined;
  try {
    let parsedBody: unknown;
    try {
      parsedBody = await req.json();
    } catch {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const body = parsedBody as Record<string, unknown>;
    const {
      boqRevisionId,
      boqId,
      costCentreId,
      projectId,
      title,
      requiredDate,
      selectedLineIds,
      autoSubmit,
    } = body as Record<string, any>;
    requestBoqRevisionId = typeof boqRevisionId === 'string' ? boqRevisionId : undefined;
    requestBoqId = typeof boqId === 'string' ? boqId : undefined;

    if ((boqRevisionId !== undefined && typeof boqRevisionId !== 'string')
      || (boqId !== undefined && typeof boqId !== 'string')
      || (projectId !== undefined && typeof projectId !== 'string')
      || (costCentreId !== undefined && typeof costCentreId !== 'string')
      || (title !== undefined && title !== null && typeof title !== 'string')
      || (requiredDate !== undefined && requiredDate !== null && typeof requiredDate !== 'string')) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    if (!boqRevisionId && !boqId) {
      return apiError(UI_STRINGS.common.bOQRevisionIDOrBOQIDIsRequired, 400, { route: '/api/boq/create-pr', method: 'POST' });
    }
    if (selectedLineIds !== undefined && (!Array.isArray(selectedLineIds) || selectedLineIds.some((id) => typeof id !== 'string'))) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const selectedIds = Array.isArray(selectedLineIds) ? Array.from(new Set(selectedLineIds as string[])) : undefined;
    if (selectedIds && selectedIds.length > MAX_PR_BATCH_LINES) {
      return apiError(interpolateUiString(UI_STRINGS.common.prExceedsAtomicWriteLimitMaxLines, {
        maxLines: MAX_PR_BATCH_LINES,
      }), 400);
    }
    const chunkedSelectionIds = selectedIds && selectedIds.length > MAX_D1_QUERY_FILTER_VALUES
      ? selectedIds
      : undefined;

    const activeLineSelection = {
      where: {
        isDeleted: false,
        ...(selectedIds && selectedIds.length > 0 ? { id: { in: selectedIds } } : {}),
      },
      orderBy: [{ lineNumber: 'asc' as const }, { id: 'asc' as const }],
      take: MAX_PR_BATCH_LINES + 1,
      include: { category: true, subcategory: true, uom: true },
    };

    // Resolve revision
    let revision = null;
    if (boqRevisionId) {
      revision = await prisma.boqRevision.findFirst({
        where: { id: boqRevisionId, tenantId: ctx.tenantId },
        include: {
          ...(chunkedSelectionIds ? {} : { lines: activeLineSelection }),
          boq: {
            include: { project: true, costCentre: true },
          },
        },
      });
    }

    if (!revision && boqId) {
      const boqRecord = await prisma.boq.findFirst({
        where: { id: boqId, tenantId: ctx.tenantId },
        include: {
          project: true,
          costCentre: true,
          revisions: {
            orderBy: { revisionNumber: 'desc' },
            take: 1,
            include: {
              ...(chunkedSelectionIds ? {} : { lines: activeLineSelection }),
            },
          },
        },
      });
      if (boqRecord && boqRecord.revisions.length > 0) {
        revision = {
          ...boqRecord.revisions[0],
          boq: boqRecord,
        };
      }
    }

    if (!revision) {
      return apiError(UI_STRINGS.common.bOQRevisionNotFound, 404, { route: '/api/boq/create-pr', method: 'POST' });
    }

    const targetProjectId = projectId || revision.boq.projectId;
    if (targetProjectId !== revision.boq.projectId) {
      return apiError(UI_STRINGS.appApiBoqCreatePrRoute.projectMustMatchTheProjectLinkedToThisBOQ, 400);
    }
    const targetCostCentreId = costCentreId || revision.costCentreId || revision.boq.costCentreId;

    if (!targetCostCentreId) {
      return apiError(UI_STRINGS.appApiBoqCreatePrRoute.aValidCostCentreIsRequiredToCreateAPR, 400, { route: '/api/boq/create-pr', method: 'POST' });
    }

    const costCentre = await prisma.costCentre.findFirst({
      where: { id: targetCostCentreId, projectId: targetProjectId, tenantId: ctx.tenantId },
    });
    if (!costCentre) {
      return apiError(UI_STRINGS.common.costCentreNotFoundForThisProject, 404, { route: '/api/boq/create-pr', method: 'POST' });
    }

    const authorized = await isUserAuthorizedForProject(ctx.userId, ctx.role, targetProjectId, ctx.tenantId);
    if (!authorized) {
      return apiError(UI_STRINGS.common.forbiddenInsufficientPermissions, 403);
    }

    // Large selections are read in D1-safe chunks; other paths use the bounded revision relation.
    const targetLines: SelectedPrBoqLine[] = chunkedSelectionIds
      ? await readSelectedPrBoqLines(ctx.tenantId, revision.id, chunkedSelectionIds)
      : revision.lines as SelectedPrBoqLine[];

    if (targetLines.length === 0) {
      return apiError(UI_STRINGS.common.noValidBOQLinesAvailableToGeneratePR, 400, { route: '/api/boq/create-pr', method: 'POST' });
    }
    const maxLinesPerAtomicWrite = MAX_PR_BATCH_LINES;
    if (targetLines.length > maxLinesPerAtomicWrite) {
      return apiError(interpolateUiString(UI_STRINGS.common.prExceedsAtomicWriteLimitMaxLines, {
        maxLines: maxLinesPerAtomicWrite,
      }), 400);
    }

    // Section 9: Commercial PR Rule - block if any line has pending/blank/invalid quantity
    const missingQtyLines = targetLines.filter((l: any) => l.quantity === null || l.quantity === undefined || l.quantity <= 0);
    if (missingQtyLines.length > 0) {
      return apiError(
        interpolateUiString(UI_STRINGS.appApiBoqCreatePrRoute.quantityRequiredForLengthItemValue2BeforeCreatingPR, { "length": missingQtyLines.length, "value2": missingQtyLines.length > 1 ? 's' : '' }),
        400, { route: '/api/boq/create-pr', method: 'POST' });
    }

    // Prevent duplicate PR creation (Correction 6)
    const existingActivePr = await prisma.procurementRequest.findFirst({
      where: {
        tenantId: ctx.tenantId,
        boqRevisionId: revision.id,
        status: { notIn: ['PR_REJECTED', 'CANCELLED'] },
      },
    });
    if (existingActivePr) {
      return apiError(
        interpolateUiString(UI_STRINGS.appApiBoqCreatePrRoute.anActiveProcurementRequestPrNumberAlreadyExistsForThisBOQRevisionDuplicatePRCreationIsPrevented, { "prNumber": existingActivePr.prNumber }),
        409, { route: '/api/boq/create-pr', method: 'POST' });
    }

    let totalEstimatedPRValue = 0;
    for (const l of targetLines) {
      const unitRate = l.aiUnitCost || (l as any).benchmarkRate || 100;
      const qty = l.quantity as number;
      const lineCost = l.aiTotalCost || Math.round(unitRate * qty * 100) / 100;
      totalEstimatedPRValue += lineCost;
    }

    const prTitle = title || `${revision.boq.title || revision.boq.boqCode} - Procurement Package`;
    const initialStatus = autoSubmit === true ? 'PR_PENDING_PROJECT_APPROVAL' : 'PR_DRAFT';
    const requestedAt = new Date();
    const requiredAt = requiredDate ? new Date(requiredDate) : new Date(requestedAt.getTime() + 30 * 86400000);
    if (!Number.isFinite(requiredAt.getTime())) {
      return apiError(UI_STRINGS.common.invalidDate, 400);
    }
    const createdAt = requestedAt.toISOString();
    const prId = crypto.randomUUID();
    const roundedTotal = Math.round(totalEstimatedPRValue * 100) / 100;
    const batch: D1BatchInputStatement[] = [{
      sql: PROCUREMENT_REQUEST_INSERT_IF_VALID_SQL,
      values: [
        prId, ctx.tenantId, String(requestedAt.getFullYear()), ctx.tenantId, String(requestedAt.getFullYear()),
        targetProjectId, targetCostCentreId, revision.boqId, revision.id, prTitle,
        roundedTotal, targetLines.length, initialStatus, ctx.userId, createdAt, requiredAt.toISOString(), createdAt, createdAt,
        revision.id, ctx.tenantId, revision.boqId,
        revision.boqId, ctx.tenantId, targetProjectId,
        targetCostCentreId, ctx.tenantId, targetProjectId,
        ctx.tenantId, revision.id,
      ],
    }];

    // Create PR lines with end-to-end BOQ line traceability in the same D1 batch.
    const prLineStatements: typeof batch = [];
    for (const [index, l] of targetLines.entries()) {
      const unitRate = l.aiUnitCost || (l as any).benchmarkRate || 100;
      const qty = l.quantity as number;
      const lineVal = l.aiTotalCost || Math.round(unitRate * qty * 100) / 100;
      prLineStatements.push({
        sql: PROCUREMENT_REQUEST_LINE_INSERT_AFTER_PARENT_SQL,
        values: [
          crypto.randomUUID(), ctx.tenantId, prId, targetProjectId, targetCostCentreId,
          revision.boqId, revision.id, l.id, l.lineNumber || String(index + 1),
          l.standardDescription || l.originalDescription || 'Line Item', l.specification || null,
          l.category?.name || 'General', l.subcategory?.name || null, l.uom?.code || l.uomRaw || 'NOS',
          qty, unitRate, lineVal, l.drawingReference || null, requiredAt.toISOString(), costCentre.code, createdAt,
        ],
      });
    }

    // JSON bulk PR lines keep PRs from large BOQs inside this one atomic batch.
    batch.push(...toBulkPrLineInsertStatements(prLineStatements, prId, ctx.tenantId));
    batch.push({
      sql: PROCUREMENT_REQUEST_REVISION_UPDATE_AFTER_ALL_LINES_SQL,
      values: [targetCostCentreId, initialStatus, createdAt, revision.id, ctx.tenantId, prId, ctx.tenantId, targetLines.length],
    });
    batch.push({
      sql: PROCUREMENT_REQUEST_BOQ_UPDATE_AFTER_REVISION_SQL,
      values: [targetCostCentreId, createdAt, revision.boqId, ctx.tenantId],
    });
    batch.push({
      sql: PROCUREMENT_REQUEST_AUDIT_INSERT_AFTER_BOQ_UPDATE_SQL,
      values: [
        crypto.randomUUID(), ctx.tenantId, ctx.userId, targetProjectId, revision.boq.boqCode,
        targetLines.length,
        JSON.stringify({
          boqCode: revision.boq.boqCode,
          revisionCode: revision.revisionCode,
          totalLines: targetLines.length,
          totalEstimatedPRValue: roundedTotal,
          status: initialStatus,
        }),
        createdAt, prId, ctx.tenantId,
      ],
    });

    if (!isD1BatchWithinLimits(batch)) {
      return apiError(interpolateUiString(UI_STRINGS.common.prExceedsAtomicWriteLimitMaxLines, { maxLines: maxLinesPerAtomicWrite }), 400);
    }
    const writeResults = await writeD1BatchAtomically(batch);
    const createdPr = writeResults[0]?.results?.[0] as { id?: string; prNumber?: string } | undefined;
    if (!createdPr?.id || !createdPr.prNumber) {
      const competingPr = await prisma.procurementRequest.findFirst({
        where: {
          tenantId: ctx.tenantId,
          boqRevisionId: revision.id,
          status: { notIn: ['PR_REJECTED', 'CANCELLED'] },
        },
        select: { prNumber: true },
      });
      if (competingPr) {
        return apiError(interpolateUiString(UI_STRINGS.appApiBoqCreatePrRoute.anActiveProcurementRequestPrNumberAlreadyExistsForThisBOQRevisionDuplicatePRCreationIsPrevented, {
          prNumber: competingPr.prNumber,
        }), 409);
      }
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }

    return apiSuccess({
      success: true,
      prId: createdPr.id,
      prNumber: createdPr.prNumber,
      totalLines: targetLines.length,
      totalValue: roundedTotal,
      status: initialStatus,
      message: interpolateUiString(UI_STRINGS.appApiBoqCreatePrRoute.procurementRequestPrNumberCreatedWithLengthItems, {
        prNumber: createdPr.prNumber,
        length: targetLines.length,
      }),
    }, 201);
  } catch (error) {
    await writeStructuredLog('error', 'purchase_request.creation_failed', {
      operation: 'create_from_boq',
      route: '/api/boq/create-pr',
      requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      boqRevisionId: requestBoqRevisionId,
      boqId: requestBoqId,
      durationMs: Date.now() - startedAt,
      error,
    }, 'application');
    return apiError(UI_STRINGS.common.userMessages.failedToCreateProcurementRequestFromBoq, 500);
  }
}
