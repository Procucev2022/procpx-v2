/* Application constants for the Super Admin company and role-limit forms. */
import type { CompanyFormValues } from '@app-types/components/admin/role-limits.types';

export const EMPTY_COMPANY_FORM: Readonly<CompanyFormValues> = Object.freeze({
  name: '',
  gstNumber: '',
  address: '',
  pincode: '',
  panNumber: '',
  industry: '',
  contactPersonName: '',
  contactPhone: '',
});

export const GST_NUMBER_LENGTH = 15;
export const PAN_NUMBER_LENGTH = 10;
export const PINCODE_LENGTH = 6;
export const CONTACT_PHONE_MAX_INPUT_LENGTH = 20;
