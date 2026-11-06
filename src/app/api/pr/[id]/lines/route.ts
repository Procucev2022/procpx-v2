import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError, apiSuccess, isApiContext, requireAuth } from '@/lib/api-utils';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { decodePrLineCursor, getPrLinePaginationMetadata, paginatePrLineRecords } from '@/lib/pr-line-pagination';
import { PR_DETAIL_LINE_PAGE_SIZE } from '@/lib/pr-line-pagination.constants';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import type { PrLinesRouteContext } from '@app-types/api/pr-lines.types';
import { PR_DETAIL_LINE_SELECT } from '../route.constants';

export async function GET(req: NextRequest, { params }: PrLinesRouteContext) {
  const ctx = await requireAuth('PR_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;
  const startedAt = Date.now();
  const cursorParam = new URL(req.url).searchParams.get('cursor');
  const cursor = cursorParam === null ? null : decodePrLineCursor(cursorParam);
  if (cursorParam !== null && !cursor) {
    return apiError(UI_STRINGS.appApiPrIdLinesRoute.invalidPurchaseRequestLineCursor, 400);
  }

  try {
    const pr = await prisma.procurementRequest.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: {
        id: true,
        lines: {
          where: {
            tenantId: ctx.tenantId,
            ...(cursor ? {
              OR: [
                { lineNumber: { gt: cursor.lineNumber } },
                { lineNumber: cursor.lineNumber, id: { gt: cursor.id } },
              ],
            } : {}),
          },
          select: PR_DETAIL_LINE_SELECT,
          orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
          take: PR_DETAIL_LINE_PAGE_SIZE + 1,
        },
      },
    });

    if (!pr) return apiError(UI_STRINGS.common.procurementRequestNotFound, 404);
    const linePage = paginatePrLineRecords(pr.lines);
    return apiSuccess({
      lines: linePage.lines,
      linePagination: getPrLinePaginationMetadata(linePage),
    });
  } catch (error) {
    await writeStructuredLog('error', 'purchase_request.lines_read_failed', {
      operation: 'read_purchase_request_lines',
      route: '/api/pr/[id]/lines',
      requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      prId: id,
      durationMs: Date.now() - startedAt,
      error: { name: error instanceof Error ? error.name : 'UnknownError' },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToFetchProcurementRequests, 500);
  }
}
