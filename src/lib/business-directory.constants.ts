/* Application constants for linking users to businesses (tenants). */

// Only this role may link a user to a business other than its own or create a new business.
export const CROSS_BUSINESS_ADMIN_ROLE = 'SUPER_ADMIN';

export const COMPANY_NAME_MAX_LENGTH = 120;
export const BUSINESS_SLUG_MAX_LENGTH = 60;
export const BUSINESS_SLUG_FALLBACK = 'business';
export const BUSINESS_SLUG_ID_SUFFIX_LENGTH = 8;
