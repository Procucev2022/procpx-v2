# proCPX Enterprise Capex Procurement Platform

> **Next-Generation Capital Expenditure Procurement & BOQ Management System**  
> Designed and built for retail, hospitality, banking, and infrastructure enterprises.

---

## 🚀 Key Highlights & Capabilities

- **Role-Aware Workspaces**: Fine-grained permissions matrix tailored across 7 enterprise roles:
  - `PROJECT_USER` (Site engineers, project managers)
  - `PROJECT_APPROVER` (Capex approvers, regional heads)
  - `PROCUREMENT_USER` (Buyers, commercial teams)
  - `FINANCE_USER` (Cost controllers, auditors)
  - `CATEGORY_MANAGER` (Specifiers, standard owners)
  - `CLIENT_ADMIN` (Organization tenant administrators)
  - `SUPER_ADMIN` (Platform administrators)
- **8-Step BOQ Ingestion & Processing**:
  - Drag-and-drop `.xlsx` / `.xls` spreadsheet parser using native memory buffers
  - Automatic sheet identification and header row detection
  - Intelligent column-mapping engine with auto-matching algorithms
  - UOM standardisation against an enterprise unit dictionary
  - Quality score calculation (0–100%) flagging missing descriptions, quantities, and anomalies
  - Auto revisioning (`R0`, `R1`, `R2`, ...) preserving immutable historical records
- **Interactive BOQ Workspace Grid**:
  - High-performance paginated line grid
  - Modal and inline item editors with real-time validation checks
  - Approval and rejection workflows with mandatory remarks and reason tracking
- **Project Master & Lifecycle**:
  - Auto project code sequencing (`PRJ-2026-XXXXXX`)
  - Sector presets (Retail, Hospitality, Banking, Healthcare, etc.)
  - Tabbed overview with BOQs, Team members, and Document repositories
- **Master Data & Category Management**:
  - Hierarchical category taxonomy (Parent & Subcategory tree)
  - UOM dictionary with canonical symbols and conversion factors
- **Immutable Audit Trail**:
  - Structured audit logging tracking all entity mutations, IP addresses, and actors
  - Interactive state diff inspection comparing before and after JSON payloads

---

## 🛠 Tech Stack

- **Framework**: Next.js 16 (App Router + Turbopack)
- **Runtime & Language**: Node.js & TypeScript
- **Styling**: Vanilla CSS Design System with Tailwind v4 utilities & Dark Mode enterprise palette
- **Database & ORM**: Prisma ORM with SQLite (`file:./dev.db`) – zero external setup required; seamlessly switchable to PostgreSQL
- **Authentication**: NextAuth.js v5 with JWT session handling & bcrypt credential hashing
- **Spreadsheet Engine**: SheetJS (`xlsx`) with custom parsing and standardisation pipelines

---

## 📋 Quick Start Guide

### 1. Prerequisites
- Node.js 18+ installed

### 2. Install Dependencies
```bash
npm install
```

### 3. Initialize Database Schema
```bash
npx prisma db push
```

### 4. Seed Demo Data & Accounts
```bash
npx tsx prisma/seed.ts
```

### 5. Launch Development Server
```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.

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
