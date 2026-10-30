/* Shared declarations for lib/audit.ts. */

export interface AuditParams {
  tenantId: string;
  userId?: string;
  projectId?: string;
  entityType: string;
  entityId: string;
  action: string;
  description: string;
  oldValue?: object;
  newValue?: object;
  ipAddress?: string;
  userAgent?: string;
}
