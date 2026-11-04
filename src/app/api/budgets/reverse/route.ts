// src/app/api/budgets/reverse/route.ts - Budget Transaction Reversal API
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { nextRecordCode } from '@/lib/record-codes';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BUDGET_REVERSE');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const { transactionId, reversalReason } = body;

    if (!transactionId) return apiError(UI_STRINGS.appApiBudgetsReverseRoute.transactionIDIsRequired, 400, { route: '/api/budgets/reverse', method: 'POST' });
    if (!reversalReason || !reversalReason.trim()) {
      return apiError(UI_STRINGS.appApiBudgetsReverseRoute.mandatoryReversalReasonMustBeProvided, 400, { route: '/api/budgets/reverse', method: 'POST' });
    }

    const tx = await prisma.budgetTransaction.findFirst({
      where: { id: transactionId, tenantId: ctx.tenantId },
    });

    if (!tx) return apiError(UI_STRINGS.appApiBudgetsReverseRoute.budgetTransactionNotFound, 404, { route: '/api/budgets/reverse', method: 'POST' });
    if (tx.isReversal) {
      return apiError(UI_STRINGS.appApiBudgetsReverseRoute.cannotReverseATransactionThatIsAlreadyAReversal, 400, { route: '/api/budgets/reverse', method: 'POST' });
    }
    if (tx.status !== 'APPROVED') {
      return apiError(UI_STRINGS.appApiBudgetsReverseRoute.onlyApprovedBudgetTransactionsCanBeReversed, 400, { route: '/api/budgets/reverse', method: 'POST' });
    }

    // Generate reversal code
    const reversalTxCode = await nextRecordCode(prisma.budgetTransaction, 'transactionCode', ctx.tenantId, `BTX-REV-`, 5);

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
        description: interpolateUiString(UI_STRINGS.appApiBudgetsReverseRoute.budgetTransactionTransactionCodeReversedWithReversalTxCodeToLocaleStringReasonTrim, { "transactionCode": tx.transactionCode, "reversalTxCode": reversalTxCode, "toLocaleString": Math.abs(tx.amount).toLocaleString(I18N_CONFIG.defaultLocale), "trim": reversalReason.trim() }),
      },
    });

    return apiSuccess({
      originalTransaction: tx,
      reversalTransaction: reversalTx,
      reversedAmount: -Math.abs(tx.amount),
    }, 201);
  } catch (err: any) {
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.transactionReversalFailed }), 500, { route: '/api/budgets/reverse', method: 'POST', error: err });
  }
}
