import { NextRequest, NextResponse } from 'next/server';
import { LOG_LEVELS, safeRequestPath, type LogLevel } from '@/lib/observability/shared';
import { writeStructuredLog } from '@/lib/observability/server-logger';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 32 * 1024;
const MAX_BATCH_SIZE = 20;
const RATE_LIMIT_PER_MINUTE = 60;
const rateLimitBuckets = new Map<string, { startedAt: number; count: number }>();

function getClientKey(request: NextRequest): string {
  return request.headers.get('x-real-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || 'local-client';
}

function isRateLimited(key: string, now = Date.now()): boolean {
  let bucket = rateLimitBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= 60_000) {
    bucket = { startedAt: now, count: 0 };
    rateLimitBuckets.set(key, bucket);
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_PER_MINUTE;
}

function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && LOG_LEVELS.includes(value as LogLevel);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  }
  if (isRateLimited(getClientKey(request))) {
    return NextResponse.json({ error: 'Too many log events' }, { status: 429 });
  }

  const bodyText = await request.text();
  if (new TextEncoder().encode(bodyText).byteLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Log batch is too large' }, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({ error: 'Invalid log payload' }, { status: 400 });
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { logs?: unknown }).logs)) {
    return NextResponse.json({ error: 'Expected a logs array' }, { status: 400 });
  }

  const logs = (parsed as { logs: unknown[] }).logs;
  if (logs.length === 0 || logs.length > MAX_BATCH_SIZE) {
    return NextResponse.json({ error: 'Log batch size is invalid' }, { status: 400 });
  }

  for (const candidate of logs) {
    if (!candidate || typeof candidate !== 'object') {
      return NextResponse.json({ error: 'Log event must be an object' }, { status: 400 });
    }
    const event = candidate as { level?: unknown; message?: unknown; context?: unknown; timestamp?: unknown };
    if (!isLogLevel(event.level) || typeof event.message !== 'string') {
      return NextResponse.json({ error: 'Log event requires a valid level and message' }, { status: 400 });
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

export function resetClientLogRateLimits(): void {
  rateLimitBuckets.clear();
}
