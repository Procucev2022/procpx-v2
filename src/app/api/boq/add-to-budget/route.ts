// src/app/api/boq/add-to-budget/route.ts - Add BOQ to Project Cost Centre Budget
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BUDGET_CREATE');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const boqRevisionId = body.boqRevisionId || body.revisionId;
    const { boqId, costCentreId, projectId, autoSubmit } = body;

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
      return apiError('A valid Cost Centre is required to allocate budget.', 400);
    }

    const costCentre = await prisma.costCentre.findFirst({
      where: { id: targetCostCentreId, projectId: targetProjectId, tenantId: ctx.tenantId },
    });
    if (!costCentre) {
      return apiError('Cost centre not found for this project.', 404);
    }

    // Section 8: Commercial Budget Rule - block if any line has pending/blank/invalid quantity
    const missingQtyLines = revision.lines.filter(l => l.quantity === null || l.quantity === undefined || l.quantity <= 0);
    if (missingQtyLines.length > 0) {
      return apiError(
        `${missingQtyLines.length} BOQ line${missingQtyLines.length > 1 ? 's' : ''} require quantity before this BOQ can be added to Budget.`,
        400
      );
    }

    // Compute line costs and category totals
    let totalEstimated = 0;
    const categoryTotals = new Map<string, { amount: number; qty: number; lines: any[] }>();

    for (const l of revision.lines) {
      const unitRate = l.aiUnitCost || (l as any).benchmarkRate || 100;
      const qty = l.quantity as number;
      const lineCost = l.aiTotalCost || Math.round(unitRate * qty * 100) / 100;
      totalEstimated += lineCost;

      const catName = l.category?.name || 'General';
      const existing = categoryTotals.get(catName) || { amount: 0, qty: 0, lines: [] };
      existing.amount += lineCost;
      existing.qty += qty;
      existing.lines.push(l);
      categoryTotals.set(catName, existing);
    }

    const initialStatus = 'UNDER_APPROVAL';

    // 1. Create or update Budget Contribution with duplicate prevention
    const existingContribution = await prisma.budgetContribution.findFirst({
      where: {
        tenantId: ctx.tenantId,
        boqRevisionId: revision.id,
      },
    });

    let contribution;
    let createdTransactions = [];
    let firstTxCode = '';

    if (existingContribution) {
      // Prevent duplicate contribution if already Under Approval
      if (existingContribution.status === 'UNDER_APPROVAL' || existingContribution.status === 'PENDING_PROJECT_APPROVAL') {
        const existingTxs = await prisma.budgetTransaction.findMany({
          where: { contributionId: existingContribution.id },
          orderBy: { createdAt: 'asc' },
        });
        return apiSuccess({
          success: true,
          alreadySubmitted: true,
          contributionId: existingContribution.id,
          transactionCode: existingTxs[0]?.transactionCode || `BTX-${existingContribution.id.substring(0, 8)}`,
          totalAmount: existingContribution.totalEstimatedValue,
          status: 'UNDER_APPROVAL',
          costCentre: {
            id: costCentre.id,
            code: costCentre.code,
            name: costCentre.name,
          },
          transactionsCount: existingTxs.length,
          message: `BOQ ${revision.boq.boqCode} budget contribution is already recorded with status Under Approval.`,
        }, 200);
      }

      if (existingContribution.status === 'APPROVED') {
        return apiError(`BOQ ${revision.boq.boqCode} has already been approved in budget for Cost Centre ${costCentre.code}.`, 400);
      }

      // If previously REJECTED or DRAFT, allow re-submission as Under Approval
      contribution = await prisma.budgetContribution.update({
        where: { id: existingContribution.id },
        data: {
          costCentreId: targetCostCentreId,
          totalEstimatedValue: totalEstimated,
          acceptedEstimatedValue: totalEstimated,
          status: initialStatus,
          submittedAt: new Date(),
          submittedBy: ctx.userId,
          rejectionReason: null,
        },
      });

      // Remove previous transactions to replace with fresh ones
      await prisma.budgetTransaction.deleteMany({
        where: { contributionId: contribution.id },
      });
    } else {
      contribution = await prisma.budgetContribution.create({
        data: {
          tenantId: ctx.tenantId,
          projectId: targetProjectId,
          costCentreId: targetCostCentreId,
          boqId: revision.boqId,
          boqRevisionId: revision.id,
          totalEstimatedValue: totalEstimated,
          acceptedEstimatedValue: totalEstimated,
          status: initialStatus,
          submittedAt: new Date(),
          submittedBy: ctx.userId,
          createdBy: ctx.userId,
        },
      });
    }

    // 2. Create Category-wise Budget Transactions with line-item traceability
    const existingTxCodes = await prisma.budgetTransaction.findMany({
      where: { tenantId: ctx.tenantId },
      select: { transactionCode: true },
    });
    const codeSet = new Set(existingTxCodes.map(t => t.transactionCode));
    let txCounter = existingTxCodes.length + 1;

    for (const [catName, catData] of categoryTotals.entries()) {
      while (codeSet.has(`BTX-${String(txCounter).padStart(6, '0')}`)) {
        txCounter++;
      }
      const txCode = `BTX-${String(txCounter++).padStart(6, '0')}`;
      codeSet.add(txCode);
      if (!firstTxCode) firstTxCode = txCode;

      const firstLineId = catData.lines[0]?.id || null;

      const tx = await prisma.budgetTransaction.create({
        data: {
          tenantId: ctx.tenantId,
          transactionCode: txCode,
          projectId: targetProjectId,
          costCentreId: targetCostCentreId,
          boqId: revision.boqId,
          boqRevisionId: revision.id,
          boqLineId: firstLineId,
          contributionId: contribution.id,
          category: catName,
          amount: Math.round(catData.amount * 100) / 100,
          quantity: catData.qty,
          rate: catData.qty > 0 ? Math.round((catData.amount / catData.qty) * 100) / 100 : null,
          status: initialStatus,
          reference: `BOQ ${revision.boq.boqCode} ${revision.revisionCode} - ${catName}`,
          createdBy: ctx.userId,
        },
      });
      createdTransactions.push(tx);
    }

    // 3. Update BOQ Revision & BOQ
    await prisma.boqRevision.update({
      where: { id: revision.id },
      data: {
        budgetStatus: 'BUDGET_UNDER_APPROVAL',
      },
    });

    await prisma.boq.update({
      where: { id: revision.boqId },
      data: {
        costCentreId: targetCostCentreId,
        purpose: 'BUDGET',
      },
    });

    // 4. Update Cost Centre Budget pending amount (do NOT include in approvedAmount before approval)
    const existingBudget = await prisma.budget.findFirst({
      where: { costCentreId: targetCostCentreId, tenantId: ctx.tenantId },
    });
    if (existingBudget) {
      await prisma.budget.update({
        where: { id: existingBudget.id },
        data: {
          pendingAmount: existingBudget.pendingAmount + totalEstimated,
        },
      });
    } else {
      await prisma.budget.create({
        data: {
          tenantId: ctx.tenantId,
          projectId: targetProjectId,
          costCentreId: targetCostCentreId,
          totalAmount: totalEstimated,
          approvedAmount: 0,
          pendingAmount: totalEstimated,
          status: 'UNDER_APPROVAL',
          createdBy: ctx.userId,
        },
      });
    }

    // 5. Audit Log
    await prisma.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        projectId: targetProjectId,
        entityType: 'BUDGET_CONTRIBUTION',
        entityId: contribution.id,
        action: 'BUDGET_CONTRIBUTION_CREATED',
        description: `BOQ ${revision.boq.boqCode} (${revision.revisionCode}) allocated to Cost Centre ${costCentre.code} with status Under Approval. Value: ₹ ${totalEstimated.toLocaleString('en-IN')}`,
        newValue: JSON.stringify({
          contributionId: contribution.id,
          boqCode: revision.boq.boqCode,
          revisionCode: revision.revisionCode,
          totalEstimated,
          transactions: createdTransactions.length,
          status: initialStatus,
        }),
      },
    });

    return apiSuccess({
      success: true,
      contributionId: contribution.id,
      transactionCode: firstTxCode || `BTX-${contribution.id.substring(0, 8)}`,
      totalAmount: totalEstimated,
      status: initialStatus,
      costCentre: {
        id: costCentre.id,
        code: costCentre.code,
        name: costCentre.name,
      },
      transactionsCount: createdTransactions.length,
      message: `BOQ ${revision.boq.boqCode} successfully allocated to budget for Cost Centre ${costCentre.code} with status Under Approval.`,
    }, 201);
  } catch (err: any) {
    console.error('Error adding BOQ to budget:', err);
    return apiError(err.message || 'Failed to add BOQ to budget.', 500);
  }
}
