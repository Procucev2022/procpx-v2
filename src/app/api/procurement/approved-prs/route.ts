// src/app/api/procurement/approved-prs/route.ts - Approved PRs for Procurement User Sourcing
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError, getListPageWindow } from '@/lib/api-utils';
import { APPROVED_PR_MAX_PAGE_SIZE, APPROVED_PR_MAX_SEARCH_LENGTH } from './route.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { UI_STRINGS } from '@/lib/ui-strings.constants';

export async function GET(req: NextRequest) {
  const ctx = await requireAuth('PR_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const pageWindow = getListPageWindow(searchParams);
  const pageSize = Math.min(pageWindow.pageSize, APPROVED_PR_MAX_PAGE_SIZE);
  const search = (searchParams.get('search') || '').trim().slice(0, APPROVED_PR_MAX_SEARCH_LENGTH);

  const where: any = {
    tenantId: ctx.tenantId,
    status: { in: ['PR_RELEASED_TO_PROCUREMENT', 'PR_APPROVED'] },
  };

  if (search) {
    where.OR = [
      { prNumber: { contains: search } },
      { title: { contains: search } },
      { project: { name: { contains: search } } },
      { costCentre: { name: { contains: search } } },
    ];
  }

  try {
    const [rows, total, valueAggregate, sourcingActiveCount] = await Promise.all([
    prisma.procurementRequest.findMany({
      where,
      orderBy: [{ releasedAt: 'desc' }, { id: 'desc' }],
      skip: pageWindow.skip,
      take: pageSize,
      select: {
        id: true, prNumber: true, title: true, status: true, totalEstimatedValue: true, releasedAt: true,
        project: { select: { id: true, projectCode: true, name: true, city: true } },
        costCentre: { select: { id: true, code: true, name: true } },
        _count: { select: { lines: true, rfqs: true } },
      },
    }),
    prisma.procurementRequest.count({ where }),
    prisma.procurementRequest.aggregate({ where, _sum: { totalEstimatedValue: true } }),
    prisma.procurementRequest.count({ where: { ...where, rfqs: { some: {} } } }),
    ]);
    const approvedPrs = rows.map(({ _count, ...pr }) => ({ ...pr, lineCount: _count.lines, rfqCount: _count.rfqs }));

    return apiSuccess({
      data: approvedPrs,
      total,
      page: pageWindow.page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasMore: pageWindow.page * pageSize < total,
      totalEstimatedValue: Number(valueAggregate._sum.totalEstimatedValue || 0),
      sourcingActiveCount,
    });
  } catch (error) {
    await writeStructuredLog('error', 'procurement.approved_pr_register_read_failed', {
      operation: 'list_approved_prs', route: '/api/procurement/approved-prs', requestId: req.headers.get('x-request-id'),
      tenantId: ctx.tenantId, page: pageWindow.page, pageSize, searchLength: search.length,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToFetchApprovedPrs, 500);
  }
}
