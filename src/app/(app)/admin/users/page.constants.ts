/* Application constants extracted from app/(app)/admin/users/page.tsx. */

export const ROLES = [
  'PROJECT_USER',
  'PROJECT_APPROVER',
  'PROCUREMENT_USER',
  'FINANCE_USER',
  'CATEGORY_MANAGER',
  'CLIENT_ADMIN',
  'VIEWER',
];

export const PERMISSIONS_MATRIX: Array<{ permission: string; description: string; roles: string[] }> = [
  { permission: 'PROJECT_VIEW', description: 'View tenant projects & overviews', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER', 'PROJECT_APPROVER', 'PROCUREMENT_USER', 'FINANCE_USER', 'CATEGORY_MANAGER', 'VIEWER'] },
  { permission: 'PROJECT_CREATE', description: 'Create new Capex projects', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER'] },
  { permission: 'PROJECT_EDIT', description: 'Modify project details & settings', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER'] },
  { permission: 'BOQ_VIEW', description: 'View BOQ lines and quality scores', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER', 'PROJECT_APPROVER', 'PROCUREMENT_USER', 'FINANCE_USER', 'CATEGORY_MANAGER', 'VIEWER'] },
  { permission: 'BOQ_UPLOAD', description: 'Upload raw Excel spreadsheets & map columns', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER'] },
  { permission: 'BOQ_EDIT', description: 'Standardise, edit descriptions and quantities', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER'] },
  { permission: 'BOQ_VALIDATE', description: 'Execute validation rules & quality scoring', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER', 'PROJECT_APPROVER', 'CATEGORY_MANAGER'] },
  { permission: 'BOQ_SUBMIT', description: 'Submit draft BOQ for management approval', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER'] },
  { permission: 'BOQ_APPROVE', description: 'Approve submitted BOQ as immutable baseline', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_APPROVER'] },
  { permission: 'BOQ_REJECT', description: 'Reject submitted BOQ with mandatory reason', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_APPROVER'] },
  { permission: 'BOQ_REVISION_CREATE', description: 'Branch new draft revision from approved baseline', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER'] },
  { permission: 'MASTER_VIEW', description: 'Inspect UOM catalog and Category taxonomy', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER', 'PROJECT_APPROVER', 'PROCUREMENT_USER', 'FINANCE_USER', 'CATEGORY_MANAGER'] },
  { permission: 'MASTER_EDIT', description: 'Create and update categories and UOMs', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'CATEGORY_MANAGER'] },
  { permission: 'USER_VIEW', description: 'View organization users', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN'] },
  { permission: 'USER_CREATE', description: 'Create and invite users', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN'] },
  { permission: 'USER_EDIT', description: 'Modify user roles and activate/disable users', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN'] },
  { permission: 'AUDIT_VIEW', description: 'View chronological entity mutation audit log', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_APPROVER', 'FINANCE_USER', 'CATEGORY_MANAGER'] },
];
