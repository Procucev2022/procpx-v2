import { normalizePrLineForDisplay } from '../src/lib/pr-line-detail';

describe('purchase request line detail normalization', () => {
  it('preserves direct detail fields and uses BOQ fallbacks for sparse lines', () => {
    expect(normalizePrLineForDisplay({
      id: 'line-1', lineNumber: '1', itemCode: 'ITEM-1', itemDescription: 'Cable', specification: 'Copper',
      category: 'Electrical', quantity: 2, uom: 'M', estimatedRate: 5, estimatedValue: 10,
    }, 0, 'Fallback')).toEqual({
      id: 'line-1', lineNumber: '1', itemCode: 'ITEM-1', itemDescription: 'Cable', specification: 'Copper',
      category: 'Electrical', quantity: 2, uom: 'M', estimatedRate: 5, estimatedValue: 10,
    });

    expect(normalizePrLineForDisplay({
      id: 'line-2', lineNumber: null, itemDescription: null, specification: null, category: null, uom: null,
      estimatedRate: null, estimatedValue: null,
      boqLine: {
        itemCode: 'BOQ-2', standardDescription: null, originalDescription: 'BOQ description', specification: 'BOQ spec',
        uom: { code: 'EA' }, aiUnitCost: 12, aiTotalCost: 24,
      },
    }, 1, 'Mechanical')).toEqual({
      id: 'line-2', lineNumber: '2', itemCode: 'BOQ-2', itemDescription: 'BOQ description', specification: 'BOQ spec',
      category: 'Mechanical', quantity: undefined, uom: 'EA', estimatedRate: 12, estimatedValue: 24,
    });
  });

  it('uses the final fallbacks when both line and BOQ values are absent', () => {
    expect(normalizePrLineForDisplay({
      itemDescription: null, specification: null, category: null, uom: null, estimatedRate: null, estimatedValue: null,
      boqLine: { standardDescription: null, originalDescription: null, specification: null, uomRaw: 'BOX' },
    }, 2)).toEqual({
      id: 'line-2', lineNumber: '3', itemCode: null, itemDescription: null, specification: null,
      category: null, quantity: undefined, uom: 'BOX', estimatedRate: null, estimatedValue: null,
    });
  });
});
