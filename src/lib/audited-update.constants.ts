export const AUDITED_UPDATE_TABLES = {
  user: {
    table: 'users',
    columns: ['name', 'role', 'status', 'updatedBy'],
    returning: '"id", "email", "name", "role", "status", "updatedAt"',
  },
  project: {
    table: 'projects',
    columns: [
      'name', 'description', 'sector', 'projectType', 'location', 'address', 'city', 'state', 'country',
      'areaSqFt', 'costCentre', 'projectOwner', 'budget', 'currency', 'status', 'updatedBy',
    ],
    returning: '*',
  },
  vendor: {
    table: 'vendors',
    columns: [
      'name', 'vendorType', 'contactPerson', 'email', 'phone', 'categories', 'operatingLocation', 'city', 'state',
      'country', 'legalStructure', 'gstin', 'pan', 'website', 'address', 'experienceYears', 'turnoverCrores',
      'capabilities', 'serviceCoverage', 'clientReferences', 'certifications', 'onboardingStatus', 'documents',
    ],
    jsonColumns: ['categories', 'capabilities', 'serviceCoverage', 'clientReferences', 'certifications', 'documents'],
    returning: '*',
  },
  auctionVendor: {
    table: 'auction_vendors',
    columns: ['termsAccepted', 'termsAcceptedAt'],
    booleanColumns: ['termsAccepted'],
    returning: '"id", "termsAccepted", "termsAcceptedAt"',
    updatedAtColumn: null,
  },
} as const;

export const AUDITED_UPDATE_ASSERT_SQL = `
  SELECT json_extract(CASE WHEN EXISTS (
    SELECT 1 FROM "audit_logs"
    WHERE "id" = ? AND "tenantId" = ? AND "entityType" = ? AND "entityId" = ?
  ) THEN '{}' ELSE 'invalid' END, '$') AS "audited"
`;

export const AUDITED_UPDATE_FAILURE_EVENT = 'database.audited_update_failed';
