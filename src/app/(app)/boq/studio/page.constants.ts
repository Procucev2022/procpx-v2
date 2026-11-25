/* Application constants extracted from app/(app)/boq/studio/page.tsx. */
import type { CSSProperties } from 'react';
import type { BoqLineColumn } from '@app-types/app/(app)/boq/studio/page.types';
import { UI_STRINGS } from '@/lib/ui-strings.constants';

export const SECTOR_PROJECT_TYPES: Record<string, string[]> = {
  RETAIL: [
    'Retail Store Fitout',
    'QSR',
    'Supermarket',
    'Hypermarket',
    'Lifestyle Store',
    'Department Store',
    'Convenience Store',
  ],
  HOSPITALITY: [
    'Hotel',
    'Restaurant',
    'Cafe',
    'QSR',
    'Banquet',
    'Guest Room',
    'Kitchen',
    'Back-of-House',
  ],
  BANKING: [
    'Branch',
    'ATM',
    'Back Office',
    'Corporate Office',
    'Customer Area',
    'Vault / Strong Room',
  ],
  INSURANCE: [
    'Branch Office',
    'Customer Service Centre',
    'Operations Hub',
  ],
  OFFICE: [
    'Office',
    'Service Centre',
    'Corporate Facility',
    'Training Centre',
  ],
  SERVICES: [
    'Service Centre',
    'Corporate Facility',
    'Training Centre',
  ],
};

export const ALL_STANDARD_CATEGORIES = [
  'Civil & Interior',
  'Electrical',
  'HVAC',
  'Plumbing',
  'Fire Fighting',
  'ELV / IT',
  'Furniture',
  'Signage & Branding',
  'Kitchen / F&B Equipment',
  'Security',
  'External Development',
];

export const BOQ_FINANCIAL_CATEGORY_KEYS = ['Material', 'Electrical', 'Civil', 'Interior', 'Other'] as const;

/** Label style shared by the Project & Target Parameters setup fields. */
export const SETUP_FIELD_LABEL_STYLE: CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: '#64748b',
  marginBottom: 6,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

/** Every standard project type, de-duplicated, for the sector-free Project Type picker. */
export const PROJECT_TYPE_OPTIONS: string[] = Array.from(new Set(Object.values(SECTOR_PROJECT_TYPES).flat()));

/** Units offered in Manual Line Entry; NOS is the default, matching the manual BOQ API. */
export const MANUAL_LINE_UOM_OPTIONS = ['NOS', 'SQFT', 'SQM', 'RFT', 'MTR', 'CUM', 'KG', 'SET', 'LOT', 'EA', 'BAG'] as const;
export const MANUAL_LINE_DEFAULT_UOM = 'NOS';

/** Compact input style used inside the Manual Line Entry table cells. */
export const MANUAL_LINE_CELL_INPUT_STYLE: CSSProperties = {
  width: '100%',
  height: 32,
  fontSize: 12,
  padding: '0 8px',
};

/**
 * BOQ Line Items table columns in on-screen order (the trailing Actions column is not switchable).
 * Locked columns identify a line and its quantity; detail columns start hidden to keep rows compact.
 */
export const BOQ_LINE_COLUMNS: BoqLineColumn[] = [
  { key: 'sno', label: UI_STRINGS.common.sNo2, locked: true, defaultVisible: true },
  { key: 'itemDescription', label: UI_STRINGS.common.itemDescription, locked: true, defaultVisible: true },
  { key: 'boqDescription', label: UI_STRINGS.common.bOQDescription, locked: false, defaultVisible: true },
  { key: 'uom', label: UI_STRINGS.common.uOM, locked: true, defaultVisible: true },
  { key: 'quantity', label: UI_STRINGS.common.quantity, locked: true, defaultVisible: true },
  { key: 'location', label: UI_STRINGS.common.location, locked: false, defaultVisible: false },
  { key: 'brand', label: UI_STRINGS.common.brand, locked: false, defaultVisible: false },
  { key: 'aiUnitCost', label: UI_STRINGS.appAppBoqStudioPage.aIUnitCost, locked: false, defaultVisible: true },
  { key: 'aiTotal', label: UI_STRINGS.appAppBoqStudioPage.aITotal, locked: false, defaultVisible: true },
  { key: 'status', label: UI_STRINGS.common.status, locked: false, defaultVisible: true },
];

export const BOQ_LINE_DEFAULT_VISIBLE_COLUMNS: string[] = BOQ_LINE_COLUMNS.filter((column) => column.defaultVisible).map((column) => column.key);

/** Browser-only preference key for the chosen BOQ Line Items columns. */
export const BOQ_LINE_COLUMNS_STORAGE_KEY = 'procpx_boq_line_columns';

/** The BOQ line table scrolls inside this height (both directions) with a sticky header. */
export const BOQ_LINES_TABLE_MAX_HEIGHT = '70vh';
/** Load the next page of lines when the table is scrolled within this distance of its bottom. */
export const BOQ_LINES_LOAD_MORE_THRESHOLD_PX = 600;
