# proCPX analysis: architecture, D1 data, logging, mock data, and gaps

Date: 2026-11-17. Branch: `anshul2`. Scope: `src/`, `prisma/schema.prisma`, `migrations/`, `scripts/`, and the local D1 database.

## Method and limits

- Six read-only investigations ran in parallel: mock data, D1 usage, database consistency, logging, routes and missing features, and latency. A separate pass covered the quality gate.
- **Verified** means the cited lines were re-read in this session. Other references come from those investigations. Line numbers marked `~` are approximate and must be rechecked before a fix.
- Remote D1 was not accessed. Remote row counts and duplicate checks are not in this document. The local D1 database holds 493 records.
- D1 cost notes come from query shape. They are not measured row reads.
- Latency coverage is partial (section 7).

## Status key

- **Fixed**: the commit is listed in the status column.
- **Open**: planned or not started.
- **Decision**: needs an owner or product choice before code changes.
- **Deferred**: needs a larger change, such as a table rebuild with a backup first.

## Top priorities

| # | ID | Why it ranks here | Status |
|---|----|-------------------|--------|
| 1 | DB-01 | Resubmitting a budget contribution deletes its ledger rows and reissues their codes. Ledger history is lost. | Open |
| 2 | MOCK-01 to MOCK-04 | Production approval and rate-card pages show hardcoded data for one named vendor, including a pre-signed agreement. | Open |
| 3 | LOG-01, LOG-02 | Permission denials (403) are not logged. Server errors (5xx) log only the public message, not the cause. | Open |
| 4 | DB-02 | Manual BOQ replace deletes a revision's lines without checking status. Downstream links clear silently. | Open |
| 5 | DB-04 | Some budget sums count REJECTED and REVERSED rows. | Open |
| 6 | D1-04 | Queries over D1's bound-variable limit re-run in pages. Small test data never reaches this path. | Open |
| 7 | D1-01 | The category-manager dashboard reads every line of up to 50 approved revisions on each load. | Open |
| 8 | GATE-01 | The quality gate takes about 25 minutes, mostly in one serial Jest run. | Open |
| 9 | F-01, F-02 | Buyers cannot record a negotiation decision or lock final rates in the UI. | Open |

## 1. Database consistency

| ID | Severity | Finding | Evidence | Status |
|---|---|---|---|---|
| DB-01 | Critical | On resubmission, `add-to-budget` deletes every `budget_transactions` row for the contribution. New `BTX-` codes come from `MAX + 1`, so a code can later point to a different row. | `src/app/api/boq/add-to-budget/route.ts` 173–175 (verified). `BUDGET_TRANSACTION_DELETE_AFTER_AUDIT_SQL` in `src/lib/d1-batch.constants.ts` 1148 (verified). | Open |
| DB-02 | High | Manual BOQ replace hard-deletes all lines of a revision with no DRAFT check. PR, RFQ, PPO, actual-cost and budget foreign keys are `ON DELETE SET NULL`, so links clear without an error. | `d1-batch.constants.ts` ~198–208; `src/app/api/boq/manual/route.ts` ~350–353 | Open |
| DB-03 | High | Quote numbers use `QT-{rfqNumber}-{version}`, so vendors on the same RFQ can share a number. `quotes.quoteNumber` has only a non-unique index. | `src/app/api/vendor-portal/rfqs/[id]/route.ts` ~262; `d1-batch.constants.ts` ~791–800 | Open |
| DB-04 | High | Budget totals mix statuses. Dashboard proposed sums include REJECTED and REVERSED. The fallback reads APPROVED rows, but reversal rows are also APPROVED. `MAX(0, …)` clamps negative drift without logging it. | `src/app/api/dashboard/route.ts` ~1186–1228; `src/app/api/approvals/route.ts` ~195, ~207 | Open |
| DB-05 | High | Revision counters (`totalLines`, `validLines`, `errorLines`, `warningLines`, `qualityScore`) have seven writers. Two reads ignore `isDeleted`. Submit requires `errorLines = 0`, so a stale counter can block or allow submission wrongly. | `boq/manual/route.ts` ~263–267; `boq/[revisionId]/lines/route.ts` ~344–347 | Open |
| DB-06 | Medium | Vendor defaults invent data. `performanceScore` defaults to 88.0, `turnoverCrores` to 15.0, and `empanelmentStatus` to APPROVED. An unrated vendor looks rated. | `prisma/schema.prisma` 416–420 (verified) | Decision (D-03) |
| DB-07 | Medium | The integrity check compares table and column names only, not types or nullability. Foreign-key and cross-tenant scans run only with `--local`. The gate never runs `report-d1-data-quality.cjs`, which checks totals and the budget invariant. | `scripts/check-d1-integrity.cjs` ~262–265, ~297; stage list in `scripts/check-quality.cjs` (verified) | Open |
| DB-08 | Medium | Several references have no foreign key: `projects.createdBy`, `budget_contributions.submittedBy`, `pr_approvals.approverId`, `vendors.evaluatedById`, `notifications.userId`, `rfq_messages.vendorId`, `auction_items.currentWinningVendorId`, `actual_cost_transactions.createdById`. `quote_lines`, `pr_lines` and `ppo_lines` copy `tenantId` without a foreign key. | `prisma/schema.prisma` | Deferred (table rebuilds with a backup first) |
| DB-09 | Medium | Natural keys are not enforced. `ppo_lines(ppoId, lineNumber)` has no unique index. `auction_bids.bidNumber` is not unique. `ppos_awardRecommendationId_key` ignores status, so a cancelled PPO blocks a replacement. | `migrations/0002_workflow_uniqueness.sql` ~22–24 | Open |
| DB-10 | Medium | Status values drift from the schema comments. PR approve writes `PR_RELEASED_TO_PROCUREMENT`, but the release route requires `PR_APPROVED`. Undocumented values: `PR_RETURNED_FOR_CORRECTION`, `UNDER_APPROVAL`, `BUDGET_UNDER_APPROVAL`, `PENDING` (`rfq_vendors.invitationStatus`), `COST GENERATED`. `CANCELLED` is filtered but never written. `REVISED` on quotes is documented but never written. | Sub-agent reading; not re-verified | Decision (D-05) |
| DB-11 | Medium | One fact lives in two places. Vendor qualification: `vendors` and `vendor_evaluations`. Offers: `quotes` and `negotiation_rounds.revisedQuoteAmount`. Approvals: `budget_approvals` and `budget_contributions.projectApprovedBy`. Project budget: `projects.budget` and `projects.costCentre`. | Sub-agent reading | Open |
| DB-12 | Low | Dead or duplicate schema. `budget_contributions.isSuperSeded` and `superSededByContributionId` are read but never set (verified: no writer in `src`). `auction_vendors.bestBidRank` has no reader or writer. The category root-name unique index is defined in `0002` and again in `0009`. Five unique constraints have different names in SQL and Prisma. `0001_initial_schema.sql` is a no-op. Prefixes `0034` and `0035` are each used twice. | `prisma/schema.prisma` 754, 1119–1120 (verified) | Open |
| DB-13 | Low | The dashboard may count draft revisions of an APPROVED BOQ. | `dashboard/route.ts` ~344 | Open |

Current write path: `prisma.$transaction` throws on D1 by design (`src/lib/prisma.ts` 41–44, verified), and no call site remains in `src`. Multi-write paths use the D1 batch helper `writeD1BatchAtomically` (`src/lib/d1-batch.ts` 172). An earlier note that the app still has live `$transaction` workflows is out of date.

## 2. Cloudflare D1 usage (estimates)

| ID | Severity | Finding | Evidence | Status |
|---|---|---|---|---|
| D1-01 | High | The category-manager dashboard groups every line of up to 50 approved revisions (`boqLine.groupBy` with `_sum` of quantity). PR lines are read twice. Index `boq_lines_tenant_revision_deleted_category_cost_idx` (0014) does not include quantity. | `src/app/api/dashboard/route.ts` | Open. Store per-revision counters in the same D1 batch as each write. |
| D1-02 | High | The SUPER_ADMIN audit query has no tenant filter, so index `audit_logs_tenant_created_idx` (0025) cannot serve it. | `dashboard` and audit routes | Open |
| D1-03 | Medium | TopNav polls `/api/notifications?limit=10` every 120 s and refetches on `visibilitychange`. The unread count uses an OR visibility filter (`notificationVisibilityWhere`) that can scan unread rows across the tenant. Migration 0036 added indexes, so re-measure first. | TopNav; `notificationVisibilityWhere` | Open |
| D1-04 | High | `findManyWithinD1Limits` in `src/lib/d1-compat.ts` re-runs the whole query through `findManyInPages` when D1 reports too many SQL variables. Page size starts at 90 and halves. Logs `db.d1_parameter_limit_paging`. Small test data never triggers this path, so production can behave differently. | `src/lib/d1-compat.ts` | Open |
| D1-05 | Medium | `procurement_requests`, `rfqs` and `boqs` have no `(tenantId, status)` index. Migrations 0001 to 0036 index only `projectId`, `costCentreId`, `boqRevisionId`, `boqId`, `prId` and `tenantId`+number on these tables (verified by grep). | `migrations/0031_add_lookup_indexes.sql` 9–17, 54–57 | Open. Planned in migration 0037. |
| D1-06 | Medium | The PROJECT_USER fallback budget reads all lines of every revision (`fallbackBudget` raw query). | Sub-agent reading | Open |
| D1-07 | Medium | The BOQ revision page calls `getBoqLineSummary` on every load. Counters already exist on `boq_revisions`. | `src/app/api/boq/[revisionId]/route.ts` ~105–109 | Open |
| D1-08 | Medium | Manual BOQ writes recount the revision on each non-replace write, without an `isDeleted` filter. | `boq/manual/route.ts` ~264–267 | Open |
| D1-09 | Medium | `actual-costs` runs a count and a findMany ordered by `actualDate`, with no index that matches. | `src/app/api/actual-costs/route.ts` 113–117 | Open. Planned in 0037. |
| D1-10 | Low | `readByD1FilterChunks` and `countByD1FilterChunks` await 90-ID chunks one after another. | `src/lib/d1-query.ts` ~18–31 | Open |
| D1-11 | Low | The auction room polls every `refreshIntervalSeconds` (15 s, paused while the tab is hidden). Cost not measured. | Sub-agent reading | Open |
| D1-12 | Medium | Eight pages call `/api/auth/me` on mount. Whether route auth writes a refreshed token back is not verified. | approvals/rate-cards, budget, cost-centres, masters/categories, masters/standard-boq, procurement/vendors/[id], projects, projects/new | Open (verify first) |

## 3. Architecture

| ID | Finding | Evidence | Status |
|---|---|---|---|
| ARCH-01 | Several files are too large to review safely: `dashboard/route.ts` (over 1,300 lines), some client pages (about 2,800 lines), and `d1-batch.constants.ts` (thousands of lines of SQL). | Line counts from sub-agent reading | Open |
| ARCH-02 | Prisma and raw SQL are mixed in the same routes. Cross-table writes go through the D1 batch helper. Reads use both styles, so one entity can be shaped two ways. | Route reading | Open |
| ARCH-03 | `withD1Compat` wraps every Prisma model. Its paging behavior is the source of D1-04. | `src/lib/d1-compat.ts` | Open |
| ARCH-04 | `ui-strings.constants.ts` is a very large catalog. Several vendor and rate-card strings are fixtures, not copy (MOCK-09). | `src/lib/ui-strings.constants.ts` | Open |
| ARCH-05 | Client-to-route wiring is sound. 249 of 251 literal `/api/` call sites match an exported method. The other two are log metadata. | Search of literal call sites | No action |

## 4. Logging and error capture

Why production logs show few errors:
- Permission denials (403) are not logged at all.
- 5xx responses carry only the public message. Only 6 of 163 5xx call sites pass the underlying error.
- Some catch blocks log nothing, or log only the error name.
- Failed client log batches are dropped silently.
- Browser `console.error` and `console.warn` calls (56 in 30 UI files) never reach the server.
- Ingestion rate limiting may put all Cloudflare traffic in one bucket.

| ID | Severity | Finding | Evidence | Status |
|---|---|---|---|---|
| LOG-01 | High | `requireAuth` returns 403 without logging. The permission, role and user are not recorded. | `src/lib/api-utils.ts` ~49 and ~77 (verified) | Fixing next |
| LOG-02 | High | `apiError` logs only the developer message for 5xx responses. The underlying error is not recorded unless a caller passes it. | `src/lib/api-utils.ts` `apiError` (verified) | Fixing next |
| LOG-03 | High | `admin/users` POST has no try block, so `req.json()` and `prisma.user.create` failures reach the framework default. The GET handler has one. | `src/app/api/admin/users/route.ts` POST (verified) | Open |
| LOG-04 | High | `budgets/approve` (approve, finance reject, reverse) logs only name and message. Malformed JSON becomes a logged 500. | `src/app/api/budgets/approve/route.ts` ~71–95 | Open |
| LOG-05 | Medium | `vendor-portal/rfqs/[id]` replaces malformed `lineItemsJson` with `[]` without logging. | ~409–410 | Open |
| LOG-06 | Medium | `approvals/vendor-ratings` overwrites malformed-history warnings. | ~229–241 | Open |
| LOG-07 | Medium | `cost-centres/[id]` (~249) and `rfqs/[id]/re-rfq` (~226) swallow failed reconciliation. | Sub-agent reading | Open |
| LOG-08 | Medium | `projects/[id]` GET logs only `error.name`. | ~100 | Open |
| LOG-09 | Medium | `auth/me` calls `auth()` without a guard. | Route line 11 | Open |
| LOG-10 | Medium | Nothing generates request IDs, and `getRequestCorrelationId` has one caller. Routes read `x-request-id`, but Cloudflare sets `cf-ray`. `apiError` responses carry no ID the user can quote. | `src/lib/observability/shared.ts` ~14–16 | Open |
| LOG-11 | Medium | The client reporter drops failed batches silently (`.catch(() => undefined)`). Only fetch responses with status 500 or higher are reported. | `client-reporter.ts` ~55, ~108 | Decision (D-04) |
| LOG-12 | Medium | Ingestion rate limit keys on `x-real-ip` or `x-forwarded-for`, else one shared bucket of 60 per minute. `cf-connecting-ip` is not read. | `src/app/api/observability/client/route.ts` ~12–15; `rate-limit.ts` ~13 | Open |
| LOG-13 | Medium | Redaction gaps. `secretTextPattern` matches a key only when a colon or `=` follows it. `sensitiveKeyPattern` has no PAN, GSTIN, phone or bank keys. The client route stores `event.context` without an allow-list. | `src/lib/observability/shared.constants.ts` (verified); client route | Open |
| LOG-14 | Medium | Retention covers local files only. On Workers, file logging is off (`isFileLoggingEnabled` is false). No Workers Logs retention is set in the repo. | `server-logger.ts` ~23; `wrangler.jsonc` 19–22 | Decision (D-06) |
| LOG-15 | Low | Some handled failures reach only the console: `(app)/audit/page.tsx` ~48, `budget/vs-actual/page.tsx` ~95, and the admin users page fetch (~46–48). | Sub-agent reading | Open |
| LOG-16 | Info | Catch clauses in `src`: 510 (upper bound). API routes: 250 (164 log, 22 apiError only, 61 neither, 3 rethrow). Lib: 45 (18 log, 23 neither). UI: 215 (89 log, 126 neither). | Sub-agent count | Open |

## 5. Mock and demo data

Production-visible unless noted. Already gated at runtime: `SHOW_DEMO_WORKFLOW_LINKS`, `SHOW_SAMPLE_AGREEMENT_ATTACHMENT`, and `isDemoMode`, which all depend on `NODE_ENV`. The literals still ship in production bundles.

| ID | Severity | Finding | Evidence | Status |
|---|---|---|---|---|
| MOCK-01 | Critical | `approvals/rate-cards/page.tsx` passes hardcoded `RC-2026-0006`, "Ramakrishna Interiors" and category "Interior Works" to the approver view and finalised-details section. | ~430–455 (verified) | Open |
| MOCK-02 | Critical | `Section6ApproverView` defaults to a SIGNED agreement (signer "K. Ramakrishna", `verified: true`) and five fixed items INT-001 to INT-005. Approve buttons only show a toast. | `src/components/rate-cards/Section6ApproverView.tsx` ~21–55 (verified) | Open |
| MOCK-03 | High | `AgreementPreviewModal` falls back to a fixed signer and DSC reference. Its unit test asserts that fallback. | `AgreementPreviewModal.tsx` ~17, 19, 232, 237 (verified); `unit-tests/agreement-preview-modal.test.tsx` 78–80 | Open |
| MOCK-04 | High | `InitiateRateCardWorkspace` defaults to vendor `37b13f45-…` (Ramakrishna). Its constants file holds INT-001 to INT-005. The POST route returns 404 for vendors outside the tenant, so the default can fail on submit. | `InitiateRateCardWorkspace.tsx` ~45–46, 615–634 (verified); `InitiateRateCardWorkspace.constants.ts` 7–75; `src/app/api/procurement/rate-cards/route.ts` ~258–262 | Open |
| MOCK-05 | High | A missing unit cost becomes a flat ₹100 benchmark, persisted to `rfq_lines`. The compare route labels it "AI Costing Engine / Baseline Benchmark". | `rfqs/post.ts` ~234, 321, 405–406; `approved-boqs/route.ts` ~115, ~281; `rfqs/[id]/compare/route.ts` ~529–547 | Open |
| MOCK-06 | High | `boq/estimate-cost` uses 46 keyword prices (`ac` maps to ₹52,000). POST writes `boq_lines`. | `src/app/api/boq/estimate-cost/route.constants.ts` 3–50; `boq/studio/page.tsx` ~1265 | Open |
| MOCK-07 | High | The dashboard values quantity × ₹100 when no stored amount exists. | `src/app/api/dashboard/route.ts` ~491, ~1040 | Open |
| MOCK-08 | High | `boq/refine-ai` keyword rules overwrite spec text when `acceptConfidenceThreshold` is set. | `src/app/api/boq/refine-ai/route.constants.ts` 3–52 | Open |
| MOCK-09 | Medium | Vendor and rate-card copy used as fallbacks in `ui-strings.constants.ts` (around lines 912, 2549, 2921, 3959, 5038, 5046, 5204). | Sub-agent reading | Open |
| MOCK-10 | Medium | `boq-cost-breakdown.ts` uses fixed 60/28/12 shares, an `ac` substring test, and a flat 10% margin. | `src/lib/boq-cost-breakdown.ts` ~52–110 | Open |
| MOCK-11 | Medium | `boq/standard/generate` writes a constant `aiConfidence` of 0.95 and `costConfidence` of 0.92 on every line. | `route.ts` ~106, 109 | Open |
| MOCK-12 | Medium | Test persona and fixture password (`Mock@1234`) in login constants. The persona UI is gated, but the literal ships. | `src/lib/ui-strings.constants.ts` ~3894; `src/app/login/page.constants.ts` 7–30 | Open |
| MOCK-13 | Medium | `procurement-demo-data.ts` (RFQ-DEMO-001) is gated at runtime, but its literals ship in server chunks. | `src/lib/procurement-demo-data.ts` 10–326 | Open |
| MOCK-14 | Medium | Vendor filters use 13 static categories and 7 regions. | `procurement/vendors/page.tsx` ~221–235, 245 | Open |
| MOCK-15 | Medium | BOQ template downloads include sample rows that can import as real lines. | `src/app/api/boq/template/route.ts` 28–96; `simple-template/download/route.ts` 10 | Open |
| MOCK-16 | Low | `Section5VendorAcceptance.tsx` is imported nowhere. `NegotiationWorkspace.tsx` and `BuyerAcceptanceWorkspace.tsx` default to Ramakrishna. | Sub-agent reading | Open |

Checked and not mock data: the permission matrix, actual-cost sources, stage lists, and drawing-parser keyword rules.

## 6. Missing features and routes

| ID | Priority | Gap | Evidence | Status |
|---|---|---|---|---|
| F-01 | P1 | Buyers cannot record a decision on RFQ negotiation rounds. `POST /api/procurement/negotiations/decision` has no caller. | Route scan | Open |
| F-02 | P1 | No UI locks final rates. `POST /api/procurement/rfqs/[id]/lock-rates` has no caller. Awards fall back to quote totals without a lock. | `rfqs/[id]/page.tsx` ~545 | Open |
| F-03 | P2 | No UI completes a PPO. `POST /api/procurement/ppos/[id]/complete` has no caller. | Route scan | Open |
| F-04 | P2 | No UI records actual costs. `GET` and `POST /api/actual-costs` have no caller. | Route scan | Open |
| F-05 | P2 | No re-tender UI. `POST rfqs/[id]/re-rfq` has no caller. | Route scan | Open |
| F-06 | P2 | Vendors cannot be added to an RFQ after creation. `POST rfqs/[id]/vendors` has no caller. | Route scan | Open |
| F-07 | P2 | "Edit Project" links to `/projects/[id]/edit`, which does not exist. `PUT /api/projects/[id]` has no caller. | `projects/[id]/page.tsx` ~176 | Open |
| F-08 | P2 | PROJECT_USER has no sidebar link to the PR or BOQ registers. | `Sidebar.tsx` ~118–141 | Open |
| F-09 | P2 | Broken targets: `/procurement/rate-cards/new` and `/approvals`. | `InitiateRateCardWorkspace.tsx` ~108, 128, 310, 443; `approvals/rate-cards/page.tsx` ~318 | Open |
| F-10 | P2 | Vendor `complianceStatus` has no write path. Vendor withdrawal has no setter; `WITHDRAWN` is filtered but never written. | Route and UI scan | Open |
| F-11 | P2 | No UI deletes project documents. `projects/[id]/documents/[documentId]/route.ts` exports only GET. | Route scan | Open |
| F-12 | P3 | API routes with no UI caller: `boq/duplicate`, `boq/from-standard-library`, `boq/standard/error-report`, `boq/template`, `budgets/add-boq`, `budgets/submit` (redundant), `cost-centres/[id]` GET and PUT, `pr/[id]/release-to-procurement`, `rate-cards/compare-workspace`, `rate-cards/[id]/submit`. Unused DELETE handlers: `procurement/auctions/[id]`, `procurement/rate-cards/[id]`. | Route scan | Open |
| F-13 | P3 | Budget reconciliation, register exports and reports are absent. | Sub-agent reading | Open |
| F-14 | P3 | TopNav Search and Help do nothing (Help at `TopNav.tsx` ~354). | `TopNav.tsx` | Decision (D-07) |
| F-15 | P3 | `/procurement/quotes` and `/procurement/approved-boqs` are unreachable for PROCUREMENT_USER in some cases. | Sub-agent reading | Open |

Checked and not defects: no "TODO", "FIXME" or "coming soon" text in the UI. Demo RFQ quotes are gated. Auction auto-extension is implemented.

## 7. Latency and loading

Only partly analysed.
- Eight pages call `/api/auth/me` on mount (D1-12).
- TopNav polls notifications every 120 s (D1-03).
- The dashboard runs heavy aggregate reads (D1-01, D1-06).
- The BOQ revision page recounts lines on each load (D1-07).
- Heavy libraries (`xlsx`, PDF tools) may be imported statically into client components. Not checked. `check:performance` enforces budgets, and its coverage is not reviewed here.
- Loading states were not audited page by page.

## 8. Quality gate speed

Measured: the coverage stage takes about 15 minutes. The build takes about 28 s. Estimated: typecheck about 10 s, and the integrity stage makes up to ten `wrangler d1 execute` calls.

Causes:
- Jest runs in band because `--detectOpenHandles` implies `--runInBand`.
- Coverage is collected for all 375 files under `src/` on every run.
- The gate runs its stages one after another.
- Lint has no ESLint cache.
- Integrity runs one Wrangler process per query.
- `next build` type-checks again after `tsc --noEmit`.

| ID | Finding | Status |
|---|---|---|
| GATE-01 | The gate takes about 25 minutes per run. Jest is about 15 of those minutes. | Open |
| GATE-02 | `unit-tests/boq-studio-page.test.tsx` (23 tests) failed once under full-gate load and passed on rerun. Its slowest tests take 5 to 8 s alone. | Open |

Planned options, ranked by time saved: shard Jest into separate processes and merge coverage before the threshold check; run the non-Jest stages beside Jest; batch integrity queries; add an ESLint cache; fix the `check:changed` trigger gaps. Rejected: removing `--detectOpenHandles`, and changed-only lint in the gate.

## 9. Verified not defects

- The SQL guards on `submit-offer` round, quote, parent and RFQ status writes hold. An earlier claim of partial writes was wrong. Regression test: `unit-tests/negotiation-offer-rfq-guard.integration.test.ts`.
- The invite path re-invites correctly.
- The rate-card "409 after commit" could not be reproduced.

## 10. Decisions needed from the owner

| ID | Question | Default until decided |
|---|---|---|
| D-01 | Should buyer accounts mapped to a vendor see the vendor portal? An existing test encodes yes. | Unchanged |
| D-02 | Should project access fail open for users with no `ProjectTeam` rows? | Unchanged (fails open) |
| D-03 | Show "Not rated" for unrated vendors, and stop writing 88 as a default? The database default stays until a table rebuild. | Unchanged |
| D-04 | For failed client log batches: retry, count drops, or keep silent? | Unchanged |
| D-05 | Which status values are canonical? For example `PR_RELEASED_TO_PROCUREMENT` or `PR_APPROVED`. | Unchanged |
| D-06 | Workers Logs retention period, and whether production needs file logs. The policy default is 30 days. | 30 days for local artifacts |
| D-07 | TopNav Search and Help: build, link, or hide. | Hide when unbuilt |
| D-08 | Tax basis for `orderedAmount`. | Unchanged |
| D-09 | PR approval releases directly, while the release route is unused. Keep one path? | Unchanged |
| D-10 | Vendor directory visibility. Reads are cross-tenant and writes tenant-scoped. Keep it? | Unchanged |
| D-11 | Remote D1 target. `wrangler.jsonc` database IDs changed in merged PR #11. Confirm the target before any remote migration. | No remote migration |
| D-12 | `NEXTAUTH_SECRET` (or `AUTH_SECRET`) must be a Worker secret before deploy. Production fails closed without it. | Deploy blocked until set |

## 11. Fix order

Each fix is committed and pushed on its own, after `npm run check:quality` passes.

1. Ledger: keep superseded budget transactions instead of deleting them (DB-01).
2. Logging: record 403 denials, record the cause of 5xx responses, and add error handling to `admin/users` POST (LOG-01 to LOG-03).
3. Mock data: remove production-visible Ramakrishna literals and replace them with API data (MOCK-01 to MOCK-04).
4. Indexes: add migration 0037 with `(tenantId, status)` indexes and the actual-cost index (D1-05, D1-09).
5. Budget totals: exclude REJECTED and REVERSED rows from proposed sums (DB-04).
6. Gate speed: parallel stages and sharded Jest, measured before and after (GATE-01).
7. Remaining items in sections 1 to 6, in priority order, as decisions are made.
