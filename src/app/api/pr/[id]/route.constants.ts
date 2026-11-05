export const PR_DETAIL_LINE_SELECT = {
  id: true,
  lineNumber: true,
  itemDescription: true,
  specification: true,
  category: true,
  subcategory: true,
  uom: true,
  quantity: true,
  estimatedRate: true,
  estimatedValue: true,
  boqLine: {
    select: {
      itemCode: true,
      standardDescription: true,
      originalDescription: true,
      specification: true,
      uomRaw: true,
      aiUnitCost: true,
      aiTotalCost: true,
      uom: { select: { code: true } },
    },
  },
} as const;
