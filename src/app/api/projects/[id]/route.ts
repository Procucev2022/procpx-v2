// app/api/projects/[id]/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { runAuditedD1UpdateAtomically } from '@/lib/audited-update';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { writeStructuredLog } from '@/lib/observability/server-logger';


export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth('PROJECT_VIEW');
  if (!isApiContext(ctx)) return ctx;
  const { id } = await params;
  const startedAt = Date.now();

  let project;
  try {
    project = await prisma.project.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: {
        id: true,
        projectCode: true,
        name: true,
        description: true,
        sector: true,
        projectType: true,
        location: true,
        address: true,
        city: true,
        state: true,
        country: true,
        areaSqFt: true,
        costCentre: true,
        projectOwner: true,
        budget: true,
        currency: true,
        businessUnit: true,
        status: true,
        createdAt: true,
        team: {
          select: {
            id: true,
            projectRole: true,
            assignedAt: true,
            user: { select: { id: true, name: true, email: true, role: true } },
          },
          orderBy: [{ assignedAt: 'desc' }, { id: 'desc' }],
          take: 100,
        },
        boqs: {
          select: {
            id: true,
            boqCode: true,
            status: true,
            updatedAt: true,
            revisions: {
              select: { id: true, revisionCode: true, revisionNumber: true, status: true, totalLines: true, qualityScore: true, createdAt: true },
              orderBy: [{ revisionNumber: 'desc' }, { id: 'desc' }],
              take: 50,
            },
            _count: { select: { revisions: true } },
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: 1,
        },
        documents: {
          select: { id: true, name: true, fileType: true, fileSize: true, uploadedBy: true, uploadedAt: true, category: true },
          orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
          take: 50,
        },
        auditLogs: {
          select: {
            id: true,
            action: true,
            description: true,
            createdAt: true,
            user: { select: { name: true, email: true } },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 30,
        },
        _count: { select: { team: true, documents: true } },
      },
    });
  } catch (error) {
    await writeStructuredLog('error', 'project.detail_read_failed', {
      operation: 'read_project_detail',
      route: '/api/projects/[id]',
      requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      projectId: id,
      durationMs: Date.now() - startedAt,
      error: { name: error instanceof Error ? error.name : 'UnknownError' },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToFetchProjects, 500);
  }

  if (!project) return apiError(UI_STRINGS.common.projectNotFound, 404, { route: '/api/projects/[id]', method: 'GET' });
  return apiSuccess(project);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth('PROJECT_EDIT');
  if (!isApiContext(ctx)) return ctx;
  const { id } = await params;

  const existing = await prisma.project.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) return apiError(UI_STRINGS.common.projectNotFound, 404, { route: '/api/projects/[id]', method: 'PUT' });

  const body = await req.json();
  const updateData = {
      name: body.name ?? existing.name,
      description: body.description ?? existing.description,
      sector: body.sector ?? existing.sector,
      projectType: body.projectType ?? existing.projectType,
      location: body.location ?? existing.location,
      address: body.address ?? existing.address,
      city: body.city ?? existing.city,
      state: body.state ?? existing.state,
      country: body.country ?? existing.country,
      areaSqFt: body.areaSqFt ? parseFloat(body.areaSqFt) : existing.areaSqFt,
      costCentre: body.costCentre ?? existing.costCentre,
      projectOwner: body.projectOwner ?? existing.projectOwner,
      budget: body.budget ? parseFloat(body.budget) : existing.budget,
      currency: body.currency ?? existing.currency,
      status: body.status ?? existing.status,
      updatedBy: ctx.userId,
  };
  const updated = await runAuditedD1UpdateAtomically({
    table: 'project',
    id,
    tenantId: ctx.tenantId,
    data: updateData,
    route: '/api/projects/[id]',
    requestId: req.headers.get('x-request-id'),
    audit: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      projectId: id,
      entityType: 'PROJECT',
      entityId: id,
      action: 'UPDATE',
      description: interpolateUiString(UI_STRINGS.appApiProjectsIdRoute.projectProjectCodeUpdated, { "projectCode": existing.projectCode }),
      oldValue: { status: existing.status, name: existing.name },
      newValue: { status: updateData.status, name: updateData.name },
    },
  });

  return apiSuccess(updated);
}
