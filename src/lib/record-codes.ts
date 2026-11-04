// lib/record-codes.ts - Sequential record numbers (PR-2026-000001, BOQ-000001, ...)
// Numbers continue from the highest existing code with the same prefix. Counting
// rows instead reissues an existing number after any deletion and whenever older
// codes used a different width, and the create then fails on the unique index.
import type { CodeLookupDelegate } from '@app-types/lib/record-codes.types';

/** Returns prefix + (highest numeric suffix among codes + 1), zero-padded to width. */
export function formatNextCode(prefix: string, width: number, codes: Array<string | null | undefined>): string {
  let highest = 0;
  for (const code of codes) {
    if (!code?.startsWith(prefix)) continue;
    const suffix = code.slice(prefix.length);
    if (!/^\d+$/.test(suffix)) continue;
    highest = Math.max(highest, Number(suffix));
  }
  return `${prefix}${String(highest + 1).padStart(width, '0')}`;
}

/** Reads the tenant's existing codes for this prefix and returns the next free one. */
export async function nextRecordCode(
  delegate: CodeLookupDelegate,
  field: string,
  tenantId: string,
  prefix: string,
  width: number,
): Promise<string> {
  const rows = await delegate.findMany({
    where: { tenantId, [field]: { startsWith: prefix } },
    select: { [field]: true },
  });
  return formatNextCode(prefix, width, rows.map((row) => row[field] as string | null | undefined));
}
