// app/api/admin/businesses/route.ts - businesses the caller may link new users to.
import { NextRequest } from 'next/server';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { loadBusinessDirectory } from '@/lib/business-directory';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';

export async function GET(req: NextRequest) {
  const ctx = await requireAuth('USER_CREATE');
  if (!isApiContext(ctx)) return ctx;

  const startedAt = Date.now();
  try {
    return apiSuccess(await loadBusinessDirectory(ctx));
  } catch (error: unknown) {
    await writeStructuredLog('error', 'admin.business_directory_read_failed', {
      operation: 'list_businesses', route: '/api/admin/businesses',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.appApiAdminBusinessesRoute.failedToFetchBusinesses, 500);
  }
}
