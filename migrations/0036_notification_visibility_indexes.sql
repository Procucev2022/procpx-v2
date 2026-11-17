-- Inbox and unread-count lookups filter by tenant, recipient (user or role), read state, and time.
-- Additive indexes only; no notification rows are changed.
CREATE INDEX IF NOT EXISTS "notifications_tenant_user_read_created_idx" ON "notifications"("tenantId", "userId", "isRead", "createdAt");
CREATE INDEX IF NOT EXISTS "notifications_tenant_role_read_created_idx" ON "notifications"("tenantId", "targetRole", "isRead", "createdAt");