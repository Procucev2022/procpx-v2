/* eslint @typescript-eslint/no-require-imports: "off" -- This script is intentionally CommonJS. */
// Seeds the ordinary local D1 (.wrangler/state) with the labelled mock baseline on request.
// The fixture uses stable fx- IDs and INSERT OR IGNORE, so repeated runs add nothing new and never delete rows.
// It is never called by build, test, or migration steps, and it has no remote mode.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DATABASE_NAME } = require('./database.constants.cjs');

const root = path.resolve(__dirname, '..');
const wranglerCli = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const configPath = path.join(root, 'wrangler.jsonc');
const fixturePath = path.join(root, 'tests', 'fixtures', 'd1-test-baseline.sql');
const DESTRUCTIVE_STATEMENT = /\b(?:DELETE|DROP|TRUNCATE)\b/i;

function runWrangler(args) {
  const result = spawnSync(process.execPath, [wranglerCli, ...args, '--config', configPath], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, CI: '1' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Wrangler failed (${result.status ?? 'unknown'}): ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

if (!fs.existsSync(wranglerCli)) throw new Error('Install dependencies before seeding local D1 mock data.');
const fixtureSql = fs.readFileSync(fixturePath, 'utf8');
if (DESTRUCTIVE_STATEMENT.test(fixtureSql)) {
  throw new Error('The mock baseline contains a destructive statement. Refusing to seed the ordinary local D1.');
}

runWrangler(['d1', 'migrations', 'apply', DATABASE_NAME, '--local']);
runWrangler(['d1', 'execute', DATABASE_NAME, '--local', '--file', fixturePath]);

const verification = runWrangler(['d1', 'execute', DATABASE_NAME, '--local', '--json', '--command', `SELECT
  (SELECT COUNT(*) FROM tenants WHERE id LIKE 'fx-%') AS tenants,
  (SELECT COUNT(*) FROM projects WHERE id LIKE 'fx-%') AS projects,
  (SELECT COUNT(*) FROM boqs WHERE id LIKE 'fx-%') AS boqs,
  (SELECT COUNT(*) FROM procurement_requests WHERE id LIKE 'fx-%') AS prs,
  (SELECT COUNT(*) FROM rfqs WHERE id LIKE 'fx-%') AS rfqs,
  (SELECT COUNT(*) FROM vendors WHERE id LIKE 'fx-%') AS vendors,
  (SELECT COUNT(*) FROM ppos WHERE id LIKE 'fx-%') AS ppos`]);
const [summary] = JSON.parse(verification).flatMap((entry) => entry.results || []);
process.stdout.write(`Local D1 (${DATABASE_NAME}) now holds the labelled fx- mock baseline: ${JSON.stringify(summary)}. Existing rows were kept.\n`);
