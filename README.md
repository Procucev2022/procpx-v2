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

`npm run dev` uses the ordinary local Wrangler D1 state under ignored `.wrangler/`. Regression fixtures use a separate persistent local D1 at `.wrangler/e2e-d1`, so seeding or running the regression workflow cannot alter the ordinary development database. Cloudflare remote D1 is accessed only with explicit `:remote` commands.

### 3. Initialize Database Schema
```bash
npm run db:migrate:safe
npm run db:integrity
```

To apply the schema to your configured Cloudflare D1 database:
```bash
npm run db:d1:migrate:remote
npm run db:integrity:remote
```

The current migration starts with an empty database. It does not import the legacy mocked SQLite records or seed demo accounts.

To create the schema and add the repeatable, clearly labelled fixture to the isolated local regression D1:
```bash
npm run db:seed:test
```
The command applies ordered Wrangler migrations and uses stable `fx-` IDs with insert-if-missing statements. It always writes to `.wrangler/e2e-d1`, never to shared local or remote D1. Fixture user accounts use the password `Mock@1234`; use them only with this isolated test D1.

**D1 transaction safety:** Prisma's D1 adapter ignores Prisma transaction boundaries, including callback and array transactions. The Prisma proxy rejects explicit `$transaction` calls. RFQ invitations, vendor quote submission, negotiation round submission, and PPO creation write their related records through native D1 batches, which execute sequentially and roll back together on failure. Additions that require atomic multi-write behavior must use the shared D1 batch helper.

### 4. Launch Development Server
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

**Database provider:** application runtime always uses D1. `npm run dev` selects Wrangler's local D1 binding; `npm start` runs the Cloudflare Worker preview. Do not configure `DATABASE_URL` or Prisma SQLite for application runtime. Remote D1 migrations and integrity checks require the explicit `npm run db:d1:migrate:remote` and `npm run db:integrity:remote` commands.

**Schema changes:** add a numbered SQL file to `migrations/` (generate it with `npx prisma migrate diff`), then run `npm run cf:migrate`.

**Secrets** (once per environment):
```bash
npx wrangler secret put NEXTAUTH_SECRET   # a long random value
npx wrangler secret put NEXTAUTH_URL      # e.g. https://procpx.<subdomain>.workers.dev
```

**Deploy:** `npm run cf:deploy`. On Windows the OpenNext build needs symlink permission, so turn on Developer Mode or build in WSL or CI.

Legacy SQLite import/export is disabled. The Prisma SQLite provider and placeholder URL exist only to generate the D1-compatible schema; application reads and writes require D1. `npm run db:seed:test` creates idempotent local fixtures in the isolated `.wrangler/e2e-d1` store.

---

## Local Regression Personas

The ordinary local D1 schema has no seeded accounts. Run `npm run db:seed:test` to create the separate regression D1 with 14 role personas across two fixture tenants. Their password is **`Mock@1234`**. The login shortcuts use these exact fixture users and are hidden from production builds. Do not run the legacy `prisma/seed.ts` dataset against D1.

---

## 📁 Project Structure

```
procpx/
├── prisma/
│   ├── schema.prisma       # Complete schema (Tenant, User, Project, BOQ, Lines, Masters, Audit)
│   └── seed.ts             # Disabled legacy mock seed; use the local D1 fixture command
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
