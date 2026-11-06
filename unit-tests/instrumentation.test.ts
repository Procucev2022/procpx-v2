import { onRequestError, register } from '../src/instrumentation';
import { initializeLogging, installConsoleCapture, writeStructuredLog } from '../src/lib/observability/server-logger';
import {
  initializeLogging as initializeEdgeLogging,
  installConsoleCapture as installEdgeConsoleCapture,
  writeStructuredLog as writeEdgeStructuredLog,
} from '../src/lib/observability/edge-logger';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/observability/server-logger', () => ({
  initializeLogging: jest.fn().mockResolvedValue(undefined),
  installConsoleCapture: jest.fn(),
  writeStructuredLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/lib/observability/edge-logger', () => ({
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

  it('initializes console-only logging in Edge runtime', async () => {
    process.env.NEXT_RUNTIME = 'edge';
    await register();
    expect(initializeEdgeLogging).toHaveBeenCalledTimes(1);
    expect(installEdgeConsoleCapture).toHaveBeenCalledTimes(1);
    expect(writeEdgeStructuredLog).toHaveBeenCalledWith(UI_STRINGS.componentsUiToast.info, 'application.server_started', { runtime: 'edge' }, 'next');
  });

  it('initializes local logging before accepting requests', async () => {
    process.env.NEXT_RUNTIME = 'nodejs';
    await register();
    expect(initializeLogging).toHaveBeenCalledTimes(1);
    expect(installConsoleCapture).toHaveBeenCalledTimes(1);
    expect(writeStructuredLog).toHaveBeenCalledWith(UI_STRINGS.componentsUiToast.info, 'application.server_started', expect.any(Object), 'next');
  });

  it('records request errors with sanitized path and route context in Edge and Node runtimes', async () => {
    process.env.NEXT_RUNTIME = 'edge';
    await onRequestError(new Error('edge failure'), {
      path: '/api/items', method: 'GET', headers: {},
    }, {
      routePath: '/api/items', routeType: 'route', routerKind: 'App Router',
      renderSource: 'server-rendering', revalidateReason: undefined,
    });
    expect(writeEdgeStructuredLog).toHaveBeenCalledWith(UI_STRINGS.common.error2, 'http.request_failed', expect.objectContaining({
      method: 'GET',
      path: '/api/items',
      route: '/api/items',
      runtime: 'edge',
    }), 'next');
    jest.clearAllMocks();

    process.env.NEXT_RUNTIME = 'nodejs';
    await onRequestError(new Error('request failed'), {
      path: '/api/pr?id=private', method: 'POST', headers: {},
    }, {
      routePath: '/api/pr/[id]', routeType: 'route', routerKind: 'App Router',
      renderSource: 'server-rendering', revalidateReason: 'stale',
    });
    expect(writeStructuredLog).toHaveBeenCalledWith(UI_STRINGS.common.error2, 'http.request_failed', expect.objectContaining({
      method: 'POST',
      path: '/api/pr?id=%5BREDACTED%5D',
      route: '/api/pr/[id]',
      routeType: 'route',
      runtime: 'nodejs',
    }), 'next');
  });

  it('uses the unknown runtime label when Next has not assigned a runtime yet', async () => {
    delete process.env.NEXT_RUNTIME;
    await register();
    expect(writeStructuredLog).toHaveBeenCalledWith(UI_STRINGS.componentsUiToast.info, 'application.server_started', { runtime: 'unknown' }, 'next');

    await onRequestError(new Error('runtime unavailable'), {
      path: '/api/health', method: 'GET', headers: {},
    }, {
      routePath: '/api/health', routeType: 'route', routerKind: 'App Router',
      renderSource: 'server-rendering', revalidateReason: undefined,
    });
    expect(writeStructuredLog).toHaveBeenCalledWith(UI_STRINGS.common.error2, 'http.request_failed', expect.objectContaining({ runtime: 'unknown' }), 'next');
  });
});
