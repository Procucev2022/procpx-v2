// src/app/api/procurement/approved-prs/route.ts - Approved PRs for Procurement User Sourcing
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess } from '@/lib/api-utils';

export async function GET(req: NextRequest) {
  const ctx = await requireAuth('PR_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') || '';

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

  const approvedPrs = await prisma.procurementRequest.findMany({
    where,
    orderBy: { releasedAt: 'desc' },
    include: {
      project: { select: { id: true, projectCode: true, name: true, city: true } },
      costCentre: { select: { id: true, code: true, name: true, areaSqFt: true } },
      boq: { select: { id: true, boqCode: true } },
      boqRevision: { select: { id: true, revisionNumber: true, revisionCode: true } },
      lines: {
        select: {
          id: true,
          lineNumber: true,
          itemDescription: true,
          specification: true,
          category: true,
          uom: true,
          quantity: true,
          estimatedRate: true,
          estimatedValue: true,
        },
      },
      rfqs: {
        select: {
          id: true,
          rfqNumber: true,
          status: true,
        },
      },
    },
  });

  return apiSuccess(approvedPrs);
}
