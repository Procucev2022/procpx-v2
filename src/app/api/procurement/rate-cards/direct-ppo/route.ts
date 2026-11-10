import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { isUserAuthorizedForProject } from '@/lib/project-auth';
import { isD1BatchWithinLimits, writeD1BatchAtomically } from '@/lib/d1-batch';
import {
  AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
  DIRECT_RATE_CARD_PPO_INSERT_IF_VALID_SQL,
  MAX_D1_BATCH_STATEMENTS,
  MAX_PPO_CREATE_LINES,
  PPO_LINE_INSERT_AFTER_HEADER_SQL,
} from '@/lib/d1-batch.constants';
import { dispatchPreparedWorkflowNotification, notifyNextResponsibleParty } from '@/lib/notifications';
import { prepareNotificationOutbox } from '@/lib/notification-outbox';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import { logEvent } from '@/lib/observability/server-logger';
import type { D1BatchInputStatement } from '@app-types/lib/d1-batch.types';
import {
  DIRECT_RATE_CARD_PPO_CODE_RETRIES,
  DIRECT_RATE_CARD_PPO_DEFAULT_DELIVERY_TERMS,
  DIRECT_RATE_CARD_PPO_DEFAULT_PAYMENT_TERMS,
  DIRECT_RATE_CARD_PPO_DEFAULT_TAX_DETAILS,
  DIRECT_RATE_CARD_PPO_PR_STATUSES,
  DIRECT_RATE_CARD_PPO_RFQ_STATUSES,
} from './route.constants';

type DirectPpoLine = {
  id: string;
  lineNumber: string;
  description: string;
  specification: string | null;
  category: string;
  subcategory: string | null;
  uom: string;
  quantity: number;
  prLineId: string | null;
  rfqLineId: string | null;
  boqLineId: string | null;
};

function requestId(req: NextRequest): string | undefined {
  const value = req.headers?.get('x-request-id');
  return value && value.length <= 128 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const ctx = await requireAuth('PPO_CREATE');
  if (!isApiContext(ctx)) return ctx;

  let projectId: string | undefined;
  let recordId: string | undefined;
  try {
    const rawBody: unknown = await req.json();
    if (!isRecord(rawBody)) {
      return apiError(UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.rateCardIDAndEitherPrIdOrRfqIdAreRequired, 400);
    }
    const rateCardId = typeof rawBody.rateCardId === 'string' ? rawBody.rateCardId.trim() : '';
    const prId = typeof rawBody.prId === 'string' && rawBody.prId.trim() ? rawBody.prId.trim() : null;
    const rfqId = typeof rawBody.rfqId === 'string' && rawBody.rfqId.trim() ? rawBody.rfqId.trim() : null;
    if (!rateCardId || Boolean(prId) === Boolean(rfqId)) {
      return apiError(UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.rateCardIDAndEitherPrIdOrRfqIdAreRequired, 400);
    }

    const rateCard = await prisma.vendorRateCard.findFirst({
      where: { id: rateCardId, tenantId: ctx.tenantId },
      include: { vendor: true, items: true },
    });
    if (!rateCard) {
      return apiError(UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.vendorRateCardNotFoundOrAccessDenied, 404, { route: '/api/procurement/rate-cards/direct-ppo', method: 'POST' });
    }
    if (rateCard.status !== 'APPROVED') {
      return apiError(interpolateUiString(
        UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.cannotCreateDirectPPORateCardIsInStatusStatusMustBeAPPROVED,
        { status: rateCard.status },
      ), 400);
    }

    const now = new Date();
    if (rateCard.validFrom > now || rateCard.validTo < now) {
      return apiError(interpolateUiString(
        UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.cannotCreateDirectPPORateCardIsExpiredOrNotYetValidValidityValue1ToValue2RouteRequirementToRegularRFQ,
        { value1: rateCard.validFrom.toISOString().split('T')[0], value2: rateCard.validTo.toISOString().split('T')[0] },
      ), 400);
    }
    if (rateCard.vendor.complianceStatus !== 'COMPLIANT') {
      return apiError(interpolateUiString(
        UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.cannotCreateDirectPPOVendorComplianceStatusIsComplianceStatus,
        { complianceStatus: rateCard.vendor.complianceStatus },
      ), 400);
    }

    let costCentreId: string | null = null;
    let boqId: string | null = null;
    let boqRevisionId: string | null = null;
    let requirementTitle = '';
    let lines: DirectPpoLine[] = [];

    if (prId) {
      const pr = await prisma.procurementRequest.findFirst({
        where: { id: prId, tenantId: ctx.tenantId },
        include: { lines: true, project: true, costCentre: true },
      });
      if (!pr) return apiError(UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.approvedProcurementRequestNotFound, 404);
      if (!DIRECT_RATE_CARD_PPO_PR_STATUSES.includes(pr.status as (typeof DIRECT_RATE_CARD_PPO_PR_STATUSES)[number])) {
        return apiError(interpolateUiString(
          UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.cannotCreateDirectPPOPRIsInStatusStatusMustBeAPPROVEDOrRELEASED,
          { status: pr.status },
        ), 400);
      }

      const existingPpo = await prisma.ppo.findFirst({
        where: { tenantId: ctx.tenantId, prId, status: { not: 'CANCELLED' } },
        select: { ppoNumber: true },
      });
      if (existingPpo) {
        return apiError(interpolateUiString(
          UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.duplicatePPOPreventedPurchaseOrderPpoNumberAlreadyExistsForThisPR,
          { ppoNumber: existingPpo.ppoNumber },
        ), 409);
      }

      projectId = pr.projectId;
      costCentreId = pr.costCentreId;
      boqId = pr.boqId;
      boqRevisionId = pr.boqRevisionId;
      requirementTitle = pr.title;
      lines = pr.lines.map((line) => ({
        id: line.id,
        lineNumber: line.lineNumber,
        description: line.itemDescription,
        specification: line.specification,
        category: line.category,
        subcategory: line.subcategory,
        uom: line.uom,
        quantity: line.quantity,
        prLineId: line.id,
        rfqLineId: null,
        boqLineId: line.boqLineId,
      }));
    } else if (rfqId) {
      const rfq = await prisma.rfq.findFirst({
        where: { id: rfqId, tenantId: ctx.tenantId },
        include: { lines: true, boqRevision: true },
      });
      if (!rfq) return apiError(UI_STRINGS.common.rFQNotFound, 404);
      if (!DIRECT_RATE_CARD_PPO_RFQ_STATUSES.includes(rfq.status as (typeof DIRECT_RATE_CARD_PPO_RFQ_STATUSES)[number])) {
        return apiError(UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.rfqMustBeApprovedBeforeDirectPpoCreation, 400);
      }

      projectId = rfq.projectId;
      costCentreId = rfq.boqRevision?.costCentreId || null;
      boqId = rfq.boqRevision?.boqId || null;
      boqRevisionId = rfq.boqRevisionId;
      requirementTitle = rfq.title;
      lines = rfq.lines.map((line) => ({
        id: line.id,
        lineNumber: line.lineNumber,
        description: line.description,
        specification: line.specification,
        category: line.category || 'General',
        subcategory: line.subcategory,
        uom: line.uom,
        quantity: line.quantity,
        prLineId: line.prLineId,
        rfqLineId: line.id,
        boqLineId: line.boqLineId,
      }));
    }

    if (!projectId) return apiError(UI_STRINGS.common.projectNotFound, 404);
    const authorized = await isUserAuthorizedForProject(ctx.userId, ctx.role, projectId, ctx.tenantId);
    if (!authorized) {
      return apiError(UI_STRINGS.common.forbiddenInsufficientPermissions, 403);
    }
    if (lines.length === 0) {
      return apiError(UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.requirementHasNoLinesToSource, 400, { route: '/api/procurement/rate-cards/direct-ppo', method: 'POST' });
    }
    if (lines.length > MAX_PPO_CREATE_LINES) {
      return apiError(UI_STRINGS.appApiProcurementPposRoute.ppoHasTooManyLineItemsToCreateAtomically, 400);
    }

    let totalOrderValue = 0;
    const ppoLines = [];
    const missingLines: string[] = [];
    for (const line of lines) {
      const requirementDescription = line.description.trim().toLowerCase();
      if (!requirementDescription || !Number.isFinite(line.quantity) || line.quantity <= 0) {
        missingLines.push(line.description || line.lineNumber);
        continue;
      }
      const match = rateCard.items.find((item) => {
        const itemDescription = item.description.trim().toLowerCase();
        return itemDescription.length > 0
          && (itemDescription.includes(requirementDescription) || requirementDescription.includes(itemDescription));
      });
      if (!match || !Number.isFinite(match.rate) || match.rate < 0) {
        missingLines.push(line.description);
        continue;
      }

      const lineTotal = match.rate * line.quantity;
      totalOrderValue += lineTotal;
      ppoLines.push({
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        projectId,
        costCentreId,
        boqId,
        boqRevisionId,
        boqLineId: line.boqLineId,
        prLineId: line.prLineId,
        rfqLineId: line.rfqLineId,
        vendorId: rateCard.vendorId,
        lineNumber: `PO-${line.lineNumber}`,
        itemDescription: line.description,
        specification: line.specification || match.specification,
        category: line.category,
        subcategory: line.subcategory,
        uom: line.uom,
        orderedQuantity: line.quantity,
        orderedUnitRate: match.rate,
        orderedAmount: lineTotal,
        taxAmount: 0,
        totalOrderValue: lineTotal,
      });
    }
    if (missingLines.length > 0) {
      return apiError(interpolateUiString(
        UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.cannotCreateDirectPPORateCardDoesNotCoverAllItemsLengthItemSMissingEGValue2RouteRequirementToCompetitiveRFQ,
        { length: missingLines.length, value2: missingLines[0] },
      ), 400);
    }

    const deliveryTerms = typeof rawBody.deliveryTerms === 'string' && rawBody.deliveryTerms.trim()
      ? rawBody.deliveryTerms.trim() : rateCard.terms || DIRECT_RATE_CARD_PPO_DEFAULT_DELIVERY_TERMS;
    const paymentTerms = typeof rawBody.paymentTerms === 'string' && rawBody.paymentTerms.trim()
      ? rawBody.paymentTerms.trim() : rateCard.terms || DIRECT_RATE_CARD_PPO_DEFAULT_PAYMENT_TERMS;
    const taxDetails = typeof rawBody.taxDetails === 'string' && rawBody.taxDetails.trim()
      ? rawBody.taxDetails.trim() : DIRECT_RATE_CARD_PPO_DEFAULT_TAX_DETAILS;
    const ppoId = crypto.randomUUID();
    recordId = ppoId;
    const issuedAt = new Date();
    const ppoTitle = interpolateUiString(
      UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.directPPORateCardRateCardNumberRequirementTitle,
      { rateCardNumber: rateCard.rateCardNumber, requirementTitle },
    );
    const year = issuedAt.getFullYear();
    const prefix = `PPO-${year}-`;
    const ppoVendorName = rateCard.vendor.name;

    for (let attempt = 0; attempt < DIRECT_RATE_CARD_PPO_CODE_RETRIES; attempt += 1) {
      const latest = await prisma.ppo.findFirst({
        where: { tenantId: ctx.tenantId, ppoNumber: { startsWith: prefix } },
        orderBy: { ppoNumber: 'desc' },
        select: { ppoNumber: true },
      });
      const latestSuffix = latest?.ppoNumber?.startsWith(prefix) ? Number(latest.ppoNumber.slice(prefix.length)) || 0 : 0;
      const ppoNumber = `${prefix}${String(latestSuffix + 1).padStart(6, '0')}`;
      const createdAt = new Date();
      const auditId = crypto.randomUUID();
      const notificationPayload = await notifyNextResponsibleParty({
        tenantId: ctx.tenantId,
        event: 'PPO_CREATED',
        recordNumber: ppoNumber,
        entityId: ppoId,
        actorName: ctx.userName,
        details: { vendorName: ppoVendorName, amount: totalOrderValue },
      }, { prepareOnly: true });
      const preparedNotification = notificationPayload
        ? prepareNotificationOutbox(notificationPayload, createdAt, auditId)
        : null;
      const headerValues = [
        ppoId, ctx.tenantId, projectId, costCentreId, boqId, boqRevisionId, rfqId, rateCard.vendorId,
        prId, rateCardId, ppoNumber, ppoTitle, totalOrderValue, deliveryTerms, paymentTerms, taxDetails,
        issuedAt, ctx.userId, createdAt, createdAt,
        projectId, ctx.tenantId,
        rateCardId, ctx.tenantId, rateCard.vendorId, issuedAt, issuedAt,
        prId, prId, ctx.tenantId, projectId,
        rfqId, rfqId, ctx.tenantId, projectId,
        ctx.tenantId, prId,
        ctx.tenantId, rfqId, rateCard.vendorId,
      ];
      const statements: D1BatchInputStatement[] = [
        { sql: DIRECT_RATE_CARD_PPO_INSERT_IF_VALID_SQL, values: headerValues },
        ...ppoLines.map((line) => ({
          sql: PPO_LINE_INSERT_AFTER_HEADER_SQL,
          values: [
            line.id, line.tenantId, ppoId, line.projectId, line.costCentreId, line.boqId, line.boqRevisionId,
            line.boqLineId, line.prLineId, line.rfqLineId, line.vendorId, line.lineNumber, line.itemDescription,
            line.specification, line.category, line.subcategory, line.uom, line.orderedQuantity, line.orderedUnitRate,
            line.orderedAmount, line.taxAmount, line.totalOrderValue, issuedAt, createdAt, createdAt, ppoId, ctx.tenantId,
          ],
        })),
        {
          sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
          values: [
            auditId, ctx.tenantId, ctx.userId, projectId, 'PPO', ppoId, 'PPO_CREATED_FROM_RATE_CARD',
            interpolateUiString(
              UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.directPPOPpoNumberIssuedToNameUnderApprovedRateCardRateCardNumberTotalToLocaleString,
              { ppoNumber, name: ppoVendorName, rateCardNumber: rateCard.rateCardNumber, toLocaleString: totalOrderValue.toLocaleString() },
            ),
            null,
            JSON.stringify({ ppoNumber, rateCardNumber: rateCard.rateCardNumber, vendorName: ppoVendorName, totalValue: totalOrderValue, prId }),
            null, null, createdAt,
          ],
        },
      ];
      if (preparedNotification) statements.push(preparedNotification.statement);

      if (statements.length > MAX_D1_BATCH_STATEMENTS || !isD1BatchWithinLimits(statements)) {
        return apiError(UI_STRINGS.appApiProcurementPposRoute.ppoHasTooManyLineItemsToCreateAtomically, 400);
      }

      let results;
      try {
        results = await writeD1BatchAtomically(statements);
      } catch (error) {
        const duplicate = await prisma.ppo.findFirst({
          where: {
            tenantId: ctx.tenantId,
            status: { not: 'CANCELLED' },
            ...(prId ? { prId } : { rfqId, vendorId: rateCard.vendorId }),
          },
          select: { ppoNumber: true },
        });
        if (duplicate) {
          return apiError(interpolateUiString(
            UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.duplicatePPOPreventedPurchaseOrderPpoNumberAlreadyExistsForThisPR,
            { ppoNumber: duplicate.ppoNumber },
          ), 409);
        }
        throw error;
      }

      const headerInserted = Number(results[0]?.meta?.changes || 0) === 1;
      const linesInserted = results.slice(1, 1 + ppoLines.length).every((result) => Number(result.meta?.changes || 0) === 1);
      const auditIndex = 1 + ppoLines.length;
      const auditInserted = Number(results[auditIndex]?.meta?.changes || 0) === 1;
      const outboxInserted = preparedNotification
        ? Number(results[auditIndex + 1]?.meta?.changes || 0) === 1
        : true;
      if (!headerInserted || !linesInserted || !auditInserted || !outboxInserted) {
        const codeCollision = await prisma.ppo.findFirst({
          where: { tenantId: ctx.tenantId, ppoNumber },
          select: { id: true },
        });
        if (codeCollision) continue;
        const duplicate = await prisma.ppo.findFirst({
          where: {
            tenantId: ctx.tenantId,
            status: { not: 'CANCELLED' },
            ...(prId ? { prId } : { rfqId, vendorId: rateCard.vendorId }),
          },
          select: { ppoNumber: true },
        });
        if (duplicate) {
          return apiError(interpolateUiString(
            UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.duplicatePPOPreventedPurchaseOrderPpoNumberAlreadyExistsForThisPR,
            { ppoNumber: duplicate.ppoNumber },
          ), 409);
        }
        logEvent('warn', 'ppo.direct_rate_card_persistence_guard_rejected', {
          operation: 'create', route: '/api/procurement/rate-cards/direct-ppo', requestId: requestId(req),
          tenantId: ctx.tenantId, projectId, recordId: ppoId, ppoNumber, headerInserted, linesInserted, auditInserted,
        }, 'next');
        return apiError(UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.directPpoSourceChangedPleaseReloadAndRetry, 409);
      }

      const ppo = {
        id: ppoId,
        tenantId: ctx.tenantId,
        projectId,
        costCentreId,
        boqId,
        boqRevisionId,
        rfqId,
        vendorId: rateCard.vendorId,
        awardRecommendationId: null,
        prId,
        rateCardId,
        sourcingType: 'DIRECT_RATE_CARD',
        ppoNumber,
        title: ppoTitle,
        totalValue: totalOrderValue,
        currency: 'INR',
        status: 'ISSUED',
        deliveryTerms,
        paymentTerms,
        taxDetails,
        issuedAt,
        createdById: ctx.userId,
        createdAt,
        updatedAt: createdAt,
        project: { id: projectId },
        vendor: rateCard.vendor,
        rateCard,
        lines: ppoLines.map((line) => ({ ...line, ppoId, status: 'ISSUED', orderDate: issuedAt, createdAt, updatedAt: createdAt })),
      };

      if (preparedNotification) {
        await dispatchPreparedWorkflowNotification(preparedNotification.id, createdAt, {
          tenantId: ctx.tenantId, entityType: 'PPO', entityId: ppoId,
          route: '/api/procurement/rate-cards/direct-ppo',
        });
      }

      return apiSuccess({
        ppo,
        message: interpolateUiString(
          UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.directPPOPpoNumberCreatedSuccessfullyFromApprovedRateCardRateCardNumber,
          { ppoNumber, rateCardNumber: rateCard.rateCardNumber },
        ),
      }, 201);
    }

    return apiError(UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.ppoNumberConflictRetryTheRequest, 409);
  } catch (error) {
    logEvent('error', 'ppo.direct_rate_card_create_failed', {
      operation: 'create', route: '/api/procurement/rate-cards/direct-ppo', requestId: requestId(req),
      tenantId: ctx.tenantId, projectId, recordId, durationMs: Date.now() - startedAt, error,
    }, 'next');
    return apiError(UI_STRINGS.common.userMessages.failedToCreateDirectPpo, 500);
  }
}
