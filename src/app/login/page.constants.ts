/* Application constants extracted from app/login/page.tsx. */

import type { Persona } from "@app-types/app/login/page.types";
import { UI_STRINGS } from "@/lib/ui-strings.constants";


export const BUYER_PERSONAS: Persona[] = [
  { role: UI_STRINGS.common.categoryManager, email: 'category.manager@procucev-demo.local', desc: UI_STRINGS.appLoginPageConstants.taxonomySourcingRFQNegotiationsAwards, badge: UI_STRINGS.appLoginPageConstants.buyer },
  { role: UI_STRINGS.common.procurementUser, email: 'procurement.user@procucev-demo.local', desc: UI_STRINGS.appLoginPageConstants.rFQsSourcingQuotations, badge: UI_STRINGS.appLoginPageConstants.buyer },
  { role: UI_STRINGS.common.projectApprover, email: 'project.approver@procucev-demo.local', desc: UI_STRINGS.appLoginPageConstants.bOQApprovalBaselines, badge: UI_STRINGS.common.approver },
  { role: UI_STRINGS.common.projectUser, email: 'project.user@procucev-demo.local', desc: UI_STRINGS.appLoginPageConstants.bOQUploadDraftingPRCreation, badge: UI_STRINGS.common.project },
  { role: UI_STRINGS.appLoginPageConstants.financeUser, email: 'finance.user@procucev-demo.local', desc: UI_STRINGS.appLoginPageConstants.awardApprovalsPPOTracking, badge: UI_STRINGS.appLoginPageConstants.finance },
  { role: UI_STRINGS.appLoginPageConstants.clientAdmin, email: 'client.admin@procucev-demo.local', desc: UI_STRINGS.appLoginPageConstants.tenantGovernanceUsersRoles, badge: UI_STRINGS.appLoginPageConstants.admin },
  { role: UI_STRINGS.appLoginPageConstants.superAdmin, email: 'super.admin@procucev-demo.local', desc: UI_STRINGS.appLoginPageConstants.platformInfrastructure, badge: UI_STRINGS.appLoginPageConstants.superAdmin },
  { role: UI_STRINGS.appLoginPageConstants.viewerReadOnly, email: 'viewer@procucev-demo.local', desc: UI_STRINGS.appLoginPageConstants.readOnlyProjectAuditView, badge: UI_STRINGS.appLoginPageConstants.auditor },
];

export const VENDOR_PERSONAS: Persona[] = [
  { role: UI_STRINGS.appLoginPageConstants.apexInfrastructure, email: 'vendor.apex@apex-infra.com', password: 'Demo@1234', desc: UI_STRINGS.appLoginPageConstants.civilContractingRedirectsToVendorPortal, badge: UI_STRINGS.common.vendor },
  { role: UI_STRINGS.appLoginPageConstants.bluePeakEngineering, email: 'bluepeak.engineering@vendor.procpx.local', password: 'welcome', desc: UI_STRINGS.appLoginPageConstants.mEPSolutionsRedirectsToVendorPortal, badge: UI_STRINGS.common.vendor },
  { role: UI_STRINGS.appLoginPageConstants.craftLineInterior, email: 'craftline.interior@vendor.procpx.local', password: 'welcome', desc: UI_STRINGS.appLoginPageConstants.retailFixturesRedirectsToVendorPortal, badge: UI_STRINGS.common.vendor },
  { role: UI_STRINGS.appLoginPageConstants.ramakrishnaInteriors, email: 'ramakrishna.interiors@vendor.procpx.local', password: 'welcome', desc: UI_STRINGS.appLoginPageConstants.commercialFitoutsRedirectsToVendorPortal, badge: UI_STRINGS.common.vendor },
  { role: UI_STRINGS.appLoginPageConstants.srinidhiInteriors, email: 'srinidhi.interiors@vendor.procpx.local', password: 'welcome', desc: UI_STRINGS.appLoginPageConstants.retailMillworkRedirectsToVendorPortal, badge: UI_STRINGS.common.vendor },
  { role: UI_STRINGS.appLoginPageConstants.zenithRetailSystems, email: 'zenith.retail@vendor.procpx.local', password: 'welcome', desc: UI_STRINGS.appLoginPageConstants.electricalDisplayRedirectsToVendorPortal, badge: UI_STRINGS.common.vendor },
];

export const TENANT_B_PERSONAS: Persona[] = [
  { role: UI_STRINGS.appLoginPageConstants.hospitalityProjectUser, email: 'hospitality.user@procucev-demo.local', password: 'Demo@1234', desc: UI_STRINGS.appLoginPageConstants.multiTenantIsolationBoundary, badge: UI_STRINGS.common.tenantB },
  { role: UI_STRINGS.appLoginPageConstants.hospitalityApprover, email: 'hospitality.approver@procucev-demo.local', password: 'Demo@1234', desc: UI_STRINGS.appLoginPageConstants.tenantBProjectApprover, badge: UI_STRINGS.common.tenantB },
  { role: UI_STRINGS.appLoginPageConstants.hospitalityAdmin, email: 'hospitality.admin@procucev-demo.local', password: 'Demo@1234', desc: UI_STRINGS.appLoginPageConstants.tenantBOrganizationAdministrator, badge: UI_STRINGS.common.tenantB },
];
