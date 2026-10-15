// src/app/api/budgets/reverse/route.ts - Budget Transaction Reversal API
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BUDGET_REVERSE');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const { transactionId, reversalReason } = body;

    if (!transactionId) return apiError('Transaction ID is required.', 400);
    if (!reversalReason || !reversalReason.trim()) {
      return apiError('Mandatory reversal reason must be provided.', 400);
    }

    const tx = await prisma.budgetTransaction.findFirst({
      where: { id: transactionId, tenantId: ctx.tenantId },
    });

    if (!tx) return apiError('Budget transaction not found.', 404);
    if (tx.isReversal) {
      return apiError('Cannot reverse a transaction that is already a reversal.', 400);
    }
    if (tx.status !== 'APPROVED') {
      return apiError('Only approved budget transactions can be reversed.', 400);
    }

    // Generate reversal code
    const count = await prisma.budgetTransaction.count({ where: { tenantId: ctx.tenantId } });
    const reversalTxCode = `BTX-REV-${String(count + 1).padStart(5, '0')}`;

    // Create negative reversal transaction
    const reversalTx = await prisma.budgetTransaction.create({
      data: {
        tenantId: ctx.tenantId,
        transactionCode: reversalTxCode,
        projectId: tx.projectId,
        costCentreId: tx.costCentreId,
        boqId: tx.boqId,
        boqRevisionId: tx.boqRevisionId,
        boqLineId: tx.boqLineId,
        contributionId: tx.contributionId,
        category: tx.category,
        subcategory: tx.subcategory,
        amount: -Math.abs(tx.amount), // negative amount
        quantity: tx.quantity ? -Math.abs(tx.quantity) : null,
        rate: tx.rate,
        budgetDate: new Date(),
        status: 'APPROVED',
        isReversal: true,
        reversalReason: reversalReason.trim(),
        reversedTransactionId: tx.id,
        reference: `REVERSAL of ${tx.transactionCode}: ${reversalReason.trim()}`,
        createdBy: ctx.userId,
      },
    });

    // Update aggregate Budget record
    const budgetRecord = await prisma.budget.findFirst({
      where: { costCentreId: tx.costCentreId, tenantId: ctx.tenantId },
    });

    if (budgetRecord) {
      await prisma.budget.update({
        where: { id: budgetRecord.id },
        data: {
          approvedAmount: Math.max(0, budgetRecord.approvedAmount - Math.abs(tx.amount)),
          totalAmount: Math.max(0, budgetRecord.totalAmount - Math.abs(tx.amount)),
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        projectId: tx.projectId,
        entityType: 'BUDGET_TRANSACTION',
        entityId: reversalTx.id,
        action: 'BUDGET_TRANSACTION_REVERSED',
        description: `Budget transaction ${tx.transactionCode} reversed with ${reversalTxCode} (-₹ ${Math.abs(tx.amount).toLocaleString('en-IN')}). Reason: ${reversalReason.trim()}`,
      },
    });

    return apiSuccess({
      originalTransaction: tx,
      reversalTransaction: reversalTx,
      reversedAmount: -Math.abs(tx.amount),
    }, 201);
  } catch (err: any) {
    return apiError(err.message || 'Transaction reversal failed.', 500);
  }
}
