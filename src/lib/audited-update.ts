import type { AuditedD1UpdateInput, AuditedD1UpdateRecord } from '@app-types/lib/audited-update.types';
import { AUDITED_UPDATE_ASSERT_SQL, AUDITED_UPDATE_FAILURE_EVENT, AUDITED_UPDATE_TABLES } from './audited-update.constants';
import { AUDIT_LOG_INSERT_AFTER_CHANGE_SQL } from './d1-batch.constants';
import { getD1BatchDatabase, runD1BatchAtomically } from './d1-batch';
import { writeStructuredLog } from './observability/server-logger';
import type { D1BatchDatabase, D1BatchInputStatement } from '@app-types/lib/d1-batch.types';
import { UI_STRINGS } from './ui-strings.constants';

function auditValues(input: AuditedD1UpdateInput, auditId: string, createdAt: Date): unknown[] {
  const audit = input.audit;
  return [
    auditId,
    audit.tenantId,
    audit.userId || null,
    audit.projectId || null,
    audit.entityType,
    audit.entityId,
    audit.action,
    audit.description,
    audit.oldValue ? JSON.stringify(audit.oldValue) : null,
    audit.newValue ? JSON.stringify(audit.newValue) : null,
    audit.ipAddress || null,
    audit.userAgent || null,
    createdAt,
  ];
}

export async function runAuditedD1UpdateAtomically(
  input: AuditedD1UpdateInput,
  database?: D1BatchDatabase,
): Promise<AuditedD1UpdateRecord> {
  if (input.audit.tenantId !== input.tenantId) throw new Error(UI_STRINGS.appLibAuditedUpdate.tenantMismatch);

  const tableConfig = AUDITED_UPDATE_TABLES[input.table];
  const entries = Object.entries(input.data).filter(([, value]) => value !== undefined);
  if (entries.some(([key]) => !(tableConfig.columns as readonly string[]).includes(key))) {
    throw new Error(UI_STRINGS.appLibAuditedUpdate.unsupportedField);
  }
  const jsonColumns = 'jsonColumns' in tableConfig ? tableConfig.jsonColumns as readonly string[] : [];
  const booleanColumns = 'booleanColumns' in tableConfig ? tableConfig.booleanColumns as readonly string[] : [];

  const updatedAt = input.updatedAt || new Date();
  const auditId = crypto.randomUUID();
  const assignments = entries.map(([key]) => `"${key}" = ?`);
  assignments.push('"updatedAt" = ?');
  const updateStatement: D1BatchInputStatement = {
    sql: `UPDATE "${tableConfig.table}" SET ${assignments.join(', ')} WHERE "id" = ? AND "tenantId" = ? RETURNING ${tableConfig.returning}`,
    values: [
      ...entries.map(([key, value]) => {
        if (jsonColumns.includes(key) && value !== null && typeof value === 'object') return JSON.stringify(value);
        if (booleanColumns.includes(key) && typeof value === 'boolean') return Number(value);
        return value;
      }),
      updatedAt,
      input.id,
      input.tenantId,
    ],
  };
  const auditStatement: D1BatchInputStatement = {
    sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
    values: auditValues(input, auditId, updatedAt),
  };
  const assertAuditStatement: D1BatchInputStatement = {
    sql: AUDITED_UPDATE_ASSERT_SQL,
    values: [auditId, input.tenantId, input.audit.entityType, input.audit.entityId],
  };
  const startedAt = Date.now();

  try {
    const results = await runD1BatchAtomically(database || getD1BatchDatabase(), [updateStatement, auditStatement, assertAuditStatement]);
    const updated = results[0]?.results?.[0];
    if (!updated || typeof updated.id !== 'string') throw new Error(UI_STRINGS.appLibAuditedUpdate.recordMissingAfterUpdate);
    return updated as AuditedD1UpdateRecord;
  } catch (error) {
    try {
      await writeStructuredLog('error', AUDITED_UPDATE_FAILURE_EVENT, {
        operation: 'update_with_audit',
        route: input.route,
        requestId: input.requestId || undefined,
        table: tableConfig.table,
        tenantId: input.tenantId,
        recordId: input.id,
        entityType: input.audit.entityType,
        entityId: input.audit.entityId,
        durationMs: Date.now() - startedAt,
        error: { name: error instanceof Error ? error.name : 'UnknownError' },
      }, 'application');
    } catch {
      // Preserve the atomic D1 failure if optional log persistence is unavailable.
    }
    throw error;
  }
}
