/** Rows a record-code lookup returns when codes up to `highest` already exist for the prefix. */
export function existingCodes(field: string, prefix: string, width: number, highest: number) {
  return highest > 0 ? [{ [field]: `${prefix}${String(highest).padStart(width, '0')}` }] : [];
}

export const currentYear = new Date().getFullYear();
