// lib/uom-standardise.ts - UOM and Description normalisation rules
// Deterministic mapping of raw UOM strings and descriptions to standard catalog values

export const UOM_MAPPING: Record<string, string> = {
  // Count / Each
  nos: 'NOS', no: 'NOS', 'no.': 'NOS', 'nos.': 'NOS', number: 'NOS', each: 'NOS', ea: 'NOS',
  unit: 'NOS', units: 'NOS', pcs: 'NOS', pc: 'NOS', piece: 'NOS', pieces: 'NOS',
  item: 'NOS', items: 'NOS', set: 'NOS', sets: 'NOS',

  // Area
  sqft: 'SQFT', 'sq ft': 'SQFT', 'sq. ft': 'SQFT', 'sq. ft.': 'SQFT', sqf: 'SQFT', sf: 'SQFT',
  'square feet': 'SQFT', 'square foot': 'SQFT', 'sq feet': 'SQFT', 'sq foot': 'SQFT',
  sqm: 'SQM', 'sq m': 'SQM', 'sq. m': 'SQM', 'sq. mtr': 'SQM', sqmtr: 'SQM',
  'square meter': 'SQM', 'square meters': 'SQM', 'square metre': 'SQM', 'square metres': 'SQM',
  'm2': 'SQM', 'ft2': 'SQFT',

  // Length
  rmt: 'RMT', rm: 'RMT', 'r.m': 'RMT', 'running mtr': 'RMT', 'running meter': 'RMT',
  mtr: 'MTR', m: 'MTR', meter: 'MTR', meters: 'MTR', metre: 'MTR', metres: 'MTR',
  rft: 'RFT', 'r.ft': 'RFT', 'running ft': 'RFT', 'running feet': 'RFT',
  ft: 'FT', feet: 'FT', foot: 'FT',

  // Volume
  cum: 'CUM', 'cu m': 'CUM', 'cu. m': 'CUM', cbm: 'CUM', m3: 'CUM',
  litre: 'LTR', ltr: 'LTR', liters: 'LTR', litres: 'LTR', l: 'LTR',

  // Weight
  kg: 'KG', kgs: 'KG', 'kg.': 'KG', kilogram: 'KG', kilograms: 'KG',
  ton: 'TON', tons: 'TON', tonne: 'TON', mt: 'MT',

  // Electrical
  kva: 'KVA', kw: 'KW', kwh: 'KWH',

  // Lump sum
  ls: 'LS', 'l.s': 'LS', 'lump sum': 'LS', lumpsum: 'LS',

  // Point / Port
  point: 'POINT', points: 'POINT', port: 'POINT',

  // Others
  lot: 'LOT', lots: 'LOT',
};

export function standardiseUom(raw: string): { code: string; confident: boolean } {
  if (!raw) return { code: '', confident: false };
  const normalised = raw.trim().toLowerCase();
  const code = UOM_MAPPING[normalised];
  if (code) return { code, confident: true };
  // Try clean exact match without punctuation
  const clean = normalised.replace(/[^a-z0-9]/g, '');
  for (const [key, val] of Object.entries(UOM_MAPPING)) {
    if (clean === key.replace(/[^a-z0-9]/g, '')) return { code: val, confident: true };
  }
  // Try substring match
  for (const [key, val] of Object.entries(UOM_MAPPING)) {
    if (normalised.includes(key)) return { code: val, confident: false };
  }
  return { code: raw.trim().toUpperCase(), confident: false };
}

// Deterministic description standardisation mapping
// Standardises variations without overwriting originalDescription
const DESCRIPTION_RULES: Array<{ pattern: RegExp; standard: string; category?: string; subcategory?: string; uom?: string }> = [
  {
    pattern: /^(ac\s*2\s*ton|2\s*ton\s*ac|2t\s*split\s*ac|2\s*tr\s*split\s*ac|split\s*ac\s*2\s*ton)$/i,
    standard: '2 TR Split AC (Inverter 5 Star)',
    category: 'HVAC',
    subcategory: 'Air Conditioning',
    uom: 'NOS',
  },
  {
    pattern: /^(4\s*tr\s*cassette\s*ac|4\s*ton\s*cassette|cassette\s*ac\s*4\s*ton)$/i,
    standard: '4 TR Cassette AC (Inverter)',
    category: 'HVAC',
    subcategory: 'Air Conditioning',
    uom: 'NOS',
  },
  {
    pattern: /^(vitrified\s*tile.*600x600|600x600\s*vitrified|tile\s*vitrified\s*600)$/i,
    standard: 'Vitrified Tile Flooring (600x600mm)',
    category: 'Civil & Interior',
    subcategory: 'Flooring',
    uom: 'SQFT',
  },
  {
    pattern: /^(gypsum\s*false\s*ceiling|false\s*ceiling\s*gypsum|gypsum\s*ceiling)$/i,
    standard: 'False Ceiling - Gypsum Board (12.5mm)',
    category: 'Civil & Interior',
    subcategory: 'False Ceiling',
    uom: 'SQFT',
  },
  {
    pattern: /^(gypsum\s*partition.*|drywall\s*partition)$/i,
    standard: 'Gypsum Partition Wall (Single Layer 75mm)',
    category: 'Civil & Interior',
    subcategory: 'Gypsum Partition',
    uom: 'SQFT',
  },
  {
    pattern: /^(interior\s*painting|acrylic\s*emulsion\s*paint|painting\s*2\s*coats)$/i,
    standard: 'Interior Painting - 2 Coats Acrylic Emulsion',
    category: 'Civil & Interior',
    subcategory: 'Painting',
    uom: 'SQFT',
  },
  {
    pattern: /^(electrical\s*cable\s*2\.5|2\.5\s*sqmm\s*cable|2\.5\s*sqmm\s*frls)$/i,
    standard: 'Electrical Cable - 2.5 SQMM (FRLS Copper)',
    category: 'Electrical',
    subcategory: 'Electrical Cable',
    uom: 'MTR',
  },
  {
    pattern: /^(electrical\s*cable\s*6|6\s*sqmm\s*cable|6\s*sqmm\s*frls)$/i,
    standard: 'Electrical Cable - 6 SQMM (FRLS Copper)',
    category: 'Electrical',
    subcategory: 'Electrical Cable',
    uom: 'MTR',
  },
  {
    pattern: /^(led\s*panel\s*light\s*600x600|600x600\s*led\s*panel|36w\s*led\s*panel)$/i,
    standard: 'LED Panel Light (600x600mm, 36W)',
    category: 'Electrical',
    subcategory: 'LED Light',
    uom: 'NOS',
  },
  {
    pattern: /^(abc\s*fire\s*extinguisher|fire\s*extinguisher\s*5kg|5\s*kg\s*abc\s*extinguisher)$/i,
    standard: 'ABC Fire Extinguisher (5 Kg Stored Pressure)',
    category: 'Fire Fighting',
    subcategory: 'Fire Extinguisher',
    uom: 'NOS',
  },
  {
    pattern: /^(cctv\s*camera|ip\s*cctv.*2mp|dome\s*camera\s*2mp)$/i,
    standard: 'IP CCTV Camera (2MP, Fixed Dome IR)',
    category: 'ELV / IT',
    subcategory: 'CCTV Camera',
    uom: 'NOS',
  },
];

export function standardiseDescription(raw: string): {
  standardDescription: string;
  matched: boolean;
  category?: string;
  subcategory?: string;
  suggestedUom?: string;
} {
  if (!raw) return { standardDescription: '', matched: false };
  const trimmed = raw.trim();

  for (const rule of DESCRIPTION_RULES) {
    if (rule.pattern.test(trimmed)) {
      return {
        standardDescription: rule.standard,
        matched: true,
        category: rule.category,
        subcategory: rule.subcategory,
        suggestedUom: rule.uom,
      };
    }
  }

  return {
    standardDescription: trimmed,
    matched: false,
  };
}

export const STANDARD_UOM_CODES = [
  { code: 'NOS', name: 'Numbers', category: 'COUNT' },
  { code: 'SQFT', name: 'Square Feet', category: 'AREA' },
  { code: 'SQM', name: 'Square Metres', category: 'AREA' },
  { code: 'RMT', name: 'Running Metres', category: 'LENGTH' },
  { code: 'RFT', name: 'Running Feet', category: 'LENGTH' },
  { code: 'MTR', name: 'Metres', category: 'LENGTH' },
  { code: 'FT', name: 'Feet', category: 'LENGTH' },
  { code: 'CUM', name: 'Cubic Metres', category: 'VOLUME' },
  { code: 'LTR', name: 'Litres', category: 'VOLUME' },
  { code: 'KG', name: 'Kilograms', category: 'WEIGHT' },
  { code: 'TON', name: 'Tons', category: 'WEIGHT' },
  { code: 'MT', name: 'Metric Tonnes', category: 'WEIGHT' },
  { code: 'KVA', name: 'Kilovolt-ampere', category: 'ELECTRICAL' },
  { code: 'KW', name: 'Kilowatt', category: 'ELECTRICAL' },
  { code: 'KWH', name: 'Kilowatt-hour', category: 'ELECTRICAL' },
  { code: 'LS', name: 'Lump Sum', category: 'OTHER' },
  { code: 'LOT', name: 'Lot', category: 'OTHER' },
  { code: 'POINT', name: 'Point', category: 'OTHER' },
];
