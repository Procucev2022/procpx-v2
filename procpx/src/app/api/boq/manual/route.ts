// src/app/api/boq/manual/route.ts - Method 4: Manual BOQ Entry & Manipulation API
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BOQ_EDIT');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const { projectId, costCentreId, boqId, boqRevisionId, lines, action, title, description, purpose, category } = body;

    if (!projectId && !boqId) {
      return apiError('Project ID or BOQ ID is required.', 400);
    }

    let targetBoqId = boqId;
    let targetRevId = boqRevisionId;

    // If new BOQ creation
    if (!targetBoqId) {
      const count = await prisma.boq.count({ where: { tenantId: ctx.tenantId } });
      const boqCode = `BOQ-${String(count + 1).padStart(6, '0')}`;

      const project = await prisma.project.findFirst({
        where: { id: projectId, tenantId: ctx.tenantId },
      });
      const catParam = category || (lines && lines[0]?.category) || '';
      const defaultTitle = catParam ? `${catParam} — ${project?.name || 'Project'}` : `${project?.name || 'Project'} BOQ`;

      const boq = await prisma.boq.create({
        data: {
          tenantId: ctx.tenantId,
          projectId,
          costCentreId: costCentreId || null,
          boqCode,
          title: title?.trim() || defaultTitle,
          description: description?.trim() || null,
          category: catParam || null,
          purpose: purpose || 'BUDGET',
          status: 'DRAFT',
          createdBy: ctx.userId,
        },
      });

      const rev = await prisma.boqRevision.create({
        data: {
          tenantId: ctx.tenantId,
          boqId: boq.id,
          costCentreId: costCentreId || null,
          revisionNumber: 0,
          revisionCode: 'R0',
          status: 'DRAFT',
          preparationStatus: 'DRAFT',
          budgetStatus: 'NOT_ADDED_TO_BUDGET',
          prStatus: 'PR_NOT_CREATED',
          sourceType: 'MANUAL',
          notes: 'Created via BOQ Studio Manual Line Workspace',
          createdById: ctx.userId,
        },
      });

      targetBoqId = boq.id;
      targetRevId = rev.id;

      await prisma.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          projectId,
          entityType: 'BOQ',
          entityId: boq.id,
          action: 'MANUAL_BOQ_CREATED',
          description: `Manual BOQ created: ${boq.boqCode}`,
        },
      });
    }

    // Verify existing revision is in editable DRAFT status (Immutability guard!)
    const currentRev = await prisma.boqRevision.findFirst({
      where: { id: targetRevId, tenantId: ctx.tenantId },
    });
    if (!currentRev) return apiError('BOQ Revision not found.', 404);
    if (currentRev.status === 'APPROVED') {
      return apiError('Approved BOQ revisions are strictly immutable. Branch a new revision to edit.', 403);
    }

    // If lines provided, handle save/replace or operations
    if (lines && Array.isArray(lines)) {
      const categories = await prisma.category.findMany({ where: { tenantId: ctx.tenantId } });
      const uoms = await prisma.uomMaster.findMany({ where: { tenantId: ctx.tenantId } });
      const catMap = new Map(categories.map(c => [c.name.toLowerCase(), c]));
      const uomMap = new Map(uoms.map(u => [u.code.toUpperCase(), u]));

      // Clear existing lines if full replacement
      if (action === 'REPLACE_ALL' || !action) {
        await prisma.boqLine.deleteMany({ where: { boqRevisionId: targetRevId } });
      }

      let validCount = 0;
      let errorCount = 0;

      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const lineNum = l.lineNumber || String(i + 1);
        const desc = (l.originalDescription || l.description || '').trim();
        const spec = (l.specification || '').trim();
        const catName = (l.category || '').trim();
        const uomRaw = (l.uom || l.uomRaw || 'NOS').trim().toUpperCase();
        const qty = parseFloat(l.quantity) || 0;

        const valMsgs: any[] = [];
        let status = 'VALID';
        if (!desc) {
          valMsgs.push({ level: 'ERROR', code: 'DESC_MISSING', message: 'Description is required' });
          status = 'ERROR';
        }
        if (qty <= 0) {
          valMsgs.push({ level: 'ERROR', code: 'QTY_INVALID', message: 'Quantity must be positive' });
          status = 'ERROR';
        }

        if (status === 'VALID') validCount++;
        else errorCount++;

        const matchedCat = catMap.get(catName.toLowerCase());
        const matchedUom = uomMap.get(uomRaw);

        await prisma.boqLine.create({
          data: {
            tenantId: ctx.tenantId,
            boqRevisionId: targetRevId,
            lineNumber: lineNum,
            itemCode: l.itemCode || null,
            originalDescription: desc || 'Untitled Item',
            standardDescription: l.standardDescription || desc || 'Untitled Item',
            specification: spec || null,
            categoryId: matchedCat?.id || null,
            uomId: matchedUom?.id || null,
            uomRaw,
            quantity: qty,
            brand: l.brand || null,
            drawingReference: l.drawingReference || null,
            location: l.location || null,
            validationStatus: status,
            validationMessages: JSON.stringify(valMsgs),
            aiSuggestedDescription: l.aiSuggestedDescription || null,
            aiUnitCost: l.aiUnitCost ? parseFloat(l.aiUnitCost) : null,
            aiTotalCost: l.aiUnitCost && qty ? parseFloat(l.aiUnitCost) * qty : null,
            costSource: l.costSource || null,
            benchmarkEligible: true,
          },
        });
      }

      await prisma.boqRevision.update({
        where: { id: targetRevId },
        data: {
          totalLines: lines.length,
          validLines: validCount,
          errorLines: errorCount,
          qualityScore: lines.length > 0 ? Math.round((validCount / lines.length) * 100) : 100,
        },
      });
    }

    const updatedRev = await prisma.boqRevision.findUnique({
      where: { id: targetRevId },
      include: {
        lines: { orderBy: { lineNumber: 'asc' } },
        boq: true,
      },
    });

    return apiSuccess({
      boqId: targetBoqId,
      revisionId: targetRevId,
      boq: updatedRev?.boq,
      revision: updatedRev,
      totalLines: updatedRev?.lines.length || 0,
    });
  } catch (err: any) {
    return apiError(err.message || 'Manual BOQ operation failed.', 500);
  }
}
