import { isCloudflareWorker } from '../runtime';
import type { LogRecord } from './shared';
import type { LogLevel, LogSource } from './shared';

type StructuredLogWriter = (
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
  source?: LogSource,
  environment?: NodeJS.ProcessEnv,
) => Promise<LogRecord>;

function getStructuredLogWriter(): StructuredLogWriter {
  if (isCloudflareWorker()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('./edge-logger') as { writeStructuredLog: StructuredLogWriter }).writeStructuredLog;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('./server-logger') as { writeStructuredLog: StructuredLogWriter }).writeStructuredLog;
}

export function writeRuntimeStructuredLog(
  level: LogLevel,
  message: string,
  context: Record<string, unknown> = {},
  source: LogSource = 'application',
  environment?: NodeJS.ProcessEnv,
): Promise<LogRecord> {
  return getStructuredLogWriter()(level, message, context, source, environment);
}
