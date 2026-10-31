// src/app/api/boq/duplicate/route.ts - Duplicate BOQ Record and Lines
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BOQ_CREATE');
  if (!isApiContext(ctx)) return ctx;

  try {
    const { boqId } = await req.json();
    if (!boqId) return apiError(UI_STRINGS.appApiBoqDuplicateRoute.boqIdIsRequired, 400);

    const sourceBoq = await prisma.boq.findFirst({
      where: { id: boqId, tenantId: ctx.tenantId },
      include: {
        project: true,
        costCentre: true,
        revisions: {
          orderBy: { revisionNumber: 'desc' },
          take: 1,
          include: { lines: true },
        },
      },
    });

    if (!sourceBoq) return apiError(UI_STRINGS.appApiBoqDuplicateRoute.sourceBOQNotFound, 404);

    const count = await prisma.boq.count({
      where: { tenantId: ctx.tenantId, projectId: sourceBoq.projectId },
    });
    const newBoqCode = `BOQ-${sourceBoq.project.projectCode}-${String(count + 1).padStart(3, '0')}`;

    // Create cloned BOQ record
    const newBoq = await prisma.boq.create({
      data: {
        tenantId: ctx.tenantId,
        projectId: sourceBoq.projectId,
        costCentreId: sourceBoq.costCentreId,
        boqCode: newBoqCode,
        title: interpolateUiString(UI_STRINGS.appApiBoqDuplicateRoute.value1Copy, { "value1": sourceBoq.title || sourceBoq.boqCode }),
        category: sourceBoq.category,
        scope: sourceBoq.scope,
        purpose: sourceBoq.purpose,
        status: 'DRAFT',
        createdBy: ctx.userEmail || ctx.userId,
      },
    });

    const sourceRev = sourceBoq.revisions[0];

    // Create cloned R0 revision
    const newRevision = await prisma.boqRevision.create({
      data: {
        tenantId: ctx.tenantId,
        boqId: newBoq.id,
        costCentreId: sourceBoq.costCentreId,
        revisionNumber: 0,
        revisionCode: 'R0',
        status: 'DRAFT',
        preparationStatus: 'DRAFT',
        budgetStatus: sourceBoq.purpose === 'BUDGET' ? 'BUDGET_DRAFT' : 'NOT_ADDED_TO_BUDGET',
        prStatus: sourceBoq.purpose === 'PR' ? 'PR_DRAFT' : 'PR_NOT_CREATED',
        sourceType: sourceRev?.sourceType || 'MANUAL',
        notes: sourceRev?.notes || null,
        createdById: ctx.userId,
      },
    });

    // Clone lines if any exist
    if (sourceRev && sourceRev.lines && sourceRev.lines.length > 0) {
      for (const line of sourceRev.lines) {
        await prisma.boqLine.create({
          data: {
            tenantId: ctx.tenantId,
            boqRevisionId: newRevision.id,
            lineNumber: line.lineNumber,
            itemCode: line.itemCode,
            originalDescription: line.originalDescription,
            standardDescription: line.standardDescription,
            specification: line.specification,
            categoryId: line.categoryId,
            subcategoryId: line.subcategoryId,
            uomId: line.uomId,
            uomRaw: line.uomRaw,
            quantity: line.quantity,
            location: line.location,
            drawingReference: line.drawingReference,
            brand: line.brand,
            model: line.model,
            material: line.material,
            grade: line.grade,
            aiSuggestedDescription: line.aiSuggestedDescription,
            aiSuggestedSpec: line.aiSuggestedSpec,
            aiConfidence: line.aiConfidence,
            aiUnitCost: line.aiUnitCost,
            aiTotalCost: line.aiTotalCost,
            costConfidence: line.costConfidence,
            costSource: line.costSource,
            costMethod: line.costMethod,
            remarks: line.remarks,
          },
        });
      }

      await prisma.boqRevision.update({
        where: { id: newRevision.id },
        data: {
          totalLines: sourceRev.lines.length,
          validLines: sourceRev.validLines,
        },
      });
    }

    // Audit Log
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          projectId: sourceBoq.projectId,
          entityType: 'BOQ',
          entityId: newBoq.id,
          action: 'BOQ_DUPLICATED',
          description: interpolateUiString(UI_STRINGS.appApiBoqDuplicateRoute.duplicatedBOQBoqCodeIntoBoqCode2Title, { "boqCode": sourceBoq.boqCode, "boqCode2": newBoq.boqCode, "title": newBoq.title }),
          newValue: JSON.stringify({
            sourceBoqCode: sourceBoq.boqCode,
            newBoqCode: newBoq.boqCode,
            timestamp: new Date().toISOString(),
          }),
        },
      });
    } catch (e) {
      console.warn(e);
    }

    return apiSuccess({
      success: true,
      boq: newBoq,
      boqId: newBoq.id,
      boqCode: newBoq.boqCode,
      message: interpolateUiString(UI_STRINGS.appApiBoqDuplicateRoute.bOQSuccessfullyDuplicatedAsBoqCode, { "boqCode": newBoq.boqCode }),
    }, 201);
  } catch (err: any) {
    console.error('Duplicate BOQ error:', err);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.failedToDuplicateBoq }), 500);
  }
}
