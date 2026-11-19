/* Type declarations for the admin users and businesses APIs. */

export interface CreateUserRequestBody {
  email?: unknown;
  name?: unknown;
  role?: unknown;
  password?: unknown;
  companyName?: unknown;
}

export interface BusinessSummary {
  id: string;
  name: string;
}

export interface BusinessDirectory {
  canChooseBusiness: boolean;
  currentBusiness: BusinessSummary | null;
  businesses: BusinessSummary[];
}

export interface ResolvedBusinessTarget {
  id: string;
  name: string;
  isNew: boolean;
}
