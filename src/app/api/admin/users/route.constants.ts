/* Application constants for the admin users API: assignable roles, business linking and D1 writes. */

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

export const BUSINESS_STATUS_ACTIVE = 'ACTIVE';
export const NEW_USER_STATUS = 'ACTIVE';

export const ADMIN_USERS_ROUTE = '/api/admin/users';
export const USER_AUDIT_ENTITY_TYPE = 'USER';
export const USER_AUDIT_CREATE_ACTION = 'CREATE';
export const BUSINESS_AUDIT_ENTITY_TYPE = 'TENANT';
export const BUSINESS_AUDIT_CREATE_ACTION = 'CREATE';

// Creates a business only when no business already uses the same normalized name or slug.
export const BUSINESS_INSERT_IF_NAME_AVAILABLE_SQL = `
  INSERT INTO "tenants" ("id", "name", "slug", "status", "config", "createdAt", "updatedAt")
  SELECT ?, ?, ?, ?, NULL, ?, ?
  WHERE NOT EXISTS (
    SELECT 1 FROM "tenants" WHERE lower(trim("name")) = lower(trim(?)) OR "slug" = ?
  )
`;

// Creates the user only inside an existing business and only when the email is unused in
// every business, because sign-in rejects an email that maps to more than one account.
export const USER_INSERT_IF_EMAIL_AVAILABLE_SQL = `
  INSERT INTO "users" (
    "id", "tenantId", "email", "name", "passwordHash", "role", "status",
    "createdAt", "updatedAt", "createdBy", "updatedBy"
  )
  SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL
  WHERE EXISTS (SELECT 1 FROM "tenants" WHERE "id" = ?)
    AND NOT EXISTS (SELECT 1 FROM "users" WHERE lower(trim("email")) = lower(trim(?)))
`;
