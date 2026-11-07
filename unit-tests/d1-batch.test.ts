import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { D1BatchDatabase, D1BatchResult, D1BatchStatement } from '@app-types/lib/d1-batch.types';
import {
  getD1BatchDatabase,
  runD1BatchAtomically,
  writeD1BatchAtomically,
  upsertRfqVendorInvitations,
  writeRfqVendorInvitationsAtomically,
  writeRateCardTransitionAtomically,
  getD1BatchLimitViolation,
  isD1BatchWithinLimits,
} from '../src/lib/d1-batch';
import {
  D1_BATCH_BINDING_LIMIT_EXCEEDED,
  D1_BATCH_STATEMENT_FAILED,
  D1_BATCH_STATEMENT_LIMIT_EXCEEDED,
  D1_STATEMENT_BINDING_LIMIT_EXCEEDED,
  D1_BINDING_SIZE_LIMIT_EXCEEDED,
  MAX_D1_BINDING_BYTES,
  MAX_D1_BATCH_STATEMENTS,
  MAX_D1_STATEMENT_BINDINGS,
  RATE_CARD_APPROVAL_INSERT_AFTER_UPDATE_SQL,
  RFQ_VENDOR_INVITATION_UPSERT_SQL,
} from '../src/lib/d1-batch.constants';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { writeStructuredLog } from '../src/lib/observability/server-logger';

jest.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn().mockResolvedValue({}) }));

const getContextMock = getCloudflareContext as jest.Mock;

function createDatabase(results: D1BatchResult[] = []) {
  const bound: Array<{ sql: string; values: unknown[] }> = [];
  const database: D1BatchDatabase = {
    prepare: jest.fn((sql: string) => ({
      bind: (...values: unknown[]) => {
        const statement = { sql, values };
        bound.push(statement);
        return statement as unknown as D1BatchStatement;
      },
    })) as unknown as D1BatchDatabase['prepare'],
    batch: jest.fn().mockResolvedValue(results),
  };
  return { database, bound };
}

describe('native D1 batch writes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves the request-scoped DB binding and reports a missing binding', () => {
    const { database } = createDatabase();
    getContextMock.mockReturnValueOnce({ env: { DB: database } });
    expect(getD1BatchDatabase()).toBe(database);

    getContextMock.mockReturnValueOnce({ env: {} });
    expect(() => getD1BatchDatabase()).toThrow(UI_STRINGS.appApiProcurementRfqsIdVendorsRoute.d1BatchBindingUnavailable);
    getContextMock.mockReturnValueOnce({ env: { DB: {} } });
    expect(() => getD1BatchDatabase()).toThrow(UI_STRINGS.appApiProcurementRfqsIdVendorsRoute.d1BatchBindingUnavailable);
  });

  it('upserts invitations in one D1 batch and totals changed rows', async () => {
    const { database, bound } = createDatabase([{ meta: { changes: 1 } }, { meta: { changes: 2 } }, {}]);
    await expect(upsertRfqVendorInvitations(database, {
      tenantId: 'tenant-1', rfqId: 'rfq-1', vendorIds: ['vendor-1', 'vendor-2', 'vendor-3'], invitationStatus: 'INVITED',
    })).resolves.toBe(3);

    expect(database.prepare).toHaveBeenCalledWith(RFQ_VENDOR_INVITATION_UPSERT_SQL);
    expect(database.batch).toHaveBeenCalledTimes(1);
    expect(database.batch).toHaveBeenCalledWith(expect.arrayContaining([expect.any(Object), expect.any(Object), expect.any(Object)]));
    expect(bound).toHaveLength(3);
    expect(bound[0]).toMatchObject({ sql: RFQ_VENDOR_INVITATION_UPSERT_SQL, values: [expect.any(String), 'tenant-1', 'rfq-1', 'vendor-1', 'INVITED'] });
  });

  it('executes ordered writes as one atomic D1 batch and surfaces a failed result', async () => {
    const { database, bound } = createDatabase([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    await expect(runD1BatchAtomically(database, [])).resolves.toEqual([]);
    expect(database.batch).not.toHaveBeenCalled();
    const input = [
      { sql: 'UPDATE workflow SET state = ?', values: ['SUPERSEDED'] },
      { sql: 'INSERT INTO workflow (state) VALUES (?)', values: ['ACTIVE'] },
    ];
    await expect(runD1BatchAtomically(database, input)).resolves.toHaveLength(2);
    expect(database.batch).toHaveBeenCalledTimes(1);
    expect(bound.map(({ sql }) => sql)).toEqual(input.map(({ sql }) => sql));

    const failed = createDatabase([{ success: false }]);
    await expect(runD1BatchAtomically(failed.database, [{ sql: 'UPDATE workflow SET state = ?', values: ['ACTIVE'] }]))
      .rejects.toThrow(D1_BATCH_STATEMENT_FAILED);
    expect(writeStructuredLog).toHaveBeenCalledWith('error', 'database.d1_batch_failed', expect.objectContaining({
      operation: 'execute_d1_batch', statementCount: 1, bindingCount: 1,
      failedStatementIndexes: [0], error: { name: 'Error', message: D1_BATCH_STATEMENT_FAILED },
    }));

    await expect(runD1BatchAtomically(failed.database, Array.from({ length: MAX_D1_BATCH_STATEMENTS + 1 }, () => ({
      sql: 'UPDATE workflow SET state = ?', values: ['ACTIVE'],
    })))).rejects.toThrow(D1_BATCH_STATEMENT_LIMIT_EXCEEDED);
  });

  it('rejects batches that exceed Cloudflare D1 binding limits before preparing statements', async () => {
    const { database } = createDatabase();
    const atLimit = Array.from({ length: 45 }, () => ({ sql: 'INSERT INTO records VALUES (?)', values: Array(100).fill('value') }));
    expect(getD1BatchLimitViolation(atLimit)).toBeNull();
    expect(isD1BatchWithinLimits(atLimit)).toBe(true);

    const overBatchLimit = [...atLimit, { sql: 'INSERT INTO records VALUES (?)', values: Array(1).fill('value') }];
    expect(getD1BatchLimitViolation(overBatchLimit)).toBe('batch_bindings');
    await expect(runD1BatchAtomically(database, overBatchLimit)).rejects.toThrow(D1_BATCH_BINDING_LIMIT_EXCEEDED);

    const overStatementLimit = [{ sql: 'INSERT INTO records VALUES (?)', values: Array(MAX_D1_STATEMENT_BINDINGS + 1).fill('value') }];
    expect(getD1BatchLimitViolation(overStatementLimit)).toBe('statement_bindings');
    expect(isD1BatchWithinLimits(overStatementLimit)).toBe(false);
    await expect(runD1BatchAtomically(database, overStatementLimit)).rejects.toThrow(D1_STATEMENT_BINDING_LIMIT_EXCEEDED);

    const overBindingSize = [{ sql: 'INSERT INTO records VALUES (?)', values: ['x'.repeat(MAX_D1_BINDING_BYTES + 1)] }];
    expect(getD1BatchLimitViolation(overBindingSize)).toBe('binding_size');
    expect(isD1BatchWithinLimits(overBindingSize)).toBe(false);
    await expect(runD1BatchAtomically(database, overBindingSize)).rejects.toThrow(D1_BINDING_SIZE_LIMIT_EXCEEDED);
    expect(database.prepare).not.toHaveBeenCalled();
    expect(database.batch).not.toHaveBeenCalled();
    expect(writeStructuredLog).toHaveBeenCalledWith('error', 'database.d1_batch_limit_exceeded', expect.objectContaining({
      operation: 'execute_d1_batch', statementCount: 1, bindingCount: MAX_D1_STATEMENT_BINDINGS + 1,
      maxBindings: 4_500, maxBindingsPerStatement: MAX_D1_STATEMENT_BINDINGS,
    }));
  });

  it('rejects an oversized binding even when optional diagnostic storage fails', async () => {
    const { database } = createDatabase();
    (writeStructuredLog as jest.Mock).mockRejectedValueOnce(new Error('log storage unavailable'));
    await expect(runD1BatchAtomically(database, [{ sql: 'INSERT INTO records VALUES (?)', values: ['x'.repeat(MAX_D1_BINDING_BYTES + 1)] }]))
      .rejects.toThrow(D1_BINDING_SIZE_LIMIT_EXCEEDED);
    expect(database.prepare).not.toHaveBeenCalled();
  });

  it('logs rejected D1 batches without SQL or values and preserves the original error', async () => {
    const { database } = createDatabase();
    const databaseError = new Error('database unavailable');
    (database.batch as jest.Mock).mockRejectedValueOnce(databaseError);
    const input = [{ sql: 'UPDATE private_records SET token = ?', values: ['sensitive-value'] }];

    await expect(runD1BatchAtomically(database, input)).rejects.toBe(databaseError);

    const [, , context] = (writeStructuredLog as jest.Mock).mock.calls[0];
    expect(context).toMatchObject({
      operation: 'execute_d1_batch', statementCount: 1, bindingCount: 1,
      durationMs: expect.any(Number), error: { name: 'Error', message: 'database unavailable' },
    });
    expect(context).not.toHaveProperty('sql');
    expect(context).not.toHaveProperty('values');
    expect(JSON.stringify(context)).not.toContain('sensitive-value');
  });

  it('warns on slow successful batches with D1 read and write metrics', async () => {
    const { database } = createDatabase([{
      success: true,
      meta: { duration: 1_200, rows_read: 35, rows_written: 4 },
    }]);

    await expect(runD1BatchAtomically(database, [{ sql: 'UPDATE workflow SET state = ?', values: ['ACTIVE'] }]))
      .resolves.toHaveLength(1);

    expect(writeStructuredLog).toHaveBeenCalledWith('warn', 'database.d1_batch_slow', expect.objectContaining({
      operation: 'execute_d1_batch', statementCount: 1, bindingCount: 1,
      durationMs: expect.any(Number), d1DurationMs: 1_200, rowsRead: 35, rowsWritten: 4,
      slowThresholdMs: 1_000,
    }));
  });

  it('keeps a successful batch successful when slow-batch logging fails', async () => {
    const { database } = createDatabase([{ success: true, meta: { duration: 1_500 } }]);
    (writeStructuredLog as jest.Mock).mockRejectedValueOnce(new Error('log storage unavailable'));

    await expect(runD1BatchAtomically(database, [{ sql: 'UPDATE workflow SET state = ?', values: ['ACTIVE'] }]))
      .resolves.toHaveLength(1);
  });

  it('preserves a D1 failure when central logging also fails', async () => {
    const { database } = createDatabase();
    const databaseError = new Error('database unavailable');
    (database.batch as jest.Mock).mockRejectedValueOnce(databaseError);
    (writeStructuredLog as jest.Mock).mockRejectedValueOnce(new Error('log storage unavailable'));

    await expect(runD1BatchAtomically(database, [{ sql: 'UPDATE workflow SET state = ?', values: ['ACTIVE'] }]))
      .rejects.toBe(databaseError);
  });

  it('normalizes Date parameters to ISO strings for D1 binding', async () => {
    const { database, bound } = createDatabase([{ meta: { changes: 1 } }]);
    const createdAt = new Date('2026-11-03T12:34:56.000Z');
    await runD1BatchAtomically(database, [{ sql: 'INSERT INTO events (createdAt) VALUES (?)', values: [createdAt] }]);
    expect(bound[0].values).toEqual([createdAt.toISOString()]);
  });

  it('returns without opening D1 for an empty list and rejects oversized batches', async () => {
    const { database } = createDatabase();
    await expect(upsertRfqVendorInvitations(database, {
      tenantId: 'tenant-1', rfqId: 'rfq-1', vendorIds: [], invitationStatus: 'PENDING',
    })).resolves.toBe(0);
    expect(database.prepare).not.toHaveBeenCalled();

    await expect(upsertRfqVendorInvitations(database, {
      tenantId: 'tenant-1', rfqId: 'rfq-1',
      vendorIds: Array.from({ length: MAX_D1_BATCH_STATEMENTS + 1 }, (_, index) => `vendor-${index}`),
      invitationStatus: 'PENDING',
    })).rejects.toThrow(UI_STRINGS.appApiProcurementRfqsIdVendorsRoute.maximumVendorInviteBatchLimit);
    expect(database.batch).not.toHaveBeenCalled();
  });

  it('surfaces failed atomic batches and obtains the binding for the workflow wrapper', async () => {
    const failed = createDatabase([{ success: false }]);
    await expect(upsertRfqVendorInvitations(failed.database, {
      tenantId: 'tenant-1', rfqId: 'rfq-1', vendorIds: ['vendor-1'], invitationStatus: 'PENDING',
    })).rejects.toThrow(UI_STRINGS.appApiProcurementRfqsIdVendorsRoute.failedToInviteVendors);

    const offline = createDatabase();
    (offline.database.batch as jest.Mock).mockRejectedValueOnce(new Error('database unavailable'));
    await expect(upsertRfqVendorInvitations(offline.database, {
      tenantId: 'tenant-1', rfqId: 'rfq-1', vendorIds: ['vendor-1'], invitationStatus: 'PENDING',
    })).rejects.toThrow('database unavailable');

    const genericBatch = createDatabase([{ meta: { changes: 1 } }]);
    getContextMock.mockReturnValueOnce({ env: { DB: genericBatch.database } });
    await expect(writeD1BatchAtomically([{ sql: 'INSERT INTO workflow (state) VALUES (?)', values: ['ACTIVE'] }]))
      .resolves.toHaveLength(1);

    const { database } = createDatabase([{ meta: { changes: 1 } }]);
    getContextMock.mockReturnValueOnce({ env: { DB: database } });
    await expect(writeRfqVendorInvitationsAtomically({
      tenantId: 'tenant-1', rfqId: 'rfq-1', vendorIds: ['vendor-1'], invitationStatus: 'PENDING',
    })).resolves.toBe(1);
  });

  it('stores rate-card state changes, approval history, and audit in one compare-and-set batch', async () => {
    const changed = createDatabase([
      { success: true, meta: { changes: 1 } },
      { success: true, meta: { changes: 1 } },
      { success: true, meta: { changes: 1 } },
    ]);
    getContextMock.mockReturnValueOnce({ env: { DB: changed.database } });
    await expect(writeRateCardTransitionAtomically({
      updateSql: 'UPDATE vendor_rate_cards SET status = ?',
      updateValues: ['APPROVED'],
      approvalValues: ['approval-1'],
      auditValues: ['audit-1'],
    })).resolves.toBe(true);
    expect(changed.database.batch).toHaveBeenCalledTimes(1);
    expect(changed.bound).toEqual([
      { sql: 'UPDATE vendor_rate_cards SET status = ?', values: ['APPROVED'] },
      { sql: RATE_CARD_APPROVAL_INSERT_AFTER_UPDATE_SQL, values: ['approval-1'] },
      { sql: expect.stringContaining('INSERT INTO "audit_logs"'), values: ['audit-1'] },
    ]);

    const stale = createDatabase([
      { success: true, meta: { changes: 0 } },
      { success: true, meta: { changes: 0 } },
      { success: true, meta: { changes: 0 } },
    ]);
    getContextMock.mockReturnValueOnce({ env: { DB: stale.database } });
    await expect(writeRateCardTransitionAtomically({
      updateSql: 'UPDATE vendor_rate_cards SET status = ?',
      updateValues: ['APPROVED'],
      approvalValues: ['approval-2'],
      auditValues: ['audit-2'],
    })).resolves.toBe(false);
  });
});
