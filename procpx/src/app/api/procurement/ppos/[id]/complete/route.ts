// src/app/api/procurement/ppos/[id]/complete/route.ts
// Handles PPO / PO Completion and records Actual Cost Transactions

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('ACTUAL_COST_CREATE');
  if (!isApiContext(ctx)) return ctx;

  const { id: ppoId } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const {
      completionDate = new Date().toISOString(),
      completionReference,
      documents,
      remarks,
      lineCompletions, // Array of { ppoLineId, completedQuantity, finalRate, actualAmount, remarks }
    } = body;

    const ppo = await prisma.ppo.findFirst({
      where: { id: ppoId, tenantId: ctx.tenantId },
      include: {
        lines: true,
        project: true,
        rfq: {
          include: {
            pr: true,
            boqRevision: true,
          },
        },
      },
    });

    if (!ppo) {
      return apiError('PPO / PO not found', 404);
    }

    if (ppo.status === 'CANCELLED') {
      return apiError('Cannot complete a cancelled order', 400);
    }

    // Determine lines to complete
    const linesToProcess = lineCompletions && Array.isArray(lineCompletions) && lineCompletions.length > 0
      ? lineCompletions
      : ppo.lines.map((l) => ({
          ppoLineId: l.id,
          completedQuantity: l.orderedQuantity - l.completedQuantity,
          finalRate: l.orderedUnitRate,
          actualAmount: (l.orderedQuantity - l.completedQuantity) * l.orderedUnitRate,
          remarks: 'Full order line completion',
        }));

    const createdActualTransactions = [];

    for (const item of linesToProcess) {
      const ppoLine = ppo.lines.find((l) => l.id === item.ppoLineId);
      if (!ppoLine) continue;

      const completedQty = Number(item.completedQuantity) || 0;
      if (completedQty <= 0) continue;

      const finalRate = Number(item.finalRate) || ppoLine.orderedUnitRate;
      const actualAmount = Number(item.actualAmount) || completedQty * finalRate;
      const taxAmount = Number(item.taxAmount) || 0;
      const totalActualAmount = actualAmount + taxAmount;

      // Generate Transaction Code ACT-YYYY-XXXXXX
      const txCount = await prisma.actualCostTransaction.count({ where: { tenantId: ctx.tenantId } });
      const transactionCode = `ACT-${new Date().getFullYear()}-${String(txCount + 1).padStart(6, '0')}`;

      // Create persistent Actual Cost Transaction preserving full originating lineage
      const actualTx = await prisma.actualCostTransaction.create({
        data: {
          tenantId: ctx.tenantId,
          transactionCode,
          projectId: ppo.projectId,
          costCentreId: ppoLine.costCentreId || ppo.costCentreId || null,
          category: ppoLine.category || 'General',
          subcategory: ppoLine.subcategory || null,
          boqId: ppoLine.boqId || ppo.boqId || ppo.rfq?.boqRevision?.boqId || null,
          boqRevisionId: ppoLine.boqRevisionId || ppo.boqRevisionId || ppo.rfq?.boqRevisionId || null,
          boqLineId: ppoLine.boqLineId || null,
          prId: ppo.rfq?.prId || null,
          prLineId: ppoLine.prLineId || null,
          rfqId: ppo.rfqId,
          rfqLineId: ppoLine.rfqLineId || null,
          ppoId: ppo.id,
          ppoLineId: ppoLine.id,
          vendorId: ppo.vendorId,
          actualQuantity: completedQty,
          actualUnitRate: finalRate,
          actualAmount,
          taxAmount,
          totalActualAmount,
          actualDate: completionDate ? new Date(completionDate) : new Date(),
          source: 'PPO_COMPLETION',
          status: 'APPROVED',
          completionReference: completionReference || `WCC-${ppo.ppoNumber}`,
          documents: documents ? (typeof documents === 'string' ? documents : JSON.stringify(documents)) : null,
          remarks: item.remarks || remarks || 'PPO milestone completion verified',
          createdById: ctx.userId,
          createdBy: ctx.userName || 'System User',
        },
      });

      createdActualTransactions.push(actualTx);

      // Update PpoLine completion progress
      const newCompletedQty = ppoLine.completedQuantity + completedQty;
      const newCompletedAmt = ppoLine.completedAmount + actualAmount;
      const lineStatus = newCompletedQty >= ppoLine.orderedQuantity ? 'COMPLETED' : 'PARTIALLY_COMPLETED';

      await prisma.ppoLine.update({
        where: { id: ppoLine.id },
        data: {
          completedQuantity: newCompletedQty,
          completedAmount: newCompletedAmt,
          status: lineStatus,
        },
      });
    }

    // Refresh lines to evaluate total PPO status
    const updatedLines = await prisma.ppoLine.findMany({ where: { ppoId: ppo.id } });
    const allCompleted = updatedLines.length > 0 && updatedLines.every((l) => l.status === 'COMPLETED');
    const hasAnyCompletion = updatedLines.some((l) => l.completedQuantity > 0);

    const newPpoStatus = allCompleted
      ? 'COMPLETED'
      : hasAnyCompletion
      ? 'PARTIALLY_COMPLETED'
      : ppo.status;

    const updatedPpo = await prisma.ppo.update({
      where: { id: ppo.id },
      data: {
        status: newPpoStatus,
        completedAt: allCompleted ? new Date() : ppo.completedAt,
      },
      include: {
        lines: true,
        actualCosts: true,
      },
    });

    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      projectId: ppo.projectId,
      entityType: 'PPO',
      entityId: ppo.id,
      action: 'PPO_COMPLETED',
      description: `PPO ${ppo.ppoNumber} completion recorded. Generated ${createdActualTransactions.length} Actual Cost transactions. Status: ${newPpoStatus}`,
      newValue: {
        status: newPpoStatus,
        actualTransactionsCount: createdActualTransactions.length,
        completionReference,
      },
    });

    return apiSuccess({
      message: `PPO completion recorded successfully. Generated ${createdActualTransactions.length} Actual Cost transaction(s).`,
      ppo: updatedPpo,
      actualTransactions: createdActualTransactions,
    });
  } catch (err: any) {
    console.error('Error recording PPO completion:', err);
    return apiError(err.message || 'Failed to complete PPO', 500);
  }
}
