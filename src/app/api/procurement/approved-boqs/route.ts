// app/api/procurement/approved-boqs/route.ts
// Returns Approved BOQs eligible for Sourcing and RFQ creation
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError, getListPageWindow } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import {
  APPROVED_BOQ_DETAIL_LINES_PAGE_SIZE,
  APPROVED_BOQ_LINE_SUMMARY_REVISION_BATCH_SIZE,
  APPROVED_BOQ_MAX_PAGE_SIZE,
  APPROVED_BOQ_MAX_SEARCH_LENGTH,
} from './route.constants';
import type { ApprovedBoqLineAggregateRow, ApprovedBoqRouteQuery } from '@app-types/app/api/procurement/approved-boqs.types';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { decodeBoqLineCursor, encodeBoqLineCursor } from '@/lib/boq-line-pagination';


export async function GET(req: NextRequest) {
  const ctx = await requireAuth('BOQ_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const pageWindow = getListPageWindow(searchParams);
  const lineCursorParam = searchParams.get('lineCursor');
  const lineCursor = lineCursorParam === null ? null : decodeBoqLineCursor(lineCursorParam);
  if ((lineCursorParam !== null && !lineCursor) || (lineCursor && !searchParams.get('revisionId'))) {
    return apiError(UI_STRINGS.common.invalidRequestBody, 400);
  }
  const requestedLinePageSize = Number(searchParams.get('linePageSize'));
  const query: ApprovedBoqRouteQuery = {
    ...pageWindow,
    pageSize: Math.min(pageWindow.pageSize, APPROVED_BOQ_MAX_PAGE_SIZE),
    projectId: searchParams.get('projectId'),
    revisionId: searchParams.get('revisionId'),
    search: (searchParams.get('search') || '').trim().slice(0, APPROVED_BOQ_MAX_SEARCH_LENGTH),
    lineCursor,
    linePageSize: Number.isSafeInteger(requestedLinePageSize) && requestedLinePageSize > 0
      ? Math.min(requestedLinePageSize, APPROVED_BOQ_DETAIL_LINES_PAGE_SIZE)
      : APPROVED_BOQ_DETAIL_LINES_PAGE_SIZE,
  };

  try {
    const statusCondition = {
      OR: [
        { status: 'APPROVED' },
        { prStatus: 'PR_RELEASED_TO_PROCUREMENT' },
        { prStatus: 'PR_APPROVED' },
        { prs: { some: { status: { in: ['PR_APPROVED', 'PR_RELEASED_TO_PROCUREMENT'] } } } },
      ],
    };

    const where: any = {
      tenantId: ctx.tenantId,
      AND: [statusCondition],
    };

    if (query.projectId) {
      where.AND.push({ boq: { projectId: query.projectId } });
    }
    if (query.revisionId) {
      where.AND.push({ id: query.revisionId });
    }

    if (query.search) {
      where.AND.push({
        OR: [
          { revisionCode: { contains: query.search } },
          { boq: { boqCode: { contains: query.search } } },
          { boq: { project: { name: { contains: query.search } } } },
          { boq: { project: { projectCode: { contains: query.search } } } },
        ],
      });
    }

    if (query.lineCursor && query.revisionId) {
      const revision = await prisma.boqRevision.findFirst({ where, select: { id: true } });
      if (!revision) return apiError(UI_STRINGS.common.userMessages.failedToFetchApprovedBoqs, 404);
      const rows = await prisma.boqLine.findMany({
        where: {
          tenantId: ctx.tenantId,
          boqRevisionId: revision.id,
          isDeleted: false,
          OR: [
            { lineNumber: { gt: query.lineCursor.lineNumber } },
            { lineNumber: query.lineCursor.lineNumber, id: { gt: query.lineCursor.id } },
          ],
        },
        orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
        take: query.linePageSize + 1,
        select: {
          id: true, lineNumber: true, itemCode: true, standardDescription: true, originalDescription: true,
          specification: true, categoryId: true, subcategoryId: true, uomRaw: true, quantity: true, aiUnitCost: true,
          category: { select: { name: true } }, uom: { select: { code: true } },
        },
      });
      const pageLines = rows.slice(0, query.linePageSize);
      const lineHasMore = rows.length > query.linePageSize;
      const nextCursor = lineHasMore && pageLines.length > 0
        ? encodeBoqLineCursor(pageLines[pageLines.length - 1])
        : null;
      return apiSuccess({
        approvedBoqs: [{
          id: revision.id,
          lines: pageLines.map((line) => ({
            id: line.id,
            lineNumber: line.lineNumber || line.itemCode || 'L-1',
            description: interpolateUiString(UI_STRINGS.common.value1, { value1: line.standardDescription || line.originalDescription }),
            specification: line.specification || 'Standard commercial grade',
            category: line.category?.name || 'General',
            subcategory: line.subcategoryId || '',
            uom: line.uom?.code || line.uomRaw || 'NOS',
            quantity: line.quantity,
            benchmarkRate: Number(line.aiUnitCost) > 0 ? Number(line.aiUnitCost) : 100,
            benchmarkAmount: (line.quantity || 0) * (Number(line.aiUnitCost) > 0 ? Number(line.aiUnitCost) : 100),
          })),
          linePagination: { pageSize: query.linePageSize, hasMore: lineHasMore, nextCursor },
        }],
        total: 1,
        page: 1,
        pageSize: 1,
        totalPages: 1,
        hasMore: false,
      });
    }

    const [approvedRevisions, total] = await Promise.all([
      prisma.boqRevision.findMany({
        where,
        skip: query.skip,
        take: query.pageSize,
        orderBy: [{ approvedAt: 'desc' }, { id: 'desc' }],
        include: {
          _count: { select: { rfqs: true } },
          boq: {
            include: {
              project: {
                select: {
                  id: true,
                  projectCode: true,
                  name: true,
                  sector: true,
                  location: true,
                  city: true,
                  state: true,
                  budget: true,
                  currency: true,
                },
              },
            },
          },
          approvedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          costCentre: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      }),
      prisma.boqRevision.count({ where }),
    ]);

    const revisionIdBatches = approvedRevisions.length === 0
      ? []
      : Array.from({ length: Math.ceil(approvedRevisions.length / APPROVED_BOQ_LINE_SUMMARY_REVISION_BATCH_SIZE) }, (_, index) =>
        approvedRevisions.slice(
          index * APPROVED_BOQ_LINE_SUMMARY_REVISION_BATCH_SIZE,
          (index + 1) * APPROVED_BOQ_LINE_SUMMARY_REVISION_BATCH_SIZE,
        ).map((revision) => revision.id));
    const [lineGroups, detailRows] = await Promise.all([
      revisionIdBatches.length === 0 ? Promise.resolve([]) : Promise.all(revisionIdBatches.map((revisionIds) =>
        prisma.$queryRaw<ApprovedBoqLineAggregateRow[]>(Prisma.sql`
        SELECT line."boqRevisionId", line."categoryId", category."name" AS "categoryName", COUNT(*) AS "lineCount",
          COALESCE(SUM(line."quantity"), 0) AS "totalQty",
          COALESCE(SUM(COALESCE(line."quantity", 0) * CASE WHEN line."aiUnitCost" > 0 THEN line."aiUnitCost" ELSE 100 END), 0) AS "estimatedValue"
        FROM "boq_lines" AS line
        LEFT JOIN "categories" AS category
          ON category."id" = line."categoryId" AND category."tenantId" = ${ctx.tenantId}
        WHERE line."tenantId" = ${ctx.tenantId}
          AND line."boqRevisionId" IN (${Prisma.join(revisionIds)})
          AND line."isDeleted" = false
        GROUP BY line."boqRevisionId", line."categoryId", category."name"
        ORDER BY "boqRevisionId" ASC, COALESCE("categoryId", '') ASC
        `),
      )).then((groups) => groups.flat()),
      query.revisionId && approvedRevisions.length > 0
        ? prisma.boqLine.findMany({
          where: {
            tenantId: ctx.tenantId,
            boqRevisionId: query.revisionId,
            isDeleted: false,
          },
          orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
          take: query.linePageSize + 1,
          select: {
            id: true, lineNumber: true, itemCode: true, standardDescription: true, originalDescription: true,
            specification: true, categoryId: true, subcategoryId: true, uomRaw: true, quantity: true, aiUnitCost: true,
            category: { select: { name: true } }, uom: { select: { code: true } },
          },
        })
        : Promise.resolve([]),
    ]);
    const detailLines = detailRows.slice(0, query.linePageSize);
    const detailHasMore = detailRows.length > query.linePageSize;
    const detailNextCursor = detailHasMore && detailLines.length > 0
      ? encodeBoqLineCursor(detailLines[detailLines.length - 1])
      : null;
    const groupsByRevision = new Map<string, typeof lineGroups>();
    for (const group of lineGroups) {
      const groups = groupsByRevision.get(group.boqRevisionId) || [];
      groups.push(group);
      groupsByRevision.set(group.boqRevisionId, groups);
    }

    // Compute summary metrics per approved revision
    const formatted = approvedRevisions.map((rev) => {
      // Calculate benchmark value and category breakdown
      const categoriesMap: Record<string, { category: string; lineCount: number; totalQty: number; estimatedValue: number }> = {};
      let totalBenchmarkValue = 0;

      const revisionLineGroups = groupsByRevision.get(rev.id) || [];
      const summaryGroups = revisionLineGroups.map((group) => ({
        category: group.categoryName || 'General',
        lineCount: Number(group.lineCount || 0),
        quantity: Number(group.totalQty || 0),
        estimatedValue: Number(group.estimatedValue || 0),
      }));

      for (const line of summaryGroups) {
        const catName = line.category;
        totalBenchmarkValue += line.estimatedValue;

        if (!categoriesMap[catName]) {
          categoriesMap[catName] = {
            category: catName,
            lineCount: 0,
            totalQty: 0,
            estimatedValue: 0,
          };
        }
        categoriesMap[catName].lineCount += line.lineCount;
        categoriesMap[catName].totalQty += line.quantity;
        categoriesMap[catName].estimatedValue += line.estimatedValue;
      }

      return {
        id: rev.id,
        boqId: rev.boqId,
        boqCode: rev.boq.boqCode || `BOQ-${rev.boq.project.projectCode}`,
        costCentre: rev.costCentre ? `${rev.costCentre.code} - ${rev.costCentre.name}` : undefined,
        projectId: rev.boq.project.id,
        projectCode: rev.boq.project.projectCode,
        projectName: rev.boq.project.name,
        location: [rev.boq.project.city, rev.boq.project.state].filter(Boolean).join(', ') || rev.boq.project.location || '—',
        approvedRevisionCode: rev.revisionCode,
        approvedAt: rev.approvedAt,
        approvedBy: rev.approvedBy?.name || rev.approvedBy?.email || 'Project Approver',
        totalLines: summaryGroups.reduce((count, group) => count + group.lineCount, 0),
        estimatedBenchmarkValue: totalBenchmarkValue,
        categories: Object.values(categoriesMap),
        rfqCount: rev._count?.rfqs || 0,
        ...(query.revisionId ? {
          lines: detailLines.map((line) => ({
            id: line.id,
            lineNumber: line.lineNumber || line.itemCode || 'L-1',
            description: interpolateUiString(UI_STRINGS.common.value1, { value1: line.standardDescription || line.originalDescription }),
            specification: line.specification || 'Standard commercial grade',
            category: line.category?.name || 'General',
            subcategory: line.subcategoryId || '',
            uom: line.uom?.code || line.uomRaw || 'NOS',
            quantity: line.quantity,
            benchmarkRate: Number(line.aiUnitCost) > 0 ? Number(line.aiUnitCost) : 100,
            benchmarkAmount: (line.quantity || 0) * (Number(line.aiUnitCost) > 0 ? Number(line.aiUnitCost) : 100),
          })),
          linePagination: {
            total: summaryGroups.reduce((count, group) => count + group.lineCount, 0),
            pageSize: query.linePageSize,
            hasMore: detailHasMore,
            nextCursor: detailNextCursor,
          },
        } : {}),
      };
    });

    return apiSuccess({
      approvedBoqs: formatted, total, page: query.page, pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize), hasMore: query.page * query.pageSize < total,
    });
  } catch (error) {
    await writeStructuredLog('error', 'procurement.approved_boq_register_read_failed', {
      operation: 'list_approved_boqs', route: '/api/procurement/approved-boqs', requestId: req.headers.get('x-request-id'),
      tenantId: ctx.tenantId, page: query.page, pageSize: query.pageSize, searchLength: query.search.length,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToFetchApprovedBoqs, 500);
  }
}
