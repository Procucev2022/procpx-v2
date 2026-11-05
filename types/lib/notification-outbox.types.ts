import type { WorkflowNotificationParams } from './notifications.types';
import type { D1BatchDatabase, D1BatchInputStatement } from './d1-batch.types';

export type NotificationOutboxPayload = WorkflowNotificationParams;
export type NotificationOutboxDatabase = D1BatchDatabase;

export interface NotificationOutboxRow {
  id: string;
  tenantId: string;
  payload: string;
  attemptCount: number;
}

export interface NotificationOutboxDispatchOptions {
  now?: Date;
  batchSize?: number;
  onlyId?: string;
}

export interface NotificationOutboxDispatchResult {
  claimed: number;
  delivered: number;
  retried: number;
  dead: number;
}

export interface PreparedNotificationOutbox {
  id: string;
  payload: NotificationOutboxPayload;
  createdAt: Date;
  statement: D1BatchInputStatement;
}
