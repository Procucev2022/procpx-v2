import { onRequestError, register } from '../src/instrumentation';
import { initializeLogging, installConsoleCapture, writeStructuredLog } from '../src/lib/observability/server-logger';
import {
  initializeLogging as initializeEdgeLogging,
  installConsoleCapture as installEdgeConsoleCapture,
  writeStructuredLog as writeEdgeStructuredLog,
} from '../src/lib/observability/edge-logger';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


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

const REQUIRED_TEST_ENV: Record<string, string> = {
  NEXTAUTH_SECRET: 'test-secret',
  NEXTAUTH_URL: 'http://localhost:3000',
  DATABASE_PROVIDER: 'd1',
  UPLOAD_DIR: './uploads',
  GEMINI_API_KEY: 'test-gemini-key',
};

describe('Next.js logging instrumentation', () => {
  const originalRuntime = process.env.NEXT_RUNTIME;
  const originalEnv = Object.fromEntries(Object.keys(REQUIRED_TEST_ENV).map((name) => [name, process.env[name]]));

  beforeEach(() => {
    Object.assign(process.env, REQUIRED_TEST_ENV);
  });

  afterEach(() => {
    if (originalRuntime === undefined) delete process.env.NEXT_RUNTIME;
    else process.env.NEXT_RUNTIME = originalRuntime;
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    jest.clearAllMocks();
  });

  it('refuses to start when a required setting is missing', async () => {
    process.env.NEXT_RUNTIME = 'nodejs';
    delete process.env.GEMINI_API_KEY;
    await expect(register()).rejects.toThrow(
      interpolateUiString(UI_STRINGS.libEnv.missingRequiredSettings, { names: 'GEMINI_API_KEY' }),
    );
    expect(initializeLogging).not.toHaveBeenCalled();
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
      path: '/api/items', method: 'GET', headers: { 'x-request-id': 'edge-request-123' },
    }, {
      routePath: '/api/items', routeType: 'route', routerKind: 'App Router',
      renderSource: 'server-rendering', revalidateReason: undefined,
    });
    expect(writeEdgeStructuredLog).toHaveBeenCalledWith(UI_STRINGS.common.error2, 'http.request_failed', expect.objectContaining({
      method: 'GET',
      requestId: 'edge-request-123',
      path: '/api/items',
      route: '/api/items',
      runtime: 'edge',
    }), 'next');
    jest.clearAllMocks();

    process.env.NEXT_RUNTIME = 'nodejs';
    await onRequestError(new Error('request failed'), {
      path: '/api/pr?id=private', method: 'POST', headers: { 'cf-ray': 'cloudflare-ray-456' },
    }, {
      routePath: '/api/pr/[id]', routeType: 'route', routerKind: 'App Router',
      renderSource: 'server-rendering', revalidateReason: 'stale',
    });
    expect(writeStructuredLog).toHaveBeenCalledWith(UI_STRINGS.common.error2, 'http.request_failed', expect.objectContaining({
      method: 'POST',
      requestId: 'cloudflare-ray-456',
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
    expect(writeStructuredLog).toHaveBeenCalledWith(UI_STRINGS.common.error2, 'http.request_failed', expect.objectContaining({
      runtime: 'unknown',
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    }), 'next');
  });
});
