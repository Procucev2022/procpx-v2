/** Account states an administrator can assign to a user. */
export const USER_ACCOUNT_STATUSES = ['ACTIVE', 'INACTIVE', 'LOCKED'] as const;

/** The only role that may create, promote to, or edit a super administrator account. */
export const PLATFORM_ADMIN_ROLE = 'SUPER_ADMIN';
