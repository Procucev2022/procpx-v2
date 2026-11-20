-- Company (tenant) profile details captured by the Super Admin "Create Company" form, and
-- per-role user limits for each company. Additive only: existing tenants keep every value
-- they already have, the new profile columns stay NULL for them, and a company without a
-- role-limit row has no limit for that role.
ALTER TABLE "tenants" ADD COLUMN "gstNumber" TEXT;
ALTER TABLE "tenants" ADD COLUMN "address" TEXT;
ALTER TABLE "tenants" ADD COLUMN "pincode" TEXT;
ALTER TABLE "tenants" ADD COLUMN "panNumber" TEXT;
ALTER TABLE "tenants" ADD COLUMN "industry" TEXT;
ALTER TABLE "tenants" ADD COLUMN "contactPersonName" TEXT;
ALTER TABLE "tenants" ADD COLUMN "contactPhone" TEXT;

CREATE TABLE IF NOT EXISTS "tenant_role_limits" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "maxUsers" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "updatedBy" TEXT,
  CONSTRAINT "tenant_role_limits_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_role_limits_tenantId_role_key"
  ON "tenant_role_limits" ("tenantId", "role");
