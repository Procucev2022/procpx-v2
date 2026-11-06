import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import { MAX_D1_BINDING_BYTES } from '@/lib/d1-batch.constants';
import type { ReRfqRouteParams } from '@app-types/app/api/procurement/rfqs/re-rfq.types';
import {
  MAX_RERFQ_LINES,
  MAX_RERFQ_REASON_LENGTH,
  MAX_RERFQ_VENDOR_ID_LENGTH,
  MAX_RERFQ_VENDORS,
  RERFQ_AUDIT_INSERT_SQL,
  RERFQ_FAILED_EVENT,
  RERFQ_INSERT_SQL,
  RERFQ_LINES_INSERT_SQL,
  RERFQ_NUMBER_MARKER,
  RERFQ_RECOVERED_EVENT,
  RERFQ_VENDORS_INSERT_SQL,
} from './route.constants';

export async function POST(req: NextRequest, { params }: ReRfqRouteParams) {
  const ctx = await requireAuth('RFQ_CREATE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;
  const startedAt = Date.now();
  let rfqId: string | null = null;
  let auditId: string | null = null;
  let expectedLineCount = 0;
  let expectedVendorCount = 0;
  let failureCode = 'rerfq_operation_failed';

  try {
    const parsedBody: unknown = await req.json().catch(() => null);
    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const body = parsedBody as Record<string, unknown>;
    if (typeof body.reason !== 'string' || body.reason.trim().length === 0 || body.reason.trim().length > MAX_RERFQ_REASON_LENGTH) {
      return apiError(UI_STRINGS.appApiProcurementRfqsIdReRfqRoute.mandatoryJustificationReasonIsRequiredForReRFQ, 400);
    }
    const reason = body.reason.trim();
    if (body.vendorIds !== undefined && (!Array.isArray(body.vendorIds) || body.vendorIds.some((vendorId) =>
      typeof vendorId !== 'string' || !vendorId.trim() || vendorId.length > MAX_RERFQ_VENDOR_ID_LENGTH))) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    if (Array.isArray(body.vendorIds) && body.vendorIds.length > MAX_RERFQ_VENDORS) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    if (body.submissionDeadline !== undefined && body.submissionDeadline !== null && typeof body.submissionDeadline !== 'string') {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const deadlineValue = typeof body.submissionDeadline === 'string' ? body.submissionDeadline.trim() : '';
    const submissionDeadline = deadlineValue ? new Date(deadlineValue) : null;
    if (submissionDeadline && (!Number.isFinite(submissionDeadline.getTime()) || submissionDeadline.getTime() <= Date.now())) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }

    const originalRfq = await prisma.rfq.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: {
        id: true,
        tenantId: true,
        originalRfqId: true,
        rfqNumber: true,
        title: true,
        projectId: true,
        boqRevisionId: true,
        scopeOfWork: true,
        packageType: true,
        packageName: true,
        commercialValidityDays: true,
        deliveryRequirement: true,
        paymentTerms: true,
        taxTerms: true,
        requiredDocuments: true,
        technicalRequirements: true,
        commercialRequirements: true,
        estimatedBenchmarkValue: true,
        totalLines: true,
        prId: true,
        lines: {
          take: MAX_RERFQ_LINES + 1,
          orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
          select: {
            projectId: true, costCentreId: true, boqId: true, boqRevisionId: true, boqLineId: true, prLineId: true,
            lineNumber: true, description: true, specification: true, category: true, subcategory: true, uom: true,
            quantity: true, benchmarkRate: true, benchmarkAmount: true,
          },
        },
        invitedVendors: {
          take: MAX_RERFQ_VENDORS + 1,
          orderBy: { vendorId: 'asc' },
          select: { vendorId: true },
        },
      },
    });
    if (!originalRfq) {
      return apiError(UI_STRINGS.appApiProcurementRfqsIdReRfqRoute.originalRFQNotFoundOrAccessDenied, 404);
    }
    if (originalRfq.lines.length > MAX_RERFQ_LINES || originalRfq.invitedVendors.length > MAX_RERFQ_VENDORS) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }

    const rootId = originalRfq.originalRfqId || originalRfq.id;
    const rootRfq = rootId === originalRfq.id ? originalRfq : await prisma.rfq.findFirst({
      where: { id: rootId, tenantId: ctx.tenantId },
      select: { id: true, rfqNumber: true },
    });
    if (!rootRfq) {
      return apiError(UI_STRINGS.appApiProcurementRfqsIdReRfqRoute.originalRFQNotFoundOrAccessDenied, 404);
    }

    const requestedVendorIds = Array.isArray(body.vendorIds) ? body.vendorIds.map((vendorId) => (vendorId as string).trim()) : [];
    const targetVendorIds = [...new Set(requestedVendorIds.length > 0
      ? requestedVendorIds
      : originalRfq.invitedVendors.map(({ vendorId }) => vendorId))];
    if (targetVendorIds.length > MAX_RERFQ_VENDORS) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }

    if (targetVendorIds.length > 0) {
      const eligibleVendors = await prisma.vendor.findMany({
        where: {
          id: { in: targetVendorIds },
          OR: [{ tenantId: ctx.tenantId }, { vendorType: 'PROCUCEV_VENDOR' }],
          isBlacklisted: false,
        },
        select: { id: true },
      });
      if (eligibleVendors.length !== targetVendorIds.length) {
        return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      }
    }

    rfqId = crypto.randomUUID();
    auditId = crypto.randomUUID();
    expectedLineCount = originalRfq.lines.length;
    expectedVendorCount = targetVendorIds.length;
    const title = interpolateUiString(UI_STRINGS.appApiProcurementRfqsIdReRfqRoute.reRFQTitle, { title: originalRfq.title });
    const createdAt = new Date();
    const sourceLineJson = JSON.stringify(originalRfq.lines.map((line) => ({ ...line, id: crypto.randomUUID(), createdAt })));
    const inviteJson = JSON.stringify(targetVendorIds.map((vendorId) => ({ id: crypto.randomUUID(), vendorId })));
    if (new TextEncoder().encode(sourceLineJson).byteLength > MAX_D1_BINDING_BYTES ||
        new TextEncoder().encode(inviteJson).byteLength > MAX_D1_BINDING_BYTES) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const auditTemplate = interpolateUiString(
      UI_STRINGS.appApiProcurementRfqsIdReRfqRoute.reRFQRfqNumberCreatedFromRfqNumber2ReasonReason,
      { rfqNumber: RERFQ_NUMBER_MARKER, rfqNumber2: originalRfq.rfqNumber, reason },
    );
    const markerIndex = auditTemplate.indexOf(RERFQ_NUMBER_MARKER);
    if (markerIndex < 0) {
      failureCode = 'audit_description_marker_missing';
      throw new Error();
    }
    const auditDescriptionPrefix = auditTemplate.slice(0, markerIndex);
    const auditDescriptionSuffix = auditTemplate.slice(markerIndex + RERFQ_NUMBER_MARKER.length);
    const releasedAt = new Date();

    const results = await writeD1BatchAtomically([
      {
        sql: RERFQ_INSERT_SQL,
        values: [rfqId, title, submissionDeadline, expectedLineCount, reason, releasedAt, createdAt, releasedAt, ctx.userId, id, ctx.tenantId],
      },
      {
        sql: RERFQ_LINES_INSERT_SQL,
        values: [ctx.tenantId, rfqId, sourceLineJson, rfqId, ctx.tenantId],
      },
      {
        sql: RERFQ_VENDORS_INSERT_SQL,
        values: [ctx.tenantId, rfqId, releasedAt, inviteJson, rfqId, ctx.tenantId],
      },
      {
        sql: RERFQ_AUDIT_INSERT_SQL,
        values: [auditId, ctx.tenantId, ctx.userId, auditDescriptionPrefix, auditDescriptionSuffix,
          JSON.stringify({ id: originalRfq.id, rfqNumber: originalRfq.rfqNumber }),
          JSON.stringify({ originalRfqId: originalRfq.id, newRfqId: rfqId, reason, lineCount: expectedLineCount, vendorCount: expectedVendorCount }),
          req.headers.get('user-agent'), releasedAt, rfqId, ctx.tenantId],
      },
    ]);
    const expectedChanges = [1, expectedLineCount, expectedVendorCount, 1];
    if (results.some((result, index) => Number(result.meta?.changes || 0) !== expectedChanges[index])) {
      failureCode = 'batch_affected_rows_mismatch';
      throw new Error();
    }

    const reRfq = await prisma.rfq.findFirst({ where: { id: rfqId, tenantId: ctx.tenantId } });
    if (!reRfq) {
      failureCode = 'committed_rfq_read_missing';
      throw new Error();
    }
    return apiSuccess({
      reRfq,
      message: interpolateUiString(UI_STRINGS.appApiProcurementRfqsIdReRfqRoute.reRFQRfqNumberCreatedSuccessfully, { rfqNumber: reRfq.rfqNumber }),
    }, 201);
  } catch (error: unknown) {
    if (rfqId && auditId) {
      try {
        const [reRfq, audit, lineCount, vendorCount] = await Promise.all([
          prisma.rfq.findFirst({ where: { id: rfqId, tenantId: ctx.tenantId } }),
          prisma.auditLog.findFirst({ where: { id: auditId, tenantId: ctx.tenantId }, select: { id: true } }),
          prisma.rfqLine.count({ where: { rfqId, tenantId: ctx.tenantId } }),
          prisma.rfqVendor.count({ where: { rfqId, tenantId: ctx.tenantId } }),
        ]);
        if (reRfq && audit && lineCount === expectedLineCount && vendorCount === expectedVendorCount) {
          try {
            await writeStructuredLog('warn', RERFQ_RECOVERED_EVENT, {
              operation: 'create_re_rfq', route: '/api/procurement/rfqs/[id]/re-rfq',
              requestId: req.headers.get('x-request-id') || null, tenantId: ctx.tenantId,
              userId: ctx.userId, originalRfqId: id, newRfqId: rfqId, rfqNumber: reRfq.rfqNumber,
              lineCount, vendorCount, durationMs: Date.now() - startedAt,
            });
          } catch {
            // A confirmed D1 commit remains successful if optional log storage is unavailable.
          }
          return apiSuccess({
            reRfq,
            message: interpolateUiString(UI_STRINGS.appApiProcurementRfqsIdReRfqRoute.reRFQRfqNumberCreatedSuccessfully, { rfqNumber: reRfq.rfqNumber }),
          }, 201);
        }
      } catch {
        // Return a stable error when D1 cannot confirm whether the batch committed.
      }
    }

    try {
      await writeStructuredLog('error', RERFQ_FAILED_EVENT, {
        operation: 'create_re_rfq', route: '/api/procurement/rfqs/[id]/re-rfq',
        requestId: req.headers.get('x-request-id') || null, tenantId: ctx.tenantId,
        userId: ctx.userId, role: ctx.role, originalRfqId: id, newRfqId: rfqId,
        lineCount: expectedLineCount, vendorCount: expectedVendorCount, failureCode, durationMs: Date.now() - startedAt,
        error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
      });
    } catch {
      // Keep the client response stable even if optional log persistence is unavailable.
    }
    return apiError(UI_STRINGS.common.userMessages.failedToInitiateReRfq, 500);
  }
}
