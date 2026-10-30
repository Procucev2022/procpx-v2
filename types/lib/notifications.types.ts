/* Shared declarations for lib/notifications.ts. */

export interface WorkflowNotificationParams {
  tenantId: string;
  userId?: string | null;
  targetRole?: string | null;
  title: string;
  message: string;
  type?: 'INFO' | 'SUCCESS' | 'WARNING' | 'ACTION_REQUIRED';
  entityType?: 'PR' | 'RFQ' | 'QUOTE' | 'NEGOTIATION' | 'AWARD' | 'PPO';
  entityId?: string;
  recordNumber?: string;
  link?: string;
}
