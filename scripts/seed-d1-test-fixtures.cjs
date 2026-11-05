/* eslint @typescript-eslint/no-require-imports: "off" -- This script is intentionally CommonJS. */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DATABASE_NAME, LOCAL_E2E_D1_PERSIST_PATH } = require('./database.constants.cjs');

const root = path.resolve(__dirname, '..');
const wranglerCli = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const configPath = path.join(root, 'wrangler.jsonc');
const fixturePath = path.join(root, 'tests', 'fixtures', 'd1-test-baseline.sql');
const persistPath = path.resolve(root, LOCAL_E2E_D1_PERSIST_PATH);

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

function rowsFrom(output) {
  const parsed = JSON.parse(output);
  return parsed.flatMap((entry) => entry.results || []);
}

if (!fs.existsSync(wranglerCli)) throw new Error('Install dependencies before seeding local D1 fixtures.');
if (!fs.existsSync(fixturePath)) throw new Error('The D1 test fixture SQL file is missing.');

// Schema and fixture writes are confined to this isolated local persistence
// directory. The seed script has no default/shared or remote database mode.
runWrangler(['d1', 'migrations', 'apply', DATABASE_NAME, '--local', '--persist-to', persistPath]);
runWrangler(['d1', 'execute', DATABASE_NAME, '--local', '--persist-to', persistPath, '--file', fixturePath]);

const verificationSql = `SELECT
  (SELECT COUNT(*) FROM tenants WHERE id IN ('fx-tenant-procpx','fx-tenant-hospitality')) AS tenants,
  (SELECT COUNT(*) FROM users WHERE email LIKE '%@test.procpx.local') AS fixtureUsers,
  (SELECT COUNT(*) FROM categories WHERE id IN ('fx-category-civil','fx-category-electrical')) AS categories,
  (SELECT COUNT(*) FROM projects WHERE id IN ('fx-project-branch','fx-project-hospitality')) AS projects,
  (SELECT COUNT(*) FROM cost_centres WHERE id IN ('fx-cost-centre-civil','fx-cost-centre-electrical')) AS costCentres,
  (SELECT COUNT(*) FROM boq_lines WHERE id IN ('fx-boq-line-1','fx-boq-line-2','fx-boq-line-3')) AS boqLines,
  (SELECT COUNT(*) FROM procurement_requests WHERE id='fx-pr-approved' AND status='PR_APPROVED') AS approvedPrs,
  (SELECT COUNT(*) FROM vendors WHERE id IN ('fx-vendor-1','fx-vendor-2','fx-vendor-3')) AS vendors,
  (SELECT COUNT(*) FROM quotes WHERE id IN ('fx-quote-1','fx-quote-2','fx-quote-3')) AS quotes,
  (SELECT COUNT(*) FROM negotiation_rounds WHERE id='fx-negotiation-round-1') AS negotiationRounds,
  (SELECT COUNT(*) FROM award_recommendations WHERE id='fx-award-1') AS awards,
  (SELECT COUNT(*) FROM ppos WHERE id='fx-ppo-1') AS ppos,
  (SELECT COUNT(*) FROM ppo_lines WHERE id IN ('fx-ppo-line-1','fx-ppo-line-2','fx-ppo-line-3')) AS ppoLines,
  (SELECT COUNT(*) FROM pragma_foreign_key_check) AS foreignKeyViolations,
  (SELECT COUNT(*) FROM (SELECT tenantId, name, parentId FROM categories GROUP BY tenantId, name, parentId HAVING COUNT(*) > 1))
    + (SELECT COUNT(*) FROM (SELECT tenantId, boqCode FROM boqs GROUP BY tenantId, boqCode HAVING COUNT(*) > 1))
    + (SELECT COUNT(*) FROM (SELECT tenantId, prNumber FROM procurement_requests GROUP BY tenantId, prNumber HAVING COUNT(*) > 1))
    + (SELECT COUNT(*) FROM (SELECT tenantId, rfqNumber FROM rfqs GROUP BY tenantId, rfqNumber HAVING COUNT(*) > 1))
    + (SELECT COUNT(*) FROM (SELECT tenantId, code FROM vendors GROUP BY tenantId, code HAVING COUNT(*) > 1))
    + (SELECT COUNT(*) FROM (SELECT tenantId, ppoNumber FROM ppos GROUP BY tenantId, ppoNumber HAVING COUNT(*) > 1)) AS duplicateGroups`;
const rows = rowsFrom(runWrangler([
  'd1', 'execute', DATABASE_NAME, '--local', '--json', '--command', verificationSql,
  '--persist-to', persistPath,
]));
const required = {
  tenants: 2, fixtureUsers: 14, categories: 2, projects: 2, costCentres: 2, boqLines: 3,
  approvedPrs: 1, vendors: 3, quotes: 3, negotiationRounds: 1, awards: 1, ppos: 1, ppoLines: 3,
  foreignKeyViolations: 0, duplicateGroups: 0,
};
const counts = rows[0];
for (const [name, count] of Object.entries(required)) {
  if (Number(counts?.[name]) !== count) {
    throw new Error(`Local D1 fixture verification failed for ${name}: expected ${count}, found ${counts?.[name] ?? 'no result'}.`);
  }
}

process.stdout.write(`Isolated local D1 test fixtures are present under ${LOCAL_E2E_D1_PERSIST_PATH}: 2 tenants, 14 login personas, 2 projects, 2 categories, 2 cost centres, BOQ + 3 lines, approved PR, 3 vendors + quotes, negotiation, award, and PPO + 3 lines.\n`);
