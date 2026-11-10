import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError, getListPageWindow } from '@/lib/api-utils';
import { getUserProjectAccessFilter, isUserAuthorizedForProject } from '@/lib/project-auth';
import { MAX_D1_QUERY_FILTER_VALUES } from '@/lib/d1-query.constants';
import { readSelectedPrBoqLines } from '@/lib/pr-line-selection';
import type { SelectedPrBoqLine } from '@app-types/lib/pr-line-selection.types';
import { isD1BatchWithinLimits, writeD1BatchAtomically } from '@/lib/d1-batch';
import {
  MAX_PR_BATCH_LINES,
  PROCUREMENT_REQUEST_AUDIT_INSERT_AFTER_BOQ_UPDATE_SQL,
  PROCUREMENT_REQUEST_BOQ_UPDATE_AFTER_REVISION_SQL,
  PROCUREMENT_REQUEST_INSERT_IF_VALID_SQL,
  PROCUREMENT_REQUEST_LINE_INSERT_AFTER_PARENT_SQL,
  PROCUREMENT_REQUEST_REVISION_UPDATE_AFTER_LINES_SQL,
} from '@/lib/d1-batch.constants';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import { logEvent } from '@/lib/observability/server-logger';
import { getCategoryPreviews } from '@/lib/category-preview';

function requestId(req: NextRequest): string | undefined {
  const value = req.headers.get('x-request-id') || req.headers.get('cf-ray');
  return value && value.length <= 128 ? value : undefined;
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const ctx = await requireAuth('PR_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId') || '';
  const costCentreId = searchParams.get('costCentreId') || '';
  const status = searchParams.get('status') || '';
  const search = searchParams.get('search') || '';
  const { page, pageSize, skip } = getListPageWindow(searchParams);

  try {
    const projectAccessFilter = await getUserProjectAccessFilter(ctx.userId, ctx.role, ctx.tenantId);
    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      ...(projectAccessFilter ? { project: { is: projectAccessFilter } } : {}),
    };
    if (projectId) where.projectId = projectId;
    if (costCentreId) where.costCentreId = costCentreId;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { prNumber: { contains: search } },
        { title: { contains: search } },
        { requestedBy: { contains: search } },
      ];
    }

    const [total, statusGroups, prs] = await Promise.all([
      prisma.procurementRequest.count({ where }),
      prisma.procurementRequest.groupBy({ by: ['status'], where, _count: { _all: true } }),
      prisma.procurementRequest.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
        include: {
          project: { select: { id: true, projectCode: true, name: true } },
          costCentre: { select: { id: true, code: true, name: true, areaSqFt: true } },
          boq: { select: { id: true, boqCode: true, category: true, title: true } },
          boqRevision: { select: { id: true, revisionNumber: true, revisionCode: true } },
          approvals: { orderBy: { timestamp: 'desc' }, take: 1 },
          _count: { select: { lines: true, rfqs: true } },
        },
      }),
    ]);

    const categoriesByRequest = await getCategoryPreviews({
      tenantId: ctx.tenantId, entityIds: prs.map(({ id }) => id), source: 'purchaseRequests',
    });
    const formatted = prs.map((pr) => {
      const categoryPreview = categoriesByRequest.get(pr.id) || { categories: [], total: 0 };
      const fallbackCategories = pr.boq?.category ? [pr.boq.category] : ['Standard'];
      const categories = categoryPreview.categories.length ? categoryPreview.categories : fallbackCategories;
      const categoryCount = Math.max(categoryPreview.total, categories.length);
      return {
        ...pr,
        categories,
        remainingCategoryCount: Math.max(categoryCount - categories.length, 0),
      };
    });
    const statusCounts = Object.fromEntries(statusGroups.map((group) => [group.status, group._count._all]));
    return apiSuccess({
      data: formatted,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      statusCounts,
    });
  } catch (error) {
    logEvent('error', 'purchase_request.list_failed', {
      operation: 'list', route: '/api/pr', requestId: requestId(req), tenantId: ctx.tenantId,
      projectId: projectId || undefined, durationMs: Date.now() - startedAt, error,
    }, 'next');
    return apiError(UI_STRINGS.common.userMessages.failedToFetchProcurementRequests, 500);
  }
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const ctx = await requireAuth('PR_CREATE');
  if (!isApiContext(ctx)) return ctx;

  let requestedRevisionId: string | undefined;
  let requestedProjectId: string | undefined;
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
    const { boqRevisionId, costCentreId, projectId, title, requiredDate, selectedLineIds, autoSubmit } = body;
    if (typeof boqRevisionId !== 'string' || !boqRevisionId.trim()
      || typeof costCentreId !== 'string' || !costCentreId.trim()) {
      return apiError(UI_STRINGS.common.bOQRevisionIDAndCostCentreIDAreMandatory, 400);
    }
    if ((projectId !== undefined && typeof projectId !== 'string')
      || (title !== undefined && title !== null && typeof title !== 'string')
      || (requiredDate !== undefined && requiredDate !== null && typeof requiredDate !== 'string')
      || (selectedLineIds !== undefined && (!Array.isArray(selectedLineIds) || selectedLineIds.some((id) => typeof id !== 'string')))
      || (autoSubmit !== undefined && typeof autoSubmit !== 'boolean')) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    requestedRevisionId = boqRevisionId;
    requestedProjectId = typeof projectId === 'string' ? projectId : undefined;
    const selectedIds = Array.isArray(selectedLineIds)
      ? [...new Set(selectedLineIds as string[])]
      : undefined;
    if (selectedIds && selectedIds.length > MAX_PR_BATCH_LINES) {
      return apiError(interpolateUiString(UI_STRINGS.common.prExceedsAtomicWriteLimitMaxLines, { maxLines: MAX_PR_BATCH_LINES }), 400);
    }
    const chunkedSelectionIds = selectedIds && selectedIds.length > MAX_D1_QUERY_FILTER_VALUES
      ? selectedIds
      : undefined;

    const revision = await prisma.boqRevision.findFirst({
      where: { id: boqRevisionId, tenantId: ctx.tenantId },
      include: {
        ...(chunkedSelectionIds ? {} : {
          lines: {
            where: {
              isDeleted: false,
              ...(selectedIds && selectedIds.length > 0 ? { id: { in: selectedIds } } : {}),
            },
            orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
            take: MAX_PR_BATCH_LINES + 1,
            include: { category: true, subcategory: true, uom: true },
          },
        }),
        boq: true,
      },
    });
    if (!revision) return apiError(UI_STRINGS.common.bOQRevisionNotFound, 404);

    const targetProjectId = (typeof projectId === 'string' && projectId.trim()) ? projectId.trim() : revision.boq.projectId;
    if (targetProjectId !== revision.boq.projectId) {
      return apiError(UI_STRINGS.appApiBoqCreatePrRoute.projectMustMatchTheProjectLinkedToThisBOQ, 400);
    }
    const targetCostCentreId = costCentreId.trim();
    const costCentre = await prisma.costCentre.findFirst({
      where: { id: targetCostCentreId, projectId: targetProjectId, tenantId: ctx.tenantId },
    });
    if (!costCentre) return apiError(UI_STRINGS.common.costCentreNotFoundForThisProject, 404, { route: '/api/pr', method: 'POST' });

    const authorized = await isUserAuthorizedForProject(ctx.userId, ctx.role, targetProjectId, ctx.tenantId);
    if (!authorized) {
      return apiError(UI_STRINGS.common.forbiddenInsufficientPermissions, 403);
    }

    const targetLines: SelectedPrBoqLine[] = chunkedSelectionIds
      ? await readSelectedPrBoqLines(ctx.tenantId, revision.id, chunkedSelectionIds)
      : revision.lines as SelectedPrBoqLine[];
    if (targetLines.length === 0) {
      return apiError(UI_STRINGS.common.noValidBOQLinesAvailableToGeneratePR, 400, { route: '/api/pr', method: 'POST' });
    }
    if (targetLines.length > MAX_PR_BATCH_LINES) {
      return apiError(interpolateUiString(UI_STRINGS.common.prExceedsAtomicWriteLimitMaxLines, { maxLines: MAX_PR_BATCH_LINES }), 400);
    }
    const missingQuantityCount = targetLines.filter((line) => line.quantity === null || line.quantity === undefined || line.quantity <= 0).length;
    if (missingQuantityCount > 0) {
      return apiError(interpolateUiString(
        UI_STRINGS.appApiBoqCreatePrRoute.quantityRequiredForLengthItemValue2BeforeCreatingPR,
        { length: missingQuantityCount, value2: missingQuantityCount > 1 ? 's' : '' },
      ), 400);
    }

    const activePr = await prisma.procurementRequest.findFirst({
      where: { tenantId: ctx.tenantId, boqRevisionId, status: { notIn: ['PR_REJECTED', 'CANCELLED'] } },
      select: { prNumber: true },
    });
    if (activePr) {
      return apiError(interpolateUiString(
        UI_STRINGS.appApiBoqCreatePrRoute.anActiveProcurementRequestPrNumberAlreadyExistsForThisBOQRevisionDuplicatePRCreationIsPrevented,
        { prNumber: activePr.prNumber },
      ), 409);
    }

    const requiredAt = requiredDate ? new Date(requiredDate) : null;
    if (requiredAt && !Number.isFinite(requiredAt.getTime())) return apiError(UI_STRINGS.common.invalidDate, 400);
    const requestedAt = new Date();
    const createdAt = requestedAt.toISOString();
    const prId = crypto.randomUUID();
    const autoSubmitEnabled = autoSubmit === true;
    const initialStatus = autoSubmitEnabled ? 'PR_PENDING_PROJECT_APPROVAL' : 'PR_DRAFT';
    const prTitle = (typeof title === 'string' && title.trim())
      || `PR for ${costCentre.name} (${revision.boq.boqCode} R${revision.revisionNumber})`;
    let totalEstimatedValue = 0;
    for (const line of targetLines) {
      const rate = line.aiUnitCost || 0;
      totalEstimatedValue += line.aiTotalCost || rate * (line.quantity || 1);
    }
    const roundedTotal = Math.round(totalEstimatedValue * 100) / 100;
    const requiredAtValue = requiredAt?.toISOString() || null;
    const batch = [{
      sql: PROCUREMENT_REQUEST_INSERT_IF_VALID_SQL,
      values: [
        prId, ctx.tenantId, String(requestedAt.getFullYear()), ctx.tenantId, String(requestedAt.getFullYear()),
        targetProjectId, targetCostCentreId, revision.boqId, revision.id, prTitle,
        roundedTotal, targetLines.length, initialStatus, ctx.userId, createdAt, requiredAtValue, createdAt, createdAt,
        revision.id, ctx.tenantId, revision.boqId,
        revision.boqId, ctx.tenantId, targetProjectId,
        targetCostCentreId, ctx.tenantId, targetProjectId,
        ctx.tenantId, revision.id,
      ],
    }];
    for (const [index, line] of targetLines.entries()) {
      const rate = line.aiUnitCost || 0;
      const quantity = line.quantity as number;
      const lineValue = line.aiTotalCost || rate * quantity;
      batch.push({
        sql: PROCUREMENT_REQUEST_LINE_INSERT_AFTER_PARENT_SQL,
        values: [
          crypto.randomUUID(), ctx.tenantId, prId, targetProjectId, targetCostCentreId,
          revision.boqId, revision.id, line.id, line.lineNumber || String(index + 1),
          line.standardDescription || line.originalDescription || UI_STRINGS.common.itemDescription,
          line.specification || null, line.category?.name || UI_STRINGS.common.general,
          line.subcategory?.name || null, line.uom?.code || line.uomRaw || UI_STRINGS.common.nOS,
          quantity, rate, lineValue, line.drawingReference || null, requiredAtValue, `${costCentre.code} ${costCentre.name}`, createdAt,
        ],
      });
    }
    batch.push({
      sql: PROCUREMENT_REQUEST_REVISION_UPDATE_AFTER_LINES_SQL,
      values: [targetCostCentreId, initialStatus, createdAt, revision.id, ctx.tenantId],
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
        JSON.stringify({ boqCode: revision.boq.boqCode, revisionCode: revision.revisionCode, totalLines: targetLines.length, totalEstimatedPRValue: roundedTotal, status: initialStatus }),
        createdAt, prId, ctx.tenantId,
      ],
    });

    if (!isD1BatchWithinLimits(batch)) {
      return apiError(interpolateUiString(UI_STRINGS.common.prExceedsAtomicWriteLimitMaxLines, { maxLines: MAX_PR_BATCH_LINES }), 400);
    }

    try {
      const results = await writeD1BatchAtomically(batch);
      const createdPr = results[0]?.results?.[0] as { id?: string; prNumber?: string } | undefined;
      if (!createdPr?.id || !createdPr.prNumber) {
        const competingPr = await prisma.procurementRequest.findFirst({
          where: { tenantId: ctx.tenantId, boqRevisionId, status: { notIn: ['PR_REJECTED', 'CANCELLED'] } },
          select: { prNumber: true },
        });
        if (competingPr) {
          return apiError(interpolateUiString(
            UI_STRINGS.appApiBoqCreatePrRoute.anActiveProcurementRequestPrNumberAlreadyExistsForThisBOQRevisionDuplicatePRCreationIsPrevented,
            { prNumber: competingPr.prNumber },
          ), 409);
        }
        return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
      }
      return apiSuccess({
        prId: createdPr.id,
        prNumber: createdPr.prNumber,
        totalEstimatedValue: roundedTotal,
        totalLines: targetLines.length,
        status: initialStatus,
      }, 201);
    } catch (error) {
      const competingPr = await prisma.procurementRequest.findFirst({
        where: { tenantId: ctx.tenantId, boqRevisionId, status: { notIn: ['PR_REJECTED', 'CANCELLED'] } },
        select: { prNumber: true },
      });
      if (competingPr) {
        return apiError(interpolateUiString(
          UI_STRINGS.appApiBoqCreatePrRoute.anActiveProcurementRequestPrNumberAlreadyExistsForThisBOQRevisionDuplicatePRCreationIsPrevented,
          { prNumber: competingPr.prNumber },
        ), 409);
      }
      throw error;
    }
  } catch (error) {
    logEvent('error', 'purchase_request.creation_failed', {
      operation: 'create', route: '/api/pr', requestId: requestId(req), tenantId: ctx.tenantId,
      userId: ctx.userId, boqRevisionId: requestedRevisionId, projectId: requestedProjectId,
      durationMs: Date.now() - startedAt, error,
    }, 'next');
    return apiError(UI_STRINGS.common.userMessages.failedToCreateProcurementRequest, 500);
  }
}
