/* eslint @typescript-eslint/no-require-imports: "off" -- This module intentionally uses CommonJS. */

function expectedColumnsByTable(models) {
  return new Map(models.map((model) => [
    model.dbName || model.name,
    new Set(model.fields
      .filter((field) => field.kind === 'scalar' || field.kind === 'enum')
      .map((field) => field.dbName || field.name)),
  ]));
}

function readIndexIdentifier(match) {
  return match[2] || match[3] || match[4] || match[5];
}

function expectedIndexNamesFromMigrations(migrations) {
  const indexes = new Set();
  const createPattern = /^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?("([^"]+)"|`([^`]+)`|\[([^\]]+)\]|([^\s;(]+))/gim;
  const dropPattern = /^\s*DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?("([^"]+)"|`([^`]+)`|\[([^\]]+)\]|([^\s;(]+))/gim;

  for (const migration of migrations) {
    const sql = typeof migration === 'string' ? migration : migration.sql;
    const operations = [
      ...[...sql.matchAll(createPattern)].map((match) => ({ match, create: true })),
      ...[...sql.matchAll(dropPattern)].map((match) => ({ match, create: false })),
    ].sort((left, right) => left.match.index - right.match.index);
    for (const { match, create } of operations) {
      const indexName = readIndexIdentifier(match);
      if (create) indexes.add(indexName);
      else indexes.delete(indexName);
    }
  }

  return indexes;
}

function findMissingColumns(expectedColumns, actualColumns) {
  const missing = [];
  for (const [tableName, columns] of expectedColumns) {
    const actual = actualColumns.get(tableName) || new Set();
    for (const columnName of columns) {
      if (!actual.has(columnName)) missing.push({ tableName, columnName });
    }
  }
  return missing;
}

function findMissingIndexes(expectedIndexes, actualIndexes) {
  return [...expectedIndexes].filter((indexName) => !actualIndexes.has(indexName)).sort();
}

// Compares tracked migration files with the names Wrangler recorded in d1_migrations.
function migrationStatus(migrationFilenames, appliedNames) {
  const tracked = [...migrationFilenames].sort();
  const applied = new Set(appliedNames);
  const trackedSet = new Set(tracked);
  return {
    pending: tracked.filter((filename) => !applied.has(filename)),
    unknownApplied: [...applied].filter((name) => !trackedSet.has(name)).sort(),
  };
}

function validateRowCounts(rowCounts, label) {
  if (!rowCounts || typeof rowCounts !== 'object' || Array.isArray(rowCounts)) {
    throw new TypeError(`${label} must be an object keyed by table name`);
  }

  const entries = Object.entries(rowCounts);
  for (const [tableName, rowCount] of entries) {
    if (!tableName || !Number.isSafeInteger(rowCount) || rowCount < 0) {
      throw new TypeError(`${label} contains an invalid table name or row count`);
    }
  }
  return Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right)));
}

function compareRowCounts(baselineCounts, currentCounts) {
  const baseline = validateRowCounts(baselineCounts, 'Baseline row counts');
  const current = validateRowCounts(currentCounts, 'Current row counts');
  const baselineTables = new Set(Object.keys(baseline));
  const currentTables = new Set(Object.keys(current));
  const decreases = [];
  const increases = [];

  for (const tableName of baselineTables) {
    if (!currentTables.has(tableName)) continue;
    const change = {
      tableName,
      baselineRowCount: baseline[tableName],
      currentRowCount: current[tableName],
    };
    if (change.currentRowCount < change.baselineRowCount) decreases.push(change);
    if (change.currentRowCount > change.baselineRowCount) increases.push(change);
  }

  return {
    removedTables: [...baselineTables].filter((tableName) => !currentTables.has(tableName)),
    addedTables: [...currentTables].filter((tableName) => !baselineTables.has(tableName)),
    decreases,
    increases,
  };
}

function compareD1IntegrityBaseline(baseline, currentTarget, currentRowCounts) {
  if (!baseline || baseline.format !== 'procpx-d1-integrity-baseline-v1' || !baseline.target) {
    throw new TypeError('The D1 integrity baseline has an unsupported format');
  }
  for (const key of ['accountId', 'databaseId', 'databaseName']) {
    if (typeof baseline.target[key] !== 'string' || baseline.target[key] !== currentTarget[key]) {
      throw new Error(`The D1 integrity baseline target does not match the current ${key}`);
    }
  }

  return compareRowCounts(baseline.rowCounts, currentRowCounts);
}

module.exports = {
  compareD1IntegrityBaseline,
  compareRowCounts,
  expectedColumnsByTable,
  expectedIndexNamesFromMigrations,
  findMissingColumns,
  findMissingIndexes,
  migrationStatus,
};
