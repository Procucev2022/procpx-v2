import { UOM_MAPPING, DESCRIPTION_RULES, STANDARD_UOM_CODES } from "./uom-standardise.constants";
export { UOM_MAPPING, STANDARD_UOM_CODES };


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
