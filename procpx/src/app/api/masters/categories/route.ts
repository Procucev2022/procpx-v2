// app/api/masters/categories/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';

export async function GET(req: NextRequest) {
  const ctx = await requireAuth('MASTER_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const flat = searchParams.get('flat') === 'true';

  if (flat) {
    const all = await prisma.category.findMany({
      where: { tenantId: ctx.tenantId, isActive: true },
      include: { parent: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return apiSuccess(all);
  }

  const categories = await prisma.category.findMany({
    where: { tenantId: ctx.tenantId, isActive: true },
    include: {
      parent: true,
      children: { where: { isActive: true }, orderBy: { name: 'asc' } },
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  // Return only top-level categories with their children
  return apiSuccess(categories.filter(c => !c.parentId));
}

export async function generateUniqueCategoryCode(
  tenantId: string,
  name: string,
  parentId?: string | null,
  parentCode?: string | null
): Promise<string> {
  if (parentId && !parentCode) {
    const parentRec = await prisma.category.findUnique({
      where: { id: parentId },
      select: { code: true },
    });
    if (parentRec?.code) {
      parentCode = parentRec.code;
    }
  }

  // If subcategory and parent has code
  if (parentId && parentCode) {
    const words = name.replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/).filter(Boolean);
    let subPrefix = '';
    if (words.length >= 2) {
      subPrefix = words.map(w => w[0].toUpperCase()).slice(0, 3).join('');
    } else if (words.length === 1) {
      subPrefix = words[0].slice(0, 3).toUpperCase();
    }
    if (!subPrefix) subPrefix = 'SUB';

    const baseCode = `${parentCode}-${subPrefix}`;
    const existing = await prisma.category.findFirst({
      where: { tenantId, code: baseCode, isActive: true },
    });
    if (!existing) return baseCode;

    let seq = 1;
    while (seq < 999) {
      const candidate = `${baseCode}${String(seq).padStart(2, '0')}`;
      const found = await prisma.category.findFirst({
        where: { tenantId, code: candidate, isActive: true },
      });
      if (!found) return candidate;
      seq++;
    }
    return `${baseCode}-${Date.now().toString().slice(-4)}`;
  }

  // Top-level category:
  const stopWords = new Set(['AND', 'OF', 'THE', 'IN', 'FOR', 'TO']);
  const words = name
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .map(w => w.toUpperCase())
    .filter(w => w.length > 0 && !stopWords.has(w));

  let prefix = '';
  if (words.length >= 3) {
    prefix = words.map(w => w[0]).slice(0, 4).join('');
  } else if (words.length === 2) {
    prefix = (words[0].slice(0, 2) + words[1].slice(0, 2)).toUpperCase();
  } else if (words.length === 1) {
    prefix = words[0].slice(0, 3).toUpperCase();
  }
  if (!prefix || prefix.length < 2) prefix = 'CAT';

  // Find all existing codes in this tenant starting with this prefix
  const existingCodes = await prisma.category.findMany({
    where: {
      tenantId,
      code: { startsWith: prefix },
      isActive: true,
    },
    select: { code: true },
  });

  const codeSet = new Set(existingCodes.map(c => c.code?.toUpperCase()));
  let seq = 1;
  while (seq < 9999) {
    const candidate = `${prefix}${String(seq).padStart(2, '0')}`;
    if (!codeSet.has(candidate)) {
      return candidate;
    }
    seq++;
  }
  return `${prefix}${Date.now().toString().slice(-4)}`;
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('MASTER_EDIT');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const { name, parentId, code } = body;

    if (!name?.trim()) {
      return apiError('Category name is required.', 400);
    }

    const normalizedName = name.trim();
    const normalizedCode = code?.trim() ? code.trim().toUpperCase() : null;
    const targetParentId = parentId?.trim() || null;

    let finalCode: string | null = normalizedCode;
    let parentCategory: any = null;

    // Validate parent exists if provided
    if (targetParentId) {
      parentCategory = await prisma.category.findFirst({
        where: { id: targetParentId, tenantId: ctx.tenantId, isActive: true },
      });
      if (!parentCategory) {
        return apiError('Selected parent category does not exist.', 404);
      }
    }

    // Duplicate Check 1: Name under the same parent
    const existingName = await prisma.category.findFirst({
      where: {
        tenantId: ctx.tenantId,
        name: normalizedName,
        parentId: targetParentId,
        isActive: true,
      },
    });

    if (existingName) {
      return apiError(
        targetParentId
          ? `Subcategory "${normalizedName}" already exists under the selected parent category.`
          : `Category "${normalizedName}" already exists.`,
        409
      );
    }

    // Duplicate Check 2: If code provided, check uniqueness across tenant
    if (finalCode) {
      const existingCode = await prisma.category.findFirst({
        where: {
          tenantId: ctx.tenantId,
          code: finalCode,
          isActive: true,
        },
      });

      if (existingCode) {
        return apiError(`Category code "${finalCode}" is already in use by "${existingCode.name}".`, 409);
      }
    } else {
      // Automatic category code generation (Correction 1)
      finalCode = await generateUniqueCategoryCode(
        ctx.tenantId,
        normalizedName,
        targetParentId,
        parentCategory?.code || null
      );
    }

    const category = await prisma.category.create({
      data: {
        tenantId: ctx.tenantId,
        name: normalizedName,
        parentId: targetParentId,
        code: finalCode,
        level: targetParentId ? 2 : 1,
        isActive: true,
      },
      include: {
        parent: true,
        children: true,
      },
    });

    // Audit Log
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          entityType: 'CATEGORY' as any,
          entityId: category.id,
          action: 'CREATE',
          description: `Created ${targetParentId ? 'subcategory' : 'category'} "${normalizedName}" (Code: ${normalizedCode || 'N/A'})`,
          newValue: JSON.stringify({ name: normalizedName, code: normalizedCode, parentId: targetParentId }),
        },
      });
    } catch {
      // Non-fatal audit log failure
    }

    return apiSuccess(category, 201);
  } catch (err: any) {
    return apiError(err.message || 'Failed to create category.', 500);
  }
}
