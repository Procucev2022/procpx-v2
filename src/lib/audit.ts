// lib/audit.ts - Audit log helper
import { prisma } from './prisma';
import type { AuditParams } from "@app-types/lib/audit.types";
import { writeStructuredLog } from './observability/server-logger';

function getSafeErrorContext(error: unknown): Record<string, string> {
  if (error === null || typeof error !== 'object') return { type: typeof error };

  const details = error as { name?: unknown; code?: unknown };
  const name = typeof details.name === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(details.name)
    ? details.name
    : 'Error';
  const code = typeof details.code === 'string' && /^[A-Z0-9_]{2,32}$/.test(details.code)
    ? details.code
    : undefined;

  return { name, ...(code ? { code } : {}) };
}

function getSafeRequestId(requestId?: string): string | undefined {
  if (!requestId) return undefined;
  const normalized = requestId.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 128);
  return normalized || undefined;
}


export async function createAuditLog(params: AuditParams) {
  const startedAt = Date.now();
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        projectId: params.projectId,
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        description: params.description,
        oldValue: params.oldValue ? JSON.stringify(params.oldValue) : null,
        newValue: params.newValue ? JSON.stringify(params.newValue) : null,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  } catch (err) {
    const context = {
      operation: 'create_audit_log',
      module: 'audit',
      ...(params.route ? { route: params.route.slice(0, 256) } : {}),
      ...(getSafeRequestId(params.requestId) ? { requestId: getSafeRequestId(params.requestId) } : {}),
      tenantId: params.tenantId,
      userId: params.userId,
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      durationMs: Date.now() - startedAt,
      status: 'failed',
      error: getSafeErrorContext(err),
    };
    try {
      await writeStructuredLog('error', 'audit.write_failed', context);
    } catch (loggingError) {
      console.error('audit.write_failed_log_failed', {
        ...context,
        loggingError: getSafeErrorContext(loggingError),
      });
    }
    // Never throw — audit failure must not break business flow
  }
}
