/* Application constants for linking users to businesses (tenants). */
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import type { IndustryOption } from '@app-types/lib/business-directory.types';

// Only this role may link a user to a business other than its own or create a new business.
export const CROSS_BUSINESS_ADMIN_ROLE = 'SUPER_ADMIN';

export const COMPANY_NAME_MAX_LENGTH = 120;
export const BUSINESS_SLUG_MAX_LENGTH = 60;
export const BUSINESS_SLUG_FALLBACK = 'business';
export const BUSINESS_SLUG_ID_SUFFIX_LENGTH = 8;

/* Company (tenant) profile captured by the Super Admin "Create Company" form. */

export const COMPANY_ADDRESS_MAX_LENGTH = 500;
export const CONTACT_PERSON_NAME_MAX_LENGTH = 120;

// GSTIN: 2-digit state code, 10-character PAN, entity number, 'Z', check character.
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const PINCODE_PATTERN = /^[1-9][0-9]{5}$/;
// Optional leading +, then 7-15 digits; spaces and hyphens are removed before matching.
export const CONTACT_PHONE_PATTERN = /^\+?[0-9]{7,15}$/;

// Highest per-role user limit a Super Admin may set. A blank limit means "no limit".
export const ROLE_LIMIT_MAX = 10_000;
// Only ACTIVE users count against a role limit; disabled users free their seat.
export const ROLE_LIMIT_COUNTED_STATUS = 'ACTIVE';

export const INDUSTRY_OPTIONS: readonly IndustryOption[] = Object.freeze([
  { value: 'RETAIL', label: UI_STRINGS.companyIndustries.retail },
  { value: 'HOSPITALITY', label: UI_STRINGS.companyIndustries.hospitality },
  { value: 'REAL_ESTATE_CONSTRUCTION', label: UI_STRINGS.companyIndustries.realEstateConstruction },
  { value: 'MANUFACTURING', label: UI_STRINGS.companyIndustries.manufacturing },
  { value: 'HEALTHCARE', label: UI_STRINGS.companyIndustries.healthcare },
  { value: 'EDUCATION', label: UI_STRINGS.companyIndustries.education },
  { value: 'IT_SERVICES', label: UI_STRINGS.companyIndustries.itServices },
  { value: 'BANKING_FINANCE', label: UI_STRINGS.companyIndustries.bankingFinance },
  { value: 'LOGISTICS', label: UI_STRINGS.companyIndustries.logistics },
  { value: 'OTHER', label: UI_STRINGS.companyIndustries.other },
]);

export const ADMIN_BUSINESSES_ROUTE = '/api/admin/businesses';
export const ADMIN_BUSINESS_ROLE_LIMITS_ROUTE = '/api/admin/businesses/[id]/role-limits';
export const BUSINESS_AUDIT_ENTITY_TYPE = 'TENANT';
export const BUSINESS_AUDIT_CREATE_ACTION = 'CREATE';
export const BUSINESS_AUDIT_ROLE_LIMITS_ACTION = 'UPDATE';
export const BUSINESS_STATUS_ACTIVE = 'ACTIVE';

// Creates a company only when no company already uses the same normalized name, slug or GSTIN.
export const BUSINESS_INSERT_IF_AVAILABLE_SQL = `
  INSERT INTO "tenants" (
    "id", "name", "slug", "status", "config", "gstNumber", "address", "pincode", "panNumber",
    "industry", "contactPersonName", "contactPhone", "createdAt", "updatedAt"
  )
  SELECT ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?
  WHERE NOT EXISTS (
    SELECT 1 FROM "tenants"
    WHERE lower(trim("name")) = lower(trim(?)) OR "slug" = ? OR upper("gstNumber") = upper(?)
  )
`;

// Sets one role limit for an existing company; inserted rows are skipped if the company vanished.
export const ROLE_LIMIT_UPSERT_SQL = `
  INSERT INTO "tenant_role_limits" ("id", "tenantId", "role", "maxUsers", "createdAt", "updatedAt", "updatedBy")
  SELECT ?, ?, ?, ?, ?, ?, ?
  WHERE EXISTS (SELECT 1 FROM "tenants" WHERE "id" = ?)
  ON CONFLICT ("tenantId", "role") DO UPDATE SET
    "maxUsers" = excluded."maxUsers", "updatedAt" = excluded."updatedAt", "updatedBy" = excluded."updatedBy"
`;

export const ROLE_LIMIT_DELETE_SQL = `DELETE FROM "tenant_role_limits" WHERE "tenantId" = ? AND "role" = ?`;

// Touches the company so the following audit insert (guarded by changes() = 1) only runs
// when the company still exists.
export const BUSINESS_TOUCH_SQL = `UPDATE "tenants" SET "updatedAt" = ? WHERE "id" = ?`;

// Company fields returned to the Users screen directory and Companies tab.
export const BUSINESS_SUMMARY_SELECT = {
  id: true, name: true, gstNumber: true, address: true, pincode: true, panNumber: true,
  industry: true, contactPersonName: true, contactPhone: true,
} as const;
