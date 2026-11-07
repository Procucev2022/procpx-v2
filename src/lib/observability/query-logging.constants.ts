/* Application constants for lib/observability/query-logging.ts. */

// D1 queries normally finish in tens of milliseconds; slower ones usually scan a large table.
export const SLOW_QUERY_THRESHOLD_MS = 750;
