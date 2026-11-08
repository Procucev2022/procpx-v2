// src/app/api/boq/[revisionId]/route.ts - Get single BOQ or Revision details
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { computeLineCostBreakdown } from '@/lib/boq-cost-breakdown';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { BOQ_DETAIL_LATEST_REVISION_LIMIT } from './route.constants';
import { BOQ_LINE_DETAIL_PAGE_SIZE } from '@/lib/boq-line-pagination.constants';
import { encodeBoqLineCursor } from '@/lib/boq-line-pagination';
import { getBoqLineSummary } from '@/lib/boq-line-summary';
import { logEvent } from '@/lib/observability/server-logger';


export async function GET(req: NextRequest, { params }: { params: Promise<{ revisionId: string }> }) {
  const startedAt = Date.now();
  const ctx = await requireAuth('BOQ_VIEW');
  if (!isApiContext(ctx)) return ctx;
  const { revisionId } = await params;

  // 1. Try finding as a revision ID first
  let revision: any = await prisma.boqRevision.findFirst({
    where: { id: revisionId, tenantId: ctx.tenantId },
    include: {
      boq: {
        include: {
          project: {
            select: {
              id: true,
              projectCode: true,
              name: true,
              sector: true,
              projectType: true,
              status: true,
              areaSqFt: true,
              location: true,
              city: true,
              state: true,
            },
          },
          costCentre: {
            select: {
              id: true,
              code: true,
              name: true,
              areaSqFt: true,
            },
          },
        },
      },
    },
  });

  // 2. If not found by revisionId, try finding by boqId
  let boq = null;
  if (revision) {
    boq = revision.boq;
  } else {
    boq = await prisma.boq.findFirst({
      where: { id: revisionId, tenantId: ctx.tenantId },
      include: {
        project: {
          select: {
            id: true,
            projectCode: true,
            name: true,
            sector: true,
            projectType: true,
            status: true,
            areaSqFt: true,
            location: true,
            city: true,
            state: true,
          },
        },
        costCentre: {
          select: {
            id: true,
            code: true,
            name: true,
            areaSqFt: true,
          },
        },
        revisions: {
          orderBy: { revisionNumber: 'desc' },
          take: BOQ_DETAIL_LATEST_REVISION_LIMIT,
        },
      },
    });

    if (boq && boq.revisions.length > 0) {
      revision = boq.revisions[0];
    }
  }

  if (!boq && !revision) {
    return apiError(UI_STRINGS.appApiBoqRevisionIdRoute.bOQOrRevisionNotFound, 404, { route: '/api/boq/[revisionId]', method: 'GET' });
  }

  const lineWhere = revision
    ? { boqRevisionId: revision.id, tenantId: ctx.tenantId, isDeleted: false }
    : null;
  const [lineSummary, rawLines] = lineWhere
    ? await Promise.all([
      getBoqLineSummary((query) => prisma.$queryRaw(query), revision.id, ctx.tenantId),
      prisma.boqLine.findMany({
        where: lineWhere,
        orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
        take: BOQ_LINE_DETAIL_PAGE_SIZE,
        include: {
          category: { select: { id: true, name: true } },
          subcategory: { select: { id: true, name: true } },
          uom: { select: { id: true, code: true, name: true } },
        },
      }),
    ])
    : [null, []];
  let malformedCostBreakdownCount = 0;
  let fallbackAppliedCount = 0;
  let fallbackUnavailableCount = 0;
  const malformedCostBreakdownLineIds: string[] = [];
  const lines = rawLines.map((l: any) => {
    let costBreakdown = null;
    let malformedCostBreakdown = false;
    if (typeof l.aiReason === 'string' && l.aiReason.trimStart().startsWith('{')) {
      try {
        const parsed = JSON.parse(l.aiReason);
        if (parsed.costBreakdown) costBreakdown = parsed.costBreakdown;
      } catch {
        malformedCostBreakdown = true;
        malformedCostBreakdownCount += 1;
        if (malformedCostBreakdownLineIds.length < 20) malformedCostBreakdownLineIds.push(l.id);
      }
    }
    if (!costBreakdown && l.aiUnitCost !== null && l.aiUnitCost !== undefined && Number(l.aiUnitCost) > 0) {
      costBreakdown = computeLineCostBreakdown(
        Number(l.aiUnitCost),
        l.quantity,
        l.category?.name,
        l.standardDescription || l.originalDescription
      );
      if (malformedCostBreakdown) fallbackAppliedCount += 1;
    } else if (malformedCostBreakdown) {
      fallbackUnavailableCount += 1;
    }
    return {
      ...l,
      costBreakdown,
    };
  });
  if (malformedCostBreakdownCount > 0) {
    const requestId = (req.headers.get('x-request-id') || req.headers.get('cf-ray') || '').trim().slice(0, 128);
    logEvent('warn', 'boq.cost_breakdown_parse_failed', {
      operation: 'parse_saved_cost_breakdown',
      route: '/api/boq/[revisionId]',
      ...(requestId ? { requestId } : {}),
      tenantId: ctx.tenantId,
      revisionId: revision?.id || revisionId,
      durationMs: Date.now() - startedAt,
      status: 'degraded',
      malformedLineCount: malformedCostBreakdownCount,
      fallbackAppliedCount,
      fallbackUnavailableCount,
      lineIds: malformedCostBreakdownLineIds,
      omittedLineIdCount: Math.max(0, malformedCostBreakdownCount - malformedCostBreakdownLineIds.length),
      errorType: 'SyntaxError',
    });
  }
  const totalLines = lineSummary?.totalLines ?? 0;
  const totalValue = lineSummary?.totalAiEstimate ?? 0;
  const nextCursor = totalLines > lines.length && lines.length > 0
    ? encodeBoqLineCursor(lines[lines.length - 1])
    : null;

  return apiSuccess({
    boq: {
      ...boq,
      estimatedValue: totalValue,
    },
    revision,
    lines,
    summary: lineSummary,
    totalLines,
    linesTruncated: totalLines > lines.length,
    nextCursor,
    qualityScore: revision?.qualityScore ?? 100,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ revisionId: string }> }) {
  const ctx = await requireAuth('BOQ_EDIT');
  if (!isApiContext(ctx)) return ctx;
  const { revisionId } = await params;

  try {
    const body = await req.json();
    const { title, description, status, purpose, category, costCentreId } = body;

    // Find boq directly or via revision
    let boq = await prisma.boq.findFirst({
      where: { id: revisionId, tenantId: ctx.tenantId },
    });

    if (!boq) {
      const rev = await prisma.boqRevision.findFirst({
        where: { id: revisionId, tenantId: ctx.tenantId },
      });
      if (rev) {
        boq = await prisma.boq.findFirst({
          where: { id: rev.boqId, tenantId: ctx.tenantId },
        });
      }
    }

    if (!boq) {
      return apiError(UI_STRINGS.appApiBoqRevisionIdRoute.bOQNotFound, 404, { route: '/api/boq/[revisionId]', method: 'PATCH' });
    }

    const updatedBoq = await prisma.boq.update({
      where: { id: boq.id },
      data: {
        ...(title !== undefined ? { title: title.trim() } : {}),
        ...(description !== undefined ? { description: description?.trim() || null } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(purpose !== undefined && ['BUDGET', 'PR'].includes(purpose) ? { purpose } : {}),
        ...(category !== undefined ? { category: Array.isArray(category) ? category.join(', ') : category } : {}),
        ...(costCentreId !== undefined ? { costCentreId: costCentreId || null } : {}),
      },
    });

    return apiSuccess({ success: true, boq: updatedBoq });
  } catch (err: any) {
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.failedToUpdateBoq }), 500, { route: '/api/boq/[revisionId]', method: 'PATCH', error: err });
  }
}

