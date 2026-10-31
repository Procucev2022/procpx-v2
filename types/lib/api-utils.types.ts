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
