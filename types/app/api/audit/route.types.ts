export type AuditLogListQueryRow = {
  id: string;
  createdAt: Date | string;
  entityType: string;
  entityId: string;
  action: string;
  description: string;
  hasDiff: number | boolean;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
};
