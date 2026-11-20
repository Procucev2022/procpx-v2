/* Application constants for the admin users API: assignable roles, company linking, role limits and D1 writes. */

// Roles an administrator may assign from the Users screen. SUPER_ADMIN and VENDOR are
// provisioned outside this screen, so they can never be granted through the invite form.
export const ASSIGNABLE_USER_ROLES: readonly string[] = Object.freeze([
  'PROJECT_USER',
  'PROJECT_APPROVER',
  'PROCUREMENT_USER',
  'FINANCE_USER',
  'CATEGORY_MANAGER',
  'CLIENT_ADMIN',
  'VIEWER',
]);

export const NEW_USER_STATUS = 'ACTIVE';

export const ADMIN_USERS_ROUTE = '/api/admin/users';
export const USER_AUDIT_ENTITY_TYPE = 'USER';
export const USER_AUDIT_CREATE_ACTION = 'CREATE';

// Creates the user only inside an existing company, only when the email is unused in every
// company (sign-in rejects an email that maps to more than one account), and only while the
// company's limit for the role, if any, still has a free seat among ACTIVE users.
export const USER_INSERT_IF_EMAIL_AVAILABLE_SQL = `
  INSERT INTO "users" (
    "id", "tenantId", "email", "name", "passwordHash", "role", "status",
    "createdAt", "updatedAt", "createdBy", "updatedBy"
  )
  SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL
  WHERE EXISTS (SELECT 1 FROM "tenants" WHERE "id" = ?)
    AND NOT EXISTS (SELECT 1 FROM "users" WHERE lower(trim("email")) = lower(trim(?)))
    AND NOT EXISTS (
      SELECT 1 FROM "tenant_role_limits" AS "l"
      WHERE "l"."tenantId" = ? AND "l"."role" = ?
        AND "l"."maxUsers" <= (
          SELECT COUNT(*) FROM "users" AS "u"
          WHERE "u"."tenantId" = "l"."tenantId" AND "u"."role" = "l"."role" AND "u"."status" = 'ACTIVE'
        )
    )
`;
