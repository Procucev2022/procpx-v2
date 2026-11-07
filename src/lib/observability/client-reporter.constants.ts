/* Application constants for lib/observability/client-reporter.ts. */

export const CLIENT_LOG_ENDPOINT = '/api/observability/client';

// Matches MAX_BATCH_SIZE accepted by the ingestion route.
export const CLIENT_LOG_MAX_BATCH = 20;

export const CLIENT_LOG_FLUSH_DELAY_MS = 2_000;

export const CLIENT_LOG_MAX_MESSAGE_LENGTH = 2_000;
