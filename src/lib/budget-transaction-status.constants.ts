/* Budget transaction statuses shared by API routes, SQL readers, and category previews. */

// Ledger rows from a contribution that was resubmitted. They stay in D1 for audit,
// and every active total, list, and status summary excludes them.
export const BUDGET_TRANSACTION_SUPERSEDED_STATUS = 'SUPERSEDED';
