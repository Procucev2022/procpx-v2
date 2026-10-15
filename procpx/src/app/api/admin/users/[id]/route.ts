// app/api/admin/users/[id]/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth('USER_EDIT');
  if (!isApiContext(ctx)) return ctx;
  const { id } = await params;

  const existing = await prisma.user.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) return apiError('User not found', 404);

  const body = await req.json();
  const { name, role, status } = body;

  const updated = await prisma.user.update({
    where: { id },
    data: {
      name: name?.trim() ?? existing.name,
      role: role ?? existing.role,
      status: status ?? existing.status,
      updatedBy: ctx.userId,
    },
    select: { id: true, email: true, name: true, role: true, status: true, updatedAt: true },
  });

  await createAuditLog({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    entityType: 'USER',
    entityId: id,
    action: 'UPDATE',
    description: `User ${existing.email} updated (Role: ${updated.role}, Status: ${updated.status})`,
    oldValue: { role: existing.role, status: existing.status },
    newValue: { role: updated.role, status: updated.status },
  });

  return apiSuccess(updated);
}
