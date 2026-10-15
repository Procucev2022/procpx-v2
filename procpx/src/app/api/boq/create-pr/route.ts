// src/app/api/boq/create-pr/route.ts - Create Procurement Request (PR) from BOQ
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';

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
      return apiError('BOQ Revision ID or BOQ ID is required.', 400);
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
      return apiError('BOQ Revision not found.', 404);
    }

    const targetProjectId = projectId || revision.boq.projectId;
    const targetCostCentreId = costCentreId || revision.costCentreId || revision.boq.costCentreId;

    if (!targetCostCentreId) {
      return apiError('A valid Cost Centre is required to create a PR.', 400);
    }

    const costCentre = await prisma.costCentre.findFirst({
      where: { id: targetCostCentreId, projectId: targetProjectId, tenantId: ctx.tenantId },
    });
    if (!costCentre) {
      return apiError('Cost centre not found for this project.', 404);
    }

    // Filter lines if specific line selection was provided
    const targetLines = selectedLineIds && selectedLineIds.length > 0
      ? revision.lines.filter((l: any) => selectedLineIds.includes(l.id))
      : revision.lines;

    if (targetLines.length === 0) {
      return apiError('No valid BOQ lines available to generate PR.', 400);
    }

    // Section 9: Commercial PR Rule - block if any line has pending/blank/invalid quantity
    const missingQtyLines = targetLines.filter((l: any) => l.quantity === null || l.quantity === undefined || l.quantity <= 0);
    if (missingQtyLines.length > 0) {
      return apiError(
        `Quantity required for ${missingQtyLines.length} item${missingQtyLines.length > 1 ? 's' : ''} before creating PR.`,
        400
      );
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
        `An active Procurement Request (${existingActivePr.prNumber}) already exists for this BOQ Revision. Duplicate PR creation is prevented.`,
        409
      );
    }

    // Generate unique PR Number
    const count = await prisma.procurementRequest.count({ where: { tenantId: ctx.tenantId } });
    const prNumber = `PR-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`;

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
        description: `Procurement Request ${prNumber} created from BOQ ${revision.boq.boqCode} (${targetLines.length} lines, Value: ₹ ${totalEstimatedPRValue.toLocaleString('en-IN')})`,
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
      message: `Procurement Request ${prNumber} created with ${targetLines.length} items.`,
    }, 201);
  } catch (err: any) {
    console.error('Error creating PR from BOQ:', err);
    return apiError(err.message || 'Failed to create Procurement Request from BOQ.', 500);
  }
}
