import type { InstrumentationRequestHeaders, LogLevel, LogSource, LogRecord } from "@app-types/lib/observability/shared.types";
export type { InstrumentationRequestHeaders, LogLevel, LogSource, LogRecord };
import { LOG_LEVELS, sensitiveKeyPattern, secretTextPattern, emailPattern } from "./shared.constants";
export { LOG_LEVELS };

function getFirstHeaderValue(headers: InstrumentationRequestHeaders, headerName: string): string | undefined {
  const header = Object.entries(headers).find(([name]) => name.toLowerCase() === headerName)?.[1];
  const firstValue = Array.isArray(header) ? header[0] : header;
  if (typeof firstValue !== 'string') return undefined;
  const normalized = firstValue.trim().slice(0, 128);
  return normalized || undefined;
}

export function getRequestCorrelationId(headers: InstrumentationRequestHeaders): string | undefined {
  return getFirstHeaderValue(headers, 'x-request-id') || getFirstHeaderValue(headers, 'cf-ray');
}


export function redactText(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(secretTextPattern, '$1$2[REDACTED]')
    .replace(emailPattern, '[REDACTED_EMAIL]')
    .slice(0, 8_000);
}

function normalizeValue(value: unknown, seen: WeakSet<object>, key?: string, depth = 0): unknown {
  if (key && sensitiveKeyPattern.test(key)) return '[REDACTED]';
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return redactText(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'symbol') return value.toString();
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
  if (depth >= 6) return '[MaxDepth]';

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactText(value.message),
      ...(value.stack ? { stack: redactText(value.stack) } : {}),
    };
  }
  if (value instanceof Date) return value.toISOString();

  const objectValue = value as object;
  if (seen.has(objectValue)) return '[Circular]';
  seen.add(objectValue);
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => normalizeValue(item, seen, undefined, depth + 1));
  }

  const entries = Object.entries(value as Record<string, unknown>).slice(0, 50);
  return Object.fromEntries(entries.map(([entryKey, entryValue]) => [
    entryKey,
    normalizeValue(entryValue, seen, entryKey, depth + 1),
  ]));
}

export function sanitizeLogValue(value: unknown): unknown {
  return normalizeValue(value, new WeakSet<object>());
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return redactText(value);
  const safeValue = sanitizeLogValue(value);
  if (typeof safeValue === 'undefined') return 'undefined';
  return JSON.stringify(safeValue) || 'undefined';
}

export function serializeConsoleArguments(args: unknown[]): { message: string; context: Record<string, unknown> } {
  const safeArguments = sanitizeLogValue(args) as unknown[];
  const message = args.map(formatValue).join(' ').slice(0, 8_000) || 'Console event';
  return { message, context: { arguments: safeArguments } };
}

export function createLogRecord(
  level: LogLevel,
  message: string,
  context: Record<string, unknown> = {},
  source: LogSource = 'application',
  environment = process.env,
): LogRecord {
  const safeContext = sanitizeLogValue(context) as Record<string, unknown>;
  return {
    timestamp: new Date().toISOString(),
    level,
    message: redactText(message || 'Application event'),
    service: 'procpx',
    environment: environment.NODE_ENV || 'development',
    source,
    ...(Object.keys(safeContext).length > 0 ? { context: safeContext } : {}),
  };
}

export function safeRequestPath(rawPath: string): string {
  try {
    const parsed = new URL(rawPath, 'http://localhost');
    const safeQuery = new URLSearchParams();
    parsed.searchParams.forEach((_value, key) => safeQuery.append(key, '[REDACTED]'));
    const query = safeQuery.toString();
    return `${parsed.pathname}${query ? `?${query}` : ''}`.slice(0, 1_000);
  } catch {
    return redactText(rawPath.split('?')[0]).slice(0, 1_000);
  }
}
