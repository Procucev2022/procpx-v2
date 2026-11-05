import {
  createLogRecord,
  serializeConsoleArguments,
  type LogLevel,
  type LogRecord,
  type LogSource,
} from './shared';
import { CONSOLE_LEVELS } from './server-logger.constants';

type ConsoleMethod = 'debug' | 'info' | 'log' | 'warn' | 'error';

const nativeConsoleMethods: Partial<Record<ConsoleMethod, (...args: unknown[]) => void>> = {};
let consoleCaptureInstalled = false;

function emit(level: LogLevel, line: string): void {
  const method: ConsoleMethod = level === 'error'
    ? 'error'
    : level === 'warn'
      ? 'warn'
      : level === 'debug'
        ? 'debug'
        : 'log';
  const logger = nativeConsoleMethods[method] || console[method].bind(console);
  logger(line);
}

export async function initializeLogging(): Promise<void> {
  // Workers have no writable filesystem; hosted logs are collected from console output.
}

export async function writeStructuredLog(
  level: LogLevel,
  message: string,
  context: Record<string, unknown> = {},
  source: LogSource = 'application',
  environment = process.env,
): Promise<LogRecord> {
  const record = createLogRecord(level, message, context, source, environment);
  emit(level, JSON.stringify(record));
  return record;
}

export function installConsoleCapture(): void {
  if (consoleCaptureInstalled) return;

  for (const { method, level } of CONSOLE_LEVELS) {
    nativeConsoleMethods[method] = console[method].bind(console) as (...args: unknown[]) => void;
    console[method] = (...args: unknown[]) => {
      try {
        const { message, context } = serializeConsoleArguments(args);
        void writeStructuredLog(level, message, context, 'application').catch(() => {
          nativeConsoleMethods[method]?.('observability.edge_log_failed');
        });
      } catch {
        nativeConsoleMethods[method]?.('observability.edge_log_failed');
      }
    };
  }

  consoleCaptureInstalled = true;
}

export function restoreConsoleCapture(): void {
  for (const [method, original] of Object.entries(nativeConsoleMethods)) {
    if (original) console[method as ConsoleMethod] = original as never;
  }
  for (const method of Object.keys(nativeConsoleMethods) as ConsoleMethod[]) {
    delete nativeConsoleMethods[method];
  }
  consoleCaptureInstalled = false;
}
