/* eslint @typescript-eslint/no-require-imports: "off" -- This script is intentionally CommonJS. */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  DATABASE_NAME,
  EXPECTED_D1_TABLE_NAMES,
  LOGICAL_DUPLICATE_CHECKS,
  MIGRATIONS_DIRECTORY,
} = require('./database.constants.cjs');
const {
  compareD1IntegrityBaseline,
  expectedColumnsByTable,
  expectedIndexNamesFromMigrations,
  findMissingColumns,
  findMissingIndexes,
  migrationStatus,
} = require('./d1-schema-integrity.cjs');
const { Prisma } = require('@prisma/client');

const root = path.resolve(__dirname, '..');
const wranglerCli = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const mode = process.argv.includes('--remote') ? '--remote' : '--local';
// Pre-migration runs record a read-only baseline instead of requiring the not-yet-applied schema.
const allowPendingMigrations = process.argv.includes('--allow-pending-migrations');
const configPath = path.join(root, 'wrangler.jsonc');
const inventorySql = "SELECT name AS tableName FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'd1_migrations' AND substr(name, 1, 4) <> '_cf_' ORDER BY name";
const indexInventorySql = "SELECT name AS indexName FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name";

function remoteEnvironment() {
  const values = {};
  for (const filename of ['.env', '.env.local']) {
    const filepath = path.join(root, filename);
    if (!fs.existsSync(filepath)) continue;
    for (const line of fs.readFileSync(filepath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*(CLOUDFLARE_(?:ACCOUNT_ID|API_TOKEN|DATABASE_ID))\s*=\s*(.*)\s*$/);
      if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, '').trim();
    }
  }
  return { ...values, ...process.env };
}

function fail(message) {
  process.stderr.write(`D1 integrity check failed: ${message}\n`);
  process.exit(1);
}

function optionValue(name) {
  const optionIndex = process.argv.indexOf(name);
  if (optionIndex < 0) return null;
  const value = process.argv[optionIndex + 1];
  if (!value || value.startsWith('--')) fail(`${name} requires a path`);
  return value;
}

const persistPath = optionValue('--persist-to');
const baselineOutputArgument = optionValue('--baseline-out');
const compareBaselineArgument = optionValue('--compare-baseline');
if (baselineOutputArgument && compareBaselineArgument) fail('use either --baseline-out or --compare-baseline, not both');
if (persistPath && mode === '--remote') fail('--persist-to can only be used with --local');
if (allowPendingMigrations && !baselineOutputArgument) {
  fail('--allow-pending-migrations requires --baseline-out so the pre-migration counts can be compared afterward');
}
if (baselineOutputArgument && !allowPendingMigrations) fail('--baseline-out requires --allow-pending-migrations');
if (compareBaselineArgument && allowPendingMigrations) {
  fail('--compare-baseline must run after migrations without --allow-pending-migrations');
}
const persistArgs = persistPath ? ['--persist-to', path.resolve(root, persistPath)] : [];
const baselineOutputPath = baselineOutputArgument ? path.resolve(root, baselineOutputArgument) : null;
const compareBaselinePath = compareBaselineArgument ? path.resolve(root, compareBaselineArgument) : null;

function collectRows(value, predicate) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectRows(item, predicate));
  }
  if (!value || typeof value !== 'object') return [];
  const matches = predicate(value) ? [value] : [];
  return [...matches, ...Object.values(value).flatMap((child) => collectRows(child, predicate))];
}

function execute(sql) {
  const result = spawnSync(process.execPath, [
    wranglerCli,
    'd1',
    'execute',
    DATABASE_NAME,
    mode,
    '--json',
    '--command',
    sql,
    '--config',
    configPath,
    ...persistArgs,
    ...((mode === '--remote' ? ['.env', '.env.local'] : [])
      .filter((filename) => fs.existsSync(path.join(root, filename)))
      .flatMap((filename) => ['--env-file', path.join(root, filename)])),
  ], { cwd: root, env: process.env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  if (result.error) fail(`Wrangler could not start: ${result.error.message}`);
  if (result.status !== 0) {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    fail(`Wrangler exited with status ${result.status ?? 'unknown'}`);
  }
  try {
    return JSON.parse(result.stdout || '[]');
  } catch {
    fail(`Wrangler did not return JSON: ${(result.stdout || '').trim()}`);
  }
}

if (!fs.existsSync(wranglerCli)) fail('the local Wrangler CLI was not found; install dependencies first');
const configText = fs.readFileSync(configPath, 'utf8');
const d1Target = {
  accountId: configText.match(/"account_id"\s*:\s*["']([^"']+)["']/)?.[1] || '',
  databaseId: configText.match(/"database_id"\s*:\s*["']([^"']+)["']/)?.[1] || '',
  databaseName: DATABASE_NAME,
};
if (mode === '--remote') {
  const env = remoteEnvironment();
  // Authentication comes from CLOUDFLARE_API_TOKEN or an interactive `wrangler login`.
  // When a database ID is supplied it must match the tracked Wrangler configuration.
  const expectedDatabaseId = env.CLOUDFLARE_DATABASE_ID;
  if (expectedDatabaseId && !expectedDatabaseId.startsWith('replace-with-') && d1Target.databaseId !== expectedDatabaseId) {
    fail('the database_id in wrangler.jsonc must match CLOUDFLARE_DATABASE_ID');
  }
  // A login with access to several accounts needs an explicit account in non-interactive runs.
  if (!env.CLOUDFLARE_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID.startsWith('replace-with-')) {
    if (d1Target.accountId) process.env.CLOUDFLARE_ACCOUNT_ID = d1Target.accountId;
  }
}

const migrationFilenames = fs.readdirSync(path.join(root, MIGRATIONS_DIRECTORY))
  .filter((filename) => filename.endsWith('.sql'))
  .sort();
const migrationTablePresent = collectRows(
  execute("SELECT COUNT(*) AS present FROM sqlite_master WHERE type = 'table' AND name = 'd1_migrations'"),
  (row) => Object.prototype.hasOwnProperty.call(row, 'present'),
).some((row) => Number(row.present) > 0);
const appliedMigrationNames = migrationTablePresent
  ? collectRows(execute('SELECT name AS migrationName FROM d1_migrations ORDER BY id'), (row) => typeof row.migrationName === 'string')
    .map((row) => row.migrationName)
  : [];
const { pending: pendingMigrations, unknownApplied } = migrationStatus(migrationFilenames, appliedMigrationNames);
if (unknownApplied.length > 0) {
  // Renamed migration files leave their old names in d1_migrations; the schema checks below still verify the result.
  process.stderr.write(`D1 integrity warning: applied migrations not tracked in ${MIGRATIONS_DIRECTORY}/ (renamed or removed files): ${unknownApplied.join(', ')}
`);
}
if (pendingMigrations.length > 0 && !allowPendingMigrations) {
  fail(`${pendingMigrations.length} reviewed migration(s) are not applied yet: ${pendingMigrations.join(', ')}. Apply them with ${mode === '--remote' ? 'npm run db:d1:migrate:remote' : 'npm run db:migrate:safe'} before running the strict check.`);
}

const inventory = execute(inventorySql);
if (baselineOutputPath) {
  // Capture pre-migration row counts for comparison in the strict post-migration check.
  const existingTables = collectRows(inventory, (row) => typeof row.tableName === 'string').map((row) => row.tableName);
  const baselineCounts = existingTables.length === 0 ? {} : collectRows(execute(`SELECT ${existingTables
    .map((tableName) => `(SELECT COUNT(*) FROM "${tableName.replace(/"/g, '""')}") AS "${tableName.replace(/"/g, '""')}"`)
    .join(', ')}`), (row) => existingTables.every((tableName) => Number.isFinite(Number(row[tableName]))))[0];
  if (existingTables.length > 0 && !baselineCounts) fail('D1 did not return row counts for the existing tables');
  const baselineRows = existingTables.map((tableName) => ({ tableName, rowCount: Number(baselineCounts[tableName]) }));
  const baselineTotal = baselineRows.reduce((total, row) => total + row.rowCount, 0);
  const baseline = {
    format: 'procpx-d1-integrity-baseline-v1',
    capturedAt: new Date().toISOString(),
    target: d1Target,
    appliedMigrations: appliedMigrationNames,
    pendingMigrations,
    rowCounts: Object.fromEntries(baselineRows.map(({ tableName, rowCount }) => [tableName, rowCount])),
  };
  try {
    fs.mkdirSync(path.dirname(baselineOutputPath), { recursive: true });
    fs.writeFileSync(baselineOutputPath, JSON.stringify(baseline, null, 2), 'utf8');
  } catch (error) {
    fail(`could not write the D1 integrity baseline: ${error.message}`);
  }
  process.stdout.write(`D1 ${mode === '--local' ? 'local' : 'remote'} pre-migration baseline: ${appliedMigrationNames.length} migration(s) applied, ${pendingMigrations.length} pending (${pendingMigrations.join(', ')}), ${existingTables.length} tables, ${baselineTotal} records. Strict schema checks run after migrations.
`);
  console.table(baselineRows);
  process.exit(0);
}
const tables = collectRows(inventory, (row) => typeof row.tableName === 'string')
  .map((row) => row.tableName);
const expectedTables = new Set(EXPECTED_D1_TABLE_NAMES);
const actualTables = new Set(tables);
const missingTables = EXPECTED_D1_TABLE_NAMES.filter((tableName) => !actualTables.has(tableName));
const unexpectedTables = tables.filter((tableName) => !expectedTables.has(tableName));

const migrationFiles = migrationFilenames
  .map((filename) => ({
    filename,
    sql: fs.readFileSync(path.join(root, MIGRATIONS_DIRECTORY, filename), 'utf8'),
  }));
const expectedIndexes = expectedIndexNamesFromMigrations(migrationFiles);
const actualIndexRows = collectRows(execute(indexInventorySql), (row) => typeof row.indexName === 'string');
const actualIndexes = new Set(actualIndexRows.map((row) => row.indexName));
const missingIndexes = findMissingIndexes(expectedIndexes, actualIndexes);
const untrackedIndexes = [...actualIndexes].filter((indexName) => !expectedIndexes.has(indexName)).sort();

const countSelects = tables.map((tableName) => {
  const quotedName = tableName.replace(/"/g, '""');
  return `(SELECT COUNT(*) FROM "${quotedName}") AS "${quotedName}"`;
}).join(', ');
const countResult = collectRows(execute(`SELECT ${countSelects}`), (row) =>
  tables.every((tableName) => Number.isFinite(Number(row[tableName]))))[0];
if (!countResult) fail('D1 did not return row counts for all application tables');
const rowCounts = Object.fromEntries(tables.map((tableName) => [tableName, Number(countResult[tableName])]));

if (compareBaselinePath) {
  let baseline;
  try {
    baseline = JSON.parse(fs.readFileSync(compareBaselinePath, 'utf8'));
  } catch (error) {
    fail(`could not read the pre-migration D1 integrity baseline: ${error.message}`);
  }
  let comparison;
  try {
    comparison = compareD1IntegrityBaseline(baseline, d1Target, rowCounts);
  } catch (error) {
    fail(error.message);
  }
  process.stdout.write(`D1 row-count baseline comparison: ${Object.keys(baseline.rowCounts).length} baseline tables, ${Object.keys(rowCounts).length} current tables.\n`);
  if (comparison.addedTables.length > 0) {
    process.stdout.write(`D1 tables added since baseline: ${comparison.addedTables.join(', ')}\n`);
  }
  for (const increase of comparison.increases) {
    process.stdout.write(`D1 row-count increase: ${increase.tableName} ${increase.baselineRowCount} -> ${increase.currentRowCount}\n`);
  }
  if (comparison.removedTables.length > 0 || comparison.decreases.length > 0) {
    const removed = comparison.removedTables.length > 0 ? `removed tables: ${comparison.removedTables.join(', ')}` : '';
    const decreased = comparison.decreases
      .map(({ tableName, baselineRowCount, currentRowCount }) => `${tableName} ${baselineRowCount}->${currentRowCount}`)
      .join(', ');
    const details = [removed, decreased && `decreased rows: ${decreased}`].filter(Boolean).join('; ');
    fail(`post-migration D1 row-count baseline regression (${details})`);
  }
  process.stdout.write('PASS: no baseline table or row count decreased. This comparison does not detect in-place updates or same-count replacements.\n');
}

if (missingTables.length > 0 || unexpectedTables.length > 0) {
  fail(`Prisma and D1 table inventory differs; missing in D1: ${missingTables.join(', ') || 'none'}; unexpected in D1: ${unexpectedTables.join(', ') || 'none'}`);
}
if (missingIndexes.length > 0) fail(`D1 is missing migration-defined indexes: ${missingIndexes.join(', ')}`);
if (untrackedIndexes.length > 0) {
  process.stderr.write(`D1 integrity warning: indexes absent from tracked migrations: ${untrackedIndexes.join(', ')}\n`);
}

const duplicateResults = execute(LOGICAL_DUPLICATE_CHECKS.map(({ sql }) => sql).join(';'));
const duplicateRows = collectRows(duplicateResults, (row) => Object.prototype.hasOwnProperty.call(row, 'duplicateGroups'));
const duplicateFailures = duplicateRows
  .map((row, index) => ({ check: LOGICAL_DUPLICATE_CHECKS[index]?.name || 'logical_duplicate', count: Number(row.duplicateGroups) }))
  .filter((failure) => failure.count > 0);
if (duplicateFailures.length > 0) {
  fail(`logical duplicate groups found: ${duplicateFailures.map(({ check, count }) => `${check}=${count}`).join(', ')}`);
}

let foreignKeyViolations = null;
let crossTenantViolations = null;
let missingColumnCount = null;
let untrackedColumnCount = null;
if (mode === '--local') {
  foreignKeyViolations = collectRows(execute('PRAGMA foreign_key_check'), (row) => typeof row.table === 'string').length;
  if (foreignKeyViolations > 0) fail(`local D1 reported ${foreignKeyViolations} foreign-key violations`);

  const quoteIdentifier = (identifier) => `"${String(identifier).replace(/"/g, '""')}"`;
  const tableInfoResults = execute(tables.map((tableName) => `PRAGMA table_info(${quoteIdentifier(tableName)})`).join(';'));
  const actualColumns = new Map(tables.map((tableName, index) => [
    tableName,
    new Set((tableInfoResults[index]?.results || []).map((row) => row.name)),
  ]));
  const expectedColumns = expectedColumnsByTable(Prisma.dmmf.datamodel.models);
  const missingColumns = findMissingColumns(expectedColumns, actualColumns);
  missingColumnCount = missingColumns.length;
  if (missingColumns.length > 0) {
    fail(`Prisma and local D1 columns differ; missing in D1: ${missingColumns.map(({ tableName, columnName }) => `${tableName}.${columnName}`).join(', ')}`);
  }
  untrackedColumnCount = [...actualColumns].reduce((total, [tableName, columns]) => {
    const expected = expectedColumns.get(tableName) || new Set();
    return total + [...columns].filter((columnName) => !expected.has(columnName)).length;
  }, 0);
  if (untrackedColumnCount > 0) {
    process.stderr.write(`D1 integrity warning: ${untrackedColumnCount} local columns are absent from the current Prisma schema; retained columns may contain data.\n`);
  }
  const tenantScopedTables = new Set(tables.filter((tableName, index) => {
    const resultRows = tableInfoResults[index]?.results || [];
    return resultRows.some((row) => row.name === 'tenantId');
  }));
  const foreignKeyResults = execute(tables.map((tableName) => `PRAGMA foreign_key_list(${quoteIdentifier(tableName)})`).join(';'));
  const crossTenantQueries = [];
  for (const [index, childTable] of tables.entries()) {
    if (!tenantScopedTables.has(childTable)) continue;
    for (const foreignKey of foreignKeyResults[index]?.results || []) {
      const parentTable = foreignKey.table;
      if (!tenantScopedTables.has(parentTable) || !foreignKey.from || !foreignKey.to) continue;
      const label = `${childTable}.${foreignKey.from}->${parentTable}.${foreignKey.to}`.replace(/'/g, "''");
      crossTenantQueries.push(
        `SELECT '${label}' AS relationship, COUNT(*) AS violationCount FROM ${quoteIdentifier(childTable)} AS child `
        + `JOIN ${quoteIdentifier(parentTable)} AS parent ON child.${quoteIdentifier(foreignKey.from)} = parent.${quoteIdentifier(foreignKey.to)} `
        + `WHERE child.${quoteIdentifier('tenantId')} <> parent.${quoteIdentifier('tenantId')}`,
      );
    }
  }
  if (crossTenantQueries.length > 0) {
    const relationshipRows = collectRows(execute(crossTenantQueries.join(';')), (row) => typeof row.relationship === 'string');
    const failures = relationshipRows.filter((row) => Number(row.violationCount) > 0);
    crossTenantViolations = failures.reduce((total, row) => total + Number(row.violationCount), 0);
    if (crossTenantViolations > 0) {
      fail(`local D1 reported ${crossTenantViolations} cross-tenant foreign-key references: ${failures.map((row) => row.relationship).join(', ')}`);
    }
  } else {
    crossTenantViolations = 0;
  }
}

const totalRows = Object.values(rowCounts).reduce((total, count) => total + count, 0);
process.stdout.write(`D1 ${mode === '--local' ? 'local' : 'remote'} schema integrity passed: ${tables.length} application tables, ${totalRows} records, ${LOGICAL_DUPLICATE_CHECKS.length} logical duplicate checks passed, ${foreignKeyViolations === null ? 'remote foreign-key scan not run' : `${foreignKeyViolations} foreign-key violations`}, ${crossTenantViolations === null ? 'remote cross-tenant scan not run' : `${crossTenantViolations} cross-tenant references`}.\n`);
process.stdout.write(`Schema drift checks: ${expectedIndexes.size} migration indexes expected, ${actualIndexes.size} indexes present, ${missingColumnCount === null ? 'remote column scan not run' : `${missingColumnCount} missing Prisma columns`}${untrackedColumnCount === null ? '' : `, ${untrackedColumnCount} retained extra columns`}.\n`);
console.table(Object.entries(rowCounts).map(([tableName, rowCount]) => ({ tableName, rowCount })));

if (mode === '--local') {
  const snapshotPath = path.join(root, 'prisma', 'backups', 'latest-integrity-snapshot.json');
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  fs.writeFileSync(snapshotPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    database: 'Cloudflare D1 local',
    applicationTableCount: tables.length,
    totalRows,
    foreignKeyViolations,
    crossTenantViolations,
    logicalDuplicateChecks: LOGICAL_DUPLICATE_CHECKS.length,
    expectedIndexCount: expectedIndexes.size,
    actualIndexCount: actualIndexes.size,
    missingColumnCount,
    untrackedColumnCount,
    rowCounts,
  }, null, 2), 'utf8');
  process.stdout.write(`D1 integrity snapshot written to ${path.relative(root, snapshotPath)}.\n`);
}
