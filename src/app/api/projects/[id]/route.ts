// app/api/projects/[id]/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth('PROJECT_VIEW');
  if (!isApiContext(ctx)) return ctx;
  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id, tenantId: ctx.tenantId }, // tenant isolation
    include: {
      team: { include: { user: { select: { id: true, name: true, email: true, role: true } } } },
      boqs: {
        include: {
          revisions: {
            select: { id: true, revisionCode: true, status: true, totalLines: true, qualityScore: true, createdAt: true },
            orderBy: { revisionNumber: 'desc' },
          },
        },
      },
      documents: true,
      auditLogs: { orderBy: { createdAt: 'desc' }, take: 30, include: { user: { select: { name: true, email: true } } } },
    },
  });

  if (!project) return apiError('Project not found', 404);
  return apiSuccess(project);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth('PROJECT_EDIT');
  if (!isApiContext(ctx)) return ctx;
  const { id } = await params;

  const existing = await prisma.project.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) return apiError('Project not found', 404);

  const body = await req.json();
  const updated = await prisma.project.update({
    where: { id },
    data: {
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
    },
  });

  await createAuditLog({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    projectId: id,
    entityType: 'PROJECT',
    entityId: id,
    action: 'UPDATE',
    description: `Project ${existing.projectCode} updated`,
    oldValue: { status: existing.status, name: existing.name },
    newValue: { status: updated.status, name: updated.name },
  });

  return apiSuccess(updated);
}
