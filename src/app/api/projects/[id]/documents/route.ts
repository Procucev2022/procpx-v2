// app/api/projects/[id]/documents/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth('PROJECT_VIEW');
  if (!isApiContext(ctx)) return ctx;
  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!project) return apiError('Project not found', 404);

  const docs = await prisma.projectDocument.findMany({
    where: { projectId: id, tenantId: ctx.tenantId },
    orderBy: { uploadedAt: 'desc' },
  });

  return apiSuccess(docs);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth('PROJECT_EDIT');
  if (!isApiContext(ctx)) return ctx;
  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!project) return apiError('Project not found', 404);

  const body = await req.json();
  const { name, fileType, fileSize, filePath, category } = body;

  if (!name?.trim()) return apiError('Document name is required');

  const doc = await prisma.projectDocument.create({
    data: {
      tenantId: ctx.tenantId,
      projectId: id,
      name: name.trim(),
      fileType: fileType || 'application/octet-stream',
      fileSize: fileSize || 0,
      filePath: filePath || `/uploads/${ctx.tenantId}/${id}/${name.trim()}`,
      uploadedBy: ctx.userId,
      category: category || 'OTHER',
    },
  });

  await createAuditLog({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    projectId: id,
    entityType: 'PROJECT',
    entityId: id,
    action: 'CREATE',
    description: `Project document added: ${doc.name} (${doc.category})`,
    newValue: { documentId: doc.id, name: doc.name, category: doc.category },
  });

  return apiSuccess(doc, 201);
}
