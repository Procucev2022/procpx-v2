// app/api/boq/[revisionId]/standardise/route.ts
// Standardise descriptions and UOMs without overwriting originalDescription
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { standardiseDescription, standardiseUom } from '@/lib/uom-standardise';
import { validateBoqLine, computeQualityScore } from '@/lib/boq-validate';
import { createAuditLog } from '@/lib/audit';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function POST(_req: NextRequest, { params }: { params: Promise<{ revisionId: string }> }) {
  const ctx = await requireAuth('BOQ_EDIT');
  if (!isApiContext(ctx)) return ctx;
  const { revisionId } = await params;

  const revision = await prisma.boqRevision.findFirst({
    where: { id: revisionId, tenantId: ctx.tenantId },
    include: {
      lines: { where: { isDeleted: false } },
      boq: true,
    },
  });

  if (!revision) return apiError(UI_STRINGS.common.revisionNotFound, 404);
  if (revision.status === 'APPROVED') {
    return apiError(UI_STRINGS.appApiBoqRevisionIdStandardiseRoute.approvedBOQsAreImmutableAndCannotBeStandardisedCreateANewRevision, 400);
  }

  // Load masters for tenant
  const [uoms, categories] = await Promise.all([
    prisma.uomMaster.findMany({ where: { tenantId: ctx.tenantId, isActive: true } }),
    prisma.category.findMany({
      where: { tenantId: ctx.tenantId, isActive: true },
      include: { children: true },
    }),
  ]);

  let standardisedCount = 0;
  let uomNormalisedCount = 0;

  for (const line of revision.lines) {
    let changed = false;
    let newStdDesc = line.standardDescription;
    let newUomId = line.uomId;
    let newCategoryId = line.categoryId;
    let newSubcategoryId = line.subcategoryId;

    // Standardise description
    const descResult = standardiseDescription(line.originalDescription);
    if (descResult.matched && descResult.standardDescription !== line.standardDescription) {
      newStdDesc = descResult.standardDescription;
      standardisedCount++;
      changed = true;
    }

    // Standardise UOM
    const rawUom = line.uomRaw || '';
    if (rawUom) {
      const uomRes = standardiseUom(rawUom);
      const matched = uoms.find(u => u.code === uomRes.code);
      if (matched && matched.id !== line.uomId) {
        newUomId = matched.id;
        uomNormalisedCount++;
        changed = true;
      }
    }

    // Auto-map category if matched and missing
    if (!newCategoryId && descResult.category) {
      const cat = categories.find(c => c.name.toLowerCase() === descResult.category?.toLowerCase());
      if (cat) {
        newCategoryId = cat.id;
        changed = true;
        if (descResult.subcategory) {
          const sub = cat.children.find(s => s.name.toLowerCase() === descResult.subcategory?.toLowerCase());
          if (sub) newSubcategoryId = sub.id;
        }
      }
    }

    if (changed || !line.standardDescription) {
      const validation = validateBoqLine({
        originalDescription: line.originalDescription,
        standardDescription: newStdDesc ?? line.originalDescription,
        uomRaw: line.uomRaw ?? undefined,
        uomId: newUomId ?? undefined,
        quantity: line.quantity,
        categoryId: newCategoryId ?? undefined,
        lineNumber: line.lineNumber,
      });

      await prisma.boqLine.update({
        where: { id: line.id },
        data: {
          standardDescription: newStdDesc ?? line.originalDescription,
          uomId: newUomId,
          categoryId: newCategoryId,
          subcategoryId: newSubcategoryId,
          validationStatus: validation.status,
          validationMessages: JSON.stringify(validation.messages),
          updatedAt: new Date(),
        },
      });
    }
  }

  // Refresh lines and re-score revision
  const refreshedLines = await prisma.boqLine.findMany({
    where: { boqRevisionId: revisionId, isDeleted: false },
  });

  const validCount = refreshedLines.filter(l => l.validationStatus === 'VALID').length;
  const errorCount = refreshedLines.filter(l => l.validationStatus === 'ERROR').length;
  const warnCount = refreshedLines.filter(l => l.validationStatus === 'WARNING').length;
  const qualityScore = computeQualityScore(refreshedLines.map(l => ({
    originalDescription: l.originalDescription,
    standardDescription: l.standardDescription ?? undefined,
    uomRaw: l.uomRaw ?? undefined,
    uomId: l.uomId ?? undefined,
    quantity: l.quantity,
    categoryId: l.categoryId ?? undefined,
  })));

  await prisma.boqRevision.update({
    where: { id: revisionId },
    data: {
      validLines: validCount,
      errorLines: errorCount,
      warningLines: warnCount,
      qualityScore,
    },
  });

  await createAuditLog({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    projectId: revision.boq.projectId,
    entityType: 'BOQ_REVISION',
    entityId: revisionId,
    action: 'STANDARDISE',
    description: interpolateUiString(UI_STRINGS.appApiBoqRevisionIdStandardiseRoute.bOQRevisionRevisionCodeStandardisedStandardisedCountDescriptionsStandardisedUomNormalisedCountUOMsNormalized, { "revisionCode": revision.revisionCode, "standardisedCount": standardisedCount, "uomNormalisedCount": uomNormalisedCount }),
    newValue: { standardisedCount, uomNormalisedCount, qualityScore },
  });

  return apiSuccess({
    message: interpolateUiString(UI_STRINGS.appApiBoqRevisionIdStandardiseRoute.standardisationCompleteStandardisedCountDescriptionsMatchedCatalogUomNormalisedCountUOMsNormalized, { "standardisedCount": standardisedCount, "uomNormalisedCount": uomNormalisedCount }),
    standardisedCount,
    uomNormalisedCount,
    totalLines: refreshedLines.length,
    validLines: validCount,
    errorLines: errorCount,
    warningLines: warnCount,
    qualityScore,
  });
}
