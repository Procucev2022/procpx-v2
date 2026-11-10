/* eslint @typescript-eslint/no-require-imports: "off" -- This script is intentionally CommonJS. */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  DATABASE_NAME,
  DESTRUCTIVE_SQL_PATTERN,
  MIGRATIONS_DIRECTORY,
} = require('./database.constants.cjs');

const root = path.resolve(__dirname, '..');
const migrationsPath = path.join(root, MIGRATIONS_DIRECTORY);
const wranglerCli = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const mode = process.argv.includes('--remote') ? '--remote' : '--local';
const configPath = path.join(root, 'wrangler.jsonc');
// Optional isolated local store (for example a dry-run copy); never combined with --remote.
const persistIndex = process.argv.indexOf('--persist-to');
const persistArgs = mode === '--local' && persistIndex > -1 && process.argv[persistIndex + 1]
  ? ['--persist-to', path.resolve(process.argv[persistIndex + 1])]
  : [];

function fail(message) {
  process.stderr.write(`D1 migration check failed: ${message}\n`);
  process.exit(1);
}

function readDotEnvValues() {
  const values = {};
  for (const filename of ['.env', '.env.local']) {
    const filepath = path.join(root, filename);
    if (!fs.existsSync(filepath)) continue;
    for (const line of fs.readFileSync(filepath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*(CLOUDFLARE_(?:ACCOUNT_ID|API_TOKEN|DATABASE_ID))\s*=\s*(.*)\s*$/);
      if (!match) continue;
      values[match[1]] = match[2].replace(/^['"]|['"]$/g, '').trim();
    }
  }
  return values;
}

if (!fs.existsSync(wranglerCli)) fail('the local Wrangler CLI was not found; install dependencies before migrating');
if (!fs.existsSync(migrationsPath)) fail(`the ${MIGRATIONS_DIRECTORY}/ directory is missing`);

const migrationFiles = fs.readdirSync(migrationsPath)
  .filter((filename) => filename.endsWith('.sql'))
  .sort();
if (migrationFiles.length === 0) fail('no D1 SQL migrations were found');

for (const filename of migrationFiles) {
  const migration = fs.readFileSync(path.join(migrationsPath, filename), 'utf8');
  if (DESTRUCTIVE_SQL_PATTERN.test(migration)) {
    fail(`${filename} contains a destructive SQL operation; review and back up D1 before applying it`);
  }
}

if (mode === '--remote') {
  const env = { ...readDotEnvValues(), ...process.env };
  const configText = fs.readFileSync(configPath, 'utf8');
  if (configText.includes('replace-with-cloudflare-d1-database-id')) {
    fail('replace database_id in wrangler.jsonc with the D1 ID from your environment before a remote migration');
  }
  // Authentication comes from CLOUDFLARE_API_TOKEN or an interactive `wrangler login`.
  // When a database ID is supplied it must match the tracked Wrangler configuration.
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

process.stdout.write(`Applying unapplied D1 migrations to the ${mode === '--local' ? 'local' : 'remote'} database.\n`);
const args = [wranglerCli, 'd1', 'migrations', 'apply', DATABASE_NAME, mode, '--config', configPath, ...persistArgs];
if (mode === '--remote') {
  for (const filename of ['.env', '.env.local']) {
    const envFile = path.join(root, filename);
    if (fs.existsSync(envFile)) args.push('--env-file', envFile);
  }
}

const result = spawnSync(process.execPath, args, {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
});

if (result.error) fail(`Wrangler could not start: ${result.error.message}`);
if (result.status !== 0) fail(`Wrangler exited with status ${result.status ?? 'unknown'}`);
process.stdout.write('D1 migrations applied successfully.\n');
