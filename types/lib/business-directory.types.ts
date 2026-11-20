/* Type declarations for company (tenant) profiles and per-role user limits. */

export interface IndustryOption {
  value: string;
  label: string;
}

export interface CompanyProfile {
  name: string;
  gstNumber: string;
  address: string;
  pincode: string | null;
  panNumber: string | null;
  industry: string | null;
  contactPersonName: string | null;
  contactPhone: string | null;
}

/** Role -> maximum active users; null removes the limit for that role. */
export type RoleLimitInput = Record<string, number | null>;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface RoleLimitUsage {
  role: string;
  maxUsers: number | null;
  activeUsers: number;
}

export interface RoleCapacity {
  allowed: boolean;
  maxUsers: number | null;
  activeUsers: number;
}
