# proCPX Enterprise Capex Procurement Platform

> **Next-Generation Capital Expenditure Procurement & BOQ Management System**  
> Designed and built for retail, hospitality, banking, and infrastructure enterprises.

---

## Quick Start Guide

### 1. Install Dependencies
```bash
npm ci
```

### 2. Configure Cloudflare D1
Copy `.env.example` to `.env` and provide `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_DATABASE_ID`. Replace the matching `database_id` placeholder in `wrangler.jsonc` with the same D1 database ID.

Create a D1 database named `procpx-d1` in Cloudflare if one does not already exist. The application uses the D1 HTTP API from the Node.js Next.js runtime.

### 3. Initialize the Empty D1 Schema
For the local Wrangler D1 database:
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

**Production readiness:** Prisma's D1 adapter currently ignores transaction boundaries. Multi-write procurement flows must be redesigned before production traffic uses D1. The current affected routes are `src/app/api/vendor-portal/rfqs/[id]/route.ts`, `src/app/api/procurement/negotiations/route.ts`, `src/app/api/procurement/ppos/route.ts`, and `src/app/api/procurement/rfqs/[id]/vendors/route.ts`.

### 4. Launch Development Server
```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser. Database-backed features require valid D1 credentials.

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
