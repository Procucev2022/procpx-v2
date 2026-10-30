/* eslint @typescript-eslint/no-require-imports: "off" -- This script is intentionally CommonJS. */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const prismaDirectory = path.join(root, 'prisma');
const migrationsDirectory = path.join(prismaDirectory, 'migrations');
const schemaPath = path.join(prismaDirectory, 'schema.prisma');
const prismaCli = path.join(root, 'node_modules', 'prisma', 'build', 'index.js');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function fail(message) {
  process.stderr.write(`Migration safety check failed: ${message}\n`);
  process.exit(1);
}

function readDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const file of [path.join(root, '.env'), path.join(prismaDirectory, '.env')]) {
    if (!fs.existsSync(file)) continue;
    const line = fs.readFileSync(file, 'utf8').split(/\r?\n/).find((entry) => /^\s*DATABASE_URL\s*=/.test(entry));
    if (!line) continue;
    const value = line.replace(/^\s*DATABASE_URL\s*=\s*/, '').trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }
    return value.replace(/\s+#.*$/, '').trim();
  }
  return 'file:./dev.db';
}

const databaseUrl = readDatabaseUrl();

function parsePendingMigrationNames(output) {
  const marker = output.match(/not yet been applied\s*:?\s*\r?\n([\s\S]*?)(?:\r?\n\s*\r?\n|$)/i);
  if (!marker) return [];
  return marker[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[A-Za-z0-9_-]+$/.test(line));
}

function runPrisma(args, inherit = true) {
  if (!fs.existsSync(prismaCli)) return { status: 1, output: 'Local Prisma CLI was not found.' };
  const result = spawnSync(process.execPath, [prismaCli, ...args, '--schema', schemaPath], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: inherit ? undefined : 'utf8',
    stdio: inherit ? 'inherit' : 'pipe',
  });
  return {
    status: result.status,
    error: result.error,
    output: inherit ? '' : `${result.stdout || ''}\n${result.stderr || ''}`,
  };
}

function integrityCheck(databaseUrl) {
  const result = spawnSync(npmCommand, ['run', 'db:integrity'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });
  return !result.error && result.status === 0;
}

function sqlitePath(databaseUrl) {
  if (!databaseUrl.startsWith('file:')) return null;
  const filePart = decodeURIComponent(databaseUrl.slice('file:'.length).split('?')[0]);
  if (!filePart || filePart === ':memory:') return null;
  return path.isAbsolute(filePart) ? filePart : path.resolve(prismaDirectory, filePart);
}

function backupSqliteDatabase(databaseUrl) {
  const databasePath = sqlitePath(databaseUrl);
  if (!databasePath || !fs.existsSync(databasePath)) return null;
  const backupDirectory = path.join(prismaDirectory, 'backups');
  fs.mkdirSync(backupDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[-:.]/g, '');
  const backupPath = path.join(backupDirectory, `dev-${timestamp}.db`);
  fs.copyFileSync(databasePath, backupPath);
  for (const suffix of ['-wal', '-shm']) {
    if (fs.existsSync(`${databasePath}${suffix}`)) fs.copyFileSync(`${databasePath}${suffix}`, `${backupPath}${suffix}`);
  }
  return backupPath;
}

if (!fs.existsSync(migrationsDirectory)) {
  process.stdout.write('No prisma/migrations directory exists; this database has no Prisma migration history to deploy. Skipping migrations.\n');
  process.exit(0);
}

const availableMigrations = fs.readdirSync(migrationsDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(migrationsDirectory, entry.name, 'migration.sql')))
  .map((entry) => entry.name);
if (availableMigrations.length === 0) {
  process.stdout.write('No Prisma migration SQL files are present. Skipping migrations.\n');
  process.exit(0);
}

process.stdout.write('\n=== Checking pending Prisma migrations ===\n');
const status = runPrisma(['migrate', 'status'], false);
const statusOutput = status.output || '';
process.stdout.write(statusOutput);
if (status.error) fail(`could not inspect migration status: ${status.error.message}`);
if (/migration table.{0,80}not found|no migration table|no migration history|history.{0,80}(diverged|different)|failed migration/i.test(statusOutput)) {
  fail('the database has no usable migration history or its history is divergent; do not deploy automatically');
}

const pendingNames = parsePendingMigrationNames(statusOutput);
if (pendingNames.length === 0) {
  if (status.status === 0) {
    process.stdout.write('No pending migrations.\n');
    process.exit(0);
  }
  fail('migration status returned an error without a parseable pending-migration list');
}

const destructiveSql = /\bDROP\s+(?:TABLE|COLUMN|INDEX|DATABASE)\b|\bTRUNCATE\b|\bDELETE\s+FROM\b|\bALTER\s+TABLE\b[\s\S]{0,160}\bDROP\b/i;
for (const migrationName of pendingNames) {
  const migrationFile = path.join(migrationsDirectory, migrationName, 'migration.sql');
  if (!fs.existsSync(migrationFile)) fail(`pending migration file is missing: ${migrationName}`);
  const sql = fs.readFileSync(migrationFile, 'utf8');
  if (destructiveSql.test(sql)) fail(`${migrationName} contains SQL that may delete or truncate existing data; review and handle it manually`);
}

if (!databaseUrl.startsWith('file:')) fail('automatic backup currently supports the repository SQLite database only');

if (!integrityCheck(databaseUrl)) fail('the pre-migration data-integrity check failed');
const backupPath = backupSqliteDatabase(databaseUrl);
if (!backupPath) fail('the configured SQLite database file was not found; migration was not applied');
process.stdout.write(`SQLite backup created: ${path.relative(root, backupPath)}\n`);

process.stdout.write(`Applying ${pendingNames.length} safe pending migration(s).\n`);
const deploy = runPrisma(['migrate', 'deploy']);
if (deploy.error || deploy.status !== 0) {
  integrityCheck(databaseUrl);
  fail(`Prisma migrate deploy failed${deploy.error ? `: ${deploy.error.message}` : ''}; inspect the backup at ${path.relative(root, backupPath)}`);
}

if (!integrityCheck(databaseUrl)) fail(`post-migration integrity check failed; inspect the backup at ${path.relative(root, backupPath)}`);
process.stdout.write('Safe pending migrations applied and integrity verified.\n');
