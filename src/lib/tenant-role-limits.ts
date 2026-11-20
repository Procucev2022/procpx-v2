// lib/tenant-role-limits.ts - reads per-role user limits and current usage for a company.
import { prisma } from '@/lib/prisma';
import { ROLE_LIMIT_COUNTED_STATUS } from '@/lib/business-directory.constants';
import { ASSIGNABLE_USER_ROLES } from '@/app/api/admin/users/route.constants';
import type { RoleCapacity, RoleLimitUsage } from '@app-types/lib/business-directory.types';

/** Limit and active-user count for every assignable role in one company. */
export async function loadRoleLimitUsage(tenantId: string): Promise<RoleLimitUsage[]> {
  const [limits, counts] = await Promise.all([
    prisma.tenantRoleLimit.findMany({ where: { tenantId }, select: { role: true, maxUsers: true } }),
    prisma.user.groupBy({
      by: ['role'],
      where: { tenantId, status: ROLE_LIMIT_COUNTED_STATUS },
      _count: { _all: true },
    }),
  ]);
  const limitByRole = new Map(limits.map((limit) => [limit.role, limit.maxUsers]));
  const countByRole = new Map(counts.map((count) => [count.role, count._count._all]));
  return ASSIGNABLE_USER_ROLES.map((role) => ({
    role,
    maxUsers: limitByRole.get(role) ?? null,
    activeUsers: countByRole.get(role) ?? 0,
  }));
}

/**
 * Whether one more active user with this role fits in the company. `excludeUserId` leaves
 * out a user who is being re-assigned, so editing someone never counts them twice.
 */
export async function checkRoleCapacity(tenantId: string, role: string, excludeUserId?: string): Promise<RoleCapacity> {
  const limit = await prisma.tenantRoleLimit.findFirst({ where: { tenantId, role }, select: { maxUsers: true } });
  const activeUsers = await prisma.user.count({
    where: {
      tenantId, role, status: ROLE_LIMIT_COUNTED_STATUS,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
  });
  if (!limit) return { allowed: true, maxUsers: null, activeUsers };
  return { allowed: activeUsers < limit.maxUsers, maxUsers: limit.maxUsers, activeUsers };
}
