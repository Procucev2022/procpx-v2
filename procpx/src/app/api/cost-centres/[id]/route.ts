// src/app/api/cost-centres/[id]/route.ts - Cost Centre Details & Updates
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth('COST_CENTRE_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  const cc = await prisma.costCentre.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      project: true,
      budgets: true,
      budgetContributions: {
        include: {
          boq: true,
          boqRevision: true,
          approvals: true,
        },
      },
      budgetTransactions: {
        orderBy: { budgetDate: 'desc' },
      },
      prs: {
        include: {
          approvals: true,
          _count: { select: { lines: true } },
        },
      },
      boqs: {
        include: {
          revisions: {
            orderBy: { revisionNumber: 'desc' },
            take: 1,
          },
        },
      },
    },
  });

  if (!cc) return apiError('Cost centre not found.', 404);

  const totalBudget = cc.budgets.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
  const approvedBudget = cc.budgets.reduce((sum, b) => sum + (b.approvedAmount || 0), 0);
  const ratePerSqFt = cc.areaSqFt && cc.areaSqFt > 0 ? approvedBudget / cc.areaSqFt : null;

  return apiSuccess({
    ...cc,
    totalBudget,
    approvedBudget,
    ratePerSqFt: ratePerSqFt !== null ? Math.round(ratePerSqFt * 100) / 100 : null,
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth('COST_CENTRE_EDIT');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  const existing = await prisma.costCentre.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) return apiError('Cost centre not found.', 404);

  try {
    const body = await req.json();
    const { name, description, areaSqFt, location, floorZone, status } = body;

    const updated = await prisma.costCentre.update({
      where: { id },
      data: {
        name: name !== undefined ? name.trim() : existing.name,
        description: description !== undefined ? description?.trim() : existing.description,
        areaSqFt: areaSqFt !== undefined ? (areaSqFt ? parseFloat(areaSqFt) : null) : existing.areaSqFt,
        location: location !== undefined ? location?.trim() : existing.location,
        floorZone: floorZone !== undefined ? floorZone?.trim() : existing.floorZone,
        status: status !== undefined ? status : existing.status,
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        projectId: existing.projectId,
        entityType: 'COST_CENTRE',
        entityId: id,
        action: 'UPDATE',
        description: `Cost Centre updated: ${updated.code} - ${updated.name}`,
        oldValue: JSON.stringify(existing),
        newValue: JSON.stringify(updated),
      },
    });

    return apiSuccess(updated);
  } catch (err: any) {
    return apiError(err.message || 'Failed to update cost centre.', 500);
  }
}
