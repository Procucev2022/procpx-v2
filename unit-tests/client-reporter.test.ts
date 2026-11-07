/** @jest-environment jsdom */
import {
  describeError,
  flushClientEvents,
  installClientErrorReporting,
  reportClientEvent,
  resetClientReporter,
} from '../src/lib/observability/client-reporter';
import {
  CLIENT_LOG_ENDPOINT,
  CLIENT_LOG_FLUSH_DELAY_MS,
  CLIENT_LOG_MAX_BATCH,
} from '../src/lib/observability/client-reporter.constants';

const sentBatches = (fetchMock: jest.Mock) => fetchMock.mock.calls
  .filter(([url]) => url === CLIENT_LOG_ENDPOINT)
  .map(([, init]) => JSON.parse((init as RequestInit).body as string).logs as Array<{ level: string; message: string; context: Record<string, unknown> }>);

describe('client error reporter', () => {
  const originalFetch = window.fetch;
  let fetchMock: jest.Mock;
  let uninstall: (() => void) | undefined;

  beforeEach(() => {
    jest.useFakeTimers();
    resetClientReporter();
    fetchMock = jest.fn().mockResolvedValue({ status: 202 });
    window.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    uninstall?.();
    uninstall = undefined;
    resetClientReporter();
    jest.useRealTimers();
    window.fetch = originalFetch;
  });

  it('describes errors and other rejection values', () => {
    expect(describeError(new TypeError('bad'))).toEqual(expect.objectContaining({ name: 'TypeError', message: 'bad' }));
    expect(describeError('plain')).toBe('plain');
  });

  it('batches events and posts them after the flush delay with the page path', () => {
    reportClientEvent('warn', 'browser.example', { detail: 1 });
    reportClientEvent('error', 'browser.second');
    expect(fetchMock).not.toHaveBeenCalled();
    jest.advanceTimersByTime(CLIENT_LOG_FLUSH_DELAY_MS);
    expect(fetchMock).toHaveBeenCalledWith(CLIENT_LOG_ENDPOINT, expect.objectContaining({ method: 'POST', keepalive: true }));
    const [batch] = sentBatches(fetchMock);
    expect(batch).toEqual([
      expect.objectContaining({ level: 'warn', message: 'browser.example', context: { path: '/', detail: 1 } }),
      expect.objectContaining({ level: 'error', message: 'browser.second' }),
    ]);
    flushClientEvents();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('posts a full batch immediately', () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    for (let index = 0; index < CLIENT_LOG_MAX_BATCH; index += 1) reportClientEvent('info', 'event-' + index);
    expect(sentBatches(fetchMock)[0]).toHaveLength(CLIENT_LOG_MAX_BATCH);
  });

  it('reports failed API responses and network errors from wrapped fetch', async () => {
    uninstall = installClientErrorReporting();
    expect(installClientErrorReporting()()).toBeUndefined();

    fetchMock.mockResolvedValueOnce({ status: 500 });
    await window.fetch('/api/pr?search=secret', { method: 'post' });
    fetchMock.mockResolvedValueOnce({ status: 200 });
    await window.fetch(new URL('http://localhost/api/ok'));
    fetchMock.mockResolvedValueOnce({ status: 503 });
    await window.fetch({ url: '/api/boq', method: 'PUT' } as Request);
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(window.fetch('/api/budgets')).rejects.toThrow('Failed to fetch');
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    await expect(window.fetch('/api/cancelled')).rejects.toThrow('aborted');
    fetchMock.mockResolvedValueOnce({ status: 500 });
    await window.fetch('http://[bad');

    flushClientEvents();
    const events = sentBatches(fetchMock).flat();
    expect(events.map((event) => event.message)).toEqual([
      'browser.api_request_failed',
      'browser.api_request_failed',
      'browser.api_network_error',
      'browser.api_request_failed',
    ]);
    expect(events[0].context).toEqual(expect.objectContaining({ url: '/api/pr', method: 'POST', status: 500 }));
    expect(events[1].context).toEqual(expect.objectContaining({ url: '/api/boq', status: 503 }));
    expect(events[2].context).toEqual(expect.objectContaining({ url: '/api/budgets', method: 'GET' }));
    expect(events[3].context).toEqual(expect.objectContaining({ url: 'http://[bad' }));
  });

  it('passes log posts through without reporting them', async () => {
    uninstall = installClientErrorReporting();
    fetchMock.mockResolvedValueOnce({ status: 500 });
    await window.fetch(CLIENT_LOG_ENDPOINT, { method: 'POST' });
    flushClientEvents();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports uncaught errors and unhandled rejections and flushes when the page is hidden', () => {
    uninstall = installClientErrorReporting();
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom', filename: 'app.js', lineno: 3, colno: 7, error: new Error('boom') }));
    window.dispatchEvent(new ErrorEvent('error', { message: 'script error' }));
    const rejection = Object.assign(new Event('unhandledrejection'), { reason: 'denied' });
    window.dispatchEvent(rejection);

    const visibility = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(fetchMock).not.toHaveBeenCalled();
    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    visibility.mockRestore();

    const events = sentBatches(fetchMock).flat();
    expect(events).toEqual([
      expect.objectContaining({ message: 'browser.uncaught_error', context: expect.objectContaining({ errorMessage: 'boom', line: 3 }) }),
      expect.objectContaining({ message: 'browser.uncaught_error', context: expect.objectContaining({ errorMessage: 'script error' }) }),
      expect.objectContaining({ message: 'browser.unhandled_rejection', context: expect.objectContaining({ reason: 'denied' }) }),
    ]);
  });

  it('restores fetch and listeners when uninstalled', () => {
    const remove = installClientErrorReporting();
    expect(window.fetch).not.toBe(fetchMock);
    remove();
    expect(window.fetch).toBe(fetchMock);
    window.dispatchEvent(new ErrorEvent('error', { message: 'after uninstall' }));
    flushClientEvents();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
