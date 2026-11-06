/* Shared declarations for lib/observability/client-reporter.ts. */

import type { LogLevel } from '@app-types/lib/observability/shared.types';

// One browser event as accepted by POST /api/observability/client.
export interface ClientLogEvent {
  level: LogLevel;
  message: string;
  timestamp: string;
  context: Record<string, unknown>;
}
