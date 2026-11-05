export interface PrLineCursorRecord {
  id: string;
  lineNumber: string;
}

export interface PrLineDetailRecord extends PrLineCursorRecord {
  itemCode?: string | null;
  itemDescription?: string | null;
  specification?: string | null;
  category?: string | null;
  subcategory?: string | null;
  uom?: string | null;
  quantity?: number | null;
  estimatedRate?: number | null;
  estimatedValue?: number | null;
  boqLine?: {
    itemCode?: string | null;
    standardDescription?: string | null;
    originalDescription?: string | null;
    specification?: string | null;
    uomRaw?: string | null;
    aiUnitCost?: number | null;
    aiTotalCost?: number | null;
    uom?: { code: string } | null;
  } | null;
}

export interface PrLinePaginationMetadata {
  hasMore: boolean;
  nextCursor: string | null;
  pageSize: number;
}

export interface PrLinePaginationPage<T extends PrLineCursorRecord> {
  lines: T[];
  metadata: PrLinePaginationMetadata;
}
