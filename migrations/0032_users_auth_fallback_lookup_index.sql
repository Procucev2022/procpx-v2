-- Support the development-only active vendor-account fallback lookup.
-- Additive index only; this migration preserves all user and tenant records.
CREATE INDEX IF NOT EXISTS "users_role_status_vendor_idx"
ON "users"("role", "status", "vendorId");
