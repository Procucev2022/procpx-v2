import { appendFile, mkdir, readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import {
  createLogRecord,
  serializeConsoleArguments,
  type LogLevel,
  type LogRecord,
  type LogSource,
} from './shared';
import type { CleanupOptions } from "@app-types/lib/observability/server-logger.types";
import { RETENTION_DAYS, CLEANUP_INTERVAL_MS, PURGEABLE_EXTENSIONS, LOG_DIRECTORY_NAME, CONSOLE_LEVELS } from "./server-logger.constants";
import { isCloudflareWorker } from '../runtime';


let writeQueue: Promise<void> = Promise.resolve();
const pendingLogWrites = new Set<Promise<unknown>>();
let lastCleanupAt = 0;
let initializedDirectory: string | null = null;
let originalConsoleMethods: Partial<Record<'debug' | 'info' | 'log' | 'warn' | 'error', (...args: unknown[]) => void>> = {};

export function isFileLoggingEnabled(environment = process.env): boolean {
  // Cloudflare Workers have no writable disk; logs go to the console (Workers Logs) only.
  if (isCloudflareWorker()) return false;
  return environment.APP_LOG_TO_FILE === 'true' || environment.NODE_ENV !== 'production';
}

export function getLogDirectory(environment = process.env): string {
  return path.resolve(environment.APP_LOG_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), LOG_DIRECTORY_NAME));
}

function getRetentionDays(environment = process.env): number {
  const configuredDays = Number(environment.APP_LOG_RETENTION_DAYS);
  return Number.isFinite(configuredDays) && configuredDays >= 1
    ? Math.floor(configuredDays)
    : RETENTION_DAYS;
}

async function purgeDirectory(directory: string, cutoff: number, purgeAll: boolean): Promise<number> {
  let removed = 0;
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return removed;
    throw error;
  }

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      removed += await purgeDirectory(entryPath, cutoff, purgeAll);
      continue;
    }
    if (!entry.isFile() || !PURGEABLE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;

    const fileStat = await stat(entryPath);
    if (purgeAll || fileStat.mtimeMs < cutoff) {
      await unlink(entryPath);
      removed += 1;
    }
  }
  return removed;
}

export async function purgeExpiredArtifacts(options: CleanupOptions = {}): Promise<number> {
  const environment = options.environment || process.env;
  const directory = options.directory || getLogDirectory(environment);
  const now = options.now ?? Date.now();
  const retentionDays = options.retentionDays ?? getRetentionDays(environment);
  await mkdir(directory, { recursive: true });
  return purgeDirectory(directory, now - retentionDays * 24 * 60 * 60 * 1_000, options.purgeAll ?? false);
}

export async function initializeLogging(environment = process.env): Promise<void> {
  if (!isFileLoggingEnabled(environment)) return;
  const directory = getLogDirectory(environment);
  if (initializedDirectory === directory && Date.now() - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  let removed: number;
  try {
    await mkdir(directory, { recursive: true });
    removed = await purgeExpiredArtifacts({
      directory,
      environment,
      purgeAll: environment.APP_LOG_PURGE_ON_STARTUP === 'true',
    });
  } catch (error) {
    process.stderr.write(`${JSON.stringify(createLogRecord('error', 'observability.initialization_failed', { error: String(error) }, 'application', environment))}\n`);
    return;
  }
  initializedDirectory = directory;
  lastCleanupAt = Date.now();
  if (removed > 0) {
    process.stdout.write(`${JSON.stringify(createLogRecord('info', 'observability.expired_artifacts_purged', { removed }))}\n`);
  }
}

function dailyLogFile(directory: string, date = new Date()): string {
  const day = date.toISOString().slice(0, 10);
  return path.join(directory, `application-${day}.jsonl`);
}

function enqueueFileWrite(filePath: string, contents: string): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    await mkdir(path.dirname(filePath), { recursive: true });
    await appendFile(filePath, contents, 'utf8');
  }).catch((error: unknown) => {
    process.stderr.write(`observability.file_write_failed ${String(error)}\n`);
  });
  return writeQueue;
}

export async function writeDebugSnapshot(
  name: string,
  payload: Record<string, unknown>,
  environment = process.env,
): Promise<string | null> {
  if (!isFileLoggingEnabled(environment)) return null;
  await initializeLogging(environment);
  const safeName = name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'snapshot';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(getLogDirectory(environment), 'snapshots', `${timestamp}-${safeName}.json`);
  const snapshot = { timestamp: new Date().toISOString(), name: safeName, data: payload };
  await enqueueFileWrite(filePath, `${JSON.stringify(createLogRecord('info', `snapshot.${safeName}`, snapshot, 'application'))}\n`);
  return filePath;
}

export async function writeStructuredLog(
  level: LogLevel,
  message: string,
  context: Record<string, unknown> = {},
  source: LogSource = 'application',
  environment = process.env,
): Promise<LogRecord> {
  const record = createLogRecord(level, message, context, source, environment);
  const line = `${JSON.stringify(record)}\n`;
  if (isCloudflareWorker()) {
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : level === 'debug' ? 'debug' : 'log';
    const logger = originalConsoleMethods[method] || console[method].bind(console);
    logger(line.trimEnd());
  } else {
    (level === 'error' ? process.stderr : process.stdout).write(line);
  }

  if (isFileLoggingEnabled(environment)) {
    await initializeLogging(environment);
    await enqueueFileWrite(dailyLogFile(getLogDirectory(environment)), line);
    if (level === 'error') {
      await writeDebugSnapshot('application-error', { record }, environment);
    }
  }
  return record;
}

export function installConsoleCapture(): void {
  const globalState = globalThis as typeof globalThis & { __procpxConsoleCaptureInstalled?: boolean };
  if (globalState.__procpxConsoleCaptureInstalled) return;

  for (const { method, level } of CONSOLE_LEVELS) {
    originalConsoleMethods[method] = console[method].bind(console) as (...args: unknown[]) => void;
    console[method] = (...args: unknown[]) => {
      const { message, context } = serializeConsoleArguments(args);
      trackPendingLogWrite(writeStructuredLog(level, message, context, 'application'));
    };
  }
  globalState.__procpxConsoleCaptureInstalled = true;
}

export function restoreConsoleCapture(): void {
  const globalState = globalThis as typeof globalThis & { __procpxConsoleCaptureInstalled?: boolean };
  for (const [method, original] of Object.entries(originalConsoleMethods)) {
    if (original) console[method as keyof typeof originalConsoleMethods] = original as never;
  }
  originalConsoleMethods = {};
  globalState.__procpxConsoleCaptureInstalled = false;
}

function trackPendingLogWrite(pending: Promise<unknown>): void {
  pendingLogWrites.add(pending);
  void pending.then(
    () => pendingLogWrites.delete(pending),
    () => pendingLogWrites.delete(pending),
  );
}

export async function flushLogWrites(): Promise<void> {
  while (pendingLogWrites.size > 0) {
    await Promise.all([...pendingLogWrites]);
  }
  await writeQueue;
}
