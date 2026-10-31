import type { Instrumentation } from 'next';
import { safeRequestPath, sanitizeLogValue } from './lib/observability/shared';

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { initializeLogging, installConsoleCapture, writeStructuredLog } = await import('./lib/observability/server-logger');
  await initializeLogging();
  installConsoleCapture();
  await writeStructuredLog('info', 'application.server_started', {
    runtime: process.env.NEXT_RUNTIME,
  }, 'next');
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { writeStructuredLog } = await import('./lib/observability/server-logger');
  const errorValue = sanitizeLogValue(error);
  await writeStructuredLog('error', 'http.request_failed', {
    requestId: crypto.randomUUID(),
    method: request.method,
    path: safeRequestPath(request.path),
    route: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
    renderSource: context.renderSource,
    revalidateReason: context.revalidateReason,
    error: errorValue,
  }, 'next');
};
