import type { Instrumentation } from 'next';
import { getRequestCorrelationId, safeRequestPath, sanitizeLogValue } from './lib/observability/shared';

type RuntimeLogger = typeof import('./lib/observability/server-logger');

function getRuntimeLogger(): RuntimeLogger {
  if (process.env.NEXT_RUNTIME === 'edge') {
    // Next.js keeps runtime-specific instrumentation in separate bundles.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('./lib/observability/edge-logger') as RuntimeLogger;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./lib/observability/server-logger') as RuntimeLogger;
}

export async function register(): Promise<void> {
  const { initializeLogging, installConsoleCapture, writeStructuredLog } = getRuntimeLogger();
  await initializeLogging();
  installConsoleCapture();
  await writeStructuredLog('info', 'application.server_started', {
    runtime: process.env.NEXT_RUNTIME || 'unknown',
  }, 'next');
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { writeStructuredLog } = getRuntimeLogger();
  const errorValue = sanitizeLogValue(error);
  await writeStructuredLog('error', 'http.request_failed', {
    requestId: getRequestCorrelationId(request.headers) || crypto.randomUUID(),
    method: request.method,
    path: safeRequestPath(request.path),
    route: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
    renderSource: context.renderSource,
    revalidateReason: context.revalidateReason,
    runtime: process.env.NEXT_RUNTIME || 'unknown',
    error: errorValue,
  }, 'next');
};
