/* Shared declarations for lib/api-utils.ts. */

import type { UserRole } from "@/lib/permissions";

export type ApiContext = {
  userId: string;
  tenantId: string;
  tenantName: string;
  role: UserRole;
  userName?: string;
  userEmail?: string;
  vendorId?: string | null;
};

/** Optional log context for apiError: a stable event name, route details and the caught error. */
export interface ApiErrorDetails {
  event?: string;
  route?: string;
  method?: string;
  error?: unknown;
  [key: string]: unknown;
}
export type AuthenticatedSessionUser = {
  id: string;
  tenantId: string;
  tenantName?: string;
  role: UserRole;
  name?: string | null;
  email?: string | null;
  vendorId?: string | null;
};

export type ListPageWindow = {
  page: number;
  pageSize: number;
  skip: number;
};
