export const DEFAULT_STANDARD_BOQ_PAGE_SIZE = 50;
export const MAX_STANDARD_BOQ_PAGE_SIZE = 100;
export const MAX_STANDARD_BOQ_IMPORT_ITEMS = 200;
export const STANDARD_BOQ_EXISTING_CODE_LOOKUP_CHUNK_SIZE = 80;
export const MAX_STANDARD_BOQ_ITEM_CODE_LENGTH = 80;
export const MAX_STANDARD_BOQ_ITEM_NAME_LENGTH = 160;
export const MAX_STANDARD_BOQ_ITEM_DESCRIPTION_LENGTH = 1_000;
export const MAX_STANDARD_BOQ_ITEM_SPECIFICATION_LENGTH = 4_000;
export const MAX_STANDARD_BOQ_ITEM_COST_DRIVERS_LENGTH = 4_000;

export const STANDARD_BOQ_ITEM_INSERT_SQL = `
  INSERT INTO "standard_boq_items" (
    "id", "tenantId", "itemCode", "sector", "projectType", "category", "subcategory",
    "standardDescription", "detailedSpecification", "uom", "brandMake", "benchmarkRate",
    "benchmarkEligibility", "aiRefinementEligibility", "costDrivers", "isActive", "createdAt", "updatedAt"
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, 1, ?, ?)
`;

export const STANDARD_BOQ_AUDIT_INSERT_SQL = `
  INSERT INTO "audit_logs" (
    "id", "tenantId", "userId", "entityType", "entityId", "action", "description", "newValue", "createdAt"
  ) VALUES (?, ?, ?, 'BOQ', ?, 'CREATE', ?, ?, ?)
`;
