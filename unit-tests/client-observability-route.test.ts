import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/observability/client/route';
import { isClientLogRateLimited, resetClientLogRateLimits } from '../src/app/api/observability/client/rate-limit';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/observability/server-logger', () => ({
  writeStructuredLog: jest.fn().mockResolvedValue(undefined),
}));

function request(body: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/observability/client', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('client observability endpoint', () => {
  beforeEach(() => {
    resetClientLogRateLimits();
    jest.clearAllMocks();
  });

  it('rejects cross-origin, oversized, malformed, and invalid batches', async () => {
    expect((await POST(request('{}', { origin: 'https://evil.test' }))).status).toBe(403);
    expect((await POST(request('x'.repeat(33 * 1024)))).status).toBe(413);
    expect((await POST(request('{'))).status).toBe(400);
    expect((await POST(request('[]'))).status).toBe(400);
    expect((await POST(request('{"logs":[]}'))).status).toBe(400);
    expect((await POST(request(JSON.stringify({ logs: Array.from({ length: 21 }, () => ({})) })))).status).toBe(400);
    expect((await POST(request('{"logs":[null]}'))).status).toBe(400);
    expect((await POST(request('{"logs":[{"level":"verbose","message":"bad"}]}'))).status).toBe(400);
    expect((await POST(request('{"logs":[{"level":"error","message":3}]}'))).status).toBe(400);
  });

  it('stores valid sanitized client events and handles client address fallbacks', async () => {
    const event = {
      timestamp: '2026-10-30T00:00:00.000Z',
      level: 'error',
      message: 'browser failed',
      context: { path: '/api/pr?id=secret', details: 'render error' },
    };
    const response = await POST(request(JSON.stringify({ logs: [event] }), {
      origin: 'http://localhost',
      'x-real-ip': '127.0.0.1',
    }));

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: 1 });
    expect(writeStructuredLog).toHaveBeenCalledWith(UI_STRINGS.common.error2, 'browser failed', expect.objectContaining({
      clientTimestamp: event.timestamp,
      clientPath: '/api/pr?id=%5BREDACTED%5D',
    }), 'browser');

    await POST(request(JSON.stringify({ logs: [{ level: 'info', message: 'forwarded' }] }), {
      'x-forwarded-for': '192.0.2.5, 192.0.2.6',
    }));
    await POST(request(JSON.stringify({ logs: [{ level: 'warn', message: 'local' }] })));
    expect(writeStructuredLog).toHaveBeenCalledTimes(3);
  });

  it('rejects batches after the per-client request limit', async () => {
    const body = JSON.stringify({ logs: [{ level: 'info', message: 'heartbeat' }] });
    for (let index = 0; index < 60; index += 1) {
      expect((await POST(request(body, { 'x-real-ip': '198.51.100.4' }))).status).toBe(202);
    }
    expect((await POST(request(body, { 'x-real-ip': '198.51.100.4' }))).status).toBe(429);
  });

  it('resets a client bucket after the fixed window expires', () => {
    expect(isClientLogRateLimited('client-1', 1_000)).toBe(false);
    expect(isClientLogRateLimited('client-1', 60_999)).toBe(false);
    expect(isClientLogRateLimited('client-1', 61_000)).toBe(false);
  });
});
