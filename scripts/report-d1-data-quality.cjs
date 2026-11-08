/* eslint @typescript-eslint/no-require-imports: "off" -- This script is intentionally CommonJS. */
// Read-only D1 data-quality report: duplicates, orphans and summary fields that disagree
// with their source rows. It runs SELECT statements only and never changes data.
//   npm run db:quality          local D1
//   npm run db:quality:remote   remote D1 (uses wrangler login or CLOUDFLARE_API_TOKEN)
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DATABASE_NAME } = require('./database.constants.cjs');

const root = path.resolve(__dirname, '..');
const wranglerCli = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const configPath = path.join(root, 'wrangler.jsonc');
const mode = process.argv.includes('--remote') ? '--remote' : '--local';

// Each check returns the rows that need attention; an empty result means the check passed.
const CHECKS = [
  ['Duplicate top-level categories (same tenant and name)', `SELECT tenantId, name, COUNT(*) AS copies FROM categories WHERE parentId IS NULL GROUP BY tenantId, lower(trim(name)) HAVING COUNT(*) > 1 ORDER BY copies DESC`],
  ['Duplicate subcategories (same parent and name, any case)', `SELECT tenantId, parentId, name, COUNT(*) AS copies FROM categories WHERE parentId IS NOT NULL GROUP BY tenantId, parentId, lower(trim(name)) HAVING COUNT(*) > 1`],
  ['Duplicate vendors (same tenant and name)', `SELECT tenantId, name, COUNT(*) AS copies FROM vendors GROUP BY tenantId, lower(trim(name)) HAVING COUNT(*) > 1`],
  ['Duplicate projects (same tenant and name)', `SELECT tenantId, name, COUNT(*) AS copies FROM projects GROUP BY tenantId, lower(trim(name)) HAVING COUNT(*) > 1`],
  ['Duplicate cost centres (same project and name)', `SELECT tenantId, projectId, name, COUNT(*) AS copies FROM cost_centres GROUP BY tenantId, projectId, lower(trim(name)) HAVING COUNT(*) > 1`],
  ['BOQs without a revision', `SELECT id, boqCode FROM boqs b WHERE NOT EXISTS (SELECT 1 FROM boq_revisions r WHERE r.boqId = b.id)`],
  ['BOQ revisions whose totalLines differs from their line rows', `SELECT r.id, r.revisionCode, r.totalLines, (SELECT COUNT(*) FROM boq_lines l WHERE l.boqRevisionId = r.id) AS actualLines FROM boq_revisions r WHERE r.totalLines <> (SELECT COUNT(*) FROM boq_lines l WHERE l.boqRevisionId = r.id)`],
  ['PRs without lines', `SELECT id, prNumber, status FROM procurement_requests p WHERE NOT EXISTS (SELECT 1 FROM pr_lines l WHERE l.prId = p.id)`],
  ['PRs whose totalLines differs from their line rows', `SELECT p.id, p.prNumber, p.totalLines, (SELECT COUNT(*) FROM pr_lines l WHERE l.prId = p.id) AS actualLines FROM procurement_requests p WHERE p.totalLines <> (SELECT COUNT(*) FROM pr_lines l WHERE l.prId = p.id)`],
  ['PRs whose totalEstimatedValue differs from their lines by more than 1', `SELECT p.id, p.prNumber, p.totalEstimatedValue, (SELECT COALESCE(SUM(estimatedValue), 0) FROM pr_lines l WHERE l.prId = p.id) AS linesValue FROM procurement_requests p WHERE abs(p.totalEstimatedValue - (SELECT COALESCE(SUM(estimatedValue), 0) FROM pr_lines l WHERE l.prId = p.id)) > 1`],
  ['PR status differs from its BOQ revision stage beyond the allowed release transition', `SELECT p.status AS prStatus, r.prStatus AS revisionPrStatus, COUNT(*) AS records FROM procurement_requests p JOIN boq_revisions r ON r.id = p.boqRevisionId AND r.tenantId = p.tenantId WHERE p.status <> r.prStatus AND NOT (p.status = 'PR_RELEASED_TO_PROCUREMENT' AND r.prStatus = 'PR_APPROVED') GROUP BY p.status, r.prStatus`],
  ['Quotes without lines', `SELECT id, quoteNumber, status FROM quotes q WHERE NOT EXISTS (SELECT 1 FROM quote_lines l WHERE l.quoteId = q.id)`],
  ['More than one budget for a project cost centre', `SELECT tenantId, projectId, costCentreId, COUNT(*) AS budgets FROM budgets GROUP BY tenantId, projectId, costCentreId HAVING COUNT(*) > 1`],
  ['More than one active budget contribution for a BOQ revision', `SELECT boqRevisionId, COUNT(*) AS contributions FROM budget_contributions WHERE isSuperSeded = 0 AND status NOT IN ('REJECTED', 'REVERSED') GROUP BY boqRevisionId HAVING COUNT(*) > 1`],
  ['Child rows whose tenant differs from their parent', `SELECT 'boq_lines' AS tableName, COUNT(*) AS records FROM boq_lines l JOIN boq_revisions r ON r.id = l.boqRevisionId WHERE l.tenantId <> r.tenantId UNION ALL SELECT 'pr_lines', COUNT(*) FROM pr_lines l JOIN procurement_requests p ON p.id = l.prId WHERE l.tenantId <> p.tenantId`],
];

function fail(message) {
  process.stderr.write(`D1 data-quality report failed: ${message}\n`);
  process.exit(1);
}

function execute(sql) {
  if (!/^\s*SELECT\b/i.test(sql)) fail('only SELECT statements are allowed in this report');
  const result = spawnSync(process.execPath, [
    wranglerCli, 'd1', 'execute', DATABASE_NAME, mode, '--json', '--command', sql, '--config', configPath,
  ], { cwd: root, env: process.env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) fail(`Wrangler could not start: ${result.error.message}`);
  if (result.status !== 0) fail(`Wrangler exited with status ${result.status}: ${(result.stderr || result.stdout || '').trim()}`);
  const output = result.stdout || '[]';
  return JSON.parse(output.slice(output.indexOf('['))).flatMap((entry) => entry.results || []);
}

if (!fs.existsSync(wranglerCli)) fail('the local Wrangler CLI was not found; install dependencies first');
if (mode === '--remote' && !process.env.CLOUDFLARE_ACCOUNT_ID) {
  // A login with access to several accounts needs an explicit account in non-interactive runs.
  const accountId = fs.readFileSync(configPath, 'utf8').match(/"account_id"\s*:\s*["']([^"']+)["']/)?.[1];
  if (accountId) process.env.CLOUDFLARE_ACCOUNT_ID = accountId;
}

let issues = 0;
for (const [title, sql] of CHECKS) {
  const rows = execute(sql).filter((row) => !('records' in row) || Number(row.records) > 0);
  process.stdout.write(`${rows.length === 0 ? 'OK  ' : 'FIX '} ${title}${rows.length ? ` (${rows.length})` : ''}\n`);
  if (rows.length) {
    issues += 1;
    console.table(rows.slice(0, 20));
  }
}
process.stdout.write(`\nD1 ${mode === '--local' ? 'local' : 'remote'} data-quality report: ${issues} of ${CHECKS.length} checks need attention. No data was changed.\n`);
