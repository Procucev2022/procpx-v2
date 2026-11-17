import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/observability/client/route';
import { resetClientLogRateLimits } from '../src/app/api/observability/client/rate-limit';
import { writeStructuredLog } from '../src/lib/observability/server-logger';

jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn().mockResolvedValue(undefined) }));

const writeLog = writeStructuredLog as unknown as jest.Mock;
const ENDPOINT = 'http://localhost/api/observability/client';

function clientLogRequest(body: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(ENDPOINT, { method: 'POST', body, headers: { 'content-type': 'application/json', ...headers } });
}

describe('client log rejections', () => {
  beforeEach(() => {
    writeLog.mockClear();
    resetClientLogRateLimits();
  });

  it('records an invalid JSON batch by reason, without the rejected body', async () => {
    const response = await POST(clientLogRequest('{not json'));

    expect(response.status).toBe(400);
    expect(writeLog).toHaveBeenCalledWith('warn', 'client_log.rejected', expect.objectContaining({ reason: 'invalid_json', status: 400 }), 'browser');
    expect(JSON.stringify(writeLog.mock.calls)).not.toContain('not json');
  });

  it('records a cross-origin batch', async () => {
    const response = await POST(clientLogRequest('{"logs":[]}', { origin: 'https://other.example' }));

    expect(response.status).toBe(403);
    expect(writeLog).toHaveBeenCalledWith('warn', 'client_log.rejected', expect.objectContaining({ reason: 'origin_mismatch', status: 403 }), 'browser');
  });

  it('records an event with an unknown level and the batch size it arrived in', async () => {
    const response = await POST(clientLogRequest(JSON.stringify({ logs: [{ level: 'trace', message: 'x' }] })));

    expect(response.status).toBe(400);
    expect(writeLog).toHaveBeenCalledWith('warn', 'client_log.rejected', expect.objectContaining({ reason: 'invalid_event_shape' }), 'browser');
  });

  it('accepts a valid batch without writing a rejection event', async () => {
    const response = await POST(clientLogRequest(JSON.stringify({ logs: [{ level: 'info', message: 'page.ready', context: { path: '/dashboard' } }] })));

    expect(response.status).toBe(202);
    expect(writeLog).toHaveBeenCalledTimes(1);
    expect(writeLog).toHaveBeenCalledWith('info', 'page.ready', expect.any(Object), 'browser');
    expect(writeLog).not.toHaveBeenCalledWith('warn', 'client_log.rejected', expect.anything(), expect.anything());
  });
});
