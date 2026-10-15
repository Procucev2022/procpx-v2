// app/api/projects/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';

// Generate next project code strictly matching CPX-P-XXXXXX format
async function nextProjectCode(tenantId: string): Promise<string> {
  const existing = await prisma.project.findMany({
    where: {
      tenantId,
      projectCode: { startsWith: 'CPX-P-' },
    },
    select: { projectCode: true },
  });

  let maxNum = 0;
  for (const p of existing) {
    const match = p.projectCode.match(/^CPX-P-(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }

  let nextNum = maxNum + 1;
  while (true) {
    const candidate = `CPX-P-${String(nextNum).padStart(6, '0')}`;
    const collision = await prisma.project.findFirst({
      where: { tenantId, projectCode: candidate },
      select: { id: true },
    });
    if (!collision) {
      return candidate;
    }
    nextNum++;
  }
}

export async function GET(req: NextRequest) {
  const ctx = await requireAuth('PROJECT_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = parseInt(searchParams.get('pageSize') || '20');
  const search = searchParams.get('search') || '';
  const status = searchParams.get('status') || '';
  const sector = searchParams.get('sector') || '';

  const where: any = { tenantId: ctx.tenantId };
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { projectCode: { contains: search } },
      { city: { contains: search } },
    ];
  }
  if (status) where.status = status;
  if (sector) where.sector = sector;

  const [total, projects] = await Promise.all([
    prisma.project.count({ where }),
    prisma.project.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        boqs: {
          select: { id: true, status: true, revisions: { select: { id: true, totalLines: true, status: true }, orderBy: { revisionNumber: 'desc' }, take: 1 } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        _count: { select: { team: true } },
      },
    }),
  ]);

  return apiSuccess({ data: projects, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth('PROJECT_CREATE');
    if (!isApiContext(ctx)) return ctx;

    const body = await req.json();
    const { name, description, sector, projectType, location, address, city, state, country, areaSqFt, costCentre, projectOwner, budget, currency, businessUnit, numberOfFloors, numberOfUnits, startDate, targetCompletion } = body;

    if (!name?.trim()) return apiError('Project name is required.');
    if (!sector) return apiError('Sector is required.');
    if (!projectType) return apiError('Project type is required.');

    let projectCode = await nextProjectCode(ctx.tenantId);

    let project: any;
    let attempts = 0;
    while (attempts < 3) {
      try {
        project = await prisma.project.create({
          data: {
            tenantId: ctx.tenantId,
            projectCode,
            name: name.trim(),
            description: description?.trim() || null,
            sector,
            projectType,
            location: location?.trim() || null,
            address: address?.trim() || null,
            city: city?.trim() || null,
            state: state?.trim() || null,
            country: country?.trim() || 'India',
            areaSqFt: areaSqFt && !isNaN(parseFloat(areaSqFt)) ? parseFloat(areaSqFt) : null,
            costCentre: costCentre?.trim() || null,
            projectOwner: projectOwner?.trim() || null,
            budget: budget && !isNaN(parseFloat(budget)) ? parseFloat(budget) : null,
            currency: currency?.trim() || 'INR',
            businessUnit: businessUnit?.trim() || null,
            numberOfFloors: numberOfFloors && !isNaN(parseInt(numberOfFloors, 10)) ? parseInt(numberOfFloors, 10) : null,
            numberOfUnits: numberOfUnits && !isNaN(parseInt(numberOfUnits, 10)) ? parseInt(numberOfUnits, 10) : null,
            startDate: startDate ? new Date(startDate) : null,
            targetCompletion: targetCompletion ? new Date(targetCompletion) : null,
            status: 'DRAFT',
            createdBy: ctx.userId,
          },
        });
        break;
      } catch (createErr: any) {
        if (createErr?.code === 'P2002' && attempts < 2) {
          attempts++;
          projectCode = await nextProjectCode(ctx.tenantId);
          continue;
        }
        throw createErr;
      }
    }

    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      projectId: project.id,
      entityType: 'PROJECT',
      entityId: project.id,
      action: 'CREATE',
      description: `Project ${projectCode} created: ${name.trim()}`,
      newValue: { projectCode, name: name.trim(), sector, projectType },
    });

    return apiSuccess(project, 201);
  } catch (error: any) {
    console.error('[POST /api/projects error]:', error);
    if (error?.code === 'P2002') {
      return apiError('A project with this project code already exists. Please retry.', 409);
    }
    return apiError(error?.message || 'Failed to create project.', 500);
  }
}
