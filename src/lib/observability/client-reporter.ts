// lib/observability/client-reporter.ts - Sends browser failures to the server log
// Uncaught errors, unhandled rejections, failed API responses (5xx) and network
// failures are batched and posted to the client log ingestion route, so problems
// users hit in the browser appear in the same structured log as server events.
import type { LogLevel } from './shared';
import type { ClientLogEvent } from '@app-types/lib/observability/client-reporter.types';
import {
  CLIENT_LOG_ENDPOINT,
  CLIENT_LOG_FLUSH_DELAY_MS,
  CLIENT_LOG_MAX_BATCH,
  CLIENT_LOG_MAX_MESSAGE_LENGTH,
} from './client-reporter.constants';

let queue: ClientLogEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let sendRequest: typeof fetch | null = null;

export function describeError(error: unknown): Record<string, unknown> | string {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return String(error);
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** Path without the query string, which can carry identifiers or search terms. */
function requestPath(url: string): string {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return url.split('?')[0];
  }
}

export function flushClientEvents(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (queue.length === 0) return;
  const batch = queue.splice(0, CLIENT_LOG_MAX_BATCH);
  const send = sendRequest ?? window.fetch.bind(window);
  // The queue never exceeds one batch: it is flushed as soon as it fills.
  // keepalive lets the last batch finish while the page unloads.
  void send(CLIENT_LOG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ logs: batch }),
    keepalive: true,
  }).catch(() => undefined);
}

export function reportClientEvent(level: LogLevel, message: string, context: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;
  queue.push({
    level,
    message: message.slice(0, CLIENT_LOG_MAX_MESSAGE_LENGTH),
    timestamp: new Date().toISOString(),
    context: { path: window.location.pathname, ...context },
  });
  if (queue.length >= CLIENT_LOG_MAX_BATCH) flushClientEvents();
  else flushTimer ??= setTimeout(flushClientEvents, CLIENT_LOG_FLUSH_DELAY_MS);
}

/** Installs global browser error reporting once; returns a function that removes it. */
export function installClientErrorReporting(): () => void {
  if (typeof window === 'undefined' || sendRequest) return () => undefined;
  const originalFetch = window.fetch;
  const send = originalFetch.bind(window);
  sendRequest = send;

  const onError = (event: ErrorEvent) => {
    reportClientEvent('error', 'browser.uncaught_error', {
      errorMessage: event.message,
      source: event.filename,
      line: event.lineno,
      column: event.colno,
      error: event.error ? describeError(event.error) : undefined,
    });
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    reportClientEvent('error', 'browser.unhandled_rejection', { reason: describeError(event.reason) });
  };
  const onHidden = () => {
    if (document.visibilityState === 'hidden') flushClientEvents();
  };

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    const path = requestPath(url);
    if (path === CLIENT_LOG_ENDPOINT) return send(input, init);
    const method = (init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
    const startedAt = Date.now();
    try {
      const response = await send(input, init);
      if (response.status >= 500) {
        reportClientEvent('error', 'browser.api_request_failed', {
          url: path, method, status: response.status, durationMs: Date.now() - startedAt,
        });
      }
      return response;
    } catch (error) {
      if ((error as { name?: string } | null)?.name !== 'AbortError') {
        reportClientEvent('error', 'browser.api_network_error', {
          url: path, method, durationMs: Date.now() - startedAt, error: describeError(error),
        });
      }
      throw error;
    }
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  document.addEventListener('visibilitychange', onHidden);

  return () => {
    flushClientEvents();
    window.fetch = originalFetch;
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    document.removeEventListener('visibilitychange', onHidden);
    sendRequest = null;
  };
}

/** Clears queued events and timers; used by tests. */
export function resetClientReporter(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  queue = [];
  sendRequest = null;
}
