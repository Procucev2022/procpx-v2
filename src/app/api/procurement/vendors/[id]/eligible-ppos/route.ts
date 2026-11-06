import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError, apiSuccess, getListPageWindow, isApiContext, requireAuth } from '@/lib/api-utils';
import { getUserProjectAccessFilter } from '@/lib/project-auth';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import type { Prisma } from '@prisma/client';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth('VENDOR_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { id: vendorId } = await params;
  const pageWindow = getListPageWindow(new URL(req.url).searchParams);
  const pageSize = pageWindow.pageSize;

  try {
    const vendor = await prisma.vendor.findFirst({
      where: {
        id: vendorId,
        OR: [{ tenantId: ctx.tenantId }, { vendorType: 'PROCUCEV_VENDOR' }],
      },
      select: { id: true },
    });
    if (!vendor) return apiError(UI_STRINGS.common.vendorNotFoundOrAccessDenied2, 404);
    if (ctx.role === 'PROCUREMENT_USER') {
      return apiSuccess({
        eligiblePpos: [],
        pagination: { page: 1, pageSize, total: 0, hasMore: false },
      });
    }

    const projectAccessFilter = await getUserProjectAccessFilter(ctx.userId, ctx.role, ctx.tenantId);
    const where: Prisma.PpoWhereInput = {
      tenantId: ctx.tenantId,
      vendorId,
      status: { notIn: ['DRAFT', 'CANCELLED'] },
      OR: [
        { vendorRating: { is: null } },
        { vendorRating: { is: { status: { notIn: ['APPROVED', 'SUBMITTED'] } } } },
      ],
      ...(projectAccessFilter ? { project: { is: projectAccessFilter } } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.ppo.findMany({
        where,
        skip: pageWindow.skip,
        take: pageSize + 1,
        select: { id: true, ppoNumber: true, title: true, totalValue: true, status: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      prisma.ppo.count({ where }),
    ]);
    const hasMore = rows.length > pageSize;

    return apiSuccess({
      eligiblePpos: hasMore ? rows.slice(0, pageSize) : rows,
      pagination: { page: pageWindow.page, pageSize, total, hasMore },
    });
  } catch (error) {
    await writeStructuredLog('error', 'vendor.eligible_ppos_read_failed', {
      operation: 'list_eligible_ppos',
      route: '/api/procurement/vendors/[id]/eligible-ppos',
      requestId: req.headers.get('x-request-id') || null,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      role: ctx.role,
      vendorId,
      page: pageWindow.page,
      pageSize,
      error: error instanceof Error
        ? { name: error.name, message: error.message.slice(0, 400) }
        : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToFetchEligiblePpos, 500);
  }
}
