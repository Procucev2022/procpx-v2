/* Application constants for app/(app)/procurement/ppos/page.tsx. */

/** PPO statuses for which `/api/procurement/ppos/[id]/complete` accepts a completion. */
export const PPO_COMPLETABLE_STATUSES: readonly string[] = Object.freeze(['ISSUED', 'CONFIRMED', 'PARTIALLY_COMPLETED']);

/**
 * Prefix of the stable per-PPO idempotency key used for full-order completion,
 * so a double click or retry replays the first completion instead of posting twice.
 */
export const PPO_COMPLETION_IDEMPOTENCY_PREFIX = 'ppo-full-completion';
