// src/app/api/boq/create-pr/route.ts - Create Procurement Request (PR) from BOQ
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { nextRecordCode } from '@/lib/record-codes';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function POST(req: NextRequest) {
  const ctx = await requireAuth('PR_CREATE');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const {
      boqRevisionId,
      boqId,
      costCentreId,
      projectId,
      title,
      requiredDate,
      selectedLineIds,
      autoSubmit,
    } = body;

    if (!boqRevisionId && !boqId) {
      return apiError(UI_STRINGS.common.bOQRevisionIDOrBOQIDIsRequired, 400, { route: '/api/boq/create-pr', method: 'POST' });
    }

    // Resolve revision
    let revision = null;
    if (boqRevisionId) {
      revision = await prisma.boqRevision.findFirst({
        where: { id: boqRevisionId, tenantId: ctx.tenantId },
        include: {
          lines: {
            where: { isDeleted: false },
            include: { category: true, subcategory: true, uom: true },
          },
          boq: {
            include: { project: true, costCentre: true },
          },
        },
      });
    }

    if (!revision && boqId) {
      const boqRecord = await prisma.boq.findFirst({
        where: { id: boqId, tenantId: ctx.tenantId },
        include: {
          project: true,
          costCentre: true,
          revisions: {
            orderBy: { revisionNumber: 'desc' },
            take: 1,
            include: {
              lines: {
                where: { isDeleted: false },
                include: { category: true, subcategory: true, uom: true },
              },
            },
          },
        },
      });
      if (boqRecord && boqRecord.revisions.length > 0) {
        revision = {
          ...boqRecord.revisions[0],
          boq: boqRecord,
        };
      }
    }

    if (!revision) {
      return apiError(UI_STRINGS.common.bOQRevisionNotFound, 404, { route: '/api/boq/create-pr', method: 'POST' });
    }

    const targetProjectId = projectId || revision.boq.projectId;
    const targetCostCentreId = costCentreId || revision.costCentreId || revision.boq.costCentreId;

    if (!targetCostCentreId) {
      return apiError(UI_STRINGS.appApiBoqCreatePrRoute.aValidCostCentreIsRequiredToCreateAPR, 400, { route: '/api/boq/create-pr', method: 'POST' });
    }

    const costCentre = await prisma.costCentre.findFirst({
      where: { id: targetCostCentreId, projectId: targetProjectId, tenantId: ctx.tenantId },
    });
    if (!costCentre) {
      return apiError(UI_STRINGS.common.costCentreNotFoundForThisProject, 404, { route: '/api/boq/create-pr', method: 'POST' });
    }

    // Filter lines if specific line selection was provided
    const targetLines = selectedLineIds && selectedLineIds.length > 0
      ? revision.lines.filter((l: any) => selectedLineIds.includes(l.id))
      : revision.lines;

    if (targetLines.length === 0) {
      return apiError(UI_STRINGS.common.noValidBOQLinesAvailableToGeneratePR, 400, { route: '/api/boq/create-pr', method: 'POST' });
    }

    // Section 9: Commercial PR Rule - block if any line has pending/blank/invalid quantity
    const missingQtyLines = targetLines.filter((l: any) => l.quantity === null || l.quantity === undefined || l.quantity <= 0);
    if (missingQtyLines.length > 0) {
      return apiError(
        interpolateUiString(UI_STRINGS.appApiBoqCreatePrRoute.quantityRequiredForLengthItemValue2BeforeCreatingPR, { "length": missingQtyLines.length, "value2": missingQtyLines.length > 1 ? 's' : '' }),
        400, { route: '/api/boq/create-pr', method: 'POST' });
    }

    // Prevent duplicate PR creation (Correction 6)
    const existingActivePr = await prisma.procurementRequest.findFirst({
      where: {
        tenantId: ctx.tenantId,
        boqRevisionId: revision.id,
        status: { notIn: ['PR_REJECTED', 'CANCELLED'] },
      },
    });
    if (existingActivePr) {
      return apiError(
        interpolateUiString(UI_STRINGS.appApiBoqCreatePrRoute.anActiveProcurementRequestPrNumberAlreadyExistsForThisBOQRevisionDuplicatePRCreationIsPrevented, { "prNumber": existingActivePr.prNumber }),
        409, { route: '/api/boq/create-pr', method: 'POST' });
    }

    // Generate unique PR Number
    const prNumber = await nextRecordCode(prisma.procurementRequest, 'prNumber', ctx.tenantId, `PR-${new Date().getFullYear()}-`, 6);

    let totalEstimatedPRValue = 0;
    for (const l of targetLines) {
      const unitRate = l.aiUnitCost || (l as any).benchmarkRate || 100;
      const qty = l.quantity as number;
      const lineCost = l.aiTotalCost || Math.round(unitRate * qty * 100) / 100;
      totalEstimatedPRValue += lineCost;
    }

    const prTitle = title || `${revision.boq.title || revision.boq.boqCode} - Procurement Package`;
    const initialStatus = autoSubmit ? 'PR_PENDING_PROJECT_APPROVAL' : 'PR_DRAFT';

    // 1. Create Procurement Request
    const pr = await prisma.procurementRequest.create({
      data: {
        tenantId: ctx.tenantId,
        prNumber,
        projectId: targetProjectId,
        costCentreId: targetCostCentreId,
        boqId: revision.boqId,
        boqRevisionId: revision.id,
        title: prTitle,
        purpose: 'PROCUREMENT_SOURCING',
        totalEstimatedValue: Math.round(totalEstimatedPRValue * 100) / 100,
        totalLines: targetLines.length,
        status: initialStatus,
        requestedBy: ctx.userId,
        requestedDate: new Date(),
        requiredDate: requiredDate ? new Date(requiredDate) : new Date(Date.now() + 30 * 86400000),
      },
    });

    // 2. Create PR Lines with end-to-end line item traceability
    for (const l of targetLines) {
      const unitRate = l.aiUnitCost || (l as any).benchmarkRate || 100;
      const qty = l.quantity as number;
      const lineVal = l.aiTotalCost || Math.round(unitRate * qty * 100) / 100;

      await prisma.pRLine.create({
        data: {
          tenantId: ctx.tenantId,
          prId: pr.id,
          projectId: targetProjectId,
          costCentreId: targetCostCentreId,
          boqId: revision.boqId,
          boqRevisionId: revision.id,
          boqLineId: l.id,
          lineNumber: l.lineNumber || '1',
          itemDescription: l.standardDescription || l.originalDescription || 'Line Item',
          specification: l.specification || null,
          category: l.category?.name || 'General',
          subcategory: l.subcategory?.name || null,
          uom: l.uom?.code || l.uomRaw || 'NOS',
          quantity: qty,
          estimatedRate: unitRate,
          estimatedValue: lineVal,
          drawingReference: l.drawingReference || null,
          costCentre: costCentre.code,
        },
      });
    }

    // 3. Update BOQ Revision & BOQ
    const newPrStatus = autoSubmit ? 'PR_PENDING_PROJECT_APPROVAL' : 'PR_DRAFT';
    await prisma.boqRevision.update({
      where: { id: revision.id },
      data: {
        prStatus: newPrStatus,
      },
    });

    await prisma.boq.update({
      where: { id: revision.boqId },
      data: {
        costCentreId: targetCostCentreId,
        purpose: 'PR',
      },
    });

    // 4. Audit Log
    await prisma.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        projectId: targetProjectId,
        entityType: 'PR',
        entityId: pr.id,
        action: 'PR_CREATED_FROM_BOQ',
        description: interpolateUiString(UI_STRINGS.appApiBoqCreatePrRoute.procurementRequestPrNumberCreatedFromBOQBoqCodeLengthLinesValueToLocaleString, { "prNumber": prNumber, "boqCode": revision.boq.boqCode, "length": targetLines.length, "toLocaleString": totalEstimatedPRValue.toLocaleString(I18N_CONFIG.defaultLocale) }),
        newValue: JSON.stringify({
          prNumber,
          boqCode: revision.boq.boqCode,
          revisionCode: revision.revisionCode,
          totalLines: targetLines.length,
          totalEstimatedPRValue,
          status: initialStatus,
        }),
      },
    });

    return apiSuccess({
      success: true,
      prId: pr.id,
      prNumber: pr.prNumber,
      totalLines: targetLines.length,
      totalValue: totalEstimatedPRValue,
      status: initialStatus,
      message: interpolateUiString(UI_STRINGS.appApiBoqCreatePrRoute.procurementRequestPrNumberCreatedWithLengthItems, { "prNumber": prNumber, "length": targetLines.length }),
    }, 201);
  } catch (err: any) {
    console.error('Error creating PR from BOQ:', err);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.failedToCreateProcurementRequestFromBoq }), 500, { route: '/api/boq/create-pr', method: 'POST', error: err });
  }
}
