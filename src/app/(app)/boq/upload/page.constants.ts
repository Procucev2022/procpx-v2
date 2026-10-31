import { UI_STRINGS } from "@/lib/ui-strings.constants";
/* Application constants extracted from app/(app)/boq/upload/page.tsx. */

export const BOQ_FIELDS = [
  { key: 'lineNumber', label: UI_STRINGS.common.sNo2, required: false },
  { key: 'itemCode', label: UI_STRINGS.common.itemCode, required: false },
  { key: 'category', label: UI_STRINGS.common.category2, required: false },
  { key: 'subcategory', label: UI_STRINGS.common.subCategory, required: false },
  { key: 'description', label: UI_STRINGS.common.itemDescription, required: true },
  { key: 'specification', label: UI_STRINGS.common.bOQDescription, required: false },
  { key: 'uom', label: UI_STRINGS.common.uOM, required: true },
  { key: 'quantity', label: UI_STRINGS.common.quantity, required: true },
  { key: 'location', label: UI_STRINGS.common.location, required: false },
  { key: 'drawingReference', label: UI_STRINGS.common.drawingReference, required: false },
  { key: 'brand', label: UI_STRINGS.common.brand, required: false },
  { key: 'model', label: UI_STRINGS.common.model, required: false },
  { key: 'material', label: UI_STRINGS.appAppBoqUploadPageConstants.material, required: false },
  { key: 'grade', label: UI_STRINGS.appAppBoqUploadPageConstants.grade, required: false },
  { key: 'remarks', label: UI_STRINGS.common.remarks, required: false },
];
