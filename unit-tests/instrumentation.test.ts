import { onRequestError, register } from '../src/instrumentation';
import { initializeLogging, installConsoleCapture, writeStructuredLog } from '../src/lib/observability/server-logger';

jest.mock('../src/lib/observability/server-logger', () => ({
  initializeLogging: jest.fn().mockResolvedValue(undefined),
  installConsoleCapture: jest.fn(),
  writeStructuredLog: jest.fn().mockResolvedValue(undefined),
}));

describe('Next.js logging instrumentation', () => {
  const originalRuntime = process.env.NEXT_RUNTIME;

  afterEach(() => {
    if (originalRuntime === undefined) delete process.env.NEXT_RUNTIME;
    else process.env.NEXT_RUNTIME = originalRuntime;
    jest.clearAllMocks();
  });

  it('skips Node filesystem setup in Edge runtime', async () => {
    process.env.NEXT_RUNTIME = 'edge';
    await register();
    expect(initializeLogging).not.toHaveBeenCalled();
    expect(installConsoleCapture).not.toHaveBeenCalled();
    expect(writeStructuredLog).not.toHaveBeenCalled();
  });

  it('initializes local logging before accepting requests', async () => {
    process.env.NEXT_RUNTIME = 'nodejs';
    await register();
    expect(initializeLogging).toHaveBeenCalledTimes(1);
    expect(installConsoleCapture).toHaveBeenCalledTimes(1);
    expect(writeStructuredLog).toHaveBeenCalledWith('info', 'application.server_started', expect.any(Object), 'next');
  });

  it('records request errors with sanitized path and route context only in Node runtime', async () => {
    process.env.NEXT_RUNTIME = 'edge';
    await onRequestError(new Error('edge failure'), {
      path: '/api/items', method: 'GET', headers: {},
    }, {
      routePath: '/api/items', routeType: 'route', routerKind: 'App Router',
      renderSource: 'server-rendering', revalidateReason: undefined,
    });
    expect(writeStructuredLog).not.toHaveBeenCalled();

    process.env.NEXT_RUNTIME = 'nodejs';
    await onRequestError(new Error('request failed'), {
      path: '/api/pr?id=private', method: 'POST', headers: {},
    }, {
      routePath: '/api/pr/[id]', routeType: 'route', routerKind: 'App Router',
      renderSource: 'server-rendering', revalidateReason: 'stale',
    });
    expect(writeStructuredLog).toHaveBeenCalledWith('error', 'http.request_failed', expect.objectContaining({
      method: 'POST',
      path: '/api/pr?id=%5BREDACTED%5D',
      route: '/api/pr/[id]',
      routeType: 'route',
    }), 'next');
  });
});
