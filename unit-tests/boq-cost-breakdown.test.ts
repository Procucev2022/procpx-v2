import { computeLineCostBreakdown } from '../src/lib/boq-cost-breakdown';

describe('computeLineCostBreakdown', () => {
  it.each([0, -1, Number.NaN, undefined])('returns an unavailable estimate for invalid cost %s', (cost) => {
    const result = computeLineCostBreakdown(cost as number);
    expect(result).toMatchObject({
      materialCost: 0,
      totalAiUnitCost: 0,
      aiLineTotal: null,
      isEstimate: true,
      reconciled: true,
    });
  });

  it.each([
    ['Electrical', '', 70],
    ['', 'Copper cable', 70],
    ['Civil', '', 55],
    ['', 'Paint walls', 55],
    ['Materials', '', 80],
    ['', 'Granite countertop', 80],
    ['Furniture', '', 75],
    ['', 'Office chair', 75],
    ['HVAC', '', 72],
    ['', 'Install ductwork', 72],
    ['Other', 'General maintenance', 60],
  ])('allocates costs for %s / %s', (categoryName, description, materialPercent) => {
    const result = computeLineCostBreakdown(110, 2, categoryName, description);

    expect(result.materialPercent).toBe(materialPercent);
    expect(result.aiLineTotal).toBe(220);
    expect(result.materialCost + result.labourCost + result.otherCharges + result.contractorMargin).toBe(110);
  });

  it('reads cost, quantity, category objects, and preferred descriptions from a line', () => {
    expect(computeLineCostBreakdown({
      aiUnitCost: 55,
      unitCost: 44,
      quantity: 3,
      category: { name: 'Electrical' },
      standardDescription: 'LED light fixture',
      originalDescription: 'Old description',
    })).toMatchObject({
      totalAiUnitCost: 55,
      aiLineTotal: 165,
      materialPercent: 70,
    });
  });

  it.each([null, undefined, 0, -2, 'invalid'])('omits line total for an invalid quantity %s', (quantity) => {
    expect(computeLineCostBreakdown({ unitCost: 25, quantity }).aiLineTotal).toBeNull();
  });
});
