import type { UserRole } from '@app-types/lib/permissions.types';
import { ROLE_PERMISSIONS } from './permissions.constants';
import { PLATFORM_ADMIN_ROLE, USER_ACCOUNT_STATUSES } from './admin-user-policy.constants';
import { UI_STRINGS } from './ui-strings.constants';

export type UserAdminPolicyViolation =
  | 'unknown_role'
  | 'unknown_status'
  | 'platform_admin_assignment_forbidden'
  | 'platform_admin_account_protected'
  | 'own_role_or_status_change_forbidden';

export interface UserAdminPolicyTarget {
  id: string;
  role: string;
  status: string;
}

export interface UserAdminPolicyInput {
  actorRole: string;
  actorUserId: string;
  /** Existing user being edited. Omit when creating a user. */
  target?: UserAdminPolicyTarget;
  /** Requested role. Undefined means the field was not changed. */
  nextRole?: unknown;
  /** Requested account status. Undefined means the field was not changed. */
  nextStatus?: unknown;
}

export function isKnownUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, value);
}

export function isKnownUserStatus(value: unknown): value is (typeof USER_ACCOUNT_STATUSES)[number] {
  return typeof value === 'string' && (USER_ACCOUNT_STATUSES as readonly string[]).includes(value);
}

/**
 * Checks an administrator's requested user change. Only a super administrator
 * can grant or edit the platform role. Nobody can change their own role or
 * status, which blocks self-promotion and self-lockout.
 */
export function findUserAdminPolicyViolation(input: UserAdminPolicyInput): UserAdminPolicyViolation | null {
  const { actorRole, actorUserId, target, nextRole, nextStatus } = input;
  if (nextRole !== undefined && !isKnownUserRole(nextRole)) return 'unknown_role';
  if (nextStatus !== undefined && !isKnownUserStatus(nextStatus)) return 'unknown_status';

  const actorIsPlatformAdmin = actorRole === PLATFORM_ADMIN_ROLE;
  if (!actorIsPlatformAdmin && nextRole === PLATFORM_ADMIN_ROLE) return 'platform_admin_assignment_forbidden';
  if (!actorIsPlatformAdmin && target?.role === PLATFORM_ADMIN_ROLE) return 'platform_admin_account_protected';

  const changesRole = nextRole !== undefined && nextRole !== target?.role;
  const changesStatus = nextStatus !== undefined && nextStatus !== target?.status;
  if (target && target.id === actorUserId && (changesRole || changesStatus)) {
    return 'own_role_or_status_change_forbidden';
  }
  return null;
}

/** Maps a policy violation to a catalog message and HTTP status for the API response. */
export function getUserAdminPolicyResponse(violation: UserAdminPolicyViolation): { message: string; status: number } {
  switch (violation) {
    case 'unknown_role':
      return { message: UI_STRINGS.libAdminUserPolicy.unknownRole, status: 400 };
    case 'unknown_status':
      return { message: UI_STRINGS.libAdminUserPolicy.unknownStatus, status: 400 };
    case 'platform_admin_assignment_forbidden':
      return { message: UI_STRINGS.libAdminUserPolicy.platformAdminAssignmentForbidden, status: 403 };
    case 'platform_admin_account_protected':
      return { message: UI_STRINGS.libAdminUserPolicy.platformAdminAccountProtected, status: 403 };
    case 'own_role_or_status_change_forbidden':
      return { message: UI_STRINGS.libAdminUserPolicy.ownRoleOrStatusChangeForbidden, status: 403 };
  }
}
