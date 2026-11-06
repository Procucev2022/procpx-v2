// lib/audit.ts - Audit log helper
import { prisma } from './prisma';
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
    console.error('audit.write_failed', {
      operation: 'create',
      tenantId: params.tenantId,
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      error: err,
    });
    // Never throw — audit failure must not break business flow
  }
}
