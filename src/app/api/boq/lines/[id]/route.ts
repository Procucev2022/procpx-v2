// app/api/boq/lines/[id]/route.ts - Dedicated single BOQ line-item endpoint
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';

import { computeLineCostBreakdown } from '@/lib/boq-cost-breakdown';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('BOQ_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;
  if (!id) return apiError(UI_STRINGS.appApiBoqLinesIdRoute.lineIDIsRequired, 400, { route: '/api/boq/lines/[id]', method: 'GET' });

  const line = await prisma.boqLine.findFirst({
    where: {
      id,
      tenantId: ctx.tenantId,
      isDeleted: false,
    },
    include: {
      category: { select: { id: true, name: true, code: true } },
      subcategory: { select: { id: true, name: true, code: true } },
      uom: { select: { id: true, code: true, name: true } },
      revision: {
        include: {
          boq: {
            include: {
              project: { select: { id: true, name: true, projectCode: true } },
              costCentre: { select: { id: true, name: true, code: true } },
            },
          },
          createdBy: { select: { id: true, name: true, email: true } },
          approvedBy: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!line) {
    return apiError(UI_STRINGS.appApiBoqLinesIdRoute.bOQLineItemNotFound, 404, { route: '/api/boq/lines/[id]', method: 'GET' });
  }

  const enrichedLine = {
    ...line,
    costBreakdown: computeLineCostBreakdown(line),
  };

  return apiSuccess({ line: enrichedLine });
}
