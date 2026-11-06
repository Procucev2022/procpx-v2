/* Shared declarations for app/(app)/audit/page.tsx. */

export interface AuditLogItem {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  description: string;
  hasDiff?: boolean;
  oldValue?: string | null;
  newValue?: string | null;
  oldValues?: string | null;
  newValues?: string | null;
  ipAddress?: string | null;
  createdAt: string;
  user?: {
    name: string | null;
    email: string;
  } | null;
}
