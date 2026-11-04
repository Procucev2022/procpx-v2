// src/app/api/boq/standard/generate/route.ts - Generates Draft BOQ from validated Standard BOQ upload
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { nextRecordCode } from '@/lib/record-codes';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createNextBoqRevision } from '@/lib/boq-revision-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BOQ_EDIT');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const {
      projectId,
      costCentreId,
      sector,
      projectType,
      validLines,
      fileName,
      boqId,
      title,
      description,
      purpose,
      category,
      areaSqFt,
      scope,
    } = body;

    if (!projectId) {
      return apiError(UI_STRINGS.common.projectIDIsRequired, 400, { route: '/api/boq/standard/generate', method: 'POST' });
    }
    if (!validLines || !Array.isArray(validLines) || validLines.length === 0) {
      return apiError(UI_STRINGS.appApiBoqStandardGenerateRoute.noValidLineItemsToGenerateBOQFrom, 400, { route: '/api/boq/standard/generate', method: 'POST' });
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId: ctx.tenantId },
    });
    if (!project) return apiError(UI_STRINGS.common.projectNotFound2, 404, { route: '/api/boq/standard/generate', method: 'POST' });

    // Verify Cost Centre if provided
    let costCentre = null;
    if (costCentreId) {
      costCentre = await prisma.costCentre.findFirst({
        where: { id: costCentreId, projectId, tenantId: ctx.tenantId },
      });
    }

    const derivedCategory = category || validLines[0]?.category || 'General';
    const derivedTitle = title?.trim() || (derivedCategory ? `${derivedCategory} — ${project.name}` : `${project.name} BOQ`);
    const derivedPurpose = purpose || 'BUDGET';
    const derivedDescription = (description || scope || '')?.trim() || null;

    // Reuse existing BOQ if boqId provided, else create new
    let boq = null;
    if (boqId) {
      boq = await prisma.boq.findFirst({
        where: { id: boqId, tenantId: ctx.tenantId },
        include: { revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 } },
      });
      if (boq) {
        boq = await prisma.boq.update({
          where: { id: boq.id },
          data: {
            title: interpolateUiString(UI_STRINGS.common.value1, { "value1": title?.trim() || boq.title || derivedTitle }),
            description: interpolateUiString(UI_STRINGS.common.value1, { "value1": derivedDescription || boq.description }),
            purpose: purpose || boq.purpose || derivedPurpose,
            category: derivedCategory || boq.category,
            costCentreId: costCentreId || boq.costCentreId,
            scope: scope || boq.scope,
          },
          include: { revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 } },
        });
      }
    }

    if (!boq) {
      const boqCode = await nextRecordCode(prisma.boq, 'boqCode', ctx.tenantId, `BOQ-`, 6);
      boq = await prisma.boq.create({
        data: {
          tenantId: ctx.tenantId,
          projectId,
          costCentreId: costCentreId || null,
          boqCode,
          title: derivedTitle,
          description: derivedDescription,
          purpose: derivedPurpose,
          category: derivedCategory,
          scope: scope || null,
          status: 'DRAFT',
          createdBy: ctx.userId,
        },
        include: { revisions: true },
      });
    }

    // Check if initial revision R0 already exists with 0 lines
    let boqRevision = boq.revisions && boq.revisions.length > 0 && (boq.revisions[0].totalLines || 0) === 0
      ? boq.revisions[0]
      : null;

    const pendingQtyLines = validLines.filter((l: any) => l.quantity === null || l.quantity === undefined || l.quantity === '').length;
    const validQtyLines = validLines.length - pendingQtyLines;
    const revisionScore = validLines.length > 0 ? Math.round((validQtyLines / validLines.length) * 100) : 100;

    if (boqRevision) {
      boqRevision = await prisma.boqRevision.update({
        where: { id: boqRevision.id },
        data: {
          costCentreId: costCentreId || boq.costCentreId || null,
          status: 'DRAFT',
          preparationStatus: 'STANDARDISED',
          sourceType: 'STANDARD_BOQ_DOWNLOAD_UPLOAD',
          sourceReference: fileName ? `Uploaded: ${fileName}` : 'Standard BOQ Download & Upload',
          notes: `Generated via Standard BOQ Download → Fill → Upload (${sector || project.sector} - ${projectType || 'Standard'}) with ${validLines.length} items (${pendingQtyLines} require quantity)`,
          totalLines: validLines.length,
          validLines: validQtyLines,
          warningLines: pendingQtyLines,
          errorLines: 0,
          qualityScore: revisionScore,
          uploadedAt: new Date(),
        },
      });
    } else {
      boqRevision = await createNextBoqRevision({
        tenantId: ctx.tenantId,
        boqId: boq.id,
        costCentreId: costCentreId || boq.costCentreId || null,
        status: 'DRAFT',
        preparationStatus: 'STANDARDISED',
        budgetStatus: boq.purpose === 'BUDGET' ? 'BUDGET_DRAFT' : 'NOT_ADDED_TO_BUDGET',
        prStatus: boq.purpose === 'PR' ? 'PR_DRAFT' : 'PR_NOT_CREATED',
        sourceType: 'STANDARD_BOQ_DOWNLOAD_UPLOAD',
        sourceReference: fileName ? `Uploaded: ${fileName}` : 'Standard BOQ Download & Upload',
        notes: `Generated via Standard BOQ Download → Fill → Upload (${sector || project.sector} - ${projectType || 'Standard'}) with ${validLines.length} items (${pendingQtyLines} require quantity)`,
        totalLines: validLines.length,
        validLines: validQtyLines,
        warningLines: pendingQtyLines,
        errorLines: 0,
        qualityScore: revisionScore,
        createdById: ctx.userId,
        uploadedAt: new Date(),
      });
    }

    // Lookup Category and UOM tables for relational linkage
    const categories = await prisma.category.findMany({ where: { tenantId: ctx.tenantId } });
    const uoms = await prisma.uomMaster.findMany({ where: { tenantId: ctx.tenantId } });

    const catMap = new Map(categories.map(c => [c.name.toLowerCase(), c]));
    const uomMap = new Map(uoms.map(u => [u.code.toUpperCase(), u]));

    for (let i = 0; i < validLines.length; i++) {
      const l = validLines[i];
      const matchedCategory = catMap.get((l.category || '').toLowerCase());
      const matchedUom = uomMap.get((l.uom || '').toUpperCase());

      // PROCPX COMMERCIAL BOQ RULE: Blank quantity is null, NEVER 1
      const rawQty = l.quantity;
      const isBlank = rawQty === null || rawQty === undefined || rawQty === '' || isNaN(parseFloat(rawQty));
      const qty = isBlank ? null : parseFloat(rawQty);
      const benchmarkRate = l.benchmarkRate ? parseFloat(l.benchmarkRate) : null;
      // Section 6: AI Cost must NOT generate a commercial total for a line whose quantity is blank
      const totalCost = (benchmarkRate !== null && qty !== null && qty > 0) ? Math.round(benchmarkRate * qty * 100) / 100 : null;
      const validationStatus = qty === null ? 'QUANTITY_REQUIRED' : (qty <= 0 ? 'WARNING' : (l.validationStatus || 'VALID'));

      await prisma.boqLine.create({
        data: {
          tenantId: ctx.tenantId,
          boqRevisionId: boqRevision.id,
          lineNumber: String(i + 1),
          itemCode: l.itemCode || `STD-L${i + 1}`,
          originalDescription: l.originalDescription || l.description || l.itemDescription || 'Standard Item',
          standardDescription: l.standardDescription || l.description || l.itemDescription || 'Standard Item',
          specification: l.specification || l.description || l.itemDescription || '',
          aiSuggestedDescription: l.aiSuggestedDescription || l.description || l.itemDescription || 'Standard Item',
          aiConfidence: 0.95,
          aiUnitCost: benchmarkRate,
          aiTotalCost: totalCost,
          costConfidence: 0.92,
          costSource: 'Standard Catalogue Benchmark',
          costMethod: 'WEIGHTED_MEDIAN',
          categoryId: matchedCategory?.id || null,
          subcategoryId: null,
          uomId: matchedUom?.id || null,
          uomRaw: l.uom || 'NOS',
          quantity: qty,
          brand: l.brand || null,
          model: l.model || null,
          location: l.areaZone || null,
          drawingReference: l.drawingReference || null,
          remarks: l.remarks || null,
          validationStatus,
          validationMessages: JSON.stringify(qty === null ? [{ level: 'WARNING', code: 'QUANTITY_REQUIRED', message: UI_STRINGS.common.quantityIsRequiredBeforeBudgetingOrPR }] : []),
          benchmarkEligible: true,
        },
      });
    }

    // Audit Log
    await prisma.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        projectId,
        entityType: 'BOQ',
        entityId: boq.id,
        action: 'BOQ_GENERATED_FROM_STANDARD_DOWNLOAD_UPLOAD',
        description: interpolateUiString(UI_STRINGS.appApiBoqStandardGenerateRoute.draftBOQBoqCodeGeneratedFromCompletedStandardBOQUploadLengthLinesCostCentreValue3, { "boqCode": boq.boqCode, "length": validLines.length, "value3": costCentre?.code || UI_STRINGS.common.none }),
      },
    });

    return apiSuccess({
      success: true,
      boq: {
        ...boq,
        id: boq.id,
        boqCode: boq.boqCode,
      },
      boqId: boq.id,
      revisionId: boqRevision.id,
      boqCode: boq.boqCode,
      revisionCode: boqRevision.revisionCode,
      totalLines: validLines.length,
      qualityScore: 100,
      sourceType: 'STANDARD_BOQ_DOWNLOAD_UPLOAD',
    }, 201);
  } catch (err: any) {
    console.error('Error generating BOQ from standard upload:', err);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.failedToGenerateDraftBoq2 }), 500, { route: '/api/boq/standard/generate', method: 'POST', error: err });
  }
}
