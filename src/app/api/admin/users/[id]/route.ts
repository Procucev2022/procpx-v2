// app/api/admin/users/[id]/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { runAuditedD1UpdateAtomically } from '@/lib/audited-update';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth('USER_EDIT');
  if (!isApiContext(ctx)) return ctx;
  const { id } = await params;

  const existing = await prisma.user.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) return apiError(UI_STRINGS.appApiAdminUsersIdRoute.userNotFound, 404);

  const body = await req.json();
  const { name, role, status } = body;

  const updated = await runAuditedD1UpdateAtomically({
    table: 'user',
    id,
    tenantId: ctx.tenantId,
    data: {
      name: name?.trim() ?? existing.name,
      role: role ?? existing.role,
      status: status ?? existing.status,
      updatedBy: ctx.userId,
    },
    route: '/api/admin/users/[id]',
    requestId: req.headers.get('x-request-id'),
    audit: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      entityType: 'USER',
      entityId: id,
      action: 'UPDATE',
      description: interpolateUiString(UI_STRINGS.appApiAdminUsersIdRoute.userEmailUpdatedRoleRoleStatusStatus, { "email": existing.email, "role": role ?? existing.role, "status": status ?? existing.status }),
      oldValue: { role: existing.role, status: existing.status },
      newValue: { role: role ?? existing.role, status: status ?? existing.status },
    },
  });

  return apiSuccess(updated);
}
