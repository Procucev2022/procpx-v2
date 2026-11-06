// src/app/api/boq/[revisionId]/route.ts - Get single BOQ or Revision details
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { computeLineCostBreakdown } from '@/lib/boq-cost-breakdown';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { BOQ_DETAIL_LATEST_REVISION_LIMIT } from './route.constants';


export async function GET(req: NextRequest, { params }: { params: Promise<{ revisionId: string }> }) {
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
      lines: {
        where: { isDeleted: false },
        orderBy: [{ lineNumber: 'asc' }],
        include: {
          category: { select: { id: true, name: true } },
          subcategory: { select: { id: true, name: true } },
          uom: { select: { id: true, code: true, name: true } },
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
          include: {
            lines: {
              where: { isDeleted: false },
              orderBy: [{ lineNumber: 'asc' }],
              include: {
                category: { select: { id: true, name: true } },
                subcategory: { select: { id: true, name: true } },
                uom: { select: { id: true, code: true, name: true } },
              },
            },
          },
        },
      },
    });

    if (boq && boq.revisions.length > 0) {
      revision = boq.revisions[0];
    }
  }

  if (!boq && !revision) {
    return apiError(UI_STRINGS.appApiBoqRevisionIdRoute.bOQOrRevisionNotFound, 404);
  }

  const rawLines = revision?.lines || [];
  const lines = rawLines.map((l: any) => {
    let costBreakdown = null;
    if (l.aiReason) {
      try {
        const parsed = JSON.parse(l.aiReason);
        if (parsed.costBreakdown) costBreakdown = parsed.costBreakdown;
      } catch {}
    }
    if (!costBreakdown && l.aiUnitCost !== null && l.aiUnitCost !== undefined && Number(l.aiUnitCost) > 0) {
      costBreakdown = computeLineCostBreakdown(
        Number(l.aiUnitCost),
        l.quantity,
        l.category?.name,
        l.standardDescription || l.originalDescription
      );
    }
    return {
      ...l,
      costBreakdown,
    };
  });
  const totalValue = lines.reduce((sum: number, l: any) => sum + (l.aiTotalCost || 0), 0);

  return apiSuccess({
    boq: {
      ...boq,
      estimatedValue: totalValue,
    },
    revision,
    lines,
    totalLines: lines.length,
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
      return apiError(UI_STRINGS.appApiBoqRevisionIdRoute.bOQNotFound, 404);
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
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.failedToUpdateBoq }), 500);
  }
}

