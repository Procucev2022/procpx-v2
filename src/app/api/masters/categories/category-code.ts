import type { CategoryCodeRecord } from '@app-types/app/api/masters/categories/category-code.types';
import { prisma } from '@/lib/prisma';
import { CATEGORY_CODE_LOOKUP_LIMIT_ERROR, MAX_CATEGORY_CODE_LOOKUP_RESULTS } from './route.constants';

export async function generateUniqueCategoryCode(
  tenantId: string,
  name: string,
  parentId?: string | null,
  parentCode?: string | null,
): Promise<string> {
  if (parentId && !parentCode) {
    const parent = await prisma.category.findFirst({
      where: { id: parentId, tenantId },
      select: { code: true },
    });
    parentCode = parent?.code || null;
  }

  let prefix: string;
  let baseCode: string | null = null;
  if (parentId && parentCode) {
    const words = name.replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/).filter(Boolean);
    const subPrefix = words.length >= 2
      ? words.map((word) => word[0].toUpperCase()).slice(0, 3).join('')
      : (words[0] || '').slice(0, 3).toUpperCase();
    baseCode = `${parentCode}-${subPrefix || 'SUB'}`;
    prefix = baseCode;
  } else {
    const stopWords = new Set(['AND', 'OF', 'THE', 'IN', 'FOR', 'TO']);
    const words = name
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .trim()
      .split(/\s+/)
      .map((word) => word.toUpperCase())
      .filter((word) => word.length > 0 && !stopWords.has(word));
    if (words.length >= 3) prefix = words.map((word) => word[0]).slice(0, 4).join('');
    else if (words.length === 2) prefix = `${words[0].slice(0, 2)}${words[1].slice(0, 2)}`;
    else prefix = (words[0] || '').slice(0, 3);
    if (prefix.length < 2) prefix = 'CAT';
  }

  const existingCodes: CategoryCodeRecord[] = await prisma.category.findMany({
    where: { tenantId, code: { startsWith: prefix } },
    select: { code: true },
    take: MAX_CATEGORY_CODE_LOOKUP_RESULTS + 1,
  });
  if (existingCodes.length > MAX_CATEGORY_CODE_LOOKUP_RESULTS) {
    throw new Error(CATEGORY_CODE_LOOKUP_LIMIT_ERROR);
  }
  const codeSet = new Set(existingCodes.map(({ code }) => code?.toUpperCase()).filter(Boolean));
  if (baseCode && !codeSet.has(baseCode.toUpperCase())) return baseCode;

  for (let sequence = 1; sequence < 9999; sequence += 1) {
    const candidate = `${prefix}${String(sequence).padStart(2, '0')}`;
    if (!codeSet.has(candidate.toUpperCase())) return candidate;
  }
  return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}
