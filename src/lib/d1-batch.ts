import type {
  D1BatchDatabase,
  D1BatchInputStatement,
  D1BatchResult,
  RfqVendorInvitationWriteInput,
} from '@app-types/lib/d1-batch.types';
import {
  D1_BATCH_STATEMENT_FAILED,
  D1_BATCH_STATEMENT_LIMIT_EXCEEDED,
  D1_BATCH_BINDING_LIMIT_EXCEEDED,
  D1_STATEMENT_BINDING_LIMIT_EXCEEDED,
  D1_BINDING_SIZE_LIMIT_EXCEEDED,
  D1_BATCH_SLOW_LOG_THRESHOLD_MS,
  MAX_D1_BATCH_BINDINGS,
  MAX_D1_BATCH_STATEMENTS,
  MAX_D1_STATEMENT_BINDINGS,
  MAX_D1_BINDING_BYTES,
  MAX_RFQ_VENDOR_INVITE_COUNT,
  RFQ_VENDOR_INVITATION_BULK_UPSERT_SQL,
  RFQ_VENDOR_INVITATION_AUDIT_INSERT_SQL,
  RATE_CARD_APPROVAL_INSERT_AFTER_UPDATE_SQL,
  RATE_CARD_TRANSITION_ASSERT_SQL,
  AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
} from './d1-batch.constants';
import { UI_STRINGS } from './ui-strings.constants';
import { writeStructuredLog } from './observability/server-logger';

export type D1BatchLimitViolation = 'statement_count' | 'batch_bindings' | 'statement_bindings' | 'binding_size';

function getBindingSizeBytes(value: unknown): number {
  if (typeof value === 'string') return new TextEncoder().encode(value).byteLength;
  if (value instanceof Date) return new TextEncoder().encode(value.toISOString()).byteLength;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  return 0;
}

export function getD1BatchLimitViolation(input: D1BatchInputStatement[]): D1BatchLimitViolation | null {
  if (input.length > MAX_D1_BATCH_STATEMENTS) return 'statement_count';
  if (input.some(({ values }) => values.length > MAX_D1_STATEMENT_BINDINGS)) return 'statement_bindings';
  if (input.some(({ values }) => values.some((value) => getBindingSizeBytes(value) > MAX_D1_BINDING_BYTES))) return 'binding_size';
  const bindingCount = input.reduce((total, statement) => total + statement.values.length, 0);
  return bindingCount > MAX_D1_BATCH_BINDINGS ? 'batch_bindings' : null;
}

export function isD1BatchWithinLimits(input: D1BatchInputStatement[]): boolean {
  return getD1BatchLimitViolation(input) === null;
}

async function logD1BatchLimitViolation(input: D1BatchInputStatement[], violation: D1BatchLimitViolation): Promise<void> {
  const bindingCount = input.reduce((total, statement) => total + statement.values.length, 0);
  const maxBindingBytes = input.reduce((maximum, statement) => Math.max(
    maximum,
    ...statement.values.map(getBindingSizeBytes),
  ), 0);
  await writeStructuredLog('error', 'database.d1_batch_limit_exceeded', {
    operation: 'execute_d1_batch',
    violation,
    statementCount: input.length,
    bindingCount,
    maxStatements: MAX_D1_BATCH_STATEMENTS,
    maxBindings: MAX_D1_BATCH_BINDINGS,
    maxBindingsPerStatement: MAX_D1_STATEMENT_BINDINGS,
    maxBindingBytes,
    safeBindingByteLimit: MAX_D1_BINDING_BYTES,
  });
}

async function logD1BatchFailure(
  input: D1BatchInputStatement[],
  startedAt: number,
  error: unknown,
  failedStatementIndexes?: number[],
): Promise<void> {
  const bindingCount = input.reduce((total, statement) => total + statement.values.length, 0);
  try {
    await writeStructuredLog('error', 'database.d1_batch_failed', {
      operation: 'execute_d1_batch',
      statementCount: input.length,
      bindingCount,
      durationMs: Date.now() - startedAt,
      ...(failedStatementIndexes ? { failedStatementIndexes } : {}),
      error: error instanceof Error
        ? { name: error.name, message: error.message.slice(0, 500) }
        : { type: typeof error },
    });
  } catch {
    // Preserve the database failure when optional log storage is unavailable.
  }
}

function getBatchMetricTotal(results: D1BatchResult[], metric: 'duration' | 'rows_read' | 'rows_written'): number | undefined {
  const values = results.map((result) => result.meta?.[metric])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return values.length > 0 ? values.reduce((total, value) => total + value, 0) : undefined;
}

async function logSlowD1Batch(
  input: D1BatchInputStatement[],
  durationMs: number,
  results: D1BatchResult[],
): Promise<void> {
  const bindingCount = input.reduce((total, statement) => total + statement.values.length, 0);
  try {
    await writeStructuredLog('warn', 'database.d1_batch_slow', {
      operation: 'execute_d1_batch',
      statementCount: input.length,
      bindingCount,
      durationMs,
      d1DurationMs: getBatchMetricTotal(results, 'duration'),
      rowsRead: getBatchMetricTotal(results, 'rows_read'),
      rowsWritten: getBatchMetricTotal(results, 'rows_written'),
      slowThresholdMs: D1_BATCH_SLOW_LOG_THRESHOLD_MS,
    });
  } catch {
    // Preserve the successful database write when optional log storage is unavailable.
  }
}

export function getD1BatchDatabase(): D1BatchDatabase {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getCloudflareContext } = require('@opennextjs/cloudflare') as typeof import('@opennextjs/cloudflare');
  const context = getCloudflareContext() as unknown as { env?: { DB?: D1BatchDatabase } };
  const database = context.env?.DB;
  if (!database || typeof database.batch !== 'function') {
    throw new Error(UI_STRINGS.appApiProcurementRfqsIdVendorsRoute.d1BatchBindingUnavailable);
  }
  return database;
}

export async function runD1BatchAtomically(
  database: D1BatchDatabase,
  input: D1BatchInputStatement[],
): Promise<D1BatchResult[]> {
  if (input.length === 0) return [];
  const violation = getD1BatchLimitViolation(input);
  if (violation) {
    try {
      await logD1BatchLimitViolation(input, violation);
    } catch {
      // Preserve the limit rejection when optional log storage is unavailable.
    }
    if (violation === 'statement_count') throw new Error(D1_BATCH_STATEMENT_LIMIT_EXCEEDED);
    if (violation === 'statement_bindings') throw new Error(D1_STATEMENT_BINDING_LIMIT_EXCEEDED);
    if (violation === 'binding_size') throw new Error(D1_BINDING_SIZE_LIMIT_EXCEEDED);
    throw new Error(D1_BATCH_BINDING_LIMIT_EXCEEDED);
  }
  const startedAt = Date.now();
  let results: D1BatchResult[];
  try {
    results = await database.batch(input.map(({ sql, values }) => database.prepare(sql).bind(
      ...values.map((value) => value instanceof Date ? value.toISOString() : value),
    )));
  } catch (error) {
    await logD1BatchFailure(input, startedAt, error);
    throw error;
  }
  const failedStatementIndexes = results.flatMap((result, index) => result.success === false ? [index] : []);
  if (failedStatementIndexes.length > 0) {
    const error = new Error(D1_BATCH_STATEMENT_FAILED);
    await logD1BatchFailure(input, startedAt, error, failedStatementIndexes);
    throw error;
  }
  const durationMs = Date.now() - startedAt;
  const d1DurationMs = getBatchMetricTotal(results, 'duration');
  if (durationMs >= D1_BATCH_SLOW_LOG_THRESHOLD_MS || (d1DurationMs ?? 0) >= D1_BATCH_SLOW_LOG_THRESHOLD_MS) {
    await logSlowD1Batch(input, durationMs, results);
  }
  return results;
}

export async function writeD1BatchAtomically(input: D1BatchInputStatement[]): Promise<D1BatchResult[]> {
  return runD1BatchAtomically(getD1BatchDatabase(), input);
}

export async function writeRfqVendorInvitationsAtomically(input: RfqVendorInvitationWriteInput): Promise<number> {
  const vendorIds = [...new Set(input.vendorIds)];
  if (vendorIds.length === 0) return 0;
  if (vendorIds.length > MAX_RFQ_VENDOR_INVITE_COUNT) {
    throw new Error(UI_STRINGS.appApiProcurementRfqsIdVendorsRoute.maximumVendorInviteBatchLimit);
  }

  const createdAt = input.createdAt || new Date();
  const invitationRows = vendorIds.map((vendorId) => ({ id: crypto.randomUUID(), vendorId }));
  let results: D1BatchResult[];
  try {
    results = await runD1BatchAtomically(getD1BatchDatabase(), [
      {
        sql: RFQ_VENDOR_INVITATION_BULK_UPSERT_SQL,
        values: [JSON.stringify(invitationRows), input.tenantId, input.rfqId, input.tenantId],
      },
      {
        sql: RFQ_VENDOR_INVITATION_AUDIT_INSERT_SQL,
        values: [crypto.randomUUID(), input.tenantId, input.audit.userId || null, input.audit.projectId || null,
          input.rfqId, input.audit.description, JSON.stringify({ vendorIds }), createdAt],
      },
    ]);
  } catch (error) {
    if (error instanceof Error && error.message === D1_BATCH_STATEMENT_FAILED) {
      throw new Error(UI_STRINGS.appApiProcurementRfqsIdVendorsRoute.failedToInviteVendors);
    }
    throw error;
  }
  if (Number(results[1]?.meta?.changes || 0) !== 1) {
    throw new Error(UI_STRINGS.appApiProcurementRfqsIdVendorsRoute.failedToInviteVendors);
  }
  return Number(results[0]?.meta?.changes || 0);
}

export async function writeRateCardTransitionAtomically(input: {
  updateSql: string;
  updateValues: unknown[];
  approvalValues: unknown[];
  auditValues: unknown[];
}): Promise<boolean> {
  const results = await runD1BatchAtomically(getD1BatchDatabase(), [
    { sql: input.updateSql, values: input.updateValues },
    { sql: RATE_CARD_APPROVAL_INSERT_AFTER_UPDATE_SQL, values: input.approvalValues },
    { sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL, values: input.auditValues },
    {
      sql: RATE_CARD_TRANSITION_ASSERT_SQL,
      values: [
        input.approvalValues[0], input.approvalValues[1], input.approvalValues[2],
        input.auditValues[0], input.auditValues[1], input.auditValues[4], input.auditValues[5],
      ],
    },
  ]);
  return results.slice(0, 3).every((result) => Number(result.meta?.changes || 0) === 1)
    && results[3]?.results?.[0]?.transition === '{}';
}
