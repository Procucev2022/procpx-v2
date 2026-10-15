<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# proCPX — Mandatory Test Data Persistence and Regression Testing Policy

## Objective
Prevent test data from being lost whenever Antigravity modifies code, updates the database schema, or implements new features.

Category Creation, Project Creation, Cost Centre Creation, BOQ Creation, PR Creation, RFQ, Vendor, Quotation, Negotiation, Award and PPO test records must remain available for continued testing unless explicitly reset by an authorised user.

**This is a permanent development rule for all future proCPX modules and changes.**

### 1. Preserve Existing Test Data
Before every code change, database migration, Prisma schema update, or `db push`:
- Inspect the current database and identify existing development/test records.
- Identify the records and relationships required for ongoing testing.
- Preserve existing test categories, projects, Cost Centres, BOQs, PRs, vendors, RFQs, quotations, negotiations, awards and PPOs.
- Preserve relationships between records, including IDs, foreign keys, statuses and audit history.
- Never automatically delete, recreate, truncate or overwrite existing test records as part of routine development.
- Do not reset the database or run destructive seed scripts merely to make a test pass.
- Do not change existing record IDs or recreate records with different IDs when dependent workflows refer to them.

### 2. Separate Test Data from Application Code
Maintain a persistent development database independent of code changes.
- Code deployments and application restarts must not erase test data.
- Schema changes must use controlled, non-destructive migrations wherever possible.
- Preserve existing records when adding optional fields, new tables, relationships or status values.
- Review the impact of every migration before execution.
- Back up the development database (`prisma/dev.db`) to `prisma/backups/` before any potentially destructive schema operation.
- If a migration could cause data loss, stop and report the risk before proceeding.
- Do not assume that `prisma db push`, migrations, application restarts or seed scripts are automatically safe for existing data.

### 3. Establish a Reusable Test Dataset
Maintain a small, stable dataset for end-to-end regression testing:
- At least 2 categories.
- At least 1 project and 2 Cost Centres, where supported by the existing architecture.
- At least 1 BOQ with multiple line items.
- At least 1 PR linked to its BOQ and Cost Centre.
- At least 1 approved PR available for RFQ creation.
- At least 3 test vendors for quotation comparison.
- At least 1 RFQ with quotation and negotiation history.
- At least 1 award/PPO workflow record where the existing lifecycle permits it.

Use stable identifiers and preserve relationships. Reuse these records in future tests instead of recreating the entire dataset every time.
Create only the missing records necessary to establish this baseline. Do not duplicate existing records.

### 4. Separate Test Data Creation from Regression Tests
- Use reusable test fixtures or controlled seed scripts that are safe to run repeatedly.
- Use upsert or equivalent idempotent logic for master test data where appropriate.
- Do not make regression tests dependent on deleting and rebuilding all records.
- Use isolated temporary records for tests that specifically require fresh creation.
- Clean up only records created by that test, and only when cleanup is safe.
- Never delete shared baseline data or records used by other tests.
- Keep automated test data clearly identifiable as test data.

### 5. Mandatory Regression Tests After Every Change
After changes to any module, run the relevant existing tests and confirm that previous functionality still works.
At a minimum, verify:
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
Before changes, record the counts and stable identifiers of the baseline test records using `npx tsx scripts/db-integrity-check.ts`.
After changes, compare them and verify:
- No baseline records were unintentionally deleted.
- No IDs or relationships changed unexpectedly.
- Existing statuses and audit history remain intact.
- No duplicate categories, BOQs, PRs, RFQs, vendors or PPOs were created.
- New schema fields and workflows operate correctly with older records.

If any data is missing, stop further feature development and investigate the cause. Restore from backup or recover the affected records safely where possible.

### 7. Completion Report Required Every Time
After every feature implementation, report:
- Database/schema changes made.
- Whether a migration or `db push` was executed.
- Test records preserved.
- Records added, modified or deleted.
- Regression tests executed and results.
- Any migration risk or unresolved data-integrity issue.

Do not claim data persistence merely because TypeScript or the production build passes.

### 8. Strict Prohibition
Never reset, wipe, truncate, reseed or recreate the development database as a routine response to code changes or test failures.
Any proposed destructive database operation requires explicit authorisation after its consequences have been explained.

