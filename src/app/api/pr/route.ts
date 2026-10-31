// src/app/api/pr/route.ts - Procurement Request (PR) Listing & Creation API
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function GET(req: NextRequest) {
  const ctx = await requireAuth('PR_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId') || '';
  const costCentreId = searchParams.get('costCentreId') || '';
  const status = searchParams.get('status') || '';
  const search = searchParams.get('search') || '';

  const where: any = { tenantId: ctx.tenantId };
  if (projectId) where.projectId = projectId;
  if (costCentreId) where.costCentreId = costCentreId;
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { prNumber: { contains: search } },
      { title: { contains: search } },
      { requestedBy: { contains: search } },
    ];
  }

  const prs = await prisma.procurementRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      project: { select: { id: true, projectCode: true, name: true } },
      costCentre: { select: { id: true, code: true, name: true, areaSqFt: true } },
      boq: { select: { id: true, boqCode: true, category: true, title: true } },
      boqRevision: { select: { id: true, revisionNumber: true, revisionCode: true } },
      lines: { select: { id: true, category: true } },
      approvals: { orderBy: { timestamp: 'desc' }, take: 1 },
      _count: { select: { lines: true, rfqs: true } },
    },
  });

  const formatted = prs.map(pr => {
    const categories = Array.from(new Set((pr as any).lines?.map((l: any) => l.category).filter(Boolean) || []));
    return {
      ...pr,
      categories: categories.length > 0 ? categories : (pr.boq?.category ? [pr.boq.category] : ['Standard']),
    };
  });

  return apiSuccess(formatted);
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('PR_CREATE');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const {
      boqRevisionId,
      costCentreId,
      projectId,
      title,
      requiredDate,
      selectedLineIds,
      autoSubmit,
    } = body;

    if (!boqRevisionId || !costCentreId) {
      return apiError(UI_STRINGS.common.bOQRevisionIDAndCostCentreIDAreMandatory, 400);
    }

    const revision = await prisma.boqRevision.findFirst({
      where: { id: boqRevisionId, tenantId: ctx.tenantId },
      include: {
        lines: {
          include: { category: true, subcategory: true, uom: true },
        },
        boq: true,
      },
    });

    if (!revision) return apiError(UI_STRINGS.common.bOQRevisionNotFound, 404);

    const targetProjectId = projectId || revision.boq.projectId;
    const costCentre = await prisma.costCentre.findFirst({
      where: { id: costCentreId, projectId: targetProjectId, tenantId: ctx.tenantId },
    });
    if (!costCentre) return apiError(UI_STRINGS.common.costCentreNotFoundForThisProject, 404);

    // Filter lines if specific line selection was provided
    const targetLines = selectedLineIds && selectedLineIds.length > 0
      ? revision.lines.filter(l => selectedLineIds.includes(l.id))
      : revision.lines;

    if (targetLines.length === 0) {
      return apiError(UI_STRINGS.common.noValidBOQLinesAvailableToGeneratePR, 400);
    }

    // Generate unique PR Number
    const count = await prisma.procurementRequest.count({ where: { tenantId: ctx.tenantId } });
    const prNumber = `PR-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`;

    let totalEstimatedPRValue = 0;
    for (const l of targetLines) {
      const lineVal = l.aiTotalCost || (l.aiUnitCost ? l.aiUnitCost * (l.quantity || 1) : 0);
      totalEstimatedPRValue += lineVal;
    }

    const initialStatus = autoSubmit ? 'PR_PENDING_PROJECT_APPROVAL' : 'PR_DRAFT';

    const pr = await prisma.procurementRequest.create({
      data: {
        tenantId: ctx.tenantId,
        prNumber,
        projectId: targetProjectId,
        costCentreId,
        boqId: revision.boqId,
        boqRevisionId: revision.id,
        title: interpolateUiString(UI_STRINGS.common.value1, { "value1": title?.trim() || `PR for ${costCentre.name} (${revision.boq.boqCode} R${revision.revisionNumber})` }),
        purpose: 'PROCUREMENT_SOURCING',
        totalEstimatedValue: totalEstimatedPRValue,
        totalLines: targetLines.length,
        status: initialStatus,
        requestedBy: ctx.userId,
        requestedDate: new Date(),
        requiredDate: requiredDate ? new Date(requiredDate) : null,
      },
    });

    // Copy lines into PRLine table (preserves traceability to BOQLine!)
    for (let i = 0; i < targetLines.length; i++) {
      const l = targetLines[i];
      const rate = l.aiUnitCost || 0;
      const val = l.aiTotalCost || rate * (l.quantity || 1);

      await prisma.pRLine.create({
        data: {
          tenantId: ctx.tenantId,
          prId: pr.id,
          boqLineId: l.id,
          lineNumber: String(i + 1),
          itemDescription: l.standardDescription || l.originalDescription,
          specification: l.specification || l.standardDescription,
          category: l.category?.name || 'General',
          subcategory: l.subcategory?.name || null,
          uom: l.uomRaw || 'NOS',
          quantity: l.quantity || 1,
          estimatedRate: rate,
          estimatedValue: val,
          drawingReference: l.drawingReference || null,
          costCentre: `${costCentre.code} ${costCentre.name}`,
        },
      });
    }

    // Update revision PR status and BOQ purpose (WITHOUT altering budget status!)
    await prisma.boqRevision.update({
      where: { id: revision.id },
      data: {
        costCentreId,
        prStatus: autoSubmit ? 'PR_PENDING_PROJECT_APPROVAL' : 'PR_DRAFT',
      },
    });

    await prisma.boq.update({
      where: { id: revision.boqId },
      data: {
        costCentreId,
        purpose: revision.boq.purpose === 'BUDGET' ? 'BOTH' : 'PR',
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        projectId: targetProjectId,
        entityType: 'PR',
        entityId: pr.id,
        action: 'PR_CREATED',
        description: interpolateUiString(UI_STRINGS.appApiPrRoute.procurementRequestPrNumberCreatedFromBOQBoqCodeRRevisionNumberLengthLinesEstimatedToLocaleString, { "prNumber": pr.prNumber, "boqCode": revision.boq.boqCode, "revisionNumber": revision.revisionNumber, "length": targetLines.length, "toLocaleString": totalEstimatedPRValue.toLocaleString(I18N_CONFIG.defaultLocale) }),
      },
    });

    return apiSuccess({
      prId: pr.id,
      prNumber: pr.prNumber,
      totalEstimatedValue: totalEstimatedPRValue,
      totalLines: targetLines.length,
      status: initialStatus,
    }, 201);
  } catch (err: any) {
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.failedToCreateProcurementRequest }), 500);
  }
}
