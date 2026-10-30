/* Application constants extracted from app/(app)/boq/upload/page.tsx. */

export const BOQ_FIELDS = [
  { key: 'lineNumber', label: 'S.No.', required: false },
  { key: 'itemCode', label: 'Item Code', required: false },
  { key: 'category', label: 'Category', required: false },
  { key: 'subcategory', label: 'Sub-category', required: false },
  { key: 'description', label: 'Item Description', required: true },
  { key: 'specification', label: 'BOQ Description', required: false },
  { key: 'uom', label: 'UOM', required: true },
  { key: 'quantity', label: 'Quantity', required: true },
  { key: 'location', label: 'Location', required: false },
  { key: 'drawingReference', label: 'Drawing Reference', required: false },
  { key: 'brand', label: 'Brand', required: false },
  { key: 'model', label: 'Model', required: false },
  { key: 'material', label: 'Material', required: false },
  { key: 'grade', label: 'Grade', required: false },
  { key: 'remarks', label: 'Remarks', required: false },
];
