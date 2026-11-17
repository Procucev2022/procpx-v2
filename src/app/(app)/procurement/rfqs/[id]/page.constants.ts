/* Application constants for app/(app)/procurement/rfqs/[id]/page.tsx. */

/**
 * RFQ statuses in which an award recommendation is refused by the server until
 * final rates are locked. Mirrors the lockable statuses of
 * `/api/procurement/rfqs/[id]/lock-rates` minus COMPARISON, which can be awarded directly.
 */
export const RFQ_RATE_LOCK_REQUIRED_STATUSES: readonly string[] = Object.freeze(['NEGOTIATION', 'RESPONSE_CLOSED']);
