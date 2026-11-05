/* eslint @typescript-eslint/no-require-imports: "off" -- This script is intentionally CommonJS. */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  DATABASE_NAME,
  EXPECTED_D1_TABLE_NAMES,
  LOGICAL_DUPLICATE_CHECKS,
} = require('./database.constants.cjs');

const root = path.resolve(__dirname, '..');
const wranglerCli = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const mode = process.argv.includes('--remote') ? '--remote' : '--local';
const configPath = path.join(root, 'wrangler.jsonc');
const inventorySql = "SELECT name AS tableName FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'd1_migrations' AND name <> '_cf_METADATA' ORDER BY name";

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
    ...((mode === '--remote' ? ['.env', '.env.local'] : [])
      .filter((filename) => fs.existsSync(path.join(root, filename)))
      .flatMap((filename) => ['--env-file', path.join(root, filename)])),
  ], { cwd: root, encoding: 'utf8' });

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
if (mode === '--remote') {
  const env = remoteEnvironment();
  const required = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_DATABASE_ID'];
  const missing = required.filter((key) => !env[key] || env[key].startsWith('replace-with-'));
  if (missing.length) fail(`remote integrity checks require configured values for: ${missing.join(', ')}`);
  const configText = fs.readFileSync(configPath, 'utf8');
  const configuredDatabaseId = configText.match(/database_id\s*:\s*["']([^"']+)["']/)?.[1];
  if (configuredDatabaseId !== env.CLOUDFLARE_DATABASE_ID) fail('the database_id in wrangler.jsonc must match CLOUDFLARE_DATABASE_ID');
}

const inventory = execute(inventorySql);
const tables = collectRows(inventory, (row) => typeof row.tableName === 'string')
  .map((row) => row.tableName);
const expectedTables = new Set(EXPECTED_D1_TABLE_NAMES);
const actualTables = new Set(tables);
const missingTables = EXPECTED_D1_TABLE_NAMES.filter((tableName) => !actualTables.has(tableName));
const unexpectedTables = tables.filter((tableName) => !expectedTables.has(tableName));
if (missingTables.length > 0 || unexpectedTables.length > 0) {
  fail(`Prisma and D1 table inventory differs; missing in D1: ${missingTables.join(', ') || 'none'}; unexpected in D1: ${unexpectedTables.join(', ') || 'none'}`);
}

const countSelects = tables.map((tableName) => {
  const quotedName = tableName.replace(/"/g, '""');
  return `(SELECT COUNT(*) FROM "${quotedName}") AS "${quotedName}"`;
}).join(', ');
const countResult = collectRows(execute(`SELECT ${countSelects}`), (row) =>
  tables.every((tableName) => Number.isFinite(Number(row[tableName]))))[0];
if (!countResult) fail('D1 did not return row counts for all application tables');
const rowCounts = Object.fromEntries(tables.map((tableName) => [tableName, Number(countResult[tableName])]));

const duplicateResults = execute(LOGICAL_DUPLICATE_CHECKS.map(({ sql }) => sql).join(';'));
const duplicateRows = collectRows(duplicateResults, (row) => Object.prototype.hasOwnProperty.call(row, 'duplicateGroups'));
const duplicateFailures = duplicateRows
  .filter((row) => Number(row.duplicateGroups) > 0)
  .map((row, index) => ({ check: LOGICAL_DUPLICATE_CHECKS[index]?.name || 'logical_duplicate', count: Number(row.duplicateGroups) }));
if (duplicateFailures.length > 0) {
  fail(`logical duplicate groups found: ${duplicateFailures.map(({ check, count }) => `${check}=${count}`).join(', ')}`);
}

let foreignKeyViolations = null;
let crossTenantViolations = null;
if (mode === '--local') {
  foreignKeyViolations = collectRows(execute('PRAGMA foreign_key_check'), (row) => typeof row.table === 'string').length;
  if (foreignKeyViolations > 0) fail(`local D1 reported ${foreignKeyViolations} foreign-key violations`);

  const quoteIdentifier = (identifier) => `"${String(identifier).replace(/"/g, '""')}"`;
  const tableInfoResults = execute(tables.map((tableName) => `PRAGMA table_info(${quoteIdentifier(tableName)})`).join(';'));
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
    rowCounts,
  }, null, 2), 'utf8');
  process.stdout.write(`D1 integrity snapshot written to ${path.relative(root, snapshotPath)}.\n`);
}
