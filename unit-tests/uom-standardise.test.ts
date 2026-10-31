import { standardiseDescription, standardiseUom, STANDARD_UOM_CODES } from '../src/lib/uom-standardise';

describe('standardiseUom', () => {
  it('handles empty, exact, punctuation-normalized, and unknown units', () => {
    expect(standardiseUom('')).toEqual({ code: '', confident: false });
    expect(standardiseUom('  SQ FT  ')).toEqual({ code: 'SQFT', confident: true });
    expect(standardiseUom('sq-ft')).toEqual({ code: 'SQFT', confident: true });
    expect(standardiseUom('approx kg weight')).toEqual({ code: 'KG', confident: false });
    expect(standardiseUom('???')).toEqual({ code: '???', confident: false });
  });

  it('publishes the complete standard unit catalog', () => {
    expect(STANDARD_UOM_CODES.map(({ code }) => code)).toContain('POINT');
    expect(STANDARD_UOM_CODES).toHaveLength(18);
  });
});

describe('standardiseDescription', () => {
  it.each([
    ['2 ton AC', '2 TR Split AC (Inverter 5 Star)', 'HVAC', 'Air Conditioning', 'NOS'],
    ['4 ton cassette', '4 TR Cassette AC (Inverter)', 'HVAC', 'Air Conditioning', 'NOS'],
    ['vitrified tile 600x600', 'Vitrified Tile Flooring (600x600mm)', 'Civil & Interior', 'Flooring', 'SQFT'],
    ['gypsum ceiling', 'False Ceiling - Gypsum Board (12.5mm)', 'Civil & Interior', 'False Ceiling', 'SQFT'],
    ['drywall partition', 'Gypsum Partition Wall (Single Layer 75mm)', 'Civil & Interior', 'Gypsum Partition', 'SQFT'],
    ['interior painting', 'Interior Painting - 2 Coats Acrylic Emulsion', 'Civil & Interior', 'Painting', 'SQFT'],
    ['2.5 sqmm cable', 'Electrical Cable - 2.5 SQMM (FRLS Copper)', 'Electrical', 'Electrical Cable', 'MTR'],
    ['6 sqmm cable', 'Electrical Cable - 6 SQMM (FRLS Copper)', 'Electrical', 'Electrical Cable', 'MTR'],
    ['36w led panel', 'LED Panel Light (600x600mm, 36W)', 'Electrical', 'LED Light', 'NOS'],
    ['fire extinguisher 5kg', 'ABC Fire Extinguisher (5 Kg Stored Pressure)', 'Fire Fighting', 'Fire Extinguisher', 'NOS'],
    ['cctv camera', 'IP CCTV Camera (2MP, Fixed Dome IR)', 'ELV / IT', 'CCTV Camera', 'NOS'],
  ])('normalizes %s', (raw, standardDescription, category, subcategory, suggestedUom) => {
    expect(standardiseDescription(raw)).toEqual({
      standardDescription,
      matched: true,
      category,
      subcategory,
      suggestedUom,
    });
  });

  it('preserves an unknown description after trimming and handles empty input', () => {
    expect(standardiseDescription('   ')).toEqual({ standardDescription: '', matched: false });
    expect(standardiseDescription('  Custom stonework  ')).toEqual({
      standardDescription: 'Custom stonework',
      matched: false,
    });
  });
});
