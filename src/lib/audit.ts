// lib/audit.ts - Audit log helper
import { prisma } from './prisma';

interface AuditParams {
  tenantId: string;
  userId?: string;
  projectId?: string;
  entityType: string;
  entityId: string;
  action: string;
  description: string;
  oldValue?: object;
  newValue?: object;
  ipAddress?: string;
  userAgent?: string;
}

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
    console.error('Audit log creation failed:', err);
    // Never throw — audit failure must not break business flow
  }
}
