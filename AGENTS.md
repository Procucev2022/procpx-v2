<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# proCPX D1 Persistence and Regression Testing Policy

## Objective
Prevent real D1 test data from being lost whenever an agent modifies code, updates the database schema, or implements new features.

Category Creation, Project Creation, Cost Centre Creation, BOQ Creation, PR Creation, RFQ, Vendor, Quotation, Negotiation, Award and PPO test records must remain available for continued testing unless explicitly reset by an authorised user.

**This is a permanent development rule for all future proCPX modules and changes.**

One-time migration authorization: the user confirmed the existing SQLite records are mocked and authorized removing them and starting with an empty D1 schema. Do not import those records or recreate them during this migration. This authorization applies only to the legacy mock database; preserve future D1 records under the rules below.

### 1. Preserve Existing Test Data
Before every code change or D1 schema migration:
- Inspect the configured D1 database and identify existing development/test records where credentials are available.
- Identify the records and relationships required for ongoing testing.
- Preserve existing test categories, projects, Cost Centres, BOQs, PRs, vendors, RFQs, quotations, negotiations, awards and PPOs.
- Preserve relationships between records, including IDs, foreign keys, statuses and audit history.
- Never automatically delete, recreate, truncate or overwrite D1 records as part of routine development.
- Do not reset the database or run destructive seed scripts merely to make a test pass.
- Do not change existing record IDs or recreate records with different IDs when dependent workflows refer to them.

### 2. Separate Test Data from Application Code
Use Cloudflare D1 as the only application database. The Prisma `sqlite` provider is retained only because D1 uses SQLite's schema dialect; the app connects through `@prisma/adapter-d1` and must not use a local Prisma SQLite database.
- Code deployments and application restarts must not erase test data.
- Schema changes must use ordered Wrangler SQL migrations in the root `migrations/` directory.
- Preserve existing records when adding optional fields, new tables, relationships or status values.
- Review the impact of every migration before execution.
- Use Cloudflare D1 Time Travel or Wrangler's D1 backup behavior before any approved remote schema operation that can change data.
- If a migration could cause data loss, stop and report the risk before proceeding.
- Never use `prisma db push` or Prisma Migrate deploy against D1. Do not assume Wrangler migrations, application restarts or seed scripts are automatically safe for existing data.

### 3. Keep Test Data Isolated
Do not populate the fresh D1 database with the legacy mock dataset. Use isolated fixtures or a separate development/test D1 database for regression workflows. If an explicit baseline dataset is requested later, create it once with stable IDs and idempotent fixtures:
- At least 2 categories.
- At least 1 project and 2 Cost Centres, where supported by the existing architecture.
- At least 1 BOQ with multiple line items.
- At least 1 PR linked to its BOQ and Cost Centre.
- At least 1 approved PR available for RFQ creation.
- At least 3 test vendors for quotation comparison.
- At least 1 RFQ with quotation and negotiation history.
- At least 1 award/PPO workflow record where the existing lifecycle permits it.

Never seed a shared or production-facing D1 database as part of build, migration, or test setup. Preserve any future records created by an authorized user.

### 4. Separate Test Data Creation from Regression Tests
- Use isolated test fixtures or controlled seed scripts that are safe to run repeatedly.
- Use upsert or equivalent idempotent logic for master test data where appropriate.
- Do not make regression tests dependent on deleting and rebuilding all records.
- Use isolated temporary records for tests that specifically require fresh creation.
- Clean up only records created by that test, and only when cleanup is safe.
- Never delete shared test data or records used by other tests.
- Keep automated test data clearly identifiable as test data.

### 5. Mandatory Regression Tests After Every Change
After changes to any module, run the relevant existing tests and confirm that previous functionality still works.
At a minimum, verify when a configured test D1 database is available:
1. Category creation and persistence after refresh/restart.
2. Project and Cost Centre creation and persistence.
3. BOQ creation and persistence.
4. PR creation and persistence.
5. Approved PR availability for RFQ creation.
6. Existing vendor, quotation, negotiation, award and PPO references remain intact.
7. Tenant isolation and role-based permissions remain enforced.
8. Existing test records remain available after schema and application changes.

For unrelated UI changes, verify that existing records are still visible and functional without unnecessarily recreating them.

### 6. Pre-Change and Post-Change Data Integrity Check
Before changes, record per-table counts with `npm run db:integrity:remote` when Cloudflare credentials are configured. If a table has records, capture stable identifiers for the relevant workflow entities with read-only Wrangler D1 queries before changing schema or data. The local D1 schema check is `npm run db:integrity`.
After changes, compare them and verify:
- No D1 records were unintentionally deleted.
- No IDs or relationships changed unexpectedly.
- Existing statuses and audit history remain intact.
- No duplicate categories, BOQs, PRs, RFQs, vendors or PPOs were created.
- New schema fields and workflows operate correctly with older records.

If any data is missing, stop further feature development and investigate the cause. Restore from D1 recovery options or recover the affected records safely where possible.

### 7. Completion Report Required Every Time
After every feature implementation, report:
- Database/schema changes made.
- Whether a Wrangler D1 migration was executed locally or remotely. Never use `db push`.
- Test records preserved.
- Records added, modified or deleted.
- Regression tests executed and results.
- Any migration risk or unresolved data-integrity issue.

Do not claim data persistence merely because TypeScript or the production build passes.

### 8. Strict Prohibition
Never reset, wipe, truncate, reseed or recreate a D1 database as a routine response to code changes or test failures. The user's one-time authorization covers removal of the legacy mocked SQLite database only. Any later destructive D1 operation requires explicit authorization after its consequences have been explained.

### 9. Dashboard and Register Summary vs. Details UI Standard
"Dashboard and register rows are concise summaries, not full-detail screens. Show only the fields needed to identify a record, understand its amount/status/stage, and take the next action. Put secondary descriptions, references, line items, and audit information in the existing View Details experience. Avoid cramped columns, repeated metadata, and duplicate actions."

Summary rows must maintain clean spacing without wrapping or crowding:
1. Show only: PR Number, Short Package/PR Description, Item Count, Cost Centre code, PR Amount, PR Approval Status, Current Procurement Stage, RFQ Count, and One View Details action.
2. Put secondary descriptions, project/BOQ references, line-item specifications, approvals, and audit information in View Details.
3. Keep the identifier prominent, maintain consistent horizontal alignment, and prevent badges from competing with descriptions.

## Unit Tests and Coverage Gate

Follow `.agents/rules/unit-test-coverage.md` for every code change. Run `npm run test:coverage`; it uses Jest's global 30-second timeout and `--detectOpenHandles`, enforces all thresholds, and prints plus writes `unit-test-coverage-report.md` with overall and per-file metrics even when the gate fails. All files under `src/` must meet 90% statements, branches, functions, and lines individually and overall; do not skip application files or lower thresholds.

## Workspace Quality Gate

- After every code change, run `npm run check:quality` from the workspace root before considering the work complete. It discovers npm projects under the workspace and runs each project's checks globally.
- The full check runs **build first, then unit-test coverage**, followed by typecheck, lint, safe pending migrations, and a final database-integrity check. Do not replace the full workspace check with a command scoped to only the active package.
- `npm run check:changed` is the fast inner-loop command. It runs lint on changed files, typechecks affected TypeScript projects, runs changed test files and tests related to changed application source, and checks tracked diffs for whitespace errors. It does not replace `npm run check:quality` before handoff.
- Run `npm run check:i18n` during the fast inner loop; the full quality runner executes it immediately after build and coverage.
- The coverage step must print and write the complete overall and per-file report, including every file under `src/`. Keep the 90% threshold for statements, branches, functions, and lines both per file and overall.
- The migration stage applies schema changes only through `npm run db:migrate:safe`, which applies reviewed Wrangler migrations to local D1 and runs D1 schema integrity checks. Remote migrations require the explicit `npm run db:d1:migrate:remote` command after credentials and the D1 ID are configured. Do not run remote migrations as part of routine quality checks; never substitute `db push`.
- If a project has its own build, coverage, typecheck, lint, migration, or integrity command, expose it as a package script so the workspace runner can include it.

## Structured Logging and Debug Evidence

- Use the shared server logger in `src/lib/observability/server-logger.ts` for new server-side events. Give events stable names such as `purchase_request.approval_failed` and include the operation, route/module, request ID when available, relevant record IDs, duration/status, and sanitized error details.
- Existing server and browser `console` calls are captured by Next.js instrumentation and normalized into structured records. Prefer the shared logger for new code so context and severity are explicit; do not add ad-hoc file writes or a second logging system.
- Logs are JSON Lines. They are always written to the process output for hosted log collectors. Local development also persists them under `logs/` by day. Search with `npm run logs:search -- --level error --since 24h` or `npm run logs:search -- --term "approval_failed"`; run `npm run logs:purge` to purge expired artifacts manually.
- Expired logs, JSON snapshots, and screenshots are removed at server startup and at least daily after 30 days. `APP_LOG_DIR` changes the local artifact directory, `APP_LOG_RETENTION_DAYS` changes retention, `APP_LOG_TO_FILE=true` enables file storage in production, and `APP_LOG_PURGE_ON_STARTUP=true` removes prior supported artifacts at the next startup. Keep the default 30-day retention unless the user requests a different compliance period.
- Error events automatically write a matching diagnostic JSON snapshot locally. For browser regression journeys, attach `attachPlaywrightDebugCapture(page, scenario)` to each Playwright/Puppeteer page and call `captureDebugCheckpoint(page, name, context)` after meaningful workflow steps. Screenshots are local development/test artifacts and are not captured from live production sessions by default.
- Never log passwords, secrets, API keys, authorization headers, cookies, session tokens, raw request/response bodies, uploaded documents, or unnecessary personal data. Include IDs and safe status/context instead of full records. Keep audit-ledger records separate from operational logs.
- Keep structured-log output useful and searchable: use one event per record, stable event names, appropriate severity, and concise context. Log handled failures where they occur and let Next.js request-error instrumentation capture uncaught server errors.

## Application Constants, Types, and Interfaces

- Keep reusable application constants in dedicated `*.constants.ts` modules beside their owning `src/` feature or library module. Move static option lists, status maps, permission tables, defaults, demo catalogs, regexes, limits, and logging settings out of pages, components, routes, and business-logic modules.
- Keep application types and interfaces in dedicated `types/**/*.types.ts` modules, organized to mirror their owning `src/` paths. Import them through `@app-types/...` with `import type`; re-export public types from the original module when needed to preserve existing import paths.
- Do not move ordinary function implementations, request/render-local computed values, mutable runtime state, or initialized runtime singletons into constants modules. Next.js route-segment configuration exports such as `runtime` must remain literal and statically analyzable in the route file. Keep other Next.js special exports at the framework-required entry point and move their values only when the installed Next.js build accepts the extraction.
- Keep constants modules under `src/` so they remain in the existing per-file coverage inventory. Add or update unit tests when a moved constant module is not exercised by its feature tests. Type-only declarations belong under root `types/` because TypeScript erases them at runtime; they must not contain application behavior.
- Before adding a new constant or type/interface declaration, check whether its owning `*.constants.ts` or `types/**/*.types.ts` module already exists and extend that module instead of defining another declaration inline.

## Internationalization and UI Copy

- Follow `.agents/rules/internationalization.md` for the complete application-wide i18n policy. `UI_STRINGS` in `src/lib/ui-strings.constants.ts` is the source of translatable UI copy; use complete catalog messages with named `{{placeholder}}` values, locale-aware `Intl` formatting, catalog-based tests, and `npm run check:i18n` enforcement.

## Repository Hygiene and Cloudflare D1

- Follow `.agents/rules/repository-hygiene.md`. Update the root `.gitignore` in the same change whenever new generated, local, sensitive, or machine-specific artifacts should stay out of version control. Verify patterns with `git check-ignore -v`; do not assume ignore rules untrack files already committed.
- Cloudflare D1 is the only application database. Keep schema changes in ordered Wrangler SQL migrations and do not add a second runtime database or `DATABASE_URL`.
- The current migration intentionally starts with an empty D1 schema because the user identified all legacy SQLite records as mock data and authorized deleting them. Do not claim that any records were imported. Local quality checks use Wrangler local D1 state under ignored `.wrangler/`; remote D1 is managed only through explicit remote commands after credentials and database ID are supplied. Prisma D1 does not provide atomic transaction semantics. The application currently has multi-write `$transaction` workflows; redesign those workflows to preserve consistency before production use. The Prisma `sqlite` datasource provider is D1 schema dialect only, not a second runtime database.
