import type { LineCostBreakdown } from "@app-types/lib/boq-cost-breakdown.types";
export type { LineCostBreakdown };


export function computeLineCostBreakdown(
  unitCostOrLine: number | any,
  quantityOrNull?: number | null,
  categoryName?: string | null,
  description?: string | null
): LineCostBreakdown {
  let unitCost: number = 0;
  let quantity: number | null = null;
  let cat: string = '';
  let desc: string = '';

  if (typeof unitCostOrLine === 'object' && unitCostOrLine !== null) {
    unitCost = Number(unitCostOrLine.aiUnitCost ?? unitCostOrLine.unitCost ?? 0);
    quantity = unitCostOrLine.quantity !== undefined ? unitCostOrLine.quantity : null;
    cat = unitCostOrLine.category?.name || unitCostOrLine.category || '';
    desc = unitCostOrLine.standardDescription || unitCostOrLine.originalDescription || unitCostOrLine.description || '';
  } else {
    unitCost = Number(unitCostOrLine ?? 0);
    quantity = quantityOrNull !== undefined ? quantityOrNull : null;
    cat = categoryName || '';
    desc = description || '';
  }

  if (isNaN(unitCost) || unitCost <= 0) {
    return {
      materialCost: 0,
      materialPercent: 0,
      labourCost: 0,
      labourPercent: 0,
      otherCharges: 0,
      otherChargesPercent: 0,
      contractorMargin: 0,
      contractorMarginPercent: 0,
      totalAiUnitCost: 0,
      aiUnitCost: 0,
      aiLineTotal: null,
      basis: 'Cost estimate unavailable for this item.',
      engineeringBasis: 'Cost estimate unavailable for this item.',
      isEstimate: true,
      reconciled: true,
    };
  }

  const normCat = cat.toLowerCase();
  const normDesc = desc.toLowerCase();

  // Discipline-specific engineering cost composition
  let materialShare = 0.60;
  let labourShare = 0.28;
  let otherShare = 0.12;

  if (normCat.includes('electrical') || normDesc.includes('cable') || normDesc.includes('light') || normDesc.includes('wire')) {
    materialShare = 0.70;
    labourShare = 0.20;
    otherShare = 0.10;
  } else if (normCat.includes('civil') || normDesc.includes('tile') || normDesc.includes('paint') || normDesc.includes('plaster')) {
    materialShare = 0.55;
    labourShare = 0.35;
    otherShare = 0.10;
  } else if (normCat.includes('material') || normDesc.includes('plywood') || normDesc.includes('granite')) {
    materialShare = 0.80;
    labourShare = 0.10;
    otherShare = 0.10;
  } else if (normCat.includes('furniture') || normDesc.includes('chair') || normDesc.includes('table') || normDesc.includes('desk')) {
    materialShare = 0.75;
    labourShare = 0.15;
    otherShare = 0.10;
  } else if (normCat.includes('hvac') || normDesc.includes('ac') || normDesc.includes('duct')) {
    materialShare = 0.72;
    labourShare = 0.18;
    otherShare = 0.10;
  }

  // 10% Contractor Margin on Direct Cost Base
  // Total Unit Cost = Direct Cost Base * 1.10
  const directCostBase = Math.round((unitCost / 1.10) * 100) / 100;
  const contractorMargin = Math.round((unitCost - directCostBase) * 100) / 100;

  let materialCost = Math.round(directCostBase * materialShare * 100) / 100;
  let labourCost = Math.round(directCostBase * labourShare * 100) / 100;
  let otherCharges = Math.round((directCostBase - materialCost - labourCost) * 100) / 100;

  // Strict penny reconciliation to ensure exact sum matches unitCost
  const reconciledSum = Math.round((materialCost + labourCost + otherCharges + contractorMargin) * 100) / 100;
  const diff = Math.round((unitCost - reconciledSum) * 100) / 100;
  if (diff !== 0) {
    materialCost = Math.round((materialCost + diff) * 100) / 100;
  }

  const validQty = (quantity !== null && quantity !== undefined && !isNaN(Number(quantity)) && Number(quantity) > 0)
    ? Number(quantity)
    : null;

  const aiLineTotal = validQty !== null ? Math.round(unitCost * validQty * 100) / 100 : null;

  const basis = `Direct cost base (~${Math.round(materialShare * 100)}% Material, ~${Math.round(labourShare * 100)}% Labour, ~${Math.round(otherShare * 100)}% Equipment & Transport) + 10% Contractor Overhead & Margin. Indicative benchmark engineering estimate.`;

  return {
    materialCost,
    materialPercent: Math.round(materialShare * 100),
    labourCost,
    labourPercent: Math.round(labourShare * 100),
    otherCharges,
    otherChargesPercent: Math.round(otherShare * 100),
    contractorMargin,
    contractorMarginPercent: 10,
    totalAiUnitCost: unitCost,
    aiUnitCost: unitCost,
    aiLineTotal,
    basis,
    engineeringBasis: basis,
    isEstimate: true,
    reconciled: true,
  };
}
