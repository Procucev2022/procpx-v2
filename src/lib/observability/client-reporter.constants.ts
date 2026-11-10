/* Application constants for lib/observability/client-reporter.ts. */

export const CLIENT_LOG_ENDPOINT = '/api/observability/client';
export const CLIENT_HANDLED_FAILURE_EVENT = 'browser.handled_client_operation_failed';
export const CLIENT_VENDOR_CATEGORIES_SHAPE_INVALID_EVENT = 'browser.vendor_categories_shape_invalid';

// Matches MAX_BATCH_SIZE accepted by the ingestion route.
export const CLIENT_LOG_MAX_BATCH = 20;

export const CLIENT_LOG_FLUSH_DELAY_MS = 2_000;

export const CLIENT_LOG_MAX_MESSAGE_LENGTH = 2_000;
