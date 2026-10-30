import { computeQualityScore, summarizeIssues, validateBoqLine } from '../src/lib/boq-validate';

describe('validateBoqLine', () => {
  it('accepts a complete line with a normalized description', () => {
    expect(validateBoqLine({
      originalDescription: 'Wall tile installation',
      standardDescription: 'Install wall tiles',
      uomRaw: 'SQFT',
      uomId: 'uom-1',
      quantity: 12,
      categoryId: 'category-1',
    })).toEqual({ status: 'VALID', messages: [] });
  });

  it('reports all required-field errors and optional warnings', () => {
    const result = validateBoqLine({ quantity: null });

    expect(result.status).toBe('ERROR');
    expect(result.messages.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'DESC_MISSING', 'UOM_MISSING', 'QTY_MISSING', 'CAT_MISSING',
    ]));
  });

  it.each([
    [-1, 'QTY_NEGATIVE'],
    [0, 'QTY_ZERO'],
    [10_000_000, 'QTY_HIGH'],
  ])('validates quantity %s with %s', (quantity, code) => {
    const result = validateBoqLine({
      standardDescription: 'Complete specification',
      uomId: 'uom-1',
      quantity,
      categoryId: 'category-1',
    });

    expect(result.messages.map(({ code: messageCode }) => messageCode)).toContain(code);
    expect(result.status).toBe(code === 'QTY_HIGH' ? 'WARNING' : 'ERROR');
  });

  it('reports duplicate lines, invalid units, short descriptions, and description information', () => {
    const result = validateBoqLine({
      originalDescription: 'Tile',
      standardDescription: 'Tile',
      uomRaw: 'unknown',
      uomId: 'uom-1',
      quantity: 1,
      categoryId: 'category-1',
      isDuplicate: true,
      isInvalidUom: true,
    });

    expect(result.status).toBe('ERROR');
    expect(result.messages.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'LINE_DUPLICATE', 'UOM_INVALID', 'DESC_SHORT', 'DESC_UNSTANDARDIZED',
    ]));
  });

  it('reports an unset standard description separately', () => {
    const result = validateBoqLine({
      originalDescription: 'Install kitchen sink fixtures',
      uomRaw: 'NOS',
      quantity: 1,
      categoryId: 'category-1',
    });

    expect(result.messages.map(({ code }) => code)).toContain('STD_DESC_MISSING');
  });
});

describe('quality summaries', () => {
  it('scores empty, valid, warning, and error line sets', () => {
    expect(computeQualityScore([])).toBe(0);
    expect(computeQualityScore([
      { standardDescription: 'Complete specification', uomId: 'uom-1', quantity: 1, categoryId: 'cat-1' },
      { standardDescription: 'Complete specification', uomId: 'uom-1', quantity: 1 },
      { standardDescription: 'Complete specification', uomId: 'uom-1', quantity: 0, categoryId: 'cat-1' },
    ])).toBe(57);
  });

  it('summarizes specification, category, UOM, duplicate, and message counts', () => {
    expect(summarizeIssues([
      {
        originalDescription: 'Small item',
        standardDescription: 'Short',
        quantity: 0,
        isDuplicate: true,
        isInvalidUom: true,
      },
      {
        originalDescription: 'Long original specification',
        uomRaw: 'NOS',
        quantity: 2,
      },
    ])).toMatchObject({
      missingSpecs: 2,
      uncategorized: 2,
      invalidUom: 2,
      duplicateLines: 1,
      errorCount: expect.any(Number),
      warningCount: expect.any(Number),
      infoCount: expect.any(Number),
      qualityScore: 35,
    });
  });
});
