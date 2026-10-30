import type { Permission, UserRole } from "@app-types/lib/permissions.types";
export type { Permission, UserRole };
import { ROLE_PERMISSIONS } from "./permissions.constants";
export { ROLE_PERMISSIONS };


export function hasPermission(role: UserRole, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes(permission);
}

export function getRolePermissions(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] || [];
}
