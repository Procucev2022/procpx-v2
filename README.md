# proCPX Enterprise Capex Procurement Platform

> **Next-Generation Capital Expenditure Procurement & BOQ Management System**  
> Designed and built for retail, hospitality, banking, and infrastructure enterprises.

---

## Quick Start Guide

### 1. Install Dependencies
```bash
npm install
cp .env.example .env
```

Cloudflare D1 is the only application database; there is no local SQLite runtime. `npm run dev` uses the ordinary local Wrangler D1 state under ignored `.wrangler/`. Regression fixtures use a separate persistent local D1 at `.wrangler/e2e-d1`, so fixture setup cannot alter the ordinary development database. Remote D1 is accessed only through explicit `:remote` commands after Wrangler credentials are configured.

### 2. Initialize Database Schema
Local D1 state (under the ignored `.wrangler/` folder, used by the quality checks):
```bash
npm run db:migrate:safe
npm run db:integrity
```

Remote Cloudflare D1 (explicit commands only; check first, then migrate):
```bash
npm run db:integrity:remote
npm run db:d1:migrate:remote
npm run db:integrity:remote
```

Migrations never seed or import data; existing D1 records are preserved.

Read-only data-quality report (duplicates, orphans, summary totals that disagree with their lines):
```bash
npm run db:quality          # local D1
npm run db:quality:remote   # remote D1
```

To create the schema and add the repeatable, clearly labelled fixture to the isolated local regression D1:
```bash
npm run db:seed:test
```
The command applies ordered Wrangler migrations and uses stable `fx-` IDs with insert-if-missing statements. It always writes to `.wrangler/e2e-d1`, never to shared local or remote D1. Fixture user accounts use the password `Mock@1234`; use them only with this isolated test D1.

**D1 transaction safety:** Prisma's D1 adapter ignores Prisma transaction boundaries, including callback and array transactions. The Prisma proxy rejects explicit `$transaction` calls. RFQ invitations, vendor quote submission, negotiation round submission, and PPO creation write their related records through native D1 batches, which execute sequentially and roll back together on failure. Additions that require atomic multi-write behavior must use the shared D1 batch helper.

### 3. Launch Development Server
```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.

For a D1-backed workflow regression, seed the isolated test D1 and start the OpenNext Worker against the same state:
```bash
npm run db:seed:test
npm run dev:e2e
npx tsx scripts/e2e-d1-regression.ts http://localhost:3001
```
The end-to-end script only accepts localhost URLs and appends clearly labelled `E2E-D1` workflow rows to `.wrangler/e2e-d1`. It does not clean up records or touch ordinary local or remote D1.

---

## ☁️ Deploying to Cloudflare Workers

The app runs on Cloudflare Workers through [OpenNext](https://opennext.js.org/cloudflare). Configuration lives in `wrangler.jsonc`.

| Concern | Local dev | Cloudflare |
|---|---|---|
| Database | Local Wrangler D1 state | D1 database bound as `DB` (via `@prisma/adapter-d1`) |
| Uploads | `uploads/` folder | R2 bucket bound as `UPLOADS` |
| Logs | `logs/` JSONL files | Workers Logs (console) |

**Logs and errors:** every `apiError` response is logged (`http.api_error_response` for 5xx with the caught error, `api.request_rejected` for 4xx), Prisma failures and slow queries are logged as `db.query_failed` / `db.query_slow`, and browser crashes and failed API calls are posted to `/api/observability/client` (`browser.*` events). In Cloudflare, open Workers Logs for the `procpx` worker and filter on these event names; locally use `npm run logs:search -- --level error --since 24h`.

**Database provider:** application runtime always uses D1. `npm run dev` selects Wrangler's local D1 binding; `npm start` runs the Cloudflare Worker preview. Do not configure `DATABASE_URL` or Prisma SQLite for application runtime. Remote D1 migrations and integrity checks require the explicit `npm run db:d1:migrate:remote` and `npm run db:integrity:remote` commands.

**Schema changes:** add a numbered SQL file to `migrations/` (generate it with `npx prisma migrate diff`), apply it locally with `npm run db:migrate:safe`, then remotely with `npm run db:d1:migrate:remote` (alias: `npm run cf:migrate`). Never use `prisma db push`.

**Secrets** (once per environment):
```bash
npx wrangler secret put NEXTAUTH_SECRET   # a long random value
npx wrangler secret put NEXTAUTH_URL      # e.g. https://procpx.<subdomain>.workers.dev
npx wrangler secret put GEMINI_API_KEY    # optional; enables AI vision for scanned drawings
```

**Deploy:** `npm run cf:deploy`. On Windows the OpenNext build needs symlink permission, so turn on Developer Mode or build in WSL or CI.

Legacy SQLite import/export tooling has been removed. The Prisma SQLite provider and placeholder URL exist only to generate the D1-compatible schema; application reads and writes require D1. `npm run db:seed:test` creates idempotent local fixtures in the isolated `.wrangler/e2e-d1` store.

### GitHub Actions dev deployment

The `Deploy dev to Cloudflare` workflow deploys automatically when changes reach `main`, or can be started with **Run workflow**. Configure these GitHub Actions secrets in the `dev` environment:

- `CLOUDFLARE_API_TOKEN` — a token with Workers Scripts and D1 edit permissions.
- `CLOUDFLARE_ACCOUNT_ID` — the Cloudflare account ID that owns the Worker and D1 database.

The workflow runs the full quality gate, verifies remote D1 integrity before and after reviewed migrations, and deploys with OpenNext. It does not seed or reset D1 data. Remote migrations must remain limited to reviewed, data-preserving SQL and use the explicit remote migration command. The pre-migration step runs `npm run db:integrity:remote -- --allow-pending-migrations`, which records a row-count baseline and lists pending migrations; the post-migration step is strict and fails if any tracked migration is unapplied or any migration-defined index or table is missing. Wrangler resolves the target from `account_id` and `database_id` in `wrangler.jsonc` (these take precedence over `CLOUDFLARE_ACCOUNT_ID`), so the CI API token must belong to that account. To rehearse the sequence on a copy, both D1 scripts accept `--persist-to <dir>` in local mode.

---

## Local Regression Personas

The ordinary local D1 schema has no seeded accounts. Run `npm run db:seed:test` to create the separate regression D1 with 14 role personas across two fixture tenants. Their password is **`Mock@1234`**. The login shortcuts use these exact fixture users and are hidden from production builds.

---

## 📁 Project Structure

```
procpx/
├── prisma/
│   └── schema.prisma       # Complete schema (Tenant, User, Project, BOQ, Lines, Masters, Audit)
├── src/
│   ├── app/
│   │   ├── (app)/          # Authenticated application shell
│   │   │   ├── dashboard/  # Role-specific KPI dashboards
│   │   │   ├── projects/   # Project list, detail view, and creation wizard
│   │   │   ├── boq/        # BOQ listing hub, upload wizard, and revision workspace
│   │   │   ├── admin/      # User management & master data (UOM + Categories)
│   │   │   ├── audit/      # System audit trail viewer with JSON state diffs
│   │   │   └── layout.tsx  # Persistent navigation sidebar and auth protection
│   │   ├── api/            # REST API endpoints (Auth, Projects, BOQ, Masters, Audit)
│   │   ├── login/          # Login page with demo one-click credentials
│   │   └── globals.css     # Enterprise dark theme design system
│   ├── components/
│   │   └── Sidebar.tsx     # Role-aware sidebar navigation
│   └── lib/
│       ├── api-utils.ts    # API auth guard and response envelope helpers
│       ├── audit.ts        # Audit logging service
│       ├── auth.ts         # NextAuth configuration
│       ├── boq-validate.ts # Quality scoring and field validation rules
│       ├── permissions.ts  # Role-based permission matrix
│       ├── prisma.ts       # Singleton Prisma client
│       └── uom-standardise.ts # Canonical UOM resolution engine
└── uploads/                # Local storage directory for uploaded spreadsheets
```
