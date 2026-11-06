// app/api/procurement/rfqs/[id]/route.ts
// Detailed RFQ view and status transition/editing endpoint
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { hasPermission } from '@/lib/permissions';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import { AUDIT_LOG_INSERT_AFTER_CHANGE_SQL } from '@/lib/d1-batch.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { getNegotiationHistoryPageMetadata, paginateNegotiationHistory } from '@/lib/negotiation-history';
import { NEGOTIATION_HISTORY_PAGE_SIZE } from '@/lib/negotiation-history.constants';
import { RFQ_INVITATION_MARK_RELEASED_SQL, RFQ_TRANSITION_ALLOWED_FIELDS } from './route.constants';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import type { RfqDetailQuoteSummary, RfqLatestQuoteSummaryRow } from '@app-types/app/api/procurement/rfqs.types';


export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;
  const startedAt = Date.now();
  const searchParams = new URL(req.url).searchParams;
  const includeNegotiationHistory = searchParams.get('includeNegotiationHistory') === 'true';
  const rawHistoryVendorId = includeNegotiationHistory ? searchParams.get('vendorId') : null;
  const requestedHistoryVendorId = rawHistoryVendorId?.trim() || null;

  if (rawHistoryVendorId !== null && (!requestedHistoryVendorId || requestedHistoryVendorId.length > 100 || !/^[A-Za-z0-9_-]+$/.test(requestedHistoryVendorId))) {
    return apiError(UI_STRINGS.common.userMessages.invalidNegotiationHistoryVendor, 400);
  }

  if (ctx.role === 'VENDOR') {
    if (!ctx.vendorId) {
      return apiError(UI_STRINGS.common.forbiddenUnmappedVendorAccount, 403);
    }
    let isInvited;
    try {
      isInvited = await prisma.rfqVendor.findFirst({
        where: { rfqId: id, vendorId: ctx.vendorId, tenantId: ctx.tenantId },
      });
    } catch (error) {
      await writeStructuredLog('error', 'procurement.rfq_invitation_check_failed', {
        operation: 'check_rfq_vendor_invitation', route: `/api/procurement/rfqs/${id}`,
        requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined,
        tenantId: ctx.tenantId, userId: ctx.userId, rfqId: id, vendorId: ctx.vendorId,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
      }, 'application');
      return apiError(UI_STRINGS.common.userMessages.failedToFetchRfqDetail, 500);
    }
    if (!isInvited) {
      return apiError(UI_STRINGS.appApiProcurementRfqsIdRoute.forbiddenYouAreNotInvitedToThisRFQ, 403);
    }
  } else {
    if (!hasPermission(ctx.role, 'RFQ_VIEW')) {
      return apiError(UI_STRINGS.common.forbiddenInsufficientPermissions, 403);
    }
    if (includeNegotiationHistory && !hasPermission(ctx.role, 'NEGOTIATION_VIEW')) {
      return apiError(UI_STRINGS.common.forbiddenInsufficientPermissions, 403);
    }
  }

  try {
    if (includeNegotiationHistory && ctx.role !== 'VENDOR' && requestedHistoryVendorId) {
      const invitation = await prisma.rfqVendor.findFirst({
        where: { rfqId: id, tenantId: ctx.tenantId, vendorId: requestedHistoryVendorId },
        select: { id: true },
      });
      if (!invitation) {
        return apiError(UI_STRINGS.appApiProcurementRfqsIdRoute.forbiddenYouAreNotInvitedToThisRFQ, 403);
      }
    }

    const rfq = await prisma.rfq.findFirst({
      where: {
        id,
        tenantId: ctx.tenantId,
      },
      include: {
        project: { select: { id: true, name: true } },
        lines: {
          select: {
            id: true,
            lineNumber: true,
            description: true,
            specification: true,
            uom: true,
            quantity: true,
            benchmarkRate: true,
            boqLineId: true,
          },
          orderBy: { lineNumber: 'asc' },
        },
        invitedVendors: {
          where: ctx.role === 'VENDOR' ? { vendorId: ctx.vendorId! } : undefined,
          select: {
            id: true,
            vendorId: true,
            invitedAt: true,
            invitationStatus: true,
            submissionStatus: true,
            vendor: { select: { id: true, name: true, code: true } },
          },
        },
        negotiations: includeNegotiationHistory
          ? {
            take: 1,
            orderBy: { updatedAt: 'desc' },
            include: {
              rounds: {
                where: ctx.role === 'VENDOR'
                  ? { vendorId: ctx.vendorId! }
                  : requestedHistoryVendorId ? { vendorId: requestedHistoryVendorId } : undefined,
                select: {
                  id: true,
                  vendorId: true,
                  roundNumber: true,
                  deadline: true,
                  targetPrice: true,
                  previousQuoteAmount: true,
                  counterOfferAmount: true,
                  revisedQuoteAmount: true,
                  savingsAmount: true,
                  savingsPercent: true,
                  status: true,
                  notes: true,
                  isFinalOffer: true,
                  buyerDecision: true,
                  buyerDecisionDate: true,
                  buyerDecisionRemarks: true,
                  nextResponsibleParty: true,
                  lineItemsJson: true,
                  submittedByVendor: true,
                  createdAt: true,
                  vendor: { select: { id: true, name: true, code: true } },
                },
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                take: NEGOTIATION_HISTORY_PAGE_SIZE + 1,
              },
            },
          }
          : {
            select: {
              id: true,
              status: true,
              currentRound: true,
            },
          },
        awards: ctx.role === 'VENDOR' ? false : {
          select: {
            id: true,
            recommendedVendorId: true,
            originalQuoteAmount: true,
            finalNegotiatedAmount: true,
            benchmarkAmount: true,
            totalSavingsAmount: true,
            savingsPercent: true,
            justification: true,
            status: true,
            submittedAt: true,
            approvedAt: true,
            approvalRemarks: true,
            recommendedVendor: { select: { id: true, name: true, code: true } },
          },
        },
        ppos: {
          where: ctx.role === 'VENDOR' ? { vendorId: ctx.vendorId! } : undefined,
          select: {
            id: true,
            vendorId: true,
            ppoNumber: true,
            title: true,
            totalValue: true,
            status: true,
            issuedAt: true,
            createdAt: true,
            vendor: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });

    if (!rfq) {
      return apiError(UI_STRINGS.common.rFQNotFoundOrAccessDenied, 404);
    }

    const vendorScope = ctx.role === 'VENDOR' ? Prisma.sql`AND q."vendorId" = ${ctx.vendorId}` : Prisma.empty;
    const quoteRows = await prisma.$queryRaw<RfqLatestQuoteSummaryRow[]>(Prisma.sql`
      WITH quote_summaries AS (
        SELECT q."tenantId", q."rfqId", q."vendorId", COUNT(*) AS "versionCount",
          MAX(q."quoteVersion") AS "latestVersion"
        FROM "quotes" AS q
        WHERE q."tenantId" = ${ctx.tenantId} AND q."rfqId" = ${id}
          ${vendorScope}
        GROUP BY q."tenantId", q."rfqId", q."vendorId"
      )
      SELECT latest."id" AS "quoteId", latest."vendorId", latest."quoteNumber", latest."quoteVersion",
        summary."versionCount", latest."status", latest."totalBaseAmount", latest."taxAmount",
        latest."discountAmount", latest."totalQuoteAmount", latest."commercialTerms",
        latest."paymentTermsOffered", latest."deliveryLeadTimeDays", latest."validUntil",
        latest."submittedAt", latest."createdAt", vendor."id" AS "vendorRecordId",
        vendor."name" AS "vendorName", vendor."code" AS "vendorCode",
        quoteLine."id" AS "quoteLineId", quoteLine."rfqLineId", quoteLine."unitRate",
        quoteLine."taxPercent", quoteLine."discountPercent", quoteLine."lineTotal",
        quoteLine."remarks" AS "lineRemarks"
      FROM quote_summaries AS summary
      INNER JOIN "quotes" AS latest
        ON latest."tenantId" = summary."tenantId" AND latest."rfqId" = summary."rfqId"
          AND latest."vendorId" = summary."vendorId" AND latest."quoteVersion" = summary."latestVersion"
      LEFT JOIN "vendors" AS vendor
        ON vendor."id" = latest."vendorId" AND vendor."tenantId" = latest."tenantId"
      LEFT JOIN "quote_lines" AS quoteLine
        ON quoteLine."quoteId" = latest."id" AND quoteLine."tenantId" = latest."tenantId"
      LEFT JOIN "rfq_lines" AS rfqLine
        ON rfqLine."id" = quoteLine."rfqLineId" AND rfqLine."tenantId" = latest."tenantId"
          AND rfqLine."rfqId" = latest."rfqId"
      ORDER BY latest."vendorId" ASC, rfqLine."lineNumber" ASC, quoteLine."id" ASC
    `);
    const quotesById = new Map<string, RfqDetailQuoteSummary>();
    for (const row of quoteRows) {
      let quote = quotesById.get(row.quoteId);
      if (!quote) {
        quote = {
          id: row.quoteId,
          vendorId: row.vendorId,
          quoteNumber: row.quoteNumber,
          quoteVersion: Number(row.quoteVersion),
          versionCount: Number(row.versionCount),
          status: row.status,
          totalBaseAmount: Number(row.totalBaseAmount),
          taxAmount: Number(row.taxAmount),
          discountAmount: Number(row.discountAmount),
          totalQuoteAmount: Number(row.totalQuoteAmount),
          commercialTerms: row.commercialTerms,
          paymentTermsOffered: row.paymentTermsOffered,
          deliveryLeadTimeDays: row.deliveryLeadTimeDays,
          validUntil: row.validUntil,
          submittedAt: row.submittedAt,
          createdAt: row.createdAt,
          vendor: row.vendorRecordId ? { id: row.vendorRecordId, name: row.vendorName || '', code: row.vendorCode || '' } : null,
          lines: [],
        };
        quotesById.set(row.quoteId, quote);
      }
      if (row.quoteLineId && row.rfqLineId) {
        quote.lines.push({
          id: row.quoteLineId,
          rfqLineId: row.rfqLineId,
          unitRate: Number(row.unitRate || 0),
          taxPercent: Number(row.taxPercent || 0),
          discountPercent: Number(row.discountPercent || 0),
          lineTotal: Number(row.lineTotal || 0),
          remarks: row.lineRemarks,
        });
      }
    }

    if (includeNegotiationHistory) {
      const roundRecords = rfq.negotiations.flatMap((negotiation) => (
        'rounds' in negotiation ? negotiation.rounds : []
      ));
      const historyPage = paginateNegotiationHistory(roundRecords);
      const pageIds = new Set(historyPage.rounds.map((round) => round.id));
      const pageNegotiations = rfq.negotiations.map((negotiation) => ({
        ...negotiation,
        rounds: ('rounds' in negotiation ? negotiation.rounds : []).filter((round) => pageIds.has(round.id)),
      }));
      return apiSuccess({
        rfq: { ...rfq, negotiations: pageNegotiations, quotes: [...quotesById.values()] },
        negotiationHistory: getNegotiationHistoryPageMetadata(historyPage),
      });
    }

    return apiSuccess({ rfq: { ...rfq, quotes: [...quotesById.values()] } });
  } catch (error: any) {
    await writeStructuredLog('error', 'procurement.rfq_detail_read_failed', {
      operation: 'read_rfq_detail', route: `/api/procurement/rfqs/${id}`,
      requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined,
      tenantId: ctx.tenantId, userId: ctx.userId, role: ctx.role, rfqId: id,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
    }, 'application');
    return apiError(UI_STRINGS.common.userMessages.failedToFetchRfqDetail, 500);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now();
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return apiError(UI_STRINGS.common.invalidRequestBody, 400);
  }
  const { action, status, reason, ...updateFields } = body;
  if ((action !== undefined && typeof action !== 'string')
    || (status !== undefined && typeof status !== 'string')
    || (reason !== undefined && typeof reason !== 'string')
    || ['title', 'scopeOfWork', 'submissionDeadline', 'clarificationDeadline', 'deliveryRequirement', 'paymentTerms', 'taxTerms']
      .some((field) => updateFields[field] !== undefined && typeof updateFields[field] !== 'string')) {
    return apiError(UI_STRINGS.common.invalidRequestBody, 400);
  }
  for (const field of ['submissionDeadline', 'clarificationDeadline']) {
    const value = updateFields[field];
    if (typeof value === 'string' && !Number.isFinite(new Date(value).getTime())) {
      return apiError(UI_STRINGS.common.invalidDate, 400);
    }
  }

  const requiredPerm = action === 'RELEASE' ? 'RFQ_RELEASE' : action === 'CANCEL' ? 'RFQ_CANCEL' : 'RFQ_EDIT';
  const ctx = await requireAuth(requiredPerm);
  if (!isApiContext(ctx)) return ctx;

  try {
    const existing = await prisma.rfq.findFirst({
      where: {
        id,
        tenantId: ctx.tenantId,
      },
      select: {
        id: true,
        tenantId: true,
        rfqNumber: true,
        projectId: true,
        status: true,
        _count: { select: { invitedVendors: true } },
      },
    });

    if (!existing) {
      return apiError(UI_STRINGS.common.rFQNotFoundOrAccessDenied, 404);
    }

    const updateData: any = {};
    let auditAction = 'RFQ_UPDATED';
    let auditDesc = `RFQ ${existing.rfqNumber} updated`;

    if (action === 'RELEASE' || status === 'RELEASED') {
      if (existing.status !== 'DRAFT' && existing.status !== 'UNDER_REVIEW') {
        return apiError(interpolateUiString(UI_STRINGS.appApiProcurementRfqsIdRoute.cannotReleaseRFQInStatusStatus, { "status": existing.status }), 400);
      }
      updateData.status = 'RELEASED';
      updateData.releasedAt = new Date();
      auditAction = 'RFQ_RELEASED';
      auditDesc = `RFQ ${existing.rfqNumber} released to ${existing._count.invitedVendors} vendors`;
    } else if (action === 'CANCEL' || status === 'CANCELLED') {
      if (!reason) {
        return apiError(UI_STRINGS.appApiProcurementRfqsIdRoute.cancellationReasonIsRequired, 400);
      }
      updateData.status = 'CANCELLED';
      auditAction = 'RFQ_CANCELLED';
      auditDesc = `RFQ ${existing.rfqNumber} cancelled. Reason: ${reason}`;
    } else if (status) {
      updateData.status = status;
      auditDesc = `RFQ ${existing.rfqNumber} status transitioned to ${status}`;
    }

    // Apply allowed field updates if in draft or review
    if (existing.status === 'DRAFT' || existing.status === 'UNDER_REVIEW') {
      if (updateFields.title) updateData.title = updateFields.title;
      if (updateFields.scopeOfWork) updateData.scopeOfWork = updateFields.scopeOfWork;
      if (updateFields.submissionDeadline) updateData.submissionDeadline = new Date(updateFields.submissionDeadline as string);
      if (updateFields.clarificationDeadline) updateData.clarificationDeadline = new Date(updateFields.clarificationDeadline as string);
      if (updateFields.deliveryRequirement) updateData.deliveryRequirement = updateFields.deliveryRequirement;
      if (updateFields.paymentTerms) updateData.paymentTerms = updateFields.paymentTerms;
      if (updateFields.taxTerms) updateData.taxTerms = updateFields.taxTerms;
    }

    const now = new Date();
    const transitionEntries = Object.entries(updateData).filter(([key]) => (RFQ_TRANSITION_ALLOWED_FIELDS as readonly string[]).includes(key));
    const transitionColumns = transitionEntries.map(([key]) => `"${key}"`);
    const assignments = transitionColumns.map((column) => `${column} = ?`).concat('"updatedAt" = ?');
    const updateSql = `UPDATE "rfqs" SET ${assignments.join(', ')}`;
    const guardedUpdateSql = `${updateSql} WHERE "id" = ? AND "tenantId" = ? AND "status" IS ?`;
    const batch = [
      {
        sql: guardedUpdateSql,
        values: [...transitionEntries.map(([, value]) => value), now, id, ctx.tenantId, existing.status],
      },
      {
        sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
        values: [
          crypto.randomUUID(), ctx.tenantId, ctx.userId, existing.projectId, 'RFQ', existing.id,
          auditAction, auditDesc, JSON.stringify({ status: existing.status }),
          JSON.stringify({ status: updateData.status || existing.status, reason: reason ?? null }), null, null, now,
        ],
      },
    ];
    if (action === 'RELEASE' || status === 'RELEASED') {
      batch.push({
        sql: RFQ_INVITATION_MARK_RELEASED_SQL,
        values: [id, ctx.tenantId, id, ctx.tenantId],
      });
    }
    const results = await writeD1BatchAtomically(batch);
    if (Number(results[0]?.meta?.changes || 0) !== 1 || Number(results[1]?.meta?.changes || 0) !== 1) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }
    const updated = { ...existing, ...updateData, updatedAt: now };

    return apiSuccess({ rfq: updated, message: auditDesc });
  } catch (error: any) {
    await writeStructuredLog('error', 'procurement.rfq_update_failed', {
      operation: 'update_rfq',
      route: `/api/procurement/rfqs/${id}`,
      requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      rfqId: id,
      action: typeof action === 'string' ? action : undefined,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
    }, 'application');
    return apiError(UI_STRINGS.common.userMessages.failedToUpdateRfq, 500);
  }
}
