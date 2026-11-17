import {
  findUserAdminPolicyViolation,
  getUserAdminPolicyResponse,
  isKnownUserRole,
  isKnownUserStatus,
} from '../src/lib/admin-user-policy';
import { UI_STRINGS } from '../src/lib/ui-strings.constants';

const clientAdmin = { actorRole: 'CLIENT_ADMIN', actorUserId: 'admin-1' };
const platformAdmin = { actorRole: 'SUPER_ADMIN', actorUserId: 'platform-1' };
const projectUser = { id: 'user-2', role: 'PROJECT_USER', status: 'ACTIVE' };

describe('user administration policy', () => {
  it('accepts only known roles and account statuses', () => {
    expect(isKnownUserRole('PROCUREMENT_USER')).toBe(true);
    expect(isKnownUserRole('ROOT')).toBe(false);
    expect(isKnownUserRole('constructor')).toBe(false);
    expect(isKnownUserRole(42)).toBe(false);
    expect(isKnownUserStatus('LOCKED')).toBe(true);
    expect(isKnownUserStatus('DELETED')).toBe(false);
    expect(isKnownUserStatus(undefined)).toBe(false);
  });

  it('rejects unknown roles and statuses before any other rule applies', () => {
    expect(findUserAdminPolicyViolation({ ...clientAdmin, nextRole: 'ROOT' })).toBe('unknown_role');
    expect(findUserAdminPolicyViolation({ ...clientAdmin, target: projectUser, nextStatus: 'DELETED' })).toBe('unknown_status');
  });

  it('blocks non-platform administrators from creating or promoting to the platform role', () => {
    expect(findUserAdminPolicyViolation({ ...clientAdmin, nextRole: 'SUPER_ADMIN' })).toBe('platform_admin_assignment_forbidden');
    expect(findUserAdminPolicyViolation({ ...platformAdmin, nextRole: 'SUPER_ADMIN' })).toBeNull();
    expect(findUserAdminPolicyViolation({ ...clientAdmin, nextRole: 'CLIENT_ADMIN' })).toBeNull();
  });

  it('protects platform accounts from edits by other administrators', () => {
    const platformUser = { id: 'platform-2', role: 'SUPER_ADMIN', status: 'ACTIVE' };
    expect(findUserAdminPolicyViolation({ ...clientAdmin, target: platformUser, nextStatus: 'INACTIVE' }))
      .toBe('platform_admin_account_protected');
    expect(findUserAdminPolicyViolation({ ...platformAdmin, target: platformUser, nextStatus: 'INACTIVE' })).toBeNull();
  });

  it('prevents administrators from changing their own role or status', () => {
    const self = { id: 'admin-1', role: 'CLIENT_ADMIN', status: 'ACTIVE' };
    expect(findUserAdminPolicyViolation({ ...clientAdmin, target: self, nextStatus: 'LOCKED' })).toBe('own_role_or_status_change_forbidden');
    expect(findUserAdminPolicyViolation({ ...clientAdmin, target: self, nextRole: 'VIEWER' })).toBe('own_role_or_status_change_forbidden');
    // Re-submitting the current values is not a change.
    expect(findUserAdminPolicyViolation({ ...clientAdmin, target: self, nextRole: 'CLIENT_ADMIN', nextStatus: 'ACTIVE' })).toBeNull();
    expect(findUserAdminPolicyViolation({ ...clientAdmin, target: self, nextRole: undefined })).toBeNull();
  });

  it('allows ordinary edits of other users and creation of ordinary roles', () => {
    expect(findUserAdminPolicyViolation({ ...clientAdmin, target: projectUser, nextRole: 'VIEWER', nextStatus: 'INACTIVE' })).toBeNull();
    expect(findUserAdminPolicyViolation({ ...clientAdmin, nextRole: 'PROJECT_USER' })).toBeNull();
  });

  it('maps every violation to a catalog message and an HTTP status', () => {
    expect(getUserAdminPolicyResponse('unknown_role')).toEqual({ message: UI_STRINGS.libAdminUserPolicy.unknownRole, status: 400 });
    expect(getUserAdminPolicyResponse('unknown_status')).toEqual({ message: UI_STRINGS.libAdminUserPolicy.unknownStatus, status: 400 });
    expect(getUserAdminPolicyResponse('platform_admin_assignment_forbidden').status).toBe(403);
    expect(getUserAdminPolicyResponse('platform_admin_account_protected').status).toBe(403);
    expect(getUserAdminPolicyResponse('own_role_or_status_change_forbidden').message)
      .toBe(UI_STRINGS.libAdminUserPolicy.ownRoleOrStatusChangeForbidden);
  });
});
