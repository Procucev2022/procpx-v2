import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth('AUDIT_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;
  const startedAt = Date.now();
  try {
    const log = await prisma.auditLog.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, oldValue: true, newValue: true },
    });
    if (!log) return apiError(UI_STRINGS.appAppAuditPage.auditRecordNotFound, 404);
    return apiSuccess({ data: log });
  } catch (error) {
    await writeStructuredLog('error', 'audit.event_detail_read_failed', {
      operation: 'read_audit_event_detail', route: '/api/audit/[id]',
      requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined,
      tenantId: ctx.tenantId, userId: ctx.userId, auditLogId: id,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
    }, 'application');
    return apiError(UI_STRINGS.common.userMessages.failedToFetchAuditTrail, 500);
  }
}
