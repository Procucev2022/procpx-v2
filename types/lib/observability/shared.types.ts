/* Shared declarations for lib/observability/shared.ts. */

import type { LOG_LEVELS } from "@/lib/observability/shared.constants";

export type LogLevel = (typeof LOG_LEVELS)[number];

export type LogSource = 'application' | 'browser' | 'next' | 'playwright';

export type InstrumentationRequestHeaders = Record<string, string | string[] | undefined>;

export type LogRecord = {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: 'procpx';
  environment: string;
  source: LogSource;
  context?: Record<string, unknown>;
};
