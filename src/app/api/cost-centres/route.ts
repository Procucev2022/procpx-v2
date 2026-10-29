// src/app/api/cost-centres/route.ts - Cost Centre Management API
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';

export async function GET(req: NextRequest) {
  const ctx = await requireAuth('COST_CENTRE_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId') || '';
  const search = searchParams.get('search') || '';

  const where: any = {
    tenantId: ctx.tenantId,
  };

  if (projectId) where.projectId = projectId;
  if (search) {
    where.OR = [
      { code: { contains: search } },
      { name: { contains: search } },
      { location: { contains: search } },
      { floorZone: { contains: search } },
    ];
  }

  const costCentres = await prisma.costCentre.findMany({
    where,
    orderBy: { code: 'asc' },
    include: {
      project: {
        select: {
          id: true,
          projectCode: true,
          name: true,
          areaSqFt: true,
        },
      },
      budgets: {
        select: {
          id: true,
          totalAmount: true,
          approvedAmount: true,
          pendingAmount: true,
          status: true,
        },
      },
      _count: {
        select: {
          boqs: true,
          prs: true,
          budgetContributions: true,
          budgetTransactions: true,
        },
      },
    },
  });

  // Calculate ₹ / Sqft for each cost centre
  const enriched = costCentres.map(cc => {
    const totalBudget = cc.budgets.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
    const approvedBudget = cc.budgets.reduce((sum, b) => sum + (b.approvedAmount || 0), 0);
    const pendingBudget = cc.budgets.reduce((sum, b) => sum + (b.pendingAmount || 0), 0);
    const ratePerSqFt = cc.areaSqFt && cc.areaSqFt > 0 ? approvedBudget / cc.areaSqFt : null;

    return {
      ...cc,
      totalBudget,
      approvedBudget,
      pendingBudget,
      ratePerSqFt: ratePerSqFt !== null ? Math.round(ratePerSqFt * 100) / 100 : null,
    };
  });

  return apiSuccess(enriched);
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('COST_CENTRE_CREATE');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const { projectId, code, name, description, areaSqFt, location, floorZone } = body;

    if (!projectId || !code || !name) {
      return apiError('Project ID, Cost Centre Code, and Name are mandatory.', 400);
    }

    // Verify project belongs to tenant
    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId: ctx.tenantId },
    });
    if (!project) {
      return apiError('Project not found or inaccessible.', 404);
    }

    // Check duplicate code within project
    const existing = await prisma.costCentre.findUnique({
      where: {
        tenantId_projectId_code: {
          tenantId: ctx.tenantId,
          projectId,
          code: code.trim(),
        },
      },
    });
    if (existing) {
      return apiError(`Cost Centre Code ${code} already exists for this project.`, 409);
    }

    const costCentre = await prisma.costCentre.create({
      data: {
        tenantId: ctx.tenantId,
        projectId,
        code: code.trim(),
        name: name.trim(),
        description: description?.trim() || null,
        areaSqFt: areaSqFt ? parseFloat(areaSqFt) : null,
        location: location?.trim() || null,
        floorZone: floorZone?.trim() || null,
        createdBy: ctx.userId,
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        projectId,
        entityType: 'COST_CENTRE',
        entityId: costCentre.id,
        action: 'COST_CENTRE_CREATED',
        description: `Cost Centre created: ${costCentre.code} - ${costCentre.name} (${costCentre.areaSqFt || 0} sqft)`,
        newValue: JSON.stringify(costCentre),
      },
    });

    return apiSuccess(costCentre, 201);
  } catch (err: any) {
    return apiError(err.message || 'Failed to create cost centre.', 500);
  }
}
