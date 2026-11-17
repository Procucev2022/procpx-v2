import { NextRequest, NextResponse } from 'next/server';
import { LOG_LEVELS, safeRequestPath, type LogLevel } from '@/lib/observability/shared';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { isClientLogRateLimited } from './rate-limit';
import { MAX_BODY_BYTES, MAX_BATCH_SIZE } from "./route.constants";
import { UI_STRINGS } from "@/lib/ui-strings.constants";



export const runtime = 'nodejs';

function getClientKey(request: NextRequest): string {
  return request.headers.get('x-real-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || 'local-client';
}

function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && LOG_LEVELS.includes(value as LogLevel);
}

/**
 * Records why a client batch was refused, with a reason code only. The rejected body is never written to the log.
 * Rate-limited requests are not recorded, so one abusive client cannot flood the log with rejection events.
 */
async function rejectClientLog(
  message: string,
  status: number,
  reason: string,
  details: Record<string, unknown> = {},
): Promise<NextResponse> {
  await writeStructuredLog('warn', 'client_log.rejected', {
    operation: 'accept_client_logs', route: '/api/observability/client', reason, status, ...details,
  }, 'browser');
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return rejectClientLog(UI_STRINGS.appApiObservabilityClientRoute.invalidRequestOrigin, 403, 'origin_mismatch');
  }
  if (isClientLogRateLimited(getClientKey(request))) {
    return NextResponse.json({ error: UI_STRINGS.appApiObservabilityClientRoute.tooManyLogEvents }, { status: 429 });
  }

  const bodyText = await request.text();
  const bodyBytes = new TextEncoder().encode(bodyText).byteLength;
  if (bodyBytes > MAX_BODY_BYTES) {
    return rejectClientLog(UI_STRINGS.appApiObservabilityClientRoute.logBatchIsTooLarge, 413, 'body_too_large', { bodyBytes });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return rejectClientLog(UI_STRINGS.appApiObservabilityClientRoute.invalidLogPayload, 400, 'invalid_json');
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { logs?: unknown }).logs)) {
    return rejectClientLog(UI_STRINGS.appApiObservabilityClientRoute.expectedALogsArray, 400, 'logs_not_array');
  }

  const logs = (parsed as { logs: unknown[] }).logs;
  if (logs.length === 0 || logs.length > MAX_BATCH_SIZE) {
    return rejectClientLog(UI_STRINGS.appApiObservabilityClientRoute.logBatchSizeIsInvalid, 400, 'batch_size_invalid', { batchSize: logs.length });
  }

  for (const candidate of logs) {
    if (!candidate || typeof candidate !== 'object') {
      return rejectClientLog(UI_STRINGS.appApiObservabilityClientRoute.logEventMustBeAnObject, 400, 'event_not_object');
    }
    const event = candidate as { level?: unknown; message?: unknown; context?: unknown; timestamp?: unknown };
    if (!isLogLevel(event.level) || typeof event.message !== 'string') {
      return rejectClientLog(UI_STRINGS.appApiObservabilityClientRoute.logEventRequiresAValidLevelAndMessage, 400, 'invalid_event_shape');
    }

    await writeStructuredLog(event.level, event.message.slice(0, 8_000), {
      clientTimestamp: typeof event.timestamp === 'string' ? event.timestamp : undefined,
      clientPath: typeof event.context === 'object' && event.context !== null
        && typeof (event.context as Record<string, unknown>).path === 'string'
        ? safeRequestPath((event.context as Record<string, string>).path)
        : undefined,
      details: event.context,
    }, 'browser');
  }

  return NextResponse.json({ accepted: logs.length }, { status: 202 });
}
