/* Type declarations for the company and role-limit admin components. */
import type { BusinessSummary } from '@app-types/app/api/admin/users/route.types';
import type { RoleLimitUsage } from '@app-types/lib/business-directory.types';

/** Role -> raw input text; '' means "no limit". */
export type RoleLimitFormValues = Record<string, string>;

export interface RoleLimitFieldsProps {
  values: RoleLimitFormValues;
  usage?: RoleLimitUsage[];
  onChange: (role: string, value: string) => void;
}

export interface RoleLimitResponse {
  businessId: string;
  businessName: string;
  roles: RoleLimitUsage[];
}

export interface CreateCompanyModalProps {
  onClose: () => void;
  onCreated: (business: BusinessSummary) => void;
}

export interface RoleLimitsModalProps {
  business: BusinessSummary;
  onClose: () => void;
  onSaved: (result: RoleLimitResponse) => void;
}

export interface CompanyFormValues {
  name: string;
  gstNumber: string;
  address: string;
  pincode: string;
  panNumber: string;
  industry: string;
  contactPersonName: string;
  contactPhone: string;
}
