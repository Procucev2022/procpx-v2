import type { AuditParams } from './audit.types';
import type { UiStringValue } from './i18n.types';

export type AuditedD1UpdateTable = 'user' | 'project' | 'vendor' | 'auctionVendor';

export interface AuditedD1UpdateInput {
  table: AuditedD1UpdateTable;
  id: string;
  tenantId: string;
  data: Record<string, unknown>;
  audit: AuditParams;
  route: string;
  requestId?: string | null;
  updatedAt?: Date;
}

export type AuditedD1UpdateRecord = { id: string } & Record<string, UiStringValue>;
