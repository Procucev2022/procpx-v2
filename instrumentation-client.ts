import {
  createLogRecord,
  safeRequestPath,
  serializeConsoleArguments,
  type LogLevel,
  type LogRecord,
} from './src/lib/observability/shared';

const endpoint = '/api/observability/client';
const batchLimit = 20;
const maxQueuedRecords = 100;
const queuedRecords: LogRecord[] = [];
const originalConsole = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};
let flushInProgress = false;

// In production every forwarded batch is another Cloudflare Worker invocation, so
// only warnings and errors leave the browser; development keeps every level.
const forwardsInfoRecords = process.env.NODE_ENV !== 'production';

function enqueueClientRecord(level: LogLevel, message: string, context: Record<string, unknown> = {}): void {
  if (!forwardsInfoRecords && (level === 'debug' || level === 'info')) return;
  const record = createLogRecord(level, message, {
    ...context,
    path: safeRequestPath(window.location.pathname),
    viewport: { width: window.innerWidth, height: window.innerHeight },
  }, 'browser');
  record.message = record.message.slice(0, 2_000);
  record.context = {
    path: record.context?.path,
    viewport: record.context?.viewport,
    details: JSON.stringify(record.context || {}).slice(0, 2_000),
  };
  queuedRecords.push(record);
  if (queuedRecords.length > maxQueuedRecords) queuedRecords.splice(0, queuedRecords.length - maxQueuedRecords);
  if (queuedRecords.length >= batchLimit) void flushClientRecords();
}

async function flushClientRecords(): Promise<void> {
  if (flushInProgress || queuedRecords.length === 0) return;
  flushInProgress = true;
  const batch = queuedRecords.splice(0, batchLimit);
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ logs: batch }),
      keepalive: true,
    });
  } catch {
    queuedRecords.unshift(...batch.slice(-maxQueuedRecords));
    if (queuedRecords.length > maxQueuedRecords) queuedRecords.length = maxQueuedRecords;
  } finally {
    flushInProgress = false;
  }
}

const consoleLevels: Array<{ method: keyof typeof originalConsole; level: LogLevel }> = [
  { method: 'debug', level: 'debug' },
  { method: 'info', level: 'info' },
  { method: 'log', level: 'info' },
  { method: 'warn', level: 'warn' },
  { method: 'error', level: 'error' },
];

for (const { method, level } of consoleLevels) {
  console[method] = (...args: unknown[]) => {
    originalConsole[method](...args);
    const { message, context } = serializeConsoleArguments(args);
    enqueueClientRecord(level, message, context);
  };
}

window.addEventListener('error', (event) => {
  enqueueClientRecord('error', 'browser.uncaught_error', {
    message: event.message,
    filename: event.filename,
    line: event.lineno,
    column: event.colno,
    error: event.error,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  enqueueClientRecord('error', 'browser.unhandled_rejection', { reason: event.reason });
});

window.addEventListener('pagehide', () => {
  if (queuedRecords.length > 0 && navigator.sendBeacon) {
    const batch = queuedRecords.splice(0, batchLimit);
    navigator.sendBeacon(endpoint, new Blob([JSON.stringify({ logs: batch })], { type: 'application/json' }));
  }
  void flushClientRecords();
});

window.setInterval(() => void flushClientRecords(), 2_000);

enqueueClientRecord('info', 'browser.client_initialized');

export function onRouterTransitionStart(
  url: string,
  navigationType: 'push' | 'replace' | 'traverse',
): void {
  enqueueClientRecord('info', 'browser.navigation_started', {
    path: safeRequestPath(url),
    navigationType,
  });
}
