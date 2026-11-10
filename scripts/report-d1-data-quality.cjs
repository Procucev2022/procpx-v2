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
  ['BOQs whose project or cost centre does not match the tenant and project', `SELECT b.id AS boqId, b.projectId, b.costCentreId FROM boqs b LEFT JOIN projects p ON p.id = b.projectId LEFT JOIN cost_centres cc ON cc.id = b.costCentreId WHERE p.id IS NULL OR b.tenantId <> p.tenantId OR (b.costCentreId IS NOT NULL AND (cc.id IS NULL OR b.tenantId <> cc.tenantId OR b.projectId <> cc.projectId))`],
  ['BOQ revisions whose tenant or cost centre does not match the parent BOQ project', `SELECT r.id AS revisionId, r.boqId, r.costCentreId FROM boq_revisions r LEFT JOIN boqs b ON b.id = r.boqId LEFT JOIN cost_centres cc ON cc.id = r.costCentreId WHERE b.id IS NULL OR r.tenantId <> b.tenantId OR (r.costCentreId IS NOT NULL AND (cc.id IS NULL OR r.tenantId <> cc.tenantId OR b.projectId <> cc.projectId))`],
  ['PRs whose project, cost centre, BOQ and revision references do not align', `SELECT pr.id AS prId, pr.projectId, pr.costCentreId, pr.boqId, pr.boqRevisionId FROM procurement_requests pr LEFT JOIN projects project ON project.id = pr.projectId LEFT JOIN cost_centres centre ON centre.id = pr.costCentreId LEFT JOIN boqs boq ON boq.id = pr.boqId LEFT JOIN boq_revisions revision ON revision.id = pr.boqRevisionId WHERE project.id IS NULL OR centre.id IS NULL OR boq.id IS NULL OR revision.id IS NULL OR pr.tenantId <> project.tenantId OR pr.tenantId <> centre.tenantId OR pr.tenantId <> boq.tenantId OR pr.tenantId <> revision.tenantId OR centre.projectId <> pr.projectId OR boq.projectId <> pr.projectId OR revision.boqId <> boq.id`],
  ['PR lines whose project, cost centre, BOQ, revision or source line differs from the PR', `SELECT line.id AS prLineId, line.prId FROM pr_lines line JOIN procurement_requests pr ON pr.id = line.prId LEFT JOIN cost_centres centre ON centre.id = line.costCentreId LEFT JOIN boq_lines sourceLine ON sourceLine.id = line.boqLineId WHERE line.tenantId <> pr.tenantId OR (line.projectId IS NOT NULL AND line.projectId <> pr.projectId) OR (line.costCentreId IS NOT NULL AND (centre.id IS NULL OR centre.tenantId <> line.tenantId OR centre.projectId <> COALESCE(line.projectId, pr.projectId))) OR (line.boqId IS NOT NULL AND line.boqId <> pr.boqId) OR (line.boqRevisionId IS NOT NULL AND line.boqRevisionId <> pr.boqRevisionId) OR (line.boqLineId IS NOT NULL AND (sourceLine.id IS NULL OR sourceLine.tenantId <> line.tenantId OR sourceLine.boqRevisionId <> pr.boqRevisionId))`],
  ['RFQ lines whose project, cost centre, BOQ, PR line or source revision differs from the RFQ', `SELECT line.id AS rfqLineId, line.rfqId FROM rfq_lines line JOIN rfqs rfq ON rfq.id = line.rfqId LEFT JOIN cost_centres centre ON centre.id = line.costCentreId LEFT JOIN pr_lines prLine ON prLine.id = line.prLineId LEFT JOIN boq_lines sourceLine ON sourceLine.id = line.boqLineId LEFT JOIN boq_revisions revision ON revision.id = rfq.boqRevisionId LEFT JOIN boqs boq ON boq.id = revision.boqId WHERE line.tenantId <> rfq.tenantId OR (line.projectId IS NOT NULL AND line.projectId <> rfq.projectId) OR (line.costCentreId IS NOT NULL AND (centre.id IS NULL OR centre.tenantId <> line.tenantId OR centre.projectId <> rfq.projectId)) OR (line.boqId IS NOT NULL AND (boq.id IS NULL OR line.boqId <> boq.id)) OR (line.boqRevisionId IS NOT NULL AND line.boqRevisionId <> rfq.boqRevisionId) OR (line.prLineId IS NOT NULL AND (prLine.id IS NULL OR prLine.tenantId <> line.tenantId OR rfq.prId IS NULL OR prLine.prId <> rfq.prId)) OR (line.boqLineId IS NOT NULL AND (sourceLine.id IS NULL OR sourceLine.tenantId <> line.tenantId OR sourceLine.boqRevisionId <> rfq.boqRevisionId))`],
  ['Child rows whose tenant differs from their parent', `SELECT 'boq_lines' AS tableName, COUNT(*) AS records FROM boq_lines l JOIN boq_revisions r ON r.id = l.boqRevisionId WHERE l.tenantId <> r.tenantId UNION ALL SELECT 'pr_lines', COUNT(*) FROM pr_lines l JOIN procurement_requests p ON p.id = l.prId WHERE l.tenantId <> p.tenantId`],
  ['RFQs whose project, BOQ revision and source PR do not agree', `SELECT r.id AS rfqId, r.projectId, r.boqRevisionId, r.prId, boq.projectId AS boqProjectId, pr.projectId AS prProjectId, pr.boqRevisionId AS prBoqRevisionId FROM rfqs r LEFT JOIN boq_revisions rev ON rev.id = r.boqRevisionId LEFT JOIN boqs boq ON boq.id = rev.boqId LEFT JOIN procurement_requests pr ON pr.id = r.prId WHERE rev.id IS NULL OR boq.id IS NULL OR r.tenantId <> rev.tenantId OR r.tenantId <> boq.tenantId OR r.projectId <> boq.projectId OR (r.prId IS NOT NULL AND (pr.id IS NULL OR pr.tenantId <> r.tenantId OR pr.projectId <> r.projectId OR pr.boqId <> boq.id OR pr.boqRevisionId <> r.boqRevisionId))`],
  ['Quote lines linked to a different RFQ or tenant', `SELECT ql.id AS quoteLineId, ql.quoteId, ql.rfqLineId, q.rfqId AS quoteRfqId, line.rfqId AS lineRfqId FROM quote_lines ql JOIN quotes q ON q.id = ql.quoteId JOIN rfq_lines line ON line.id = ql.rfqLineId WHERE ql.tenantId <> q.tenantId OR ql.tenantId <> line.tenantId OR q.rfqId <> line.rfqId`],
  ['Negotiation rounds whose tenant differs from their negotiation or vendor', `SELECT round.id AS negotiationRoundId, round.negotiationId, round.vendorId FROM negotiation_rounds round JOIN negotiations n ON n.id = round.negotiationId JOIN vendors v ON v.id = round.vendorId WHERE round.tenantId <> n.tenantId OR round.tenantId <> v.tenantId`],
  ['PPO lines whose project, vendor, RFQ or tenant differs from the PPO', `SELECT line.id AS ppoLineId, line.ppoId, line.rfqLineId, p.rfqId AS ppoRfqId, rfqLine.rfqId AS lineRfqId FROM ppo_lines line JOIN ppos p ON p.id = line.ppoId LEFT JOIN rfq_lines rfqLine ON rfqLine.id = line.rfqLineId WHERE line.tenantId <> p.tenantId OR line.projectId <> p.projectId OR line.vendorId <> p.vendorId OR (line.rfqLineId IS NOT NULL AND (rfqLine.id IS NULL OR rfqLine.tenantId <> line.tenantId OR (p.rfqId IS NOT NULL AND rfqLine.rfqId <> p.rfqId)))`],
  ['Actual-cost PPO line references whose PPO does not match', `SELECT actual.id AS actualCostId, actual.ppoId, actual.ppoLineId, line.ppoId AS ppoLinePpoId FROM actual_cost_transactions actual LEFT JOIN ppo_lines line ON line.id = actual.ppoLineId LEFT JOIN ppos p ON p.id = actual.ppoId WHERE (actual.ppoLineId IS NOT NULL AND (line.id IS NULL OR line.tenantId <> actual.tenantId OR (actual.ppoId IS NOT NULL AND line.ppoId <> actual.ppoId))) OR (actual.ppoId IS NOT NULL AND (p.id IS NULL OR p.tenantId <> actual.tenantId))`],
];

function fail(message) {
  process.stderr.write(`D1 data-quality report failed: ${message}\n`);
  process.exit(1);
}

function executeAll(statements) {
  if (statements.some((sql) => !/^\s*SELECT\b/i.test(sql))) fail('only SELECT statements are allowed in this report');
  const result = spawnSync(process.execPath, [
    wranglerCli, 'd1', 'execute', DATABASE_NAME, mode, '--json', '--command', statements.join(';'), '--config', configPath,
  ], { cwd: root, env: process.env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) fail(`Wrangler could not start: ${result.error.message}`);
  if (result.status !== 0) fail(`Wrangler exited with status ${result.status}: ${(result.stderr || result.stdout || '').trim()}`);
  const output = result.stdout || '[]';
  const results = JSON.parse(output.slice(output.indexOf('[')));
  if (results.length !== statements.length) fail(`Wrangler returned ${results.length} query results for ${statements.length} checks`);
  return results.map((entry) => entry.results || []);
}

function runReport() {
  if (!fs.existsSync(wranglerCli)) fail('the local Wrangler CLI was not found; install dependencies first');
  if (mode === '--remote' && !process.env.CLOUDFLARE_ACCOUNT_ID) {
    // A login with access to several accounts needs an explicit account in non-interactive runs.
    const accountId = fs.readFileSync(configPath, 'utf8').match(/"account_id"\s*:\s*["']([^"']+)["']/)?.[1];
    if (accountId) process.env.CLOUDFLARE_ACCOUNT_ID = accountId;
  }

  let issues = 0;
  const checkResults = executeAll(CHECKS.map(([, sql]) => sql));
  for (const [index, [title]] of CHECKS.entries()) {
    const rows = checkResults[index].filter((row) => !('records' in row) || Number(row.records) > 0);
    process.stdout.write(`${rows.length === 0 ? 'OK  ' : 'FIX '} ${title}${rows.length ? ` (${rows.length})` : ''}\n`);
    if (rows.length) {
      issues += 1;
      console.table(rows.slice(0, 20));
    }
  }
  process.stdout.write(`\nD1 ${mode === '--local' ? 'local' : 'remote'} data-quality report: ${issues} of ${CHECKS.length} checks need attention. No data was changed.\n`);
}

if (require.main === module) runReport();

module.exports = { CHECKS };
