import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { ASSIGNABLE_USER_ROLES } from "@/app/api/admin/users/route.constants";
import type { InviteFormValues } from "@app-types/app/(app)/admin/users/page.types";
/* Application constants extracted from app/(app)/admin/users/page.tsx. */

// The invite form offers exactly the roles the users API accepts.
export const ROLES: string[] = [...ASSIGNABLE_USER_ROLES];

// Blank invite form; businessId is filled with the caller's company for non-Super-Admins.
export const EMPTY_INVITE_FORM: Readonly<InviteFormValues> = Object.freeze({ email: '', name: '', role: 'PROJECT_USER', password: '', businessId: '' });

export const PERMISSIONS_MATRIX: Array<{ permission: string; description: string; roles: string[] }> = [
  { permission: 'PROJECT_VIEW', description: UI_STRINGS.appAppAdminUsersPageConstants.viewTenantProjectsOverviews, roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER', 'PROJECT_APPROVER', 'PROCUREMENT_USER', 'FINANCE_USER', 'CATEGORY_MANAGER', 'VIEWER'] },
  { permission: 'PROJECT_CREATE', description: UI_STRINGS.appAppAdminUsersPageConstants.createNewCapexProjects, roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER'] },
  { permission: 'PROJECT_EDIT', description: UI_STRINGS.appAppAdminUsersPageConstants.modifyProjectDetailsSettings, roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER'] },
  { permission: 'BOQ_VIEW', description: UI_STRINGS.appAppAdminUsersPageConstants.viewBOQLinesAndQualityScores, roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER', 'PROJECT_APPROVER', 'PROCUREMENT_USER', 'FINANCE_USER', 'CATEGORY_MANAGER', 'VIEWER'] },
  { permission: 'BOQ_UPLOAD', description: UI_STRINGS.appAppAdminUsersPageConstants.uploadRawExcelSpreadsheetsMapColumns, roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER'] },
  { permission: 'BOQ_EDIT', description: UI_STRINGS.appAppAdminUsersPageConstants.standardiseEditDescriptionsAndQuantities, roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER'] },
  { permission: 'BOQ_VALIDATE', description: UI_STRINGS.appAppAdminUsersPageConstants.executeValidationRulesQualityScoring, roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER', 'PROJECT_APPROVER', 'CATEGORY_MANAGER'] },
  { permission: 'BOQ_SUBMIT', description: UI_STRINGS.appAppAdminUsersPageConstants.submitDraftBOQForManagementApproval, roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER'] },
  { permission: 'BOQ_APPROVE', description: UI_STRINGS.appAppAdminUsersPageConstants.approveSubmittedBOQAsImmutableBaseline, roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_APPROVER'] },
  { permission: 'BOQ_REJECT', description: UI_STRINGS.appAppAdminUsersPageConstants.rejectSubmittedBOQWithMandatoryReason, roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_APPROVER'] },
  { permission: 'BOQ_REVISION_CREATE', description: UI_STRINGS.appAppAdminUsersPageConstants.branchNewDraftRevisionFromApprovedBaseline, roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER'] },
  { permission: 'MASTER_VIEW', description: UI_STRINGS.appAppAdminUsersPageConstants.inspectUOMCatalogAndCategoryTaxonomy, roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER', 'PROJECT_APPROVER', 'PROCUREMENT_USER', 'FINANCE_USER', 'CATEGORY_MANAGER'] },
  { permission: 'MASTER_EDIT', description: UI_STRINGS.appAppAdminUsersPageConstants.createAndUpdateCategoriesAndUOMs, roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'CATEGORY_MANAGER'] },
  { permission: 'USER_VIEW', description: UI_STRINGS.appAppAdminUsersPageConstants.viewOrganizationUsers, roles: ['SUPER_ADMIN', 'CLIENT_ADMIN'] },
  { permission: 'USER_CREATE', description: UI_STRINGS.appAppAdminUsersPageConstants.createAndInviteUsers, roles: ['SUPER_ADMIN', 'CLIENT_ADMIN'] },
  { permission: 'USER_EDIT', description: UI_STRINGS.appAppAdminUsersPageConstants.modifyUserRolesAndActivateDisableUsers, roles: ['SUPER_ADMIN', 'CLIENT_ADMIN'] },
  { permission: 'AUDIT_VIEW', description: UI_STRINGS.appAppAdminUsersPageConstants.viewChronologicalEntityMutationAuditLog, roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_APPROVER', 'FINANCE_USER', 'CATEGORY_MANAGER'] },
];
