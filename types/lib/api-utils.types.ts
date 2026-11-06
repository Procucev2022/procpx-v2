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
