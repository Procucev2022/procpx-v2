// src/app/api/pr/[id]/route.ts - Procurement Request Details API
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { getPrLinePaginationMetadata, paginatePrLineRecords } from '@/lib/pr-line-pagination';
import { PR_DETAIL_LINE_PAGE_SIZE } from '@/lib/pr-line-pagination.constants';
import { PR_DETAIL_LINE_SELECT, PR_DETAIL_RFQ_PREVIEW_LIMIT } from './route.constants';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth('PR_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;
  const startedAt = Date.now();

  try {
    const pr = await prisma.procurementRequest.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: {
        id: true,
        tenantId: true,
        projectId: true,
        costCentreId: true,
        boqId: true,
        boqRevisionId: true,
        prNumber: true,
        title: true,
        status: true,
        purpose: true,
        totalEstimatedValue: true,
        totalLines: true,
        requestedBy: true,
        requestedDate: true,
        requiredDate: true,
        projectApprovedAt: true,
        projectApprovedBy: true,
        releasedAt: true,
        releasedBy: true,
        createdAt: true,
        updatedAt: true,
        project: { select: { id: true, name: true, projectCode: true } },
        costCentre: { select: { id: true, code: true, name: true } },
        boq: { select: { id: true, boqCode: true } },
        boqRevision: { select: { id: true, revisionCode: true } },
        lines: {
          select: PR_DETAIL_LINE_SELECT,
          orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
          take: PR_DETAIL_LINE_PAGE_SIZE + 1,
        },
        _count: { select: { rfqs: true } },
        rfqs: {
          select: {
            id: true,
            rfqNumber: true,
            title: true,
            status: true,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: PR_DETAIL_RFQ_PREVIEW_LIMIT + 1,
        },
      },
    });

    if (!pr) return apiError(UI_STRINGS.common.procurementRequestNotFound, 404);
    const linePage = paginatePrLineRecords(pr.lines || []);
    const { _count, rfqs: rfqRows, ...prDetail } = pr;
    const rfqPreview = (rfqRows || []).slice(0, PR_DETAIL_RFQ_PREVIEW_LIMIT);
    const rfqCount = typeof _count?.rfqs === 'number' ? _count.rfqs : (rfqRows || []).length;
    return apiSuccess({
      ...prDetail,
      lines: linePage.lines,
      linePagination: getPrLinePaginationMetadata(linePage),
      rfqs: rfqPreview,
      rfqCount,
      rfqPreviewTruncated: rfqCount > rfqPreview.length,
    });
  } catch (error) {
    await writeStructuredLog('error', 'purchase_request.detail_read_failed', {
      operation: 'read_purchase_request_detail',
      route: '/api/pr/[id]',
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
