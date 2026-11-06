ALTER TABLE "notifications" ADD COLUMN "vendorId" TEXT;

CREATE INDEX IF NOT EXISTS "notifications_tenant_vendor_created_id_idx"
ON "notifications" ("tenantId", "vendorId", "createdAt", "id");
