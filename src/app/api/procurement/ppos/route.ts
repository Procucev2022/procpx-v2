// Purchase / Procurement Order generation from an approved award.
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError, getListPageWindow } from '@/lib/api-utils';
import { dispatchPreparedWorkflowNotification, notifyNextResponsibleParty } from '@/lib/notifications';
import { hasPermission } from '@/lib/permissions';
import { getUserProjectAccessFilter, isUserAuthorizedForProject } from '@/lib/project-auth';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import { isD1BatchWithinLimits, writeD1BatchAtomically } from '@/lib/d1-batch';
import {
  AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
  MAX_D1_BATCH_STATEMENTS,
  MAX_PPO_CREATE_LINES,
  PPO_INSERT_IF_VALID_SQL,
  PPO_LINE_INSERT_SQL,
  RFQ_MARK_AWARDED_AFTER_PPO_INSERT_SQL,
} from '@/lib/d1-batch.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { prepareNotificationOutbox } from '@/lib/notification-outbox';
import type { D1BatchInputStatement } from '@app-types/lib/d1-batch.types';
import {
  D1_PPO_AUDIT_RESULT_MISSING,
  D1_PPO_NOTIFICATION_PAYLOAD_MISSING,
  PPO_CREATE_ACTIONS,
  PPO_CREATION_RFQ_STATUSES,
} from './route.constants';

function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  return /unique constraint|unique failed|P2002/i.test(message);
}

function isPpoNumberCollision(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  return /ppos[.\"]tenantId[.\"]?\s*,\s*ppos[.\"]ppoNumber/i.test(message);
}

async function getNextPpoNumber(tenantId: string, year: number): Promise<string> {
  const prefix = `PPO-${year}-`;
  const latest = await prisma.ppo.findFirst({
    where: { tenantId, ppoNumber: { startsWith: prefix } },
    orderBy: { ppoNumber: 'desc' },
    select: { ppoNumber: true },
  });
  const sequence = Number(latest?.ppoNumber?.slice(prefix.length)) || 0;
  return `${prefix}${String(sequence + 1).padStart(6, '0')}`;
}

export async function GET(req: NextRequest) {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;
  if (!hasPermission(ctx.role, 'PPO_VIEW') && !hasPermission(ctx.role, 'VENDOR_RATE_PPO')) {
    return apiError(UI_STRINGS.common.forbiddenInsufficientPermissions, 403, { route: '/api/procurement/ppos', method: 'GET' });
  }

  const startedAt = Date.now();
  const { searchParams } = new URL(req.url);
  const rfqId = searchParams.get('rfqId');
  const projectId = searchParams.get('projectId');
  const { page, pageSize, skip } = getListPageWindow(searchParams);
  try {
    const projectAccessFilter = await getUserProjectAccessFilter(ctx.userId, ctx.role, ctx.tenantId);
    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      ...(projectAccessFilter ? { project: { is: projectAccessFilter } } : {}),
    };
    if (rfqId) where.rfqId = rfqId;
    if (projectId) where.projectId = projectId;

    const ratingWhere: Record<string, unknown> = { tenantId: ctx.tenantId };
    if (projectId) ratingWhere.ppo = { projectId };
    if (projectAccessFilter) ratingWhere.ppo = { is: { project: { is: projectAccessFilter }, ...(projectId ? { projectId } : {}) } };

    const [total, committedValueAggregate, ratingGroups, ppos] = await Promise.all([
      prisma.ppo.count({ where }),
      prisma.ppo.aggregate({ where, _sum: { totalValue: true } }),
      prisma.ppoVendorRating.groupBy({ by: ['status'], where: ratingWhere, _count: { _all: true } }),
      prisma.ppo.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          project: { select: { id: true, name: true, projectCode: true } },
          vendor: { select: { id: true, name: true, code: true } },
          vendorRating: {
            select: {
              id: true,
              status: true,
              qualityScore: true,
              deliveryScore: true,
              commercialComplianceScore: true,
              responsivenessScore: true,
              documentationClosureScore: true,
              overallScore: true,
              criteriaDetails: true,
              comments: true,
            },
          },
          rfq: {
            select: {
              id: true,
              rfqNumber: true,
              packageName: true,
              boqRevision: {
                select: { id: true, revisionCode: true, boq: { select: { id: true, boqCode: true } } },
              },
            },
          },
        },
      }),
    ]);

    const isProcurementUser = ctx.role === 'PROCUREMENT_USER';
    const ratingParseFailures: string[] = [];
    const pposWithParsedRatings = ppos.map((ppo) => {
      let rating = ppo.vendorRating;
      if (rating && isProcurementUser && rating.status !== 'APPROVED') rating = null;
      let parsedCriteria: Record<string, any> = {};
      if (rating?.criteriaDetails) {
        try {
          parsedCriteria = typeof rating.criteriaDetails === 'string'
            ? JSON.parse(rating.criteriaDetails)
            : rating.criteriaDetails;
        } catch {
          ratingParseFailures.push(ppo.id);
        }
      }
      return {
        ...ppo,
        vendorRating: rating
          ? {
              ...rating,
              criteriaDetailsParsed: parsedCriteria,
              qualityComments: parsedCriteria.qualityComments || '',
              deliveryComments: parsedCriteria.deliveryComments || '',
              commercialComments: parsedCriteria.commercialComments || '',
              documentationComments: parsedCriteria.documentationComments || '',
              responsivenessComments: parsedCriteria.responsivenessComments || '',
              overallImprovement: parsedCriteria.overallImprovement || '',
              approverComments: parsedCriteria.approverComments || '',
              approvedBy: parsedCriteria.approvedBy || null,
              approvedByName: parsedCriteria.approvedByName || null,
              approvedAt: parsedCriteria.approvedAt || null,
              returnReason: parsedCriteria.returnReason || null,
              decisionHistory: parsedCriteria.history || [],
            }
          : null,
      };
    });
    if (ratingParseFailures.length > 0) {
      await writeStructuredLog('warn', 'procurement.ppo_rating_details_parse_failed', {
        operation: 'parse_vendor_rating_details',
        route: '/api/procurement/ppos',
        requestId: req.headers.get('x-request-id'),
        tenantId: ctx.tenantId,
        ppoIds: ratingParseFailures,
      });
    }

    return apiSuccess({
      ppos: pposWithParsedRatings,
      total,
      totalCommittedValue: committedValueAggregate._sum.totalValue || 0,
      ratingCounts: Object.fromEntries(ratingGroups.map((group) => [group.status, group._count._all])),
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      currentUserRole: ctx.role,
      isProcurementUser,
    });
  } catch (error: unknown) {
    await writeStructuredLog('error', 'procurement.ppos_read_failed', {
      operation: 'read_ppos',
      route: '/api/procurement/ppos',
      requestId: req.headers.get('x-request-id'),
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToFetchPpos, 500);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('PPO_CREATE');
  if (!isApiContext(ctx)) return ctx;
  const startedAt = Date.now();
  const requestId = req.headers.get('x-request-id') || undefined;
  let rfqId: string | undefined;
  let selectedVendorId: string | undefined;
  let selectedVendorName: string | undefined;

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const payload = body as Record<string, unknown>;
    rfqId = typeof payload.rfqId === 'string' ? payload.rfqId.trim() : undefined;
    const awardRecommendationId = typeof payload.awardRecommendationId === 'string'
      ? payload.awardRecommendationId.trim()
      : undefined;
    const targetVendorId = typeof payload.targetVendorId === 'string' ? payload.targetVendorId.trim() : undefined;
    const justification = typeof payload.justification === 'string' ? payload.justification.trim() : '';
    const action = payload.action === undefined ? 'ISSUE_PPO' : payload.action;
    if (!rfqId) return apiError(UI_STRINGS.appApiProcurementPposRoute.rFQIDIsRequiredToGeneratePPO, 400);
    if (typeof action !== 'string' || !PPO_CREATE_ACTIONS.includes(action as typeof PPO_CREATE_ACTIONS[number])) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    for (const field of ['deliveryTerms', 'paymentTerms', 'taxDetails'] as const) {
      if (payload[field] !== undefined && payload[field] !== null && typeof payload[field] !== 'string') {
        return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      }
    }

    const rfq = await prisma.rfq.findFirst({
      where: { id: rfqId, tenantId: ctx.tenantId },
      include: {
        project: true,
        boqRevision: true,
        lines: true,
        quotes: {
          orderBy: [{ quoteVersion: 'desc' }, { createdAt: 'desc' }],
          include: { lines: true, vendor: true },
        },
        awards: {
          where: { status: 'APPROVED' },
          include: { recommendedVendor: true },
          orderBy: { approvedAt: 'desc' },
        },
      },
    });
    if (!rfq) return apiError(UI_STRINGS.common.rFQNotFoundOrAccessDenied, 404);

    const authorized = await isUserAuthorizedForProject(ctx.userId, ctx.role, rfq.projectId, ctx.tenantId);
    if (!authorized) {
      return apiError(UI_STRINGS.common.forbiddenInsufficientPermissions, 403);
    }
    if (!(PPO_CREATION_RFQ_STATUSES as readonly string[]).includes(rfq.status)) {
      return apiError(UI_STRINGS.appApiProcurementPposRoute.rFQMustHaveAnApprovedAwardBeforePpoCreation, 409);
    }

    let award: any = null;
    if (awardRecommendationId) {
      award = await prisma.awardRecommendation.findFirst({
        where: { id: awardRecommendationId, tenantId: ctx.tenantId, rfqId },
        include: { recommendedVendor: true },
      });
      if (!award || award.rfqId !== rfqId) return apiError(UI_STRINGS.common.awardRecommendationNotFound, 404);
      if (award.status !== 'APPROVED') {
        return apiError(UI_STRINGS.appApiProcurementPposRoute.awardRecommendationMustBeApprovedBeforeCreatingPpo, 409);
      }
    } else if (targetVendorId) {
      award = rfq.awards.find((item: { recommendedVendorId: string }) => item.recommendedVendorId === targetVendorId) || null;
      if (!award && rfq.awards.length > 0) {
        return apiError(UI_STRINGS.appApiProcurementPposRoute.selectedVendorMustMatchApprovedAwardRecommendation, 409);
      }
    } else if (rfq.awards.length === 1) {
      award = rfq.awards[0];
    } else if (rfq.awards.length > 1) {
      return apiError(UI_STRINGS.appApiProcurementPposRoute.awardRecommendationIdRequiredWhenMultipleApprovedAwardsExist, 400);
    }

    if (!award) {
      return apiError(UI_STRINGS.appApiProcurementPposRoute.awardRecommendationMustBeApprovedBeforeCreatingPpo, 409);
    }
    if (targetVendorId && targetVendorId !== award.recommendedVendorId) {
      return apiError(UI_STRINGS.appApiProcurementPposRoute.selectedVendorMustMatchApprovedAwardRecommendation, 409);
    }
    const vendorId = typeof award.recommendedVendorId === 'string' ? award.recommendedVendorId : '';
    if (!vendorId) return apiError(UI_STRINGS.common.invalidRequestBody, 409);
    selectedVendorId = vendorId;

    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, tenantId: ctx.tenantId },
      select: { id: true, name: true },
    });
    if (!vendor) return apiError(UI_STRINGS.common.vendorNotFoundOrAccessDenied, 404);
    selectedVendorName = vendor.name;
    const invitation = await prisma.rfqVendor.findFirst({
      where: { tenantId: ctx.tenantId, rfqId, vendorId },
      select: { id: true },
    });
    if (!invitation) return apiError(UI_STRINGS.appApiProcurementAwardsRoute.recommendedVendorWasNotInvitedToThisRFQ, 409);

    const latestQuoteByVendor = new Map<string, typeof rfq.quotes[number]>();
    for (const quote of rfq.quotes) {
      if (!latestQuoteByVendor.has(quote.vendorId)) latestQuoteByVendor.set(quote.vendorId, quote);
    }
    const rankedQuotes = Array.from(latestQuoteByVendor.values())
      .sort((left, right) => left.totalQuoteAmount - right.totalQuoteAmount);
    const selectedQuote = latestQuoteByVendor.get(vendorId);
    if (!selectedQuote) {
      return apiError(UI_STRINGS.appApiProcurementPposRoute.cannotGeneratePPONoValidQuotationFoundForTheSelectedVendor, 400);
    }
    const quoteTotal = Number(selectedQuote.totalQuoteAmount);
    const totalValue = Number(award.finalNegotiatedAmount);
    if (!Number.isFinite(quoteTotal) || quoteTotal < 0 || !Number.isFinite(totalValue) || totalValue < 0) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 409);
    }
    if (Math.abs(quoteTotal - totalValue) > 0.01) {
      return apiError(UI_STRINGS.appApiProcurementPposRoute.approvedAwardAmountMustMatchTheLatestQuoteForPpoCreation, 409);
    }

    const vendorRankIndex = rankedQuotes.findIndex((quote) => quote.vendorId === vendorId);
    const rankAtAward = vendorRankIndex >= 0 ? vendorRankIndex + 1 : 1;
    const isL1 = rankAtAward === 1;
    const awardJustification = justification || (typeof award.justification === 'string' ? award.justification.trim() : '');
    if (!isL1 && !awardJustification) {
      return apiError(
        interpolateUiString(UI_STRINGS.appApiProcurementPposRoute.vendorNameIsRankedLRankAtAwardAMandatoryCommercialJustificationIsRequiredWhenAwardingRaisingPPOForANonL1Vendor, {
          name: vendor.name,
          rankAtAward,
        }),
        400,
      );
    }

    const existingPpo = await prisma.ppo.findFirst({
      where: { tenantId: ctx.tenantId, rfqId, vendorId, sourcingType: 'REGULAR_RFQ', status: { not: 'CANCELLED' } },
      select: { ppoNumber: true },
    });
    if (existingPpo) {
      return apiError(
        interpolateUiString(UI_STRINGS.appApiProcurementPposRoute.anActivePurchaseOrderPpoNumberHasAlreadyBeenRaisedForNameOnThisRFQ, {
          ppoNumber: existingPpo.ppoNumber,
          name: vendor.name,
        }),
        409,
      );
    }

    const quoteLineMap = new Map<string, { rate: number; lineTotal: number }>();
    for (const quoteLine of selectedQuote.lines) {
      const rate = Number(quoteLine.unitRate);
      const lineTotal = Number(quoteLine.lineTotal);
      if (!quoteLine.rfqLineId || quoteLineMap.has(quoteLine.rfqLineId)
        || !Number.isFinite(rate) || rate < 0 || !Number.isFinite(lineTotal) || lineTotal < 0) {
        return apiError(UI_STRINGS.appApiProcurementPposRoute.selectedQuotationDoesNotContainValidRatesForEveryRfqLine, 409);
      }
      quoteLineMap.set(quoteLine.rfqLineId, { rate, lineTotal });
    }
    if (quoteLineMap.size !== rfq.lines.length || rfq.lines.some((line: { id: string; quantity: number }) => {
      return !quoteLineMap.has(line.id) || !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0;
    })) {
      return apiError(UI_STRINGS.appApiProcurementPposRoute.selectedQuotationDoesNotContainValidRatesForEveryRfqLine, 409);
    }

    let ppoNumber = await getNextPpoNumber(ctx.tenantId, new Date().getFullYear());
    const isIssued = action === 'ISSUE_PPO';
    const initialStatus = isIssued ? 'ISSUED' : 'DRAFT';
    const now = new Date();
    const ppoId = crypto.randomUUID();
    const ppoTitle = interpolateUiString(UI_STRINGS.appApiProcurementPposRoute.purchaseOrderTitleVendorNameQuoteVQuoteVersion, {
      title: rfq.title,
      vendorName: vendor.name,
      quoteVersion: selectedQuote.quoteVersion,
    });
    const ppoLines = rfq.lines.map((line: any, index: number) => {
      const quoteLine = quoteLineMap.get(line.id)!;
      const orderedAmount = quoteLine.lineTotal;
      return {
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        ppoId,
        projectId: rfq.projectId,
        costCentreId: line.costCentreId || rfq.boqRevision?.costCentreId || null,
        boqId: rfq.boqRevision?.boqId || null,
        boqRevisionId: rfq.boqRevisionId || null,
        boqLineId: line.boqLineId || null,
        prLineId: line.prLineId || null,
        rfqLineId: line.id,
        vendorId,
        lineNumber: `PO-${line.lineNumber || index + 1}`,
        itemDescription: line.description,
        specification: line.specification,
        category: line.category,
        subcategory: line.subcategory,
        uom: line.uom,
        orderedQuantity: Number(line.quantity),
        orderedUnitRate: quoteLine.rate,
        orderedAmount,
        taxAmount: 0,
        totalOrderValue: orderedAmount,
        orderDate: now,
        expectedCompletionDate: null,
        completedQuantity: 0,
        completedAmount: 0,
        status: initialStatus,
        createdAt: now,
        updatedAt: now,
      };
    });
    if (ppoLines.length > MAX_PPO_CREATE_LINES) {
      return apiError(UI_STRINGS.appApiProcurementPposRoute.ppoHasTooManyLineItemsToCreateAtomically, 400);
    }

    const ppo = {
      id: ppoId,
      tenantId: ctx.tenantId,
      projectId: rfq.projectId,
      costCentreId: rfq.boqRevision?.costCentreId || null,
      boqId: rfq.boqRevision?.boqId || null,
      boqRevisionId: rfq.boqRevisionId || null,
      rfqId,
      vendorId,
      awardRecommendationId: award.id,
      prId: rfq.prId || null,
      sourcingType: 'REGULAR_RFQ',
      ppoNumber,
      title: ppoTitle,
      totalValue,
      currency: 'INR',
      status: initialStatus,
      deliveryTerms: payload.deliveryTerms || rfq.deliveryRequirement || UI_STRINGS.appApiProcurementPposRoute.defaultPpoDeliveryTerms,
      paymentTerms: payload.paymentTerms || rfq.paymentTerms || UI_STRINGS.appApiProcurementPposRoute.defaultPpoPaymentTerms,
      taxDetails: payload.taxDetails || rfq.taxTerms || UI_STRINGS.appApiProcurementPposRoute.defaultPpoTaxDetails,
      issuedAt: isIssued ? now : null,
      completedAt: null,
      vendorStatus: 'PENDING_VENDOR_ACCEPTANCE',
      vendorAcceptedAt: null,
      vendorAcceptedBy: null,
      vendorAcceptedVersion: 1,
      vendorIssueRemarks: null,
      vendorIssueRaisedAt: null,
      createdById: ctx.userId,
      createdAt: now,
      updatedAt: now,
      project: rfq.project,
      vendor,
      rfq: Object.fromEntries(Object.entries(rfq).filter(([key]) => !['project', 'boqRevision', 'lines', 'quotes', 'awards'].includes(key))),
      lines: ppoLines,
    };

    const auditId = crypto.randomUUID();
    const notificationPayload = await notifyNextResponsibleParty({
      tenantId: ctx.tenantId,
      event: 'PPO_CREATED',
      recordNumber: ppoNumber,
      entityId: ppo.id,
      actorName: ctx.userName,
      details: { vendorName: vendor.name, amount: totalValue },
    }, { prepareOnly: true });
    const preparedNotification = notificationPayload
      ? prepareNotificationOutbox(notificationPayload, now, auditId)
      : null;
    const makeAuditDescription = (currentPpoNumber: string) => interpolateUiString(
      UI_STRINGS.appApiProcurementPposRoute.purchaseOrderPpoNumberRaisedForVendorNameRankLRankAtAwardQuoteVQuoteVersionToLocaleStringOnRFQRfqNumber,
      {
        ppoNumber: currentPpoNumber,
        vendorName: vendor.name,
        rankAtAward,
        quoteVersion: selectedQuote.quoteVersion,
        toLocaleString: totalValue.toLocaleString(I18N_CONFIG.defaultLocale),
        rfqNumber: rfq.rfqNumber,
      },
    );
    const statements: D1BatchInputStatement[] = [{
      sql: PPO_INSERT_IF_VALID_SQL,
      values: [
        ppo.id, ppo.tenantId, ppo.projectId, ppo.costCentreId, ppo.boqId, ppo.boqRevisionId,
        ppo.rfqId, ppo.vendorId, ppo.awardRecommendationId, ppo.prId, ppo.sourcingType,
        ppo.ppoNumber, ppo.title, ppo.totalValue, ppo.currency, ppo.status, ppo.deliveryTerms,
        ppo.paymentTerms, ppo.taxDetails, ppo.issuedAt?.toISOString() || null, ppo.createdById,
        now.toISOString(), now.toISOString(),
        rfqId, ctx.tenantId, award.id, ctx.tenantId, rfqId, vendorId,
        ctx.tenantId, rfqId, vendorId,
      ],
    }];
    statements.push(...ppoLines.map((line) => ({
      sql: PPO_LINE_INSERT_SQL,
      values: [
        line.id, line.tenantId, line.ppoId, line.projectId, line.costCentreId, line.boqId,
        line.boqRevisionId, line.boqLineId, line.prLineId, line.rfqLineId, line.vendorId,
        line.lineNumber, line.itemDescription, line.specification, line.category, line.subcategory,
        line.uom, line.orderedQuantity, line.orderedUnitRate, line.orderedAmount, line.taxAmount,
        line.totalOrderValue, now.toISOString(), null, line.completedQuantity, line.completedAmount,
        line.status, now.toISOString(), now.toISOString(),
      ],
    })));
    statements.push({
      sql: RFQ_MARK_AWARDED_AFTER_PPO_INSERT_SQL,
      values: [initialStatus, now.toISOString(), rfqId, ctx.tenantId, ppo.id, ctx.tenantId, rfqId, award.id, award.id, ctx.tenantId, rfqId],
    });
    statements.push({
      sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
      values: [auditId, ctx.tenantId, ctx.userId, rfq.projectId, 'PPO', ppo.id, 'PPO_CREATED', makeAuditDescription(ppoNumber),
        null, JSON.stringify({ ppoNumber, vendorId, awardRecommendationId: award.id, totalValue, quoteVersion: selectedQuote.quoteVersion, rankAtAward, justification: awardJustification || (isL1 ? UI_STRINGS.appApiProcurementPposRoute.l1PpoAuditJustification : UI_STRINGS.appApiProcurementPposRoute.nonL1PpoAuditJustification) }),
        null, null, now],
    });
    if (preparedNotification) statements.push(preparedNotification.statement);
    if (statements.length > MAX_D1_BATCH_STATEMENTS || !isD1BatchWithinLimits(statements)) {
      return apiError(UI_STRINGS.appApiProcurementPposRoute.ppoHasTooManyLineItemsToCreateAtomically, 400);
    }

    let results: Awaited<ReturnType<typeof writeD1BatchAtomically>> = [];
    let writeSucceeded = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        results = await writeD1BatchAtomically(statements);
        writeSucceeded = true;
        break;
      } catch (error) {
        if (!isPpoNumberCollision(error) || attempt === 2) throw error;
        ppoNumber = await getNextPpoNumber(ctx.tenantId, new Date().getFullYear());
        ppo.ppoNumber = ppoNumber;
        statements[0].values[11] = ppoNumber;
        const auditStatement = statements.find(({ sql }) => sql === AUDIT_LOG_INSERT_AFTER_CHANGE_SQL);
        const auditValues = auditStatement?.values;
        if (!auditValues) throw new Error(D1_PPO_AUDIT_RESULT_MISSING);
        auditValues[7] = makeAuditDescription(ppoNumber);
        const auditNewValue = JSON.parse(String(auditValues[9])) as Record<string, unknown>;
        auditNewValue.ppoNumber = ppoNumber;
        auditValues[9] = JSON.stringify(auditNewValue);
        if (preparedNotification) {
          const retryNotificationPayload = await notifyNextResponsibleParty({
            tenantId: ctx.tenantId,
            event: 'PPO_CREATED',
            recordNumber: ppoNumber,
            entityId: ppo.id,
            actorName: ctx.userName,
            details: { vendorName: vendor.name, amount: totalValue },
          }, { prepareOnly: true });
          if (!retryNotificationPayload) throw new Error(D1_PPO_NOTIFICATION_PAYLOAD_MISSING);
          preparedNotification.statement.values[2] = JSON.stringify(retryNotificationPayload);
        }
      }
    }
    if (!writeSucceeded) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    const ppoInserted = Number(results[0]?.meta?.changes || 0) === 1;
    const rfqUpdated = Number(results[1 + ppoLines.length]?.meta?.changes || 0) === 1;
    const outboxInserted = preparedNotification
      ? Number(results[3 + ppoLines.length]?.meta?.changes || 0) === 1
      : true;
    if (!ppoInserted || !rfqUpdated || !outboxInserted) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }

    if (preparedNotification) {
      await dispatchPreparedWorkflowNotification(preparedNotification.id, now, {
        tenantId: ctx.tenantId, entityType: 'PPO', entityId: ppo.id, route: '/api/procurement/ppos',
      });
    }
    return apiSuccess({
      ppo,
      message: interpolateUiString(UI_STRINGS.appApiProcurementPposRoute.pPOPpoNumberRaisedSuccessfullyForVendorNameQuoteVQuoteVersion, {
        ppoNumber,
        vendorName: vendor.name,
        quoteVersion: selectedQuote.quoteVersion,
      }),
      ppoNumber,
    }, 201);
  } catch (error: unknown) {
    if (isUniqueConstraintError(error) && rfqId && selectedVendorId) {
      try {
        const existing = await prisma.ppo.findFirst({
          where: { tenantId: ctx.tenantId, rfqId, vendorId: selectedVendorId, sourcingType: 'REGULAR_RFQ', status: { not: 'CANCELLED' } },
          select: { ppoNumber: true },
        });
        if (existing) {
          return apiError(interpolateUiString(UI_STRINGS.appApiProcurementPposRoute.anActivePurchaseOrderPpoNumberHasAlreadyBeenRaisedForNameOnThisRFQ, {
            ppoNumber: existing.ppoNumber,
            name: selectedVendorName || selectedVendorId,
          }), 409);
        }
      } catch {
        // Keep the original unique-index diagnostic for structured logging.
      }
      await writeStructuredLog('warn', 'procurement.ppo_create_conflict', {
        operation: 'create_ppo', route: '/api/procurement/ppos', requestId,
        tenantId: ctx.tenantId, rfqId, vendorId: selectedVendorId,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
      });
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }
    await writeStructuredLog('error', 'procurement.ppo_create_failed', {
      operation: 'create_ppo',
      route: '/api/procurement/ppos',
      requestId,
      tenantId: ctx.tenantId,
      rfqId,
      vendorId: selectedVendorId,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToGeneratePpo, 500);
  }
}
