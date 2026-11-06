import { I18N_CONFIG } from '@/lib/i18n.constants';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import {
  BUDGET_AGGREGATE_REVERSE_UPDATE_SQL,
  BUDGET_AUDIT_INSERT_AFTER_TRANSITION_SQL,
  BUDGET_REVERSAL_INSERT_AFTER_STATUS_SQL,
  BUDGET_TRANSACTION_REVERSE_CAS_SQL,
} from '@/lib/d1-batch.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BUDGET_REVERSE');
  if (!isApiContext(ctx)) return ctx;

  const startedAt = Date.now();
  let transactionId: string | undefined;
  try {
    const body = await req.json();
    transactionId = typeof body?.transactionId === 'string' ? body.transactionId : undefined;
    const reversalReason = typeof body?.reversalReason === 'string' ? body.reversalReason.trim() : '';
    if (!transactionId) return apiError(UI_STRINGS.appApiBudgetsReverseRoute.transactionIDIsRequired, 400);
    if (!reversalReason) return apiError(UI_STRINGS.appApiBudgetsReverseRoute.mandatoryReversalReasonMustBeProvided, 400);

    const tx = await prisma.budgetTransaction.findFirst({ where: { id: transactionId, tenantId: ctx.tenantId } });
    if (!tx) return apiError(UI_STRINGS.appApiBudgetsReverseRoute.budgetTransactionNotFound, 404);
    if (tx.isReversal) return apiError(UI_STRINGS.appApiBudgetsReverseRoute.cannotReverseATransactionThatIsAlreadyAReversal, 400);
    if (tx.status !== 'APPROVED') return apiError(UI_STRINGS.appApiBudgetsReverseRoute.onlyApprovedBudgetTransactionsCanBeReversed, 400);

    const now = new Date();
    const reversalId = crypto.randomUUID();
    const auditId = crypto.randomUUID();
    const reversedAmount = -Math.abs(tx.amount);
    const reversedQuantity = tx.quantity ? -Math.abs(tx.quantity) : null;
    const reference = `REVERSAL of ${tx.transactionCode}: ${reversalReason}`;
    const description = interpolateUiString(UI_STRINGS.common.budgetTransactionReversedForAmountReason, {
      transactionCode: tx.transactionCode,
      amount: Math.abs(tx.amount).toLocaleString(I18N_CONFIG.defaultLocale),
      reason: reversalReason,
    });
    const results = await writeD1BatchAtomically([
      { sql: BUDGET_TRANSACTION_REVERSE_CAS_SQL, values: [tx.id, ctx.tenantId, ctx.tenantId, tx.id] },
      {
        sql: BUDGET_REVERSAL_INSERT_AFTER_STATUS_SQL,
        values: [reversalId, ctx.tenantId, ctx.tenantId, tx.projectId, tx.costCentreId, tx.boqId, tx.boqRevisionId,
          tx.boqLineId, tx.contributionId, tx.category, tx.subcategory, tx.uom, reversedAmount, reversedQuantity,
          tx.rate, now, ctx.userId, reversalReason, tx.id, reference, now],
      },
      {
        sql: BUDGET_AUDIT_INSERT_AFTER_TRANSITION_SQL,
        values: [auditId, ctx.tenantId, ctx.userId, tx.projectId, 'BUDGET_TRANSACTION', reversalId,
          'BUDGET_TRANSACTION_REVERSED', description, JSON.stringify({ status: 'APPROVED' }),
          JSON.stringify({ status: 'APPROVED', isReversal: true, reversedTransactionId: tx.id }), null, null, now],
      },
      {
        sql: BUDGET_AGGREGATE_REVERSE_UPDATE_SQL,
        values: [Math.abs(tx.amount), Math.abs(tx.amount), now, ctx.tenantId, tx.projectId, tx.costCentreId, auditId, ctx.tenantId],
      },
    ]);
    if (Number(results[0]?.meta?.changes || 0) !== 1) {
      return apiError(UI_STRINGS.common.budgetTransactionChangedPleaseRefresh, 409);
    }

    const inserted = results[1]?.results?.[0];
    const reversalTransaction = {
      ...tx,
      id: reversalId,
      transactionCode: inserted?.transactionCode,
      amount: reversedAmount,
      quantity: reversedQuantity,
      status: 'APPROVED',
      isReversal: true,
      reversalReason,
      reversedTransactionId: tx.id,
      reference,
      createdBy: ctx.userId,
      budgetDate: now,
      createdAt: now,
    };
    return apiSuccess({
      originalTransaction: { ...tx, status: 'REVERSED' },
      reversalTransaction,
      reversedAmount,
    }, 201);
  } catch (error) {
    await writeStructuredLog('error', 'budget_transaction.reversal_failed', {
      operation: 'reverse_budget_transaction', route: '/api/budgets/reverse', requestId: req.headers.get('x-request-id'),
      tenantId: ctx.tenantId, userId: ctx.userId, transactionId, durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.transactionReversalFailed, 500);
  }
}
