// src/app/api/boq/from-standard-library/route.ts - Method 2: Standard BOQ Library Generation
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BOQ_EDIT');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const { projectId, costCentreId, items } = body;

    if (!projectId || !items || !Array.isArray(items) || items.length === 0) {
      return apiError('Project ID and a list of selected standard items are required.', 400);
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId: ctx.tenantId },
    });
    if (!project) return apiError('Project not found.', 404);

    // Verify Cost Centre if provided
    if (costCentreId) {
      const cc = await prisma.costCentre.findFirst({
        where: { id: costCentreId, projectId, tenantId: ctx.tenantId },
      });
      if (!cc) return apiError('Cost centre not found for this project.', 404);
    }

    // Generate unique BOQ Code
    const count = await prisma.boq.count({ where: { tenantId: ctx.tenantId } });
    const boqCode = `BOQ-${String(count + 1).padStart(6, '0')}`;

    const boq = await prisma.boq.create({
      data: {
        tenantId: ctx.tenantId,
        projectId,
        costCentreId: costCentreId || null,
        boqCode,
        status: 'DRAFT',
        createdBy: ctx.userId,
      },
    });

    const boqRevision = await prisma.boqRevision.create({
      data: {
        tenantId: ctx.tenantId,
        boqId: boq.id,
        costCentreId: costCentreId || null,
        revisionNumber: 0,
        revisionCode: 'R0',
        status: 'DRAFT',
        preparationStatus: 'STANDARDISED',
        budgetStatus: 'NOT_ADDED_TO_BUDGET',
        prStatus: 'PR_NOT_CREATED',
        sourceType: 'STANDARD_BOQ',
        sourceReference: 'Standard BOQ Enterprise Library',
        notes: `Generated from Standard BOQ Library (${items.length} items)`,
        totalLines: items.length,
        validLines: items.length,
        qualityScore: 100,
        createdById: ctx.userId,
        uploadedAt: new Date(),
      },
    });

    const categories = await prisma.category.findMany({ where: { tenantId: ctx.tenantId } });
    const uoms = await prisma.uomMaster.findMany({ where: { tenantId: ctx.tenantId } });

    const catMap = new Map(categories.map(c => [c.name.toLowerCase(), c]));
    const uomMap = new Map(uoms.map(u => [u.code.toUpperCase(), u]));

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const matchedCategory = catMap.get((it.category || '').toLowerCase());
      const matchedUom = uomMap.get((it.uom || '').toUpperCase());
      const qty = parseFloat(it.quantity) || 1;
      const benchmarkRate = it.benchmarkRate ? parseFloat(it.benchmarkRate) : null;
      const totalCost = benchmarkRate ? benchmarkRate * qty : null;

      await prisma.boqLine.create({
        data: {
          tenantId: ctx.tenantId,
          boqRevisionId: boqRevision.id,
          lineNumber: String(i + 1),
          itemCode: it.itemCode || `STD-ITEM-${i + 1}`,
          originalDescription: it.standardDescription,
          standardDescription: it.standardDescription,
          specification: it.detailedSpecification || it.standardDescription,
          aiSuggestedDescription: it.standardDescription,
          aiConfidence: 0.98,
          aiUnitCost: benchmarkRate,
          aiTotalCost: totalCost,
          costConfidence: 0.95,
          costSource: 'Standard Catalogue',
          categoryId: matchedCategory?.id || null,
          uomId: matchedUom?.id || null,
          uomRaw: it.uom || 'NOS',
          quantity: qty,
          brand: it.brandMake || null,
          validationStatus: 'VALID',
          validationMessages: JSON.stringify([]),
          benchmarkEligible: true,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        projectId,
        entityType: 'BOQ',
        entityId: boq.id,
        action: 'BOQ_GENERATED_FROM_STANDARD_LIBRARY',
        description: `Draft BOQ ${boq.boqCode} generated from Standard Library with ${items.length} items`,
      },
    });

    return apiSuccess({
      boqId: boq.id,
      revisionId: boqRevision.id,
      boqCode: boq.boqCode,
      revisionCode: boqRevision.revisionCode,
      totalLines: items.length,
      qualityScore: 100,
    }, 201);
  } catch (err: any) {
    return apiError(err.message || 'Standard BOQ generation failed.', 500);
  }
}
