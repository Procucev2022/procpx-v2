// app/api/audit/route.ts - Audit trail
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { requireAuth, isApiContext, apiSuccess, apiError, getListPageWindow } from '@/lib/api-utils';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import type { AuditLogListQueryRow } from '@app-types/app/api/audit/route.types';

export async function GET(req: NextRequest) {
  const ctx = await requireAuth('AUDIT_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const { page, pageSize, skip } = getListPageWindow(searchParams);
  const entityType = (searchParams.get('entityType') || '').trim().slice(0, 80);
  const action = (searchParams.get('action') || '').trim().slice(0, 100);
  const projectId = (searchParams.get('projectId') || '').trim().slice(0, 128);

  const where: Prisma.AuditLogWhereInput = { tenantId: ctx.tenantId };
  if (entityType) where.entityType = entityType;
  if (action) where.action = action;
  if (projectId) where.projectId = projectId;

  const startedAt = Date.now();
  try {
    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.$queryRaw<AuditLogListQueryRow[]>(Prisma.sql`
        SELECT audit_log."id", audit_log."createdAt", audit_log."entityType", audit_log."entityId",
          audit_log."action", audit_log."description",
          CASE WHEN audit_log."oldValue" IS NOT NULL OR audit_log."newValue" IS NOT NULL THEN 1 ELSE 0 END AS "hasDiff",
          user."id" AS "userId", user."name" AS "userName", user."email" AS "userEmail"
        FROM "audit_logs" AS audit_log
        LEFT JOIN "users" AS user
          ON user."id" = audit_log."userId" AND user."tenantId" = audit_log."tenantId"
        WHERE audit_log."tenantId" = ${ctx.tenantId}
          ${entityType ? Prisma.sql`AND audit_log."entityType" = ${entityType}` : Prisma.empty}
          ${action ? Prisma.sql`AND audit_log."action" = ${action}` : Prisma.empty}
          ${projectId ? Prisma.sql`AND audit_log."projectId" = ${projectId}` : Prisma.empty}
        ORDER BY audit_log."createdAt" DESC, audit_log."id" DESC
        LIMIT ${pageSize} OFFSET ${skip}
      `),
    ]);

    const data = logs.map(({ userId, userName, userEmail, hasDiff, createdAt, ...log }) => ({
      ...log,
      createdAt: createdAt instanceof Date ? createdAt.toISOString() : createdAt,
      hasDiff: Boolean(hasDiff),
      user: userId ? { name: userName, email: userEmail || '' } : null,
    }));
    return apiSuccess({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (error) {
    await writeStructuredLog('error', 'audit.trail_read_failed', {
      operation: 'list_audit_trail', route: '/api/audit',
      requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined,
      tenantId: ctx.tenantId, userId: ctx.userId,
      entityType: entityType || undefined, action: action || undefined, projectId: projectId || undefined,
      page, pageSize, durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
    }, 'application');
    return apiError(UI_STRINGS.common.userMessages.failedToFetchAuditTrail, 500);
  }
}
