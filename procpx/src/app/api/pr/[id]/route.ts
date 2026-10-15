// src/app/api/pr/[id]/route.ts - Procurement Request Details API
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth('PR_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  const pr = await prisma.procurementRequest.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      project: true,
      costCentre: true,
      boq: true,
      boqRevision: true,
      lines: {
        include: {
          boqLine: true,
        },
        orderBy: { lineNumber: 'asc' },
      },
      approvals: {
        orderBy: { timestamp: 'desc' },
      },
      rfqs: {
        select: {
          id: true,
          rfqNumber: true,
          title: true,
          status: true,
        },
      },
    },
  });

  if (!pr) return apiError('Procurement Request not found.', 404);

  return apiSuccess(pr);
}
