/* Application constants extracted from app/login/page.tsx. */

import type { Persona } from "@app-types/app/login/page.types";

export const BUYER_PERSONAS: Persona[] = [
  { role: 'Category Manager', email: 'category.manager@procucev-demo.local', desc: 'Taxonomy, Sourcing, RFQ Negotiations & Awards', badge: 'Buyer' },
  { role: 'Procurement User', email: 'procurement.user@procucev-demo.local', desc: 'RFQs, Sourcing & Quotations', badge: 'Buyer' },
  { role: 'Project Approver', email: 'project.approver@procucev-demo.local', desc: 'BOQ Approval & Baselines', badge: 'Approver' },
  { role: 'Project User', email: 'project.user@procucev-demo.local', desc: 'BOQ Upload, Drafting & PR Creation', badge: 'Project' },
  { role: 'Finance User', email: 'finance.user@procucev-demo.local', desc: 'Award Approvals & PPO Tracking', badge: 'Finance' },
  { role: 'Client Admin', email: 'client.admin@procucev-demo.local', desc: 'Tenant Governance, Users & Roles', badge: 'Admin' },
  { role: 'Super Admin', email: 'super.admin@procucev-demo.local', desc: 'Platform Infrastructure', badge: 'Super Admin' },
  { role: 'Viewer (Read-Only)', email: 'viewer@procucev-demo.local', desc: 'Read-Only Project & Audit View', badge: 'Auditor' },
];

export const VENDOR_PERSONAS: Persona[] = [
  { role: 'Apex Infrastructure', email: 'vendor.apex@apex-infra.com', password: 'Demo@1234', desc: 'Civil & Contracting (Redirects to Vendor Portal)', badge: 'Vendor' },
  { role: 'BluePeak Engineering', email: 'bluepeak.engineering@vendor.procpx.local', password: 'welcome', desc: 'MEP Solutions (Redirects to Vendor Portal)', badge: 'Vendor' },
  { role: 'CraftLine Interior', email: 'craftline.interior@vendor.procpx.local', password: 'welcome', desc: 'Retail Fixtures (Redirects to Vendor Portal)', badge: 'Vendor' },
  { role: 'Ramakrishna Interiors', email: 'ramakrishna.interiors@vendor.procpx.local', password: 'welcome', desc: 'Commercial Fitouts (Redirects to Vendor Portal)', badge: 'Vendor' },
  { role: 'Srinidhi Interiors', email: 'srinidhi.interiors@vendor.procpx.local', password: 'welcome', desc: 'Retail Millwork (Redirects to Vendor Portal)', badge: 'Vendor' },
  { role: 'Zenith Retail Systems', email: 'zenith.retail@vendor.procpx.local', password: 'welcome', desc: 'Electrical & Display (Redirects to Vendor Portal)', badge: 'Vendor' },
];

export const TENANT_B_PERSONAS: Persona[] = [
  { role: 'Hospitality Project User', email: 'hospitality.user@procucev-demo.local', password: 'Demo@1234', desc: 'Multi-Tenant Isolation Boundary', badge: 'Tenant B' },
  { role: 'Hospitality Approver', email: 'hospitality.approver@procucev-demo.local', password: 'Demo@1234', desc: 'Tenant B Project Approver', badge: 'Tenant B' },
  { role: 'Hospitality Admin', email: 'hospitality.admin@procucev-demo.local', password: 'Demo@1234', desc: 'Tenant B Organization Administrator', badge: 'Tenant B' },
];
