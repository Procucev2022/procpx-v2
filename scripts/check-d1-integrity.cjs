/* eslint @typescript-eslint/no-require-imports: "off" -- This script is intentionally CommonJS. */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  DATABASE_NAME,
  EXPECTED_D1_MODEL_TABLES,
} = require('./database.constants.cjs');

const root = path.resolve(__dirname, '..');
const wranglerCli = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const mode = process.argv.includes('--remote') ? '--remote' : '--local';
const configPath = path.join(root, 'wrangler.jsonc');
const inventorySql = "SELECT name AS tableName FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'd1_migrations' AND substr(name, 1, 4) <> '_cf_' ORDER BY name";

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
if (mode === '--remote') {
  const env = remoteEnvironment();
  // Authentication comes from CLOUDFLARE_API_TOKEN or an interactive `wrangler login`.
  // When a database ID is supplied it must match the tracked Wrangler configuration.
  const configText = fs.readFileSync(configPath, 'utf8');
  const configuredDatabaseId = configText.match(/"database_id"\s*:\s*["']([^"']+)["']/)?.[1];
  const expectedDatabaseId = env.CLOUDFLARE_DATABASE_ID;
  if (expectedDatabaseId && !expectedDatabaseId.startsWith('replace-with-') && configuredDatabaseId !== expectedDatabaseId) {
    fail('the database_id in wrangler.jsonc must match CLOUDFLARE_DATABASE_ID');
  }
  // A login with access to several accounts needs an explicit account in non-interactive runs.
  if (!env.CLOUDFLARE_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID.startsWith('replace-with-')) {
    const configuredAccountId = configText.match(/"account_id"\s*:\s*["']([^"']+)["']/)?.[1];
    if (configuredAccountId) process.env.CLOUDFLARE_ACCOUNT_ID = configuredAccountId;
  }
}

const inventory = execute(inventorySql);
const tables = collectRows(inventory, (row) => typeof row.tableName === 'string')
  .map((row) => row.tableName);
if (tables.length !== EXPECTED_D1_MODEL_TABLES) {
  fail(`expected ${EXPECTED_D1_MODEL_TABLES} application tables from the current Prisma schema, found ${tables.length}; apply migrations or review the schema`);
}

const countSelects = tables.map((tableName) => {
  const quotedName = tableName.replace(/"/g, '""');
  return `(SELECT COUNT(*) FROM "${quotedName}") AS "${quotedName}"`;
}).join(', ');
const countResult = collectRows(execute(`SELECT ${countSelects}`), (row) =>
  tables.every((tableName) => Number.isFinite(Number(row[tableName]))))[0];
if (!countResult) fail('D1 did not return row counts for all application tables');
const rowCounts = Object.fromEntries(tables.map((tableName) => [tableName, Number(countResult[tableName])]));

let foreignKeyViolations = null;
if (mode === '--local') {
  foreignKeyViolations = collectRows(execute('PRAGMA foreign_key_check'), (row) => typeof row.table === 'string').length;
  if (foreignKeyViolations > 0) fail(`local D1 reported ${foreignKeyViolations} foreign-key violations`);
}

const totalRows = Object.values(rowCounts).reduce((total, count) => total + count, 0);
process.stdout.write(`D1 ${mode === '--local' ? 'local' : 'remote'} schema integrity passed: ${tables.length} application tables, ${totalRows} records, ${foreignKeyViolations === null ? 'remote foreign-key scan not run' : `${foreignKeyViolations} foreign-key violations`}.\n`);
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
    rowCounts,
  }, null, 2), 'utf8');
  process.stdout.write(`D1 integrity snapshot written to ${path.relative(root, snapshotPath)}.\n`);
}
