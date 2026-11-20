/* Type declarations for the admin users and businesses APIs. */

export interface CreateUserRequestBody {
  email?: unknown;
  name?: unknown;
  role?: unknown;
  password?: unknown;
  businessId?: unknown;
}

export interface BusinessSummary {
  id: string;
  name: string;
  gstNumber?: string | null;
  address?: string | null;
  pincode?: string | null;
  panNumber?: string | null;
  industry?: string | null;
  contactPersonName?: string | null;
  contactPhone?: string | null;
}

export interface BusinessDirectory {
  canChooseBusiness: boolean;
  currentBusiness: BusinessSummary | null;
  businesses: BusinessSummary[];
}
