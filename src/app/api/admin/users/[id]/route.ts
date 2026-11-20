// app/api/admin/users/[id]/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { runAuditedD1UpdateAtomically } from '@/lib/audited-update';
import { canChooseAnyBusiness } from '@/lib/business-name';
import { CROSS_BUSINESS_ADMIN_ROLE } from '@/lib/business-directory.constants';
import { ASSIGNABLE_USER_ROLES } from '../route.constants';
import { ROLE_LIMIT_COUNTED_STATUS } from '@/lib/business-directory.constants';
import { checkRoleCapacity } from '@/lib/tenant-role-limits';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth('USER_EDIT');
  if (!isApiContext(ctx)) return ctx;
  const { id } = await params;
  const isSuperAdmin = canChooseAnyBusiness(ctx.role);

  // A Super Admin manages users in every business; other administrators only their own.
  const existing = await prisma.user.findFirst({
    where: isSuperAdmin ? { id } : { id, tenantId: ctx.tenantId },
  });
  if (!existing) return apiError(UI_STRINGS.appApiAdminUsersIdRoute.userNotFound, 404, { route: '/api/admin/users/[id]', method: 'PUT' });
  if (existing.role === CROSS_BUSINESS_ADMIN_ROLE && !isSuperAdmin) {
    return apiError(UI_STRINGS.appApiAdminUsersIdRoute.superAdminAccountsCanOnlyBeChangedByASuperAdmin, 403);
  }

  const body = await req.json();
  const { name, role, status } = body;
  // Keeping the current role is always allowed; any change must be to an assignable role,
  // so the edit form can never grant SUPER_ADMIN or VENDOR.
  if (role != null && role !== existing.role && !ASSIGNABLE_USER_ROLES.includes(role)) {
    return apiError(UI_STRINGS.appApiAdminUsersIdRoute.roleIsInvalid);
  }

  // A role change or a re-activation takes a seat in the company's role limit; a user who
  // keeps the same active role, or who is being disabled, never needs a new seat.
  const nextRole = role ?? existing.role;
  const nextStatus = status ?? existing.status;
  const takesNewSeat = nextStatus === ROLE_LIMIT_COUNTED_STATUS
    && (nextRole !== existing.role || existing.status !== ROLE_LIMIT_COUNTED_STATUS);
  if (takesNewSeat) {
    const capacity = await checkRoleCapacity(existing.tenantId, nextRole, existing.id);
    if (!capacity.allowed) {
      const business = await prisma.tenant.findFirst({ where: { id: existing.tenantId }, select: { name: true } });
      return apiError(interpolateUiString(UI_STRINGS.appApiAdminUsersIdRoute.roleLimitReachedForCompany, {
        company: business?.name ?? existing.tenantId, count: capacity.activeUsers, role: nextRole, max: capacity.maxUsers,
      }), 409);
    }
  }

  const updated = await runAuditedD1UpdateAtomically({
    table: 'user',
    id,
    tenantId: existing.tenantId,
    data: {
      name: name?.trim() ?? existing.name,
      role: role ?? existing.role,
      status: status ?? existing.status,
      updatedBy: ctx.userId,
    },
    route: '/api/admin/users/[id]',
    requestId: req.headers.get('x-request-id'),
    audit: {
      tenantId: existing.tenantId,
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
