// src/app/api/budgets/add-boq/route.ts - Add BOQ to Cost Centre Budget API
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BUDGET_CREATE');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const { boqRevisionId, costCentreId, projectId, autoSubmit } = body;

    if (!boqRevisionId || !costCentreId) {
      return apiError(UI_STRINGS.common.bOQRevisionIDAndCostCentreIDAreMandatory, 400);
    }

    // Retrieve revision with lines and categories
    const revision = await prisma.boqRevision.findFirst({
      where: { id: boqRevisionId, tenantId: ctx.tenantId },
      include: {
        lines: {
          include: {
            category: true,
            subcategory: true,
            uom: true,
          },
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

    // Calculate total value based on AI unit cost or benchmark rate
    let totalEstimated = 0;
    const categoryTotals = new Map<string, { amount: number; qty: number; lines: any[] }>();

    for (const l of revision.lines) {
      const lineCost = l.aiTotalCost || (l.aiUnitCost ? l.aiUnitCost * (l.quantity || 1) : 0);
      totalEstimated += lineCost;

      const catName = l.category?.name || 'General';
      const existing = categoryTotals.get(catName) || { amount: 0, qty: 0, lines: [] };
      existing.amount += lineCost;
      existing.qty += l.quantity || 1;
      existing.lines.push(l);
      categoryTotals.set(catName, existing);
    }

    const initialStatus = autoSubmit ? 'PENDING_PROJECT_APPROVAL' : 'DRAFT';

    // 1. Create Budget Contribution
    const contribution = await prisma.budgetContribution.create({
      data: {
        tenantId: ctx.tenantId,
        projectId: targetProjectId,
        costCentreId,
        boqId: revision.boqId,
        boqRevisionId: revision.id,
        totalEstimatedValue: totalEstimated,
        acceptedEstimatedValue: totalEstimated,
        status: initialStatus,
        submittedAt: autoSubmit ? new Date() : null,
        submittedBy: autoSubmit ? ctx.userId : null,
        createdBy: ctx.userId,
      },
    });

    // 2. Create Category-wise Budget Transactions
    const txCount = await prisma.budgetTransaction.count({ where: { tenantId: ctx.tenantId } });
    let txCounter = txCount + 1;
    const createdTransactions = [];

    for (const [catName, catData] of categoryTotals.entries()) {
      const txCode = `BTX-${String(txCounter++).padStart(6, '0')}`;
      const tx = await prisma.budgetTransaction.create({
        data: {
          tenantId: ctx.tenantId,
          transactionCode: txCode,
          projectId: targetProjectId,
          costCentreId,
          boqId: revision.boqId,
          boqRevisionId: revision.id,
          contributionId: contribution.id,
          category: catName,
          amount: catData.amount,
          quantity: catData.qty,
          rate: catData.qty > 0 ? catData.amount / catData.qty : null,
          status: initialStatus,
          reference: `BOQ ${revision.boq.boqCode} R${revision.revisionNumber} - ${catName}`,
          createdBy: ctx.userId,
        },
      });
      createdTransactions.push(tx);
    }

    // 3. Update BOQ Revision purpose and budget workflow status (WITHOUT altering PR status!)
    await prisma.boqRevision.update({
      where: { id: revision.id },
      data: {
        costCentreId,
        budgetStatus: autoSubmit ? 'BUDGET_PENDING_PROJECT_APPROVAL' : 'BUDGET_DRAFT',
      },
    });

    await prisma.boq.update({
      where: { id: revision.boqId },
      data: {
        costCentreId,
        purpose: revision.boq.purpose === 'PR' ? 'BOTH' : 'BUDGET',
      },
    });

    // 4. Audit Log
    await prisma.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        projectId: targetProjectId,
        entityType: 'BUDGET_CONTRIBUTION',
        entityId: contribution.id,
        action: 'BOQ_ADDED_TO_BUDGET',
        description: interpolateUiString(UI_STRINGS.appApiBudgetsAddBoqRoute.bOQBoqCodeRRevisionNumberAddedToBudgetForCostCentreCodeNameTotalValueToLocaleString, { "boqCode": revision.boq.boqCode, "revisionNumber": revision.revisionNumber, "code": costCentre.code, "name": costCentre.name, "toLocaleString": totalEstimated.toLocaleString(I18N_CONFIG.defaultLocale) }),
      },
    });

    return apiSuccess({
      contributionId: contribution.id,
      costCentre: {
        id: costCentre.id,
        code: costCentre.code,
        name: costCentre.name,
        areaSqFt: costCentre.areaSqFt,
      },
      totalEstimatedValue: totalEstimated,
      status: initialStatus,
      transactions: createdTransactions,
      categoriesCount: categoryTotals.size,
    }, 201);
  } catch (err: any) {
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.failedToAddBoqToBudget }), 500);
  }
}
