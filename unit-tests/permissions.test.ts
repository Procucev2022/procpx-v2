import { getRolePermissions, hasPermission, ROLE_PERMISSIONS, type UserRole } from '../src/lib/permissions';

describe('role permissions', () => {
  it('returns the configured permissions for each supported role', () => {
    const roles = Object.keys(ROLE_PERMISSIONS) as UserRole[];

    for (const role of roles) {
      expect(getRolePermissions(role)).toEqual(ROLE_PERMISSIONS[role]);
      expect(getRolePermissions(role).length).toBeGreaterThan(0);
    }
  });

  it('checks granted and denied permissions', () => {
    expect(hasPermission('SUPER_ADMIN', 'PROJECT_CREATE')).toBe(true);
    expect(hasPermission('VIEWER', 'PROJECT_DELETE')).toBe(false);
    expect(hasPermission('UNKNOWN_ROLE' as UserRole, 'PROJECT_VIEW')).toBe(false);
    expect(getRolePermissions('UNKNOWN_ROLE' as UserRole)).toEqual([]);
  });
});
