// app/api/boq/route.ts - List and Create BOQs
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';

export async function GET(req: NextRequest) {
  const ctx = await requireAuth('BOQ_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = parseInt(searchParams.get('pageSize') || '50');
  const status = searchParams.get('status') || '';
  const projectId = searchParams.get('projectId') || '';
  const costCentreId = searchParams.get('costCentreId') || '';
  const purpose = searchParams.get('purpose') || '';
  const search = searchParams.get('search') || '';

  const where: any = {
    tenantId: ctx.tenantId,
  };

  if (status) where.status = status;
  if (projectId) where.projectId = projectId;
  if (costCentreId) where.costCentreId = costCentreId;
  if (purpose) where.purpose = purpose;
  if (search) {
    where.OR = [
      { boqCode: { contains: search } },
      { title: { contains: search } },
      { category: { contains: search } },
      { project: { name: { contains: search } } },
      { project: { projectCode: { contains: search } } },
    ];
  }

  const [total, boqs] = await Promise.all([
    prisma.boq.count({ where }),
    prisma.boq.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
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
          take: 1,
          include: {
            lines: {
              select: {
                id: true,
                aiTotalCost: true,
                quantity: true,
              },
            },
          },
        },
      },
    }),
  ]);

  // Compute estimated total value for each BOQ
  const formattedBoqs = boqs.map(b => {
    const latestRev = b.revisions[0];
    const estimatedValue = latestRev?.lines?.reduce((sum, l) => sum + (l.aiTotalCost || 0), 0) || 0;
    return {
      ...b,
      estimatedValue,
      latestRevision: latestRev ? {
        id: latestRev.id,
        revisionCode: latestRev.revisionCode,
        revisionNumber: latestRev.revisionNumber,
        status: latestRev.status,
        sourceType: latestRev.sourceType,
        totalLines: latestRev.totalLines || latestRev.lines?.length || 0,
        createdAt: latestRev.createdAt,
      } : null,
    };
  });

  return apiSuccess({
    data: formattedBoqs,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BOQ_CREATE');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const {
      projectId,
      costCentreId,
      title,
      description,
      category,
      purpose,
      sector,
      projectType,
      areaSqFt,
      floorZone,
      requiredDate,
      scope,
      referenceDrawing,
      remarks,
    } = body;

    // 1. Mandatory Field Validations
    if (!projectId) return apiError('Project is required', 400);
    if (!costCentreId) return apiError('Cost Centre is required', 400);
    if (!title || !title.trim()) return apiError('BOQ Title / Name is required', 400);
    if (!category || (Array.isArray(category) && category.length === 0)) {
      return apiError('BOQ Category is required', 400);
    }
    if (!purpose || !['BUDGET', 'PR'].includes(purpose)) {
      return apiError('BOQ Purpose (BUDGET or PR) is required', 400);
    }

    // 2. Verify Project & Cost Centre
    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId: ctx.tenantId },
    });
    if (!project) return apiError('Project not found or accessible', 404);

    const costCentre = await prisma.costCentre.findFirst({
      where: { id: costCentreId, projectId, tenantId: ctx.tenantId },
    });
    if (!costCentre) return apiError('Cost Centre does not belong to the selected Project', 400);

    // 3. Generate sequential BOQ Code
    const count = await prisma.boq.count({
      where: { tenantId: ctx.tenantId, projectId },
    });
    const boqCode = `BOQ-${project.projectCode}-${String(count + 1).padStart(3, '0')}`;

    const categoryStr = Array.isArray(category) ? category.join(', ') : category;

    // 4. Create BOQ Master record
    const boq = await prisma.boq.create({
      data: {
        tenantId: ctx.tenantId,
        projectId,
        costCentreId,
        boqCode,
        title: title.trim(),
        description: (description || scope || '')?.trim() || null,
        category: categoryStr,
        scope: scope?.trim() || null,
        purpose,
        status: 'DRAFT',
        createdBy: ctx.userEmail || ctx.userId,
      },
    });

    // 5. Create initial Revision R0
    const boqRevision = await prisma.boqRevision.create({
      data: {
        tenantId: ctx.tenantId,
        boqId: boq.id,
        costCentreId,
        revisionNumber: 0,
        revisionCode: 'R0',
        status: 'DRAFT',
        preparationStatus: 'DRAFT',
        budgetStatus: purpose === 'BUDGET' ? 'BUDGET_DRAFT' : 'NOT_ADDED_TO_BUDGET',
        prStatus: purpose === 'PR' ? 'PR_DRAFT' : 'PR_NOT_CREATED',
        sourceType: 'NOT_YET_SELECTED',
        notes: JSON.stringify({
          sector: sector || project.sector || 'RETAIL',
          projectType: projectType || project.projectType || 'Standard Fitout',
          areaSqFt: areaSqFt || costCentre.areaSqFt || project.areaSqFt || null,
          floorZone: floorZone || costCentre.floorZone || null,
          requiredDate: requiredDate || null,
          referenceDrawing: referenceDrawing || null,
          remarks: remarks || null,
        }),
        createdById: ctx.userId,
      },
    });

    // 6. Record Audit Log
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          projectId,
          entityType: 'BOQ',
          entityId: boq.id,
          action: 'BOQ_CREATED',
          description: `Created new BOQ ${boq.boqCode} (${boq.title || 'Untitled'}) for Project ${project.projectCode}, Cost Centre: ${costCentre.code}, Purpose: ${purpose}`,
          newValue: JSON.stringify({
            boqCode: boq.boqCode,
            title: boq.title,
            projectId,
            costCentreId,
            category: categoryStr,
            purpose,
            timestamp: new Date().toISOString(),
          }),
        },
      });
    } catch (auditErr) {
      console.warn('Audit log write error:', auditErr);
    }

    return apiSuccess({
      success: true,
      boq: {
        ...boq,
        project,
        costCentre,
        latestRevision: boqRevision,
        revisions: [boqRevision],
      },
      boqId: boq.id,
      revisionId: boqRevision.id,
      boqCode: boq.boqCode,
    }, 201);
  } catch (err: any) {
    console.error('Create BOQ error:', err);
    return apiError(err.message || 'Failed to create BOQ record', 500);
  }
}

