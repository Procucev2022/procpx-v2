/* eslint @typescript-eslint/no-require-imports: "off" -- This module intentionally uses CommonJS. */
const DATABASE_NAME = 'procpx-dev';
const LOCAL_E2E_D1_PERSIST_PATH = '.wrangler/e2e-d1';
const fs = require('node:fs');
const path = require('node:path');
const prismaSchema = fs.readFileSync(path.resolve(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
const EXPECTED_D1_TABLE_NAMES = [...prismaSchema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)(?=^\})/gm)]
  .map(([, modelName, modelBody]) => modelBody.match(/@@map\("([^"]+)"\)/)?.[1] || modelName)
  .sort();
const MIGRATIONS_DIRECTORY = 'migrations';
const DESTRUCTIVE_SQL_PATTERN = /\bDROP\s+(?:TABLE|COLUMN|INDEX|DATABASE)\b|\bTRUNCATE\b|\bDELETE\s+FROM\b|\bALTER\s+TABLE\b[\s\S]{0,160}\bDROP\b/i;
const LOGICAL_DUPLICATE_CHECKS = [
  { name: 'categories.root_name', sql: `SELECT COUNT(*) AS duplicateGroups FROM (SELECT tenantId, name FROM categories WHERE parentId IS NULL GROUP BY tenantId, name HAVING COUNT(*) > 1)` },
  { name: 'categories.child_name', sql: `SELECT COUNT(*) AS duplicateGroups FROM (SELECT tenantId, parentId, name FROM categories WHERE parentId IS NOT NULL GROUP BY tenantId, parentId, name HAVING COUNT(*) > 1)` },
  { name: 'categories.code', sql: `SELECT COUNT(*) AS duplicateGroups FROM (SELECT tenantId, code FROM categories WHERE code IS NOT NULL GROUP BY tenantId, code HAVING COUNT(*) > 1)` },
  { name: 'projects.project_code', sql: `SELECT COUNT(*) AS duplicateGroups FROM (SELECT tenantId, projectCode FROM projects GROUP BY tenantId, projectCode HAVING COUNT(*) > 1)` },
  { name: 'cost_centres.project_code', sql: `SELECT COUNT(*) AS duplicateGroups FROM (SELECT tenantId, projectId, code FROM cost_centres GROUP BY tenantId, projectId, code HAVING COUNT(*) > 1)` },
  { name: 'boqs.code', sql: `SELECT COUNT(*) AS duplicateGroups FROM (SELECT tenantId, boqCode FROM boqs GROUP BY tenantId, boqCode HAVING COUNT(*) > 1)` },
  { name: 'boq_lines.revision_number', sql: `SELECT COUNT(*) AS duplicateGroups FROM (SELECT boqRevisionId, lineNumber FROM boq_lines GROUP BY boqRevisionId, lineNumber HAVING COUNT(*) > 1)` },
  { name: 'procurement_requests.active_revision', sql: `SELECT COUNT(*) AS duplicateGroups FROM (SELECT tenantId, boqRevisionId FROM procurement_requests WHERE status NOT IN ('PR_REJECTED', 'CANCELLED') GROUP BY tenantId, boqRevisionId HAVING COUNT(*) > 1)` },
  { name: 'pr_lines.request_number', sql: `SELECT COUNT(*) AS duplicateGroups FROM (SELECT prId, lineNumber FROM pr_lines GROUP BY prId, lineNumber HAVING COUNT(*) > 1)` },
  { name: 'rfqs.number', sql: `SELECT COUNT(*) AS duplicateGroups FROM (SELECT tenantId, rfqNumber FROM rfqs GROUP BY tenantId, rfqNumber HAVING COUNT(*) > 1)` },
  { name: 'rfq_lines.number', sql: `SELECT COUNT(*) AS duplicateGroups FROM (SELECT rfqId, lineNumber FROM rfq_lines GROUP BY rfqId, lineNumber HAVING COUNT(*) > 1)` },
  { name: 'rfq_vendors.invitation', sql: `SELECT COUNT(*) AS duplicateGroups FROM (SELECT rfqId, vendorId FROM rfq_vendors GROUP BY rfqId, vendorId HAVING COUNT(*) > 1)` },
  { name: 'quotes.vendor_version', sql: `SELECT COUNT(*) AS duplicateGroups FROM (SELECT rfqId, vendorId, quoteVersion FROM quotes GROUP BY rfqId, vendorId, quoteVersion HAVING COUNT(*) > 1)` },
  { name: 'quote_lines.rfq_line', sql: `SELECT COUNT(*) AS duplicateGroups FROM (SELECT quoteId, rfqLineId FROM quote_lines GROUP BY quoteId, rfqLineId HAVING COUNT(*) > 1)` },
  { name: 'negotiations.rfq', sql: `SELECT COUNT(*) AS duplicateGroups FROM (SELECT tenantId, rfqId FROM negotiations GROUP BY tenantId, rfqId HAVING COUNT(*) > 1)` },
  { name: 'negotiation_rounds.vendor_round', sql: `SELECT COUNT(*) AS duplicateGroups FROM (SELECT negotiationId, vendorId, roundNumber FROM negotiation_rounds GROUP BY negotiationId, vendorId, roundNumber HAVING COUNT(*) > 1)` },
  { name: 'award_recommendations.pending_rfq', sql: `SELECT COUNT(*) AS duplicateGroups FROM (SELECT tenantId, rfqId FROM award_recommendations WHERE status = 'PENDING_APPROVAL' GROUP BY tenantId, rfqId HAVING COUNT(*) > 1)` },
  { name: 'ppos.award_recommendation', sql: `SELECT COUNT(*) AS duplicateGroups FROM (SELECT awardRecommendationId FROM ppos WHERE awardRecommendationId IS NOT NULL GROUP BY awardRecommendationId HAVING COUNT(*) > 1)` },
  { name: 'ppos.active_rfq_vendor', sql: `SELECT COUNT(*) AS duplicateGroups FROM (SELECT tenantId, rfqId, vendorId FROM ppos WHERE rfqId IS NOT NULL AND sourcingType = 'REGULAR_RFQ' AND status <> 'CANCELLED' GROUP BY tenantId, rfqId, vendorId HAVING COUNT(*) > 1)` },
  { name: 'ppos.active_direct_pr', sql: `SELECT COUNT(*) AS duplicateGroups FROM (SELECT tenantId, prId FROM ppos WHERE prId IS NOT NULL AND sourcingType = 'DIRECT_RATE_CARD' AND status <> 'CANCELLED' GROUP BY tenantId, prId HAVING COUNT(*) > 1)` },
  { name: 'ppos.active_direct_rfq_vendor', sql: `SELECT COUNT(*) AS duplicateGroups FROM (SELECT tenantId, rfqId, vendorId FROM ppos WHERE rfqId IS NOT NULL AND sourcingType = 'DIRECT_RATE_CARD' AND status <> 'CANCELLED' GROUP BY tenantId, rfqId, vendorId HAVING COUNT(*) > 1)` },
  { name: 'budgets.cost_centre', sql: `SELECT COUNT(*) AS duplicateGroups FROM (SELECT tenantId, costCentreId FROM budgets WHERE costCentreId IS NOT NULL GROUP BY tenantId, costCentreId HAVING COUNT(*) > 1)` },
  { name: 'budget_contributions.revision', sql: `SELECT COUNT(*) AS duplicateGroups FROM (SELECT tenantId, boqRevisionId FROM budget_contributions GROUP BY tenantId, boqRevisionId HAVING COUNT(*) > 1)` },
  { name: 'budget_transactions.reversal', sql: `SELECT COUNT(*) AS duplicateGroups FROM (SELECT reversedTransactionId FROM budget_transactions WHERE reversedTransactionId IS NOT NULL GROUP BY reversedTransactionId HAVING COUNT(*) > 1)` },
  { name: 'actual_costs.completion_line', sql: `SELECT COUNT(*) AS duplicateGroups FROM (SELECT tenantId, completionRequestId, ppoLineId FROM actual_cost_transactions WHERE completionRequestId IS NOT NULL AND ppoLineId IS NOT NULL GROUP BY tenantId, completionRequestId, ppoLineId HAVING COUNT(*) > 1)` },
];

module.exports = {
  DATABASE_NAME,
  LOCAL_E2E_D1_PERSIST_PATH,
  DESTRUCTIVE_SQL_PATTERN,
  EXPECTED_D1_TABLE_NAMES,
  LOGICAL_DUPLICATE_CHECKS,
  MIGRATIONS_DIRECTORY,
};
