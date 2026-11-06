# proCPX Architecture Audit

Audit date: 2026-11-06

## Scope and evidence

This audit covers the current app and migrations in this checkout, the installed Cloudflare D1/Next runtime configuration, unit coverage, local D1 integrity, and a real local D1 workflow run. It does not certify production behavior: Cloudflare production credentials and production log/analytics access were not available in this run.

The current local database is a Wrangler D1 SQLite state. The Prisma SQLite provider is schema dialect only; the app runtime uses the Cloudflare D1 adapter. The legacy `prisma/dev.db` is removed under the user's one-time authorization and was not imported or recreated.

## Findings resolved in this work

### D1 data and schema integrity

- The latest local integrity gate reports 44 application tables and 493 records, with 25 logical duplicate checks passing, no foreign-key violations, and no cross-tenant references. The shared local D1 record set remained unchanged during the latest code and integrity checks.
- The full local end-to-end workflow checked that earlier record counts never decreased and that vendor, quotation, negotiation, award, and PPO references remained intact.
- Ordered Wrangler migrations now run through 0029. Migrations 0002–0017 add logical uniqueness guards and lookup indexes; 0018 adds the notification outbox; 0019–0022 add rate-card, auction-history, and vendor-scoped notification lookup support; 0023 adds a covering PPO lookup index for budget-versus-actual aggregation; 0024 indexes active project assignments by user; 0025 indexes tenant audit timeline ordering; 0026 indexes rate-card items by tenant/card; 0027 indexes RFQ vendor preview ordering; 0028 indexes tenant quote-ledger ordering; and 0029 indexes cursor-ordered negotiation history. These reviewed migrations were applied locally through `npm run db:migrate:safe`; no remote migration was run.
- The fixture script `scripts/seed-d1-test-fixtures.cjs` now runs migrations and idempotent fixtures only in the ignored `.wrangler/e2e-d1` database. It was run twice successfully; the shared local D1 was unchanged. The isolated dataset contains two tenants, two categories, two projects, two cost centres, a multi-line BOQ, an approved PR, three vendors and quotes, negotiation history, an award, and a PPO.

### D1 batch limits and write consistency

- `src/lib/d1-batch.ts` now rejects oversized writes before preparing statements and emits `database.d1_batch_limit_exceeded` with counts and the violated limit.
- The guard enforces 500 statements per batch, 100 bindings per statement, and a conservative 4,500 binding ceiling per batch. Workflow-specific line caps and preflights cover PR, BOQ, PPO, quote, RFQ invitation, and rate-card writes.
- Cloudflare documents the D1 Worker binding limits and `batch()` behavior in its [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) and [D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/) references. D1 batch statements execute sequentially as one atomic batch; Prisma's D1 adapter does not provide ordinary Prisma transaction guarantees.
- Final-rate locking previously changed the RFQ, wrote its audit entry, and sent a notification separately. It now performs a tenant-scoped compare-and-set update plus audit insertion in one D1 batch, and checks invitation, vendor, quote, and allowed current status in SQL. A stale transition returns conflict; notification failure is logged without falsely failing the committed lock.
- Buyer acceptance of vendor final offers was blocked by two issues: `PENDING_BUYER_DECISION` was treated as a completed decision, and the D1 statement bound its decision and tenant parameters in the wrong order. Both are fixed and covered by regression tests.
- Auction creation now allocates tenant/year-scoped numbers in D1 and writes the auction, invited vendors, items, audit record, and one vendor-scoped notification outbox row per invitation in one bounded native batch. A preflight rejects combined writes above the safe binding limit before D1 is called. Invite and RFQ-line tenant references are checked, vendor/item counts are capped, and create failures emit `auction.creation_failed`. A SQLite execution check verified numbering, audit-number consistency, and rollback on invalid vendor/line references. The shared D1 currently contains no auction rows.
- Auction bid history now uses a stable `(timestamp, id)` cursor and a separate bounded bid query after authorization/privacy checks. Active sealed-bid vendors receive only their own history and do not get competitor row counts or cursor metadata. Both buyer and vendor pages retain older history across polls and ignore stale page/poll responses. Migrations 0020 add only lookup indexes for those paths.
- `/api/budgets` now requires a project ID, matching its only UI caller and preventing its previous tenant-wide project/cost-centre expansion plus unbounded aggregate grouping. The route tests verify the missing-scope rejection and project-filtered totals.
- Core D1 end-to-end run covers category, project, cost centres, BOQ, PR approval/release, RFQ, three vendors and quotes, negotiation, vendor final offer, buyer acceptance, final-rate lock, award approval, PPO issuance, duplicate PPO rejection, audit history, role checks, and tenant isolation. The latest run (`E2E-D1 20261104012504151-c9158dd8`) passed 70/70 checks.

### Bounded approval reads and observability

- The approval API previously returned complete budget, PR, and finance queues with full related records. It now pages parents, adds stable ID tie-breaks, returns queue totals and aggregate money totals, and selects identity/budget records only for the current page. The three approval screens expose a Load More control and retain already loaded rows.
- The project-approver dashboard now returns five pending PRs as a preview, preserves the full pending count, links to the complete approval register, and fetches only the preview requesters. It reads the latest approval event instead of loading approval history for every row.
- New final-rate lock and batch-limit events use the shared structured logger. Existing Next server/browser console capture remains in place. The lock path does not log request bodies or vendor contact details.
- Vendor RFQ detail read failures now emit `vendor_portal.rfq_detail_failed` with request, tenant, user, vendor, RFQ, duration, and sanitized error context. The API returns a stable user-safe error instead of exposing exception text; if structured logging itself fails, the fallback console event is captured by the existing instrumentation. Regression coverage checks Error and non-Error failures plus logger failure.
- The buyer RFQ negotiation workspace now refreshes through the tenant-scoped procurement detail route. It previously called the vendor-portal route, which could reject a buyer or fail to refresh the buyer's scoped detail. A regression test confirms buyer refreshes use the procurement endpoint and preserve the vendor-only path for vendors.

### Budget versus actual report fan-out

- `/api/financial/budget-vs-actual` now aggregates budget transactions, PPO commitments, and actual-cost transactions by BOQ line for full-project KPIs and cost-centre/category summaries. The project summary and category/cost-centre totals use a parameterized grouped SQL query, while full transaction lineage is fetched only for a stable, paginated page of BOQ lines (50 by default, capped by the shared list-page policy). The grouped query is covered for tenant, project, category and cost-centre scope, and fallback categories.
- The report UI exposes a Load More action and retains the aggregate totals while appending detailed rows. Regression coverage verifies that page two returns one line while project KPIs remain calculated across all three lines.
- Compact BOQ line metadata is still read across the selected project to calculate exact fallback budget values and category/cost-centre totals. The aggregate query's SQL shape was validated against local D1; production rows-read and latency impact remain unmeasured without Insights.

### Budget summary and ledger fan-out

- `/api/budgets` pages cost-centre summaries in stable `(code, id)` order (50 by default, capped at 100) and returns project-wide KPI totals from one parameterized D1 aggregate query. Detailed grouped reads are filtered to cost centres on the requested page instead of materializing project-wide category/status groups.
- The summary first validates tenant and project-team scope, and returns a generic 404 before counts or finance aggregates when the requested project is inaccessible. Explicit project IDs cannot bypass the user's active assignment scope.
- Superseded budget contribution revisions are excluded from both the KPI aggregate and approval banner. This matches the dashboard's active-revision semantics and prevents old revisions being counted beside their replacements.
- Read-only execution of the parameterized aggregate SQL against local Wrangler D1 returned the expected empty aggregate row; route tests cover KPI totals on later pages, assignment denial, filters, superseded-revision SQL, and load-more behavior.
- Free-text category fan-out is now isolated from the cost-centre summary. `/api/budgets` returns category-free, status-grouped transaction totals and preserves exact actual totals through a bounded cost-centre JSON aggregate; `/api/budgets/categories` validates tenant, project assignment and cost-centre scope, applies the shared 50-row default/100-row maximum, and pages stable category rows for the selected centre only. The workspace loads categories on selection, offers Load More, reports failures, and ignores stale responses. Local D1 was unchanged (44 tables, 493 records, no duplicate/FK/tenant issues); no migration was required. Focused category, summary and workspace tests cover aggregate fallbacks, status mapping, pagination, error paths and stale responses.
- Pending contribution records are limited to the most recent 10 non-superseded rows per cost centre for the approval banner. Full ledger rows are served by `/api/budgets/transactions`, with tenant-scoped filters, stable date/ID ordering, a 50-row default page (100 maximum), and user lookups limited to IDs present on that page.
- The budget workspace summary contract returns its aggregate totals and a ledger endpoint link. The transaction page owns ledger pagination and filters; regressions cover totals, fallbacks, filters, pagination, and reversal refresh behavior.
- No schema migration was required for this summary repair. The full quality gate found no pending migration, and local D1 remained at 44 tables/493 records with 25 logical duplicate checks, zero foreign-key violations, and zero cross-tenant references.

### Dashboard read fan-out and repeatability

- Procurement and category-manager dashboard registers now return bounded 50-row previews with exact counts. RFQ children are capped at five with relation counts and latest lifecycle summaries; BOQ/PR line totals and amounts use grouped D1 aggregates instead of loading every line. Category exceptions and taxonomy/UOM previews are capped and the UI links to full registers where they exist.
- Viewer dashboards now return a stable 50-project preview, select only display fields, and fetch only the latest updated BOQ and revision per project. The API returns the exact project count and the UI shows a preview notice when more projects exist.
- Project-user fallback budgets now use one tenant-scoped SQL aggregate over each BOQ's latest revision instead of loading all BOQs and nested line rows. The SQL was executed read-only against the configured local D1 schema.
- The general project-user dashboard had a dead project-approver pending-action branch after the project-approver role had already returned. That unreachable code was removed. Handled dashboard failures now emit `dashboard.read_failed` with request, tenant, user, role, and sanitized error context.

### Project authorization tenant scope

- The shared project-authorization helpers now require the authenticated tenant ID. Active team assignments are read only through projects in that tenant, owner/creator lookups carry the same tenant predicate, and the project-specific owner fallback uses `(projectId, tenantId)` rather than a globally keyed lookup.
- All API callers pass the authenticated tenant context. The helper preserves its documented default that a user with no active team assignments in a tenant has tenant-wide project scope. Focused tests cover tenant-filtered assignment/owner reads and this fallback; no schema change or D1 data change was required.

### Credential login tenant ambiguity

- The user schema permits the same email address in different tenants, while credential login previously used an unordered `findFirst`. That could authenticate an arbitrary tenant identity when duplicate active emails existed.
- Login now fetches at most two active matches and accepts email login only when exactly one tenant identity exists. Ambiguous email matches fail closed and cannot fall through to the non-production vendor-name shortcut. Regression tests cover duplicate-tenant email rejection, regular login, password rejection, and vendor-name matching. No schema or D1 data change was made.

### Super-admin dashboard and auction picker read bounds

- The super-admin dashboard now orders tenant rows by `(name, id)`, returns a stable page through the shared page-window policy, and appends later pages in the UI. Exact tenant counts are retained; a large tenant list no longer expands into one dashboard response.
- Auction creation previously expanded 50 RFQs at once with every line, invitation, quote, and quote line, and loaded every active project observer. The RFQ picker now returns paged summaries, loads one RFQ's detail only after selection, and omits unused quote-line rows. Observer candidates use a separate stable page; RFQ and observer pages can be extended independently.
- The RFQ-options route emits `auction.rfq_options_read_failed` with request/tenant/user/page context and sanitized error type. Regression tests cover page boundaries, empty detail associations, omitted observer expansion, and access denial.

### Master catalog and category-code lookup bounds

- Active category reads now use one tenant-scoped query with stable ordering and a 1,001-row sentinel. The flat response retains its existing array shape; the tree response is assembled from that same bounded set, preserving the existing root/child shape and stable child ordering. Catalogs above 1,000 active rows return a clear 413 and emit `masters.categories_result_limit_exceeded` instead of being silently truncated.
- Active UOM reads now have a stable 501-row sentinel and a 500-row ceiling. Oversized lists return 413 and emit `masters.uom_result_limit_exceeded`; unexpected reads emit `masters.uom_list_failed` and return a safe message.
- Automatic category-code generation now limits prefix lookups to 10,000 rows. That accommodates the 9,998 generated sequence codes plus a parent base code; an over-limit legacy prefix fails closed with a 503 and `masters.category_code_lookup_limit_exceeded`. The caller may provide an explicit code while the legacy catalog is reviewed.
- Regression tests cover category tree compatibility, both catalog ceilings, stale-parent and duplicate-name races, category uniqueness conflicts, non-Error failures, and code-prefix overflow. No schema migration or D1 record change was made.

### Budget transaction filter option bounds

- `/api/budgets/transactions` previously loaded every tenant/project cost centre alongside each ledger page. The endpoint now returns cost-centre options in stable `(code, id)` pages of 100 and includes an exact option count and `hasMore` state. An options-only mode loads later dropdown pages without repeating transaction, category, or user queries.
- The ledger UI appends unique cost-centre IDs, ignores stale option responses when the active project changes, and leaves already loaded options intact while fetching later ledger pages. Existing array shape remains available to clients; pagination metadata is additive.
- Route and page regressions verify tenant/project scope, page bounds and ordering, no ledger reads in options-only mode, safe error logging, and UI append behavior. No schema migration or D1 record change was made.

### Vendor-rating approval queue fan-out

- `/api/approvals/vendor-ratings` now reads 50 stable rows per page (100 maximum), resolves only submitter IDs present on the current page, and returns a `hasMore` cursor state. The approval page appends records with duplicate-ID protection and retains the exact KPI totals.
- Status counts now use a grouped D1 query, and approved PPO value uses a filtered PPO aggregate under the same tenant/project scope. This removes the previous second full rating-history read and in-memory filtering pass.
- Queue read errors now produce `vendor_rating.approval_queue_read_failed` with request/tenant/user/role/page context and sanitized error details; clients receive a safe generic error.

### Vendor directory fan-out and error visibility

- `/api/procurement/vendors` now returns a stable 50-row page (100 maximum), selects only fields used by the directory and evaluation workspace, and returns an exact filtered total. The directory and evaluation screens can load further pages, append rows without duplicate IDs, and ignore stale responses when a filter request is superseded.
- The old full vendor scan for tab counts is now a grouped D1 query. Approved rating totals and averages are grouped in D1 for only the vendor IDs on the current page and scoped to the current tenant; rating history is no longer expanded into every directory response.
- Migration 0016 adds tenant/status/vendor and vendor/status indexes for the rating queries. It was applied only to local D1 after read-only inspection found zero rating rows. The post-migration integrity check remained at 44 tables and 493 application rows, with zero foreign-key or cross-tenant violations.
- Directory read and onboarding failures now emit `vendor.directory_read_failed` and `vendor.onboarding_failed` structured events with request/tenant/user/role context and sanitized errors. API clients receive generic failure messages instead of raw database errors.

### Vendor profile and rating history fan-out

- The vendor profile API no longer embeds PPOs, all vendor ratings, or full audit history in one response. It selects the profile fields needed by the screen, one tenant-scoped evaluation, and the latest 20 tenant-scoped audit events.
- Rating history is served in stable 50-row pages (100 maximum), with approved rating and PPO counts/averages calculated in D1 `groupBy` queries. User names are fetched only for the current page. Eligible PPOs use a separate tenant/vendor/project-scoped page and exclude locked or approved ratings.
- Both profile lists append with duplicate-ID protection and sequence guards, and log failures through the shared structured logger. Rating submission failures also return stable generic errors and include a searchable event with vendor/PPO context.
- Vendor profile edits now use a tenant-scoped `updatedAt` compare-and-set plus an audit insert in one native D1 batch. The update timestamp advances monotonically to prevent same-millisecond lost updates; a stale write rolls the entire batch back and returns a refresh conflict. String-backed category/certification fields serialize structured JSON values before binding. Update failures return a generic client message and emit `vendor.profile_update_failed` with request, tenant, user, role, vendor, duration, and sanitized error details.
- Migration 0017 adds the tenant/vendor/created-at PPO lookup index used by eligible-order pages. It was applied only to local D1 after capturing all four existing PPO IDs. The post-migration integrity check remains at 44 tables and 493 records, with 25 logical duplicate checks passing and no foreign-key or cross-tenant violations. All four PPO IDs and references are unchanged.

### Cost-centre register and audit consistency

- The main cost-centre register now requests stable pages of 50 (100 maximum), pushes project/search filters to D1, and keeps exact area/budget summary totals through aggregates. The page appends records and ignores stale search responses.
- Page rows aggregate budget values by cost-centre ID rather than expanding each `Budget` history relation. Project-scoped PR/BOQ pickers now use 100-row pages, a server-side search, Load More, and an exact-ID lookup to restore a BOQ's selected cost centre. The legacy array response is capped at 100, signals truncation in headers, and logs `cost_centre.lookup_truncated`; budget aggregates are limited to returned IDs.
- Cost-centre creation now inserts the record and audit event in one native D1 batch. Duplicate-code races are mapped to conflict responses; failures log `cost_centre.creation_failed` with tenant/project/request context and clients receive a generic error.
- No cost-centre schema or row migration was needed. The change was verified against the PR and BOQ forms so their existing project-scoped selectors still work.

### PR approval queue read fan-out

- The PR approval queue previously fetched every PR line and the full approval history for every row on a page, even though the table only needs counts, summary fields, categories, and the latest approval state. It now uses the stored line/RFQ counts, aggregates categories for the current page's PR IDs, and fetches only the latest approval event.
- The full PR lines are fetched through the tenant-scoped `/api/pr/[id]` detail endpoint only when an approver opens Review. The page shows a loading state, reports a safe failure message, and ignores stale detail responses when another PR is opened or the modal is closed.
- Regression tests verify the queue query no longer includes the `lines` relation, limits approval history to one event, preserves summary counts/categories, and loads the detail modal on demand. No schema migration or D1 row change was needed.

### PR detail line pagination

- Opening a PR detail now reads at most 25 line rows plus one sentinel. Additional rows use a tenant-scoped keyset cursor over `(lineNumber, id)` so equal line numbers remain stable and the client does not load an unbounded line relation.
- The modal retains the stored total-line count, appends pages without duplicate replacement, and discards stale detail or line-page responses when the selected PR changes. Error responses preserve the initial PR summary and expose a safe retry message.
- Regression coverage exercises cursor validation, malformed legacy display fields, page failures, and stale responses. This change added no schema migration and did not modify D1 records. Linked RFQ summaries in the PR detail projection are still unbounded and remain in the query-bound review.

### Budget approval queue read fan-out

- Project and finance budget approval queues previously expanded every contribution's BOQ lines, all budget transactions, and full approval history in each paginated list response. They now select the latest required approval only, aggregate category names for the current contribution page, and keep BOQ lines/transaction detail out of the queue payload.
- New tenant-scoped `GET /api/budgets/[id]` loads a contribution's BOQ lines and transactions only when a reviewer opens Inspect/Review. The modal blocks approval while detail is loading or failed, and stale responses are ignored when the modal closes. D1 errors log safe identifiers and return a generic response.
- Regression tests cover bounded queue projections, page-scoped category groups, tenant-scoped detail access, safe failures, and both review screens. No schema migration or D1 row change was needed.

### Stored negotiation line diagnostics

- Buyer/vendor offer submission and RFQ quote comparison previously swallowed malformed persisted negotiation line JSON while continuing with rate-level fallback data. They now emit `procurement.negotiation_line_items_invalid` with request, tenant, RFQ, vendor/round IDs and continue only through the existing safe rate-level fallback. The stored payload is never logged.
- Regression coverage verifies the warning and the existing fallback response/write behavior.

### Buyer negotiation dispatch read fan-out

- `POST /api/procurement/negotiations` previously materialized every RFQ line, invited-vendor record, quote version, and negotiation round. The dispatch logic only needs invited vendor IDs, the latest quote per vendor, the latest round number, an active-offer count, the latest pending offer, and a recent duplicate candidate. The route now queries only those inputs and keeps the existing four-offer cap, superseding behavior, sequential round numbers, and four-second retry handling.
- Local `EXPLAIN QUERY PLAN` uses the existing quote-version index for latest-quote aggregation and per-vendor retrieval. It uses the negotiation-round unique index for one tenant/negotiation history scan and two keyed row lookups, with no temporary sort. The grouped count still reads round history to enforce the offer cap, so D1 rows read can grow as that history grows. A denormalized counter or per-vendor summary would need atomic write maintenance and a safe data backfill; it should be driven by production measurements.
- Focused route tests cover latest quote projection, no nested round history, pending/superseding offers, retry duplicates, offer caps, and read failures. No schema migration or D1 row change was made. Local integrity remains 44 tables and 493 records, with no duplicate, foreign-key, or cross-tenant findings.

### Rate-card workflow metadata integrity

- Rate-card `notes` and line `comparisonRef` values store structured negotiation and agreement data. Several buyer and vendor write paths previously caught JSON parse errors, replaced the data with `{}`, and continued. This could erase prior negotiation context; malformed agreement notes could also make the finance signature check skip its required-signature condition.
- Shared `parseStoredJsonObject` now distinguishes absent values, valid objects, and malformed/non-object JSON. Read paths retain their safe legacy-field fallback and emit one structured warning with bounded record IDs/field names. Workflow write paths and finance activation log `rate_card.workflow_metadata_invalid` and stop before the D1 batch when persisted JSON cannot be parsed. Error responses no longer expose raw database exception text.
- Regression tests cover preserved metadata, read fallback diagnostics, failed-closed vendor/buyer updates, and blocked finance activation. No schema migration or D1 row changes were made for this repair.

### Rate-card register item fan-out

- The paginated rate-card register and approval queue previously loaded every child item for every card, up to 200 items per card, even though list rows need counts and buyer/vendor amount summaries. The list API now reads only the current card page plus a tenant-scoped D1 aggregate for item count and offer totals; the register consumes those totals, and full item details remain on the detail endpoint.
- Migration 0026 adds `(tenantId, rateCardId)` to support page-card item aggregation. The index is additive. Before the local migration, `vendor_rate_cards` and `vendor_rate_card_items` each had zero rows and no IDs to preserve. Post-change local integrity remains 44 tables and 493 records with no duplicate, foreign-key, or cross-tenant violations. Local `EXPLAIN QUERY PLAN` confirms the aggregate's item lookup uses `vendor_rate_card_items_tenant_card_idx`. No remote migration ran.
- Regression coverage verifies the tenant-bound aggregate, summary totals, invalid comparison metadata diagnostics, and that list responses omit child item payloads. Approval detail still loads its line items on demand.

### RFQ register reference integrity and stable vendor preview

- The RFQ register used fabricated BOQ, cost-centre, and location values when persisted relations were absent, and attempted to read a benchmark field that does not exist on the BOQ model. It now uses the actual BOQ/PR/revision cost-centre relations and the persisted RFQ estimate; absent values display the localized “Not Available” label. Missing required project/revision/BOQ and PR cost-centre relations produce a bounded structured warning with RFQ IDs and missing relation names.
- The five-vendor register preview now sorts by `(invitedAt, id)`. Migration 0027 adds `(tenantId, rfqId, invitedAt, id)` for that lookup and ordering. Local `EXPLAIN QUERY PLAN` uses the covering index and no longer reports a temporary sort.
- Regression tests cover stable preview order, revision cost-centre fallback, missing-relation logging, and the removal of fabricated register values. Local D1 remains at 44 tables and 493 records; all 21 captured RFQ-vendor IDs and relationships are unchanged. Migration 0027 was local only; no RFQ/vendor data was modified.

### PPO register projection

- The buyer PPO register previously selected RFQ lines, full cost centres, award recommendation details, and rating data that the list screen did not display. Those expansions were removed or narrowed to the fields actually used for the register, reducing D1 row transfer and Worker object allocation on each page.
- The PPO list regression verifies required rating fields remain available while unused nested expansions are absent. No schema migration or D1 row change was made.

### Audit timeline payload

- The audit register previously included complete old/new JSON snapshots in every paginated list response. The list now selects only event identity/summary fields, a `hasDiff` flag, and tenant-matched user identity; it uses stable `(createdAt, id)` ordering with the existing page limit.
- New `GET /api/audit/[id]` returns snapshots only when an authorized user opens Inspect Diff, and scopes lookup by both audit ID and tenant. The page ignores stale detail responses after close/reopen, shows loading/failure states, and writes a structured server event on detail-read failure.
- Regression tests cover parameterized filters, stable paging, snapshot omission from the list projection, tenant-scoped detail access, safe missing/failure responses, and stale UI response suppression. The list SQL executed read-only against local D1. No audit rows changed.
- Migration 0025 adds `(tenantId, createdAt, id)` to support tenant timeline ordering. Before/after integrity checks remained at 44 tables and 493 rows; captured audit IDs and their tenant/project/timestamp fields were unchanged. The migration was local only.

### Bounded negotiation history and comparison summaries

- RFQ detail and vendor RFQ detail now include at most the newest 25 negotiation rounds, with deterministic `(createdAt, id)` ordering and `hasMore`/cursor metadata. The buyer history modal fetches its vendor's older rounds on demand from `GET /api/procurement/rfqs/[id]/negotiation-history`; the endpoint validates tenant, RFQ, permission, invitation, and vendor scope, then returns a 25-row keyset page. The endpoint selects the same most recently updated negotiation as RFQ detail. Buyer comparison responses use compact per-vendor counts plus latest submitted/pending offer summaries instead of loading every round into Worker memory.
- Migration 0029 adds `(tenantId, negotiationId, createdAt, id)` and `(tenantId, negotiationId, vendorId, createdAt, id)` indexes. Local `EXPLAIN QUERY PLAN` used the corresponding index for buyer-wide and vendor-scoped history cursors. Before/after local integrity remained 44 tables and 493 rows; all seven negotiation IDs, seven round IDs, tenant/RFQ/vendor references, round numbers, statuses, and timestamps were unchanged. No D1 rows were added, modified, or deleted. Migration 0029 was applied locally; no remote migration ran.
- The history helper and route pass per-file coverage. The commercial workspace now passes at 90.46% branches after covering first-page and older-page success, malformed responses, missing cursors, and both failure paths.

### Rate-card comparison tenant isolation and failure handling

- The rate-card comparison workspace looked up its initial vendor by globally unique ID without also requiring the request tenant. The selected vendor projection could therefore expose another tenant's vendor profile even though the comparison histories were tenant-filtered. The vendor lookup now includes both ID and authenticated tenant ID; a missing or cross-tenant vendor returns the same not-found response before any comparison-history reads.
- Comparison read failures now emit a structured event with request, tenant, user, vendor, route, operation, duration, and bounded error context. The API returns the localized generic failure instead of forwarding database exception text. Regression tests cover tenant-scoped lookup, no downstream reads on a miss, and logged/generic failure behavior. No schema or D1 row changes were required.

### Rate-card clarification message tenant isolation

- The clarification-message POST and GET handlers now include the authenticated tenant in the rate-card lookup itself, before any approval history is read or written. Their handled failures log route, operation, request, tenant, user, rate-card ID, duration, and error class without exception messages; clients receive the existing generic localized error.
- Regression tests verify the tenant-scoped queries and safe failure responses/logging. No schema or D1 row changes were required.

### Bounded rate-card approval history

- Rate-card detail and transition handlers previously loaded the full approval ledger, and the clarification-message GET returned the entire history. Detail reads and action responses now carry only the newest 25 events with stable `(timestamp, id)` ordering and a next-page cursor. The message GET uses a tenant- and card-scoped keyset query; the review modal can load older events without duplicates. Transition-route tests verify the bounded projections.
- Migration 0030 adds `(tenantId, rateCardId, timestamp, id)` for those pages. Local `EXPLAIN QUERY PLAN` uses the covering index for the tenant/card cursor lookup. Before and after integrity checks remained at 44 tables and 493 records; `rate_card_approvals` had zero rows, so no approval IDs or relationships were affected. Migration 0030 was applied locally only; no remote migration ran.

## Remaining architectural work

These are real unresolved findings; this audit does not claim the architecture is fully repaired.

### P1: remaining high-fanout reads outside the dashboard and vendor profile

- The BOQ detail endpoint's BOQ-ID fallback previously expanded every historical revision and all of their lines even though the studio selects only the latest revision. The nested relation is now limited to one latest revision, preserving the response shape while avoiding historical line fan-out. The separate revision-ID lookup still returns every line for that revision and remains under query-bound review.
- Dashboard role reads now use bounded previews, exact summary counts, and compact/grouped child data. This does not complete the repository-wide query budget review.
- The RFQ register and its five-vendor preview are bounded and stably ordered. `GET /api/procurement/rfqs/[id]` loads the latest quote and its lines per vendor with a version count; the default detail response returns negotiation metadata, while `includeNegotiationHistory=true` returns only the newest history page. The buyer history modal loads older rounds through a tenant-, RFQ-, permission-, and invitation-scoped keyset endpoint. `GET /api/procurement/rfqs/[id]/compare` loads only the latest quote and its line rows per vendor, returns a compact version count, and returns latest negotiation and offer summaries rather than full round history. Local `EXPLAIN QUERY PLAN` confirms that comparison uses the quote-version index for aggregation and latest-row retrieval and the quote-line index for line lookup, without a temporary sort. The quotes ledger already lists all version summaries, and its RFQ-filtered API can return lines for a paged set of historical quotes. That ledger uses tenant-validated cursor pagination ordered by `(createdAt, id)`; migration 0028 adds the matching index, removing the prior temporary sort on the tenant-wide ledger query. Buyer negotiation creation selects only invited vendor IDs, latest quote state per vendor, and one grouped round summary instead of materializing every quote version and round in Worker memory. Its summary still scans the RFQ's round history to enforce the active-offer cap and compute latest/pending/retry state; local `EXPLAIN QUERY PLAN` shows one indexed history scan plus two indexed row lookups, but D1 rows read can still grow with round history.
- `/api/budgets` rejects tenant-wide summaries without a project filter, pages project cost centres, computes project KPIs with scalar SQL, and limits detailed aggregation to the current cost-centre page. Budget categories are loaded only for a selected cost centre through a separate stable, paged endpoint. Budget and PR approval queue rows now return at most eight distinct category names each, with exact omitted-category counts for the summary UI; the main PR register uses the same tenant-scoped window query and eight-category preview. The budget transaction ledger now pages its cost-centre filter options at 100 per query and loads later option pages without re-reading transaction rows. The approved BOQ register now aggregates line counts, quantities, and benchmark values in D1 by revision/category instead of by every distinct unit rate; category names are joined in tenant scope and 98 revision IDs per query keep the two tenant bindings within D1's 100-binding limit. Local `EXPLAIN QUERY PLAN` uses the existing tenant/revision/deleted/category index. The rate-card list now aggregates item counts and totals for only the current card page and avoids transferring nested item payloads; local query planning confirms the tenant/card index. The latest direct-property TypeScript AST scan finds 35 API and one shared-library `findMany` expression without a literal `take` property; this is a query-shape inventory, not a count of proven unbounded reads. Manual review identifies page/input-ID-bounded lookups, import chunks, project-scoped reads, catalog reads, and dynamically assembled pagination objects. Active category/UOM catalogs and category-code prefix lookup are explicitly capped. Project authorization no longer materializes assignment/owner IDs. Its scoped list queries now use project relation filters, fixing the prior explicit-`projectId` path that bypassed the allowed-project filter on PR and actual-cost lists. Single-project writes use bounded existence queries. Remaining cardinality questions include nested relation expansion. The scan cannot prove bounds hidden in helper arguments or dynamic objects. RFQ, PR, and BOQ paths still need complete stable-order, exact-total, and navigation review. Production D1 Insights are unavailable, so query budgets remain unmeasured.

### P1: durable post-commit side effects

- Migration 0018, an idempotent outbox dispatcher, and a scheduled retry worker exist. The notification call sites audited in this repair use prepare-only payloads so their outbox insert can be included in the business write batch. Auction invitations now use the same pattern. A nullable `notifications.vendorId` column (migration 0022) lets an invitation persist once per vendor organization and remain visible after portal-account activation; the API filters it by the authenticated vendor ID. Focused unit tests, a read-only local D1 `EXPLAIN`, and a Node SQLite integration harness that executes production outbox SQL cover retry, lease expiry, rollback, and duplicate delivery behavior. Cloudflare D1 runtime behavior and production queue delivery remain unverified.

### P1: production D1 observability

- Local integrity and workflow checks pass, but production query frequency, slow-query distribution, invocation-level query counts, D1 read/write usage, and production log retention were not inspectable without Cloudflare access. Cloudflare's [expensive query guidance](https://developers.cloudflare.com/d1/observability/find-expensive-queries/) and [pricing/usage model](https://developers.cloudflare.com/d1/platform/pricing/) should be used with production Insights before setting production query budgets.
- Remote D1 row counts and stable IDs were not captured because credentials/database ID were not configured in this environment. No remote read, write, or migration was attempted.

### P2: transaction semantics across the whole app

- No application `$transaction` calls remain in `src/`; the Prisma proxy test and `npm run check:architecture` guard against reintroducing direct transactions, multiple direct handler mutations, and nested Prisma writes. BOQ estimate/refine/generation paths already use bounded D1 batches; the earlier finding that they remained separate writes was stale and is withdrawn.
- The guard covers 155 exported handlers but does not follow calls into helper functions or prove atomicity of multiple writes performed across helpers. Auction creation, auction state/delete transitions, vendor creation and profile update, cost-centre creation, and several BOQ/RFQ/rate-card/PPO workflows use D1 batches. A full call-graph mutation audit and explicit classification of indirect multi-write paths remain necessary before claiming every workflow is atomic.

### P2: regression coverage and feature verification

- The D1 E2E scenario now covers the central sourcing lifecycle through PPO issuance. It does not yet prove auctions, rate-card matching/direct PPO, vendor qualification/rating, actual-cost reconciliation, PPO completion, cancellation/reversal, and all return/reject branches end to end. Some have unit coverage, but production-like D1 workflows remain unverified.
- The product has implemented modules for masters, projects/cost centres, BOQ authoring/import, approvals, budget allocation, PR, procurement sourcing, vendor portal, quote comparison/negotiation, awards/PPOs, rate cards, auctions, actual costs, and budget-vs-actual reporting. The repository scan did not identify an explicit product requirements backlog that can distinguish intentionally deferred features from missing requirements. These workflows should be checked against an approved acceptance checklist before claiming feature completeness.
- The latest full quality run on 2026-11-06, after resolving PR #9 against the updated `main`, passed the production build, performance budgets, i18n, typecheck, the checked-in per-file lint baseline, D1 mutation boundaries (156 handlers), safe local migration check, and local D1 integrity. The full command remains red only on repository-wide per-file coverage: 279 of 327 source files meet all four 90% thresholds; 48 remain below at least one metric. Aggregate statements/lines are 98.75%, branches are 91.06%, and functions are 97.88%. The PR detail modal passes at 99.77% statements, 94.90% branches, 100% functions, and 99.77% lines. Lint observed 1,252 existing errors and 446 warnings across 697 files, with no per-file rule count increase. No migration was pending, and integrity remained at 44 tables/493 records, 25 logical duplicate checks, zero foreign-key violations, and zero cross-tenant references. See `unit-test-coverage-report.md` for the complete file-level report.

## Data safety and test records

- Resolving PR #9 against `main` kept the configured Wrangler D1 target used by the 493-row local dataset. The base branch had a different D1 ID, so the merge did not redirect local checks or attempt a remote migration. The post-merge check remains 44 tables/493 records with no relationship or duplicate violations.
- Removed the hard-coded Gemini provider key from the current Wrangler variables and documented the Worker secret setup. Its earlier value remains in `main` history, so rotate the provider credential.
- Migrations 0015 through 0030 are present in the local D1 state. Migration 0020 adds auction bid-history indexes, 0021 adds the tenant/vendor user lookup index, 0022 adds nullable vendor scope plus a read index to notifications, 0023 adds the PPO project/status/BOQ-line aggregate index, 0024 indexes active project assignments by user, 0025 indexes tenant audit timeline ordering, 0026 indexes rate-card items by tenant/card, 0027 indexes RFQ vendor preview ordering, 0028 indexes tenant quote-ledger ordering by creation time and ID, 0029 indexes tenant/negotiation cursor ordering with and without vendor scope, and 0030 indexes tenant/rate-card approval cursor ordering. Read-only `EXPLAIN QUERY PLAN` changed the PPO aggregate from a full table scan to a covering-index search, confirms rate-card aggregation uses its tenant/card index, RFQ vendor preview uses its covering index without a temporary sort, quote-ledger cursor reads use the new covering index without a temporary sort, buyer/vendor negotiation-history cursors use their respective 0029 indexes, and rate-card approval cursor reads use the 0030 index. Post-migration integrity reports 44 tables and 493 records, 25 duplicate checks passing, and no foreign-key or cross-tenant violations; pre/post counts and captured IDs remain unchanged. Rate-card, item, and approval-history tables had zero rows before their indexes were added. The 21 RFQ-vendor IDs and relationships were unchanged across migration 0027; all 25 quote IDs, tenant/RFQ/vendor links, versions, and creation timestamps were unchanged across migration 0028; all seven negotiation and seven round IDs and their workflow fields remained unchanged across migration 0029. Migrations were applied only to local D1; no remote migration ran. No table was truncated, reset, or reseeded.
- Earlier local E2E attempts added identifiable `E2E-D1` records. Partial records from failed attempts were preserved; the latest completed run passed all 70 checks through PPO issuance. The regression scenario was not rerun during the latest changes, avoiding additional persistent records.
- The current local integrity result verifies that existing and newly added records have valid references. Remote production records remain unverified because no remote credentials were configured.

## Next repair sequence

1. Complete semantic query-bound review of the current 35 API and one shared-library `findMany` expressions without a direct `take` property. The approved BOQ line summary no longer groups by unit rate, the rate-card list aggregates only the current page, RFQ vendor preview has stable indexed ordering, and requested negotiation history now uses 25-row cursor pages with indexed lookups; the BOQ-ID detail fallback now loads only the latest revision. Continue with direct PR/BOQ detail relations and verify exact totals and navigation before measuring them in D1 Insights. Measure whether the buyer negotiation summary scan remains costly at production history sizes before introducing denormalized state; that state would need migration/backfill and atomic maintenance. PPO completion replay already caps actual-cost rows at the configured PPO line limit plus one overflow row.
2. Complete isolated D1 delivery, retry, and crash-recovery coverage for the outbox, including post-commit failure scenarios.
3. Complete the indirect multi-write call-graph audit and strengthen the static guard to cover helper-dispatched Prisma writes and explicit consistency boundaries.
4. Extend isolated D1 workflow coverage to actual-cost reconciliation, PPO completion, auctions, rate cards, and rejection/reversal paths.
5. Bring all 48 source files below the enforced 90% statements, branches, functions, and lines floor up to threshold without exclusions; continue with the nearest remaining files listed in `unit-test-coverage-report.md`.
6. Reconcile `PRODUCT_ACCEPTANCE_CHECKLIST.md` against an approved product requirements backlog; the repository does not currently contain that source of truth.
7. Obtain authorized Cloudflare production Insights/log access, capture read-only remote D1 integrity evidence, then set measured query/latency budgets.
