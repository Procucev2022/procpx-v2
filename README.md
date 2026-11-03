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

Cloudflare D1 is the only application database; there is no local SQLite file. Run `npx wrangler login` once so Wrangler and `npm run dev` can reach the `DB` binding in `wrangler.jsonc`.

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
```

Migrations never seed or import data; existing D1 records are preserved.

**Production readiness:** Prisma's D1 adapter currently ignores transaction boundaries. Multi-write procurement flows must be redesigned before production traffic uses D1. The current affected routes are `src/app/api/vendor-portal/rfqs/[id]/route.ts`, `src/app/api/procurement/negotiations/route.ts`, `src/app/api/procurement/ppos/route.ts`, and `src/app/api/procurement/rfqs/[id]/vendors/route.ts`.

### 3. Launch Development Server
```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.

---

## ☁️ Deploying to Cloudflare Workers

The app runs on Cloudflare Workers through [OpenNext](https://opennext.js.org/cloudflare). Configuration lives in `wrangler.jsonc`.

| Concern | Local dev | Cloudflare |
|---|---|---|
| Database | D1 `DB` binding via `wrangler login` | D1 database bound as `DB` (via `@prisma/adapter-d1`) |
| Uploads | `uploads/` folder | R2 bucket bound as `UPLOADS` |
| Logs | `logs/` JSONL files | Workers Logs (console) |

**Local dev against D1:** keep `DATABASE_PROVIDER="d1"` in `.env` and run `npm run dev`. The app uses the `DB` database from `wrangler.jsonc` through your `npx wrangler login`, and no API token is needed.

**Schema changes:** add a numbered SQL file to `migrations/` (generate it with `npx prisma migrate diff`), apply it locally with `npm run db:migrate:safe`, then remotely with `npm run db:d1:migrate:remote` (alias: `npm run cf:migrate`). Never use `prisma db push`.

**Secrets** (once per environment):
```bash
npx wrangler secret put NEXTAUTH_SECRET   # a long random value
npx wrangler secret put NEXTAUTH_URL      # e.g. https://procpx.<subdomain>.workers.dev
```

**Deploy:** `npm run cf:deploy`. On Windows the OpenNext build needs symlink permission, so turn on Developer Mode or build in WSL or CI.

---

## 👥 Demo Credentials

All accounts are pre-seeded with password: **`Demo@1234`**

| Role | Email Address | Dashboard View |
| :--- | :--- | :--- |
| **Project User** | `project.user@procucev-demo.local` | Draft Projects, Upload BOQ, Active Line Items |
| **Project Approver** | `project.approver@procucev-demo.local` | Approval Queue, Review Requests, Approve/Reject Actions |
| **Client Admin** | `client.admin@procucev-demo.local` | Organization Overview, User Management, Master Data |
| **Procurement User** | `procurement.user@procucev-demo.local` | Approved BOQs, Commercial Review |
| **Finance User** | `finance.user@procucev-demo.local` | Financial Auditing, Budget Tracking |
| **Category Manager** | `category.manager@procucev-demo.local` | Taxonomy, UOM Masters, Specifications |
| **Super Admin** | `super.admin@procucev-demo.local` | Global System Controls, All Tenants |

> **Quick Login**: The `/login` page features one-click buttons to sign in as any demo persona instantly.

---

## 📁 Project Structure

```
procpx/
├── prisma/
│   ├── schema.prisma       # Complete schema (Tenant, User, Project, BOQ, Lines, Masters, Audit)
│   └── seed.ts             # Rich seed dataset with 32 categorized BOQ line items
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
