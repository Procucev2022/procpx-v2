// lib/audit.ts - Audit log helper
import { prisma } from './prisma';
import { logEvent } from './observability/server-logger';
import type { AuditParams } from "@app-types/lib/audit.types";


export async function createAuditLog(params: AuditParams) {
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
    // Never throw — audit failure must not break business flow, but a missing audit row must be traceable.
    logEvent('error', 'audit_log.create_failed', {
      tenantId: params.tenantId,
      projectId: params.projectId,
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      error: err,
    });
  }
}
