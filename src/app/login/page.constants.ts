/* Application constants extracted from app/login/page.tsx. */

import type { Persona } from "@app-types/app/login/page.types";
import { UI_STRINGS } from "@/lib/ui-strings.constants";


export const TEST_FIXTURE_PASSWORD = 'Mock@1234';

export const BUYER_PERSONAS: Persona[] = [
  { role: UI_STRINGS.common.categoryManager, email: 'category.manager@test.procpx.local', desc: UI_STRINGS.appLoginPageConstants.taxonomySourcingRFQNegotiationsAwards, badge: UI_STRINGS.appLoginPageConstants.buyer },
  { role: UI_STRINGS.common.procurementUser, email: 'procurement.user@test.procpx.local', desc: UI_STRINGS.appLoginPageConstants.rFQsSourcingQuotations, badge: UI_STRINGS.appLoginPageConstants.buyer },
  { role: UI_STRINGS.common.projectApprover, email: 'project.approver@test.procpx.local', desc: UI_STRINGS.appLoginPageConstants.bOQApprovalBaselines, badge: UI_STRINGS.common.approver },
  { role: UI_STRINGS.common.projectUser, email: 'project.user@test.procpx.local', desc: UI_STRINGS.appLoginPageConstants.bOQUploadDraftingPRCreation, badge: UI_STRINGS.common.project },
  { role: UI_STRINGS.appLoginPageConstants.financeUser, email: 'finance.user@test.procpx.local', desc: UI_STRINGS.appLoginPageConstants.awardApprovalsPPOTracking, badge: UI_STRINGS.appLoginPageConstants.finance },
  { role: UI_STRINGS.appLoginPageConstants.clientAdmin, email: 'client.admin@test.procpx.local', desc: UI_STRINGS.appLoginPageConstants.tenantGovernanceUsersRoles, badge: UI_STRINGS.appLoginPageConstants.admin },
  { role: UI_STRINGS.appLoginPageConstants.superAdmin, email: 'super.admin@test.procpx.local', desc: UI_STRINGS.appLoginPageConstants.platformInfrastructure, badge: UI_STRINGS.appLoginPageConstants.superAdmin },
  { role: UI_STRINGS.appLoginPageConstants.viewerReadOnly, email: 'viewer@test.procpx.local', desc: UI_STRINGS.appLoginPageConstants.readOnlyProjectAuditView, badge: UI_STRINGS.appLoginPageConstants.auditor },
];

export const VENDOR_PERSONAS: Persona[] = [
  { role: UI_STRINGS.appLoginPageConstants.testVendorOne, email: 'vendor.one@test.procpx.local', password: TEST_FIXTURE_PASSWORD, desc: UI_STRINGS.appLoginPageConstants.civilContractingRedirectsToVendorPortal, badge: UI_STRINGS.common.vendor },
  { role: UI_STRINGS.appLoginPageConstants.testVendorTwo, email: 'vendor.two@test.procpx.local', password: TEST_FIXTURE_PASSWORD, desc: UI_STRINGS.appLoginPageConstants.mEPSolutionsRedirectsToVendorPortal, badge: UI_STRINGS.common.vendor },
  { role: UI_STRINGS.appLoginPageConstants.testVendorThree, email: 'vendor.three@test.procpx.local', password: TEST_FIXTURE_PASSWORD, desc: UI_STRINGS.appLoginPageConstants.retailFixturesRedirectsToVendorPortal, badge: UI_STRINGS.common.vendor },
];

export const TENANT_B_PERSONAS: Persona[] = [
  { role: UI_STRINGS.appLoginPageConstants.hospitalityProjectUser, email: 'hospitality.user@test.procpx.local', desc: UI_STRINGS.appLoginPageConstants.multiTenantIsolationBoundary, badge: UI_STRINGS.common.tenantB },
  { role: UI_STRINGS.appLoginPageConstants.hospitalityApprover, email: 'hospitality.approver@test.procpx.local', desc: UI_STRINGS.appLoginPageConstants.tenantBProjectApprover, badge: UI_STRINGS.common.tenantB },
  { role: UI_STRINGS.appLoginPageConstants.hospitalityAdmin, email: 'hospitality.admin@test.procpx.local', desc: UI_STRINGS.appLoginPageConstants.tenantBOrganizationAdministrator, badge: UI_STRINGS.common.tenantB },
];
