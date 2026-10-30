/* Application constants extracted from lib/observability/server-logger.ts. */

import {
  createLogRecord,
  serializeConsoleArguments,
  type LogLevel,
  type LogRecord,
  type LogSource,
} from './shared';

export const RETENTION_DAYS = 30;

export const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1_000;

export const PURGEABLE_EXTENSIONS = new Set(['.jsonl', '.json', '.png', '.jpg', '.jpeg', '.webp']);

export const LOG_DIRECTORY_NAME = 'logs';

export const CONSOLE_LEVELS: Array<{
  method: 'debug' | 'info' | 'log' | 'warn' | 'error';
  level: LogLevel;
}> = [
  { method: 'debug', level: 'debug' },
  { method: 'info', level: 'info' },
  { method: 'log', level: 'info' },
  { method: 'warn', level: 'warn' },
  { method: 'error', level: 'error' },
];
