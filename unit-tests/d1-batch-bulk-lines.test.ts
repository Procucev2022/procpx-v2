import {
  chunkRowsForJsonBinding,
  sumD1BatchChanges,
  toBulkBoqLineInsertStatements,
  toBulkPrLineInsertStatements,
} from '../src/lib/d1-batch';
import {
  BOQ_LINE_BULK_INSERT_AFTER_AUDIT_SQL,
  BOQ_LINE_BULK_INSERT_AFTER_REVISION_SQL,
  BOQ_LINE_BULK_MAX_JSON_BYTES,
  BOQ_LINE_BULK_MAX_ROWS,
  BOQ_LINE_INSERT_AFTER_AUDIT_SQL,
  BOQ_LINE_INSERT_AFTER_REVISION_SQL,
  BOQ_LINE_INSERT_COLUMN_COUNT,
  BOQ_LINE_PER_STATEMENT_MAX,
  D1_BATCH_STATEMENT_FAILED,
  PR_LINE_INSERT_COLUMN_COUNT,
  PROCUREMENT_REQUEST_LINE_BULK_INSERT_SQL,
  PROCUREMENT_REQUEST_LINE_INSERT_AFTER_PARENT_SQL,
} from '../src/lib/d1-batch.constants';

const createdAt = new Date('2026-11-23T10:00:00.000Z');

function lineValues(index: number, description = `Line ${index}`): unknown[] {
  const values: unknown[] = Array.from({ length: BOQ_LINE_INSERT_COLUMN_COUNT }, () => null);
  values[0] = `line-${index}`;
  values[3] = String(index);
  values[4] = description;
  values[11] = index + 0.5;
  values[24] = true; // benchmarkEligible
  values[27] = false; // isDeleted
  values[28] = undefined; // deletedAt
  values[43] = createdAt;
  values[44] = createdAt;
  return values;
}

const auditLine = (index: number, revisionId = 'revision-1') => ({
  sql: BOQ_LINE_INSERT_AFTER_AUDIT_SQL,
  values: [...lineValues(index), 'audit-1', 'tenant-1', revisionId, 'tenant-1'],
});
const revisionLine = (index: number) => ({
  sql: BOQ_LINE_INSERT_AFTER_REVISION_SQL,
  values: [...lineValues(index), 'revision-1', 'tenant-1'],
});

describe('JSON bulk BOQ line inserts', () => {
  it('keeps one statement per line up to the proven per-statement maximum', () => {
    const statements = Array.from({ length: BOQ_LINE_PER_STATEMENT_MAX }, (_, index) => auditLine(index + 1));
    expect(toBulkBoqLineInsertStatements(statements)).toBe(statements);
    expect(toBulkBoqLineInsertStatements([])).toEqual([]);
  });

  it('merges larger line sets into bulk statements with the same guards and JSON-safe values', () => {
    const lines = Array.from({ length: BOQ_LINE_BULK_MAX_ROWS + 5 }, (_, index) => auditLine(index + 1));
    const bulk = toBulkBoqLineInsertStatements(lines);

    expect(bulk).toHaveLength(2);
    expect(bulk.every((statement) => statement.sql === BOQ_LINE_BULK_INSERT_AFTER_AUDIT_SQL)).toBe(true);
    expect(bulk[0].values.slice(1)).toEqual(['audit-1', 'tenant-1', 'revision-1', 'tenant-1']);
    const firstChunk = JSON.parse(bulk[0].values[0] as string) as unknown[][];
    const secondChunk = JSON.parse(bulk[1].values[0] as string) as unknown[][];
    expect(firstChunk).toHaveLength(BOQ_LINE_BULK_MAX_ROWS);
    expect(secondChunk).toHaveLength(5);
    // Dates become ISO text, booleans 1/0 and undefined null, matching what D1 stores per line.
    expect(firstChunk[0]).toHaveLength(BOQ_LINE_INSERT_COLUMN_COUNT);
    expect(firstChunk[0][24]).toBe(1);
    expect(firstChunk[0][27]).toBe(0);
    expect(firstChunk[0][28]).toBeNull();
    expect(firstChunk[0][43]).toBe(createdAt.toISOString());
    expect(firstChunk[0][11]).toBe(1.5);
  });

  it('uses the revision guard for revision-guarded inserts', () => {
    const bulk = toBulkBoqLineInsertStatements(Array.from({ length: BOQ_LINE_PER_STATEMENT_MAX + 1 }, (_, index) => revisionLine(index + 1)));
    expect(bulk).toEqual([{ sql: BOQ_LINE_BULK_INSERT_AFTER_REVISION_SQL, values: [expect.any(String), 'revision-1', 'tenant-1'] }]);
  });

  it('splits chunks by JSON size as well as row count', () => {
    const longText = 'x'.repeat(Math.ceil(BOQ_LINE_BULK_MAX_JSON_BYTES / 90));
    const lines = Array.from({ length: BOQ_LINE_PER_STATEMENT_MAX + 20 }, (_, index) => ({
      sql: BOQ_LINE_INSERT_AFTER_AUDIT_SQL,
      values: [...lineValues(index + 1, longText), 'audit-1', 'tenant-1', 'revision-1', 'tenant-1'],
    }));
    const bulk = toBulkBoqLineInsertStatements(lines);
    expect(bulk.length).toBeGreaterThan(1);
    for (const statement of bulk) {
      expect(new TextEncoder().encode(statement.values[0] as string).byteLength).toBeLessThanOrEqual(BOQ_LINE_BULK_MAX_JSON_BYTES);
    }
    expect(bulk.reduce((total, statement) => total + (JSON.parse(statement.values[0] as string) as unknown[]).length, 0)).toBe(lines.length);
  });

  it('refuses to merge lines for different revisions or with unknown SQL', () => {
    const lines = Array.from({ length: BOQ_LINE_PER_STATEMENT_MAX + 1 }, (_, index) => auditLine(index + 1));
    lines[40] = auditLine(41, 'revision-2');
    expect(() => toBulkBoqLineInsertStatements(lines)).toThrow(D1_BATCH_STATEMENT_FAILED);

    const mixedSql = Array.from({ length: BOQ_LINE_PER_STATEMENT_MAX + 1 }, (_, index) => auditLine(index + 1));
    mixedSql[3] = { ...mixedSql[3], sql: BOQ_LINE_INSERT_AFTER_REVISION_SQL };
    expect(() => toBulkBoqLineInsertStatements(mixedSql)).toThrow(D1_BATCH_STATEMENT_FAILED);

    expect(() => toBulkBoqLineInsertStatements([{ sql: 'INSERT INTO "other"', values: [] }])).toThrow(D1_BATCH_STATEMENT_FAILED);
  });

  it('generates a valid bulk SELECT for every line column', () => {
    for (let index = 0; index < BOQ_LINE_INSERT_COLUMN_COUNT; index += 1) {
      expect(BOQ_LINE_BULK_INSERT_AFTER_AUDIT_SQL).toContain(`json_extract(line.value, '$[${index}]')`);
    }
    expect(BOQ_LINE_BULK_INSERT_AFTER_AUDIT_SQL).not.toContain(`'$[${BOQ_LINE_INSERT_COLUMN_COUNT}]'`);
    expect(BOQ_LINE_BULK_INSERT_AFTER_REVISION_SQL).not.toContain('changes()');
  });
});

describe('JSON bulk PR line inserts', () => {
  const prLine = (index: number) => ({
    sql: PROCUREMENT_REQUEST_LINE_INSERT_AFTER_PARENT_SQL,
    values: Array.from({ length: PR_LINE_INSERT_COLUMN_COUNT }, (_, column) => (column === 0 ? `pr-line-${index}` : column)),
  });

  it('keeps small PRs per line and bulk-inserts large PRs guarded by the parent PR', () => {
    const small = [prLine(1), prLine(2)];
    expect(toBulkPrLineInsertStatements(small, 'pr-1', 'tenant-1')).toBe(small);

    const large = Array.from({ length: BOQ_LINE_PER_STATEMENT_MAX + 1 }, (_, index) => prLine(index));
    const bulk = toBulkPrLineInsertStatements(large, 'pr-1', 'tenant-1');
    expect(bulk).toEqual([{ sql: PROCUREMENT_REQUEST_LINE_BULK_INSERT_SQL, values: [expect.any(String), 'pr-1', 'tenant-1'] }]);
    expect(JSON.parse(bulk[0].values[0] as string)).toHaveLength(large.length);
  });

  it('rejects statements that are not PR line inserts', () => {
    expect(() => toBulkPrLineInsertStatements([{ sql: BOQ_LINE_INSERT_AFTER_AUDIT_SQL, values: [] }], 'pr-1', 'tenant-1'))
      .toThrow(D1_BATCH_STATEMENT_FAILED);
  });
});

describe('bulk helpers', () => {
  it('chunks rows by count and size, and handles empty input', () => {
    expect(chunkRowsForJsonBinding([])).toEqual([]);
    const rows = Array.from({ length: BOQ_LINE_BULK_MAX_ROWS * 2 + 1 }, (_, index) => ({ index }));
    expect(chunkRowsForJsonBinding(rows).map((chunk) => chunk.length)).toEqual([BOQ_LINE_BULK_MAX_ROWS, BOQ_LINE_BULK_MAX_ROWS, 1]);
    const big = Array.from({ length: 3 }, () => ({ text: 'y'.repeat(Math.ceil(BOQ_LINE_BULK_MAX_JSON_BYTES * 0.6)) }));
    expect(chunkRowsForJsonBinding(big).map((chunk) => chunk.length)).toEqual([1, 1, 1]);
  });

  it('sums changed rows across consecutive results, treating missing metadata as zero', () => {
    const results = [
      { success: true, meta: { changes: 1 } },
      { success: true, meta: { changes: 400 } },
      { success: true },
      { success: true, meta: { changes: 7 } },
    ];
    expect(sumD1BatchChanges(results, 1, 3)).toBe(407);
    expect(sumD1BatchChanges(results, 4, 2)).toBe(0);
  });
});
