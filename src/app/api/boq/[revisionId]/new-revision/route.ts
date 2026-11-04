// app/api/boq/[revisionId]/new-revision/route.ts
// Create a new draft revision from an approved revision
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { createNextBoqRevision } from '@/lib/boq-revision-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function POST(_req: NextRequest, { params }: { params: Promise<{ revisionId: string }> }) {
  const ctx = await requireAuth('BOQ_REVISION_CREATE');
  if (!isApiContext(ctx)) return ctx;
  const { revisionId } = await params;

  const sourceRevision = await prisma.boqRevision.findFirst({
    where: { id: revisionId, tenantId: ctx.tenantId },
    include: { lines: { where: { isDeleted: false } } },
  });
  if (!sourceRevision) return apiError(UI_STRINGS.common.revisionNotFound, 404, { route: '/api/boq/[revisionId]/new-revision', method: 'POST' });
  if (sourceRevision.status !== 'APPROVED') {
    return apiError(UI_STRINGS.appApiBoqRevisionIdNewRevisionRoute.newRevisionsCanOnlyBeCreatedFromAnApprovedRevision);
  }

  // Create new sequential revision with atomic concurrency handling
  const newRevision = await createNextBoqRevision({
    boqId: sourceRevision.boqId,
    tenantId: ctx.tenantId,
    costCentreId: sourceRevision.costCentreId,
    status: 'DRAFT',
    createdById: ctx.userId,
    totalLines: sourceRevision.totalLines,
    validLines: sourceRevision.validLines,
    errorLines: 0,
    warningLines: sourceRevision.warningLines,
    qualityScore: sourceRevision.qualityScore,
    notes: `Created from ${sourceRevision.revisionCode}`,
  });
  const newRevCode = newRevision.revisionCode;

  // Copy all lines from approved revision
  if (sourceRevision.lines.length > 0) {
    await prisma.boqLine.createMany({
      data: sourceRevision.lines.map(l => ({
        tenantId: ctx.tenantId,
        boqRevisionId: newRevision.id,
        lineNumber: l.lineNumber,
        originalDescription: l.originalDescription,
        standardDescription: l.standardDescription,
        specification: l.specification ?? undefined,
        categoryId: l.categoryId ?? undefined,
        subcategoryId: l.subcategoryId ?? undefined,
        uomId: l.uomId ?? undefined,
        uomRaw: l.uomRaw ?? undefined,
        quantity: l.quantity,
        location: l.location ?? undefined,
        drawingReference: l.drawingReference ?? undefined,
        brand: l.brand ?? undefined,
        model: l.model ?? undefined,
        material: l.material ?? undefined,
        grade: l.grade ?? undefined,
        remarks: l.remarks ?? undefined,
        itemCode: l.itemCode ?? undefined,
        validationStatus: l.validationStatus,
        validationMessages: l.validationMessages ?? undefined,
        benchmarkEligible: l.benchmarkEligible,
      })),
    });
  }

  await createAuditLog({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    entityType: 'BOQ_REVISION',
    entityId: newRevision.id,
    action: 'CREATE',
    description: interpolateUiString(UI_STRINGS.appApiBoqRevisionIdNewRevisionRoute.newBOQRevisionNewRevCodeCreatedFromApprovedRevisionCode, { "newRevCode": newRevCode, "revisionCode": sourceRevision.revisionCode }),
    newValue: { revisionCode: newRevCode, sourceRevision: sourceRevision.revisionCode, lines: sourceRevision.lines.length },
  });

  return apiSuccess({ revisionId: newRevision.id, revisionCode: newRevCode, copiedLines: sourceRevision.lines.length }, 201);
}
