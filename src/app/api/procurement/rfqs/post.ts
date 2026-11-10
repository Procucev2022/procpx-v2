import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { isUserAuthorizedForProject } from '@/lib/project-auth';
import { isD1BatchWithinLimits, writeD1BatchAtomically } from '@/lib/d1-batch';
import {
  AUDIT_LOG_INSERT_FAIL_CLOSED_SQL,
  MAX_D1_BATCH_STATEMENTS,
  RFQ_INSERT_IF_VALID_SQL,
  RFQ_LINE_INSERT_AFTER_HEADER_SQL,
  RFQ_VENDOR_INVITATION_INSERT_AFTER_CHANGE_SQL,
} from '@/lib/d1-batch.constants';
import { dispatchPreparedWorkflowNotification, notifyNextResponsibleParty } from '@/lib/notifications';
import { prepareRfqNotificationOutbox } from '@/lib/notification-outbox';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import { logEvent, writeStructuredLog } from '@/lib/observability/server-logger';
import { readByD1FilterChunks } from '@/lib/d1-query';
import type { RfqLineWrite } from '@app-types/app/api/procurement/rfqs.types';
import {
  RFQ_CREATE_ACTIONS,
  RFQ_CREATE_PACKAGE_TYPES,
  RFQ_DEFAULT_COMMERCIAL_VALIDITY_DAYS,
  RFQ_DEFAULT_PACKAGE_SUFFIX,
  RFQ_DEFAULT_PACKAGE_TYPE,
} from './route.constants';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const result = value.trim();
  return result || null;
}

function parseOptionalDate(value: unknown): Date | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const result = new Date(value);
  return Number.isNaN(result.getTime()) ? undefined : result;
}

function requestId(req: NextRequest): string | undefined {
  const value = req.headers.get('x-request-id') || req.headers.get('cf-ray');
  return value && value.length <= 128 ? value : undefined;
}

function auditValues(input: {
  id: string;
  tenantId: string;
  userId: string;
  projectId: string;
  rfqId: string;
  action: string;
  description: string;
  newValue: Record<string, unknown> | null;
  createdAt: Date;
}): unknown[] {
  return [
    input.id, input.tenantId, input.userId, input.projectId, 'RFQ', input.rfqId,
    input.action, input.description, null, input.newValue ? JSON.stringify(input.newValue) : null,
    null, null, input.createdAt,
  ];
}

export async function createRfq(req: NextRequest) {
  const startedAt = Date.now();
  const ctx = await requireAuth('RFQ_CREATE');
  if (!isApiContext(ctx)) return ctx;

  let projectId: string | undefined;
  let boqRevisionId: string | undefined;
  let prId: string | undefined;
  let rfqId: string | undefined;
  try {
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    if (!isRecord(rawBody)) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    const body = rawBody;
    const rawProjectId = body.projectId;
    const rawRevisionId = body.boqRevisionId;
    const rawPrId = body.prId;
    const title = optionalText(body.title);
    const rawPackageType = body.packageType ?? RFQ_DEFAULT_PACKAGE_TYPE;
    const rawAction = body.action ?? 'SAVE_DRAFT';
    const selectedLineIds = body.selectedLineIds ?? [];
    const vendorIds = body.vendorIds ?? [];
    const categoryName = optionalText(body.categoryName);
    const requiredDocuments = body.requiredDocuments ?? [];
    const parsedCommercialValidityDays = body.commercialValidityDays === undefined
      ? RFQ_DEFAULT_COMMERCIAL_VALIDITY_DAYS
      : Number(body.commercialValidityDays);
    const commercialValidityDays = parsedCommercialValidityDays === 0
      ? RFQ_DEFAULT_COMMERCIAL_VALIDITY_DAYS
      : parsedCommercialValidityDays;
    const submissionDeadline = parseOptionalDate(body.submissionDeadline);
    const clarificationDeadline = parseOptionalDate(body.clarificationDeadline);

    if ((rawProjectId !== undefined && typeof rawProjectId !== 'string')
      || (rawRevisionId !== undefined && typeof rawRevisionId !== 'string')
      || (rawPrId !== undefined && rawPrId !== null && typeof rawPrId !== 'string')
      || (body.title !== undefined && typeof body.title !== 'string')
      || (body.scopeOfWork !== undefined && body.scopeOfWork !== null && typeof body.scopeOfWork !== 'string')
      || (body.packageName !== undefined && body.packageName !== null && typeof body.packageName !== 'string')
      || (body.categoryName !== undefined && body.categoryName !== null && typeof body.categoryName !== 'string')
      || !RFQ_CREATE_PACKAGE_TYPES.includes(rawPackageType as (typeof RFQ_CREATE_PACKAGE_TYPES)[number])
      || !RFQ_CREATE_ACTIONS.includes(rawAction as (typeof RFQ_CREATE_ACTIONS)[number])
      || !Array.isArray(selectedLineIds) || selectedLineIds.some((value) => typeof value !== 'string')
      || !Array.isArray(vendorIds) || vendorIds.some((value) => typeof value !== 'string' || !value.trim())
      || new Set(vendorIds).size !== vendorIds.length
      || !Array.isArray(requiredDocuments) || requiredDocuments.some((value) => typeof value !== 'string')
      || !Number.isInteger(commercialValidityDays) || commercialValidityDays <= 0
      || submissionDeadline === undefined || clarificationDeadline === undefined) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    if (!rawPrId && (!optionalText(rawProjectId) || !optionalText(rawRevisionId) || !title)) {
      return apiError(UI_STRINGS.appApiProcurementRfqsRoute.projectApprovedBOQRevisionAndTitleAreRequired, 400);
    }
    if (rawPackageType === 'CATEGORY' && !categoryName) {
      return apiError(UI_STRINGS.appApiProcurementRfqsRoute.categoryNameIsRequiredForCategoryRFQ, 400);
    }

    const packageType = rawPackageType as (typeof RFQ_CREATE_PACKAGE_TYPES)[number];
    const action = rawAction as (typeof RFQ_CREATE_ACTIONS)[number];
    const isRelease = action === 'RELEASE_RFQ';
    const uniqueSelectedLineIds = selectedLineIds as string[];
    const uniqueVendorIds = (vendorIds as string[]).map((id) => id.trim());
    if (new Set(uniqueSelectedLineIds).size !== uniqueSelectedLineIds.length) {
      return apiError(UI_STRINGS.appApiProcurementRfqsRoute.duplicateLineItemIDsFoundInRFQLineSelection, 400);
    }
    const auditCount = isRelease ? 3 : 1;
    const maxRfqLineCount = MAX_D1_BATCH_STATEMENTS - 1 - uniqueVendorIds.length - auditCount;
    if (maxRfqLineCount < 1 || uniqueSelectedLineIds.length > maxRfqLineCount) {
      return apiError(interpolateUiString(UI_STRINGS.appApiProcurementRfqsRoute.rfqExceedsAtomicWriteLimit, {
        maxLines: Math.max(0, maxRfqLineCount),
      }), 400);
    }
    const scopeOfWork = optionalText(body.scopeOfWork);
    const deliveryRequirement = optionalText(body.deliveryRequirement);
    const paymentTerms = optionalText(body.paymentTerms);
    const taxTerms = optionalText(body.taxTerms);
    const technicalRequirements = optionalText(body.technicalRequirements);
    const commercialRequirements = optionalText(body.commercialRequirements);
    const requestedProjectId = optionalText(rawProjectId);
    const requestedRevisionId = optionalText(rawRevisionId);
    prId = optionalText(rawPrId) || undefined;
    projectId = requestedProjectId || undefined;
    boqRevisionId = requestedRevisionId || undefined;

    let resolvedProjectId = requestedProjectId || '';
    let resolvedBoqRevisionId = requestedRevisionId || '';
    let resolvedTitle = title || '';
    let boqRevisionCode = 'R0';
    let rfqLinesData: RfqLineWrite[] = [];
    let totalBenchmarkValue = 0;

    if (prId) {
      const pr = await prisma.procurementRequest.findFirst({
        where: { id: prId, tenantId: ctx.tenantId },
        select: {
          id: true, tenantId: true, status: true, projectId: true, costCentreId: true, boqId: true,
          boqRevisionId: true, title: true, prNumber: true,
          boqRevision: { select: { revisionCode: true } },
          lines: {
            where: {
              tenantId: ctx.tenantId,
              ...(uniqueSelectedLineIds.length > 0 ? { id: { in: uniqueSelectedLineIds } } : {}),
            },
            orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
            take: maxRfqLineCount + 1,
            select: {
              id: true, tenantId: true, lineNumber: true, itemDescription: true, specification: true, category: true,
              subcategory: true, uom: true, quantity: true, estimatedRate: true, estimatedValue: true, boqLineId: true,
              boqLine: { select: { aiUnitCost: true, specification: true } },
            },
          },
        },
      });
      if (!pr) return apiError(UI_STRINGS.appApiProcurementRfqsRoute.procurementRequestNotFoundOrAccessDenied, 404);
      if (!['PR_APPROVED', 'PR_RELEASED_TO_PROCUREMENT'].includes(pr.status)) {
        return apiError(interpolateUiString(
          UI_STRINGS.appApiProcurementRfqsRoute.cannotCreateRFQPRIsInStatusStatusSourcingIsOnlyPermittedForAPPROVEDOrRELEASEDPRs,
          { status: pr.status },
        ), 400);
      }
      if (requestedProjectId && requestedProjectId !== pr.projectId) {
        return apiError(UI_STRINGS.appApiProcurementRfqsRoute.projectMustMatchTheProjectLinkedToThePR, 400);
      }

      const existingRfq = await prisma.rfq.findFirst({
        where: { tenantId: ctx.tenantId, prId, status: { not: 'CANCELLED' } },
        select: { rfqNumber: true },
      });
      if (existingRfq) {
        return apiError(interpolateUiString(
          UI_STRINGS.appApiProcurementRfqsRoute.anActiveRFQRfqNumberAlreadyExistsForThisApprovedPRDuplicateSourcingEventsAreBlocked,
          { rfqNumber: existingRfq.rfqNumber },
        ), 409);
      }

      resolvedProjectId = pr.projectId;
      resolvedBoqRevisionId = pr.boqRevisionId;
      boqRevisionCode = pr.boqRevision?.revisionCode || 'R0';
      if (!resolvedTitle) resolvedTitle = pr.title;
      if (new Set(uniqueSelectedLineIds).size !== uniqueSelectedLineIds.length) {
        return apiError(UI_STRINGS.appApiProcurementRfqsRoute.duplicateLineItemIDsFoundInRFQLineSelection, 400);
      }
      const lineMap = new Map(pr.lines.map((line) => [line.id, line]));
      const targetLines = uniqueSelectedLineIds.length > 0
        ? pr.lines.filter((line) => uniqueSelectedLineIds.includes(line.id))
        : pr.lines;
      if (targetLines.length !== (uniqueSelectedLineIds.length || pr.lines.length)) {
        const foreignIds = uniqueSelectedLineIds.filter((id) => !lineMap.has(id));
        return apiError(interpolateUiString(
          UI_STRINGS.appApiProcurementRfqsRoute.invalidLineItemSelectionLineIDSJoinDoNotBelongToTheApprovedPRScopePrNumber,
          { join: foreignIds.join(', '), prNumber: pr.prNumber },
        ), 400);
      }
      if (targetLines.length === 0) {
        return apiError(interpolateUiString(
          UI_STRINGS.appApiProcurementRfqsRoute.atLeastOneApprovedPRLineItemMustBeSelectedForRFQFromPrNumber,
          { prNumber: pr.prNumber },
        ), 400);
      }

      rfqLinesData = targetLines.map((line) => {
        const benchmarkRate = line.estimatedRate !== null && line.estimatedRate !== undefined && line.estimatedRate > 0
          ? line.estimatedRate : line.boqLine?.aiUnitCost || 100;
        const quantity = line.quantity || 1;
        const benchmarkAmount = line.estimatedValue || quantity * benchmarkRate;
        totalBenchmarkValue += benchmarkAmount;
        return {
          tenantId: ctx.tenantId,
          projectId: pr.projectId,
          costCentreId: pr.costCentreId,
          boqId: pr.boqId,
          boqRevisionId: pr.boqRevisionId,
          boqLineId: line.boqLineId || null,
          prLineId: line.id,
          lineNumber: line.lineNumber || 'L-1',
          description: line.itemDescription,
          specification: line.specification || line.boqLine?.specification || 'Standard technical specification',
          category: line.category || 'General',
          subcategory: line.subcategory || null,
          uom: line.uom,
          quantity,
          benchmarkRate,
          benchmarkAmount,
        };
      });
    } else {
      const requestedId = requestedRevisionId;
      if (!requestedProjectId || !requestedId || !title) {
        return apiError(UI_STRINGS.appApiProcurementRfqsRoute.projectApprovedBOQRevisionAndTitleAreRequired, 400);
      }
      const revision = await prisma.boqRevision.findFirst({
        where: {
          id: requestedId,
          tenantId: ctx.tenantId,
          OR: [
            { status: 'APPROVED' },
            { prStatus: 'PR_RELEASED_TO_PROCUREMENT' },
            { prStatus: 'PR_APPROVED' },
            { prs: { some: { status: { in: ['PR_APPROVED', 'PR_RELEASED_TO_PROCUREMENT'] } } } },
          ],
        },
        include: {
          boq: { select: { id: true, projectId: true } },
          lines: {
            where: {
              isDeleted: false,
              ...(packageType === 'CATEGORY' && categoryName
                ? { category: { is: { name: categoryName } } }
                : uniqueSelectedLineIds.length > 0 ? { id: { in: uniqueSelectedLineIds } } : {}),
            },
            orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
            take: maxRfqLineCount + 1,
            select: {
              id: true, tenantId: true, lineNumber: true, itemCode: true, standardDescription: true,
              originalDescription: true, specification: true, categoryId: true, subcategoryId: true, uomRaw: true,
              quantity: true, aiUnitCost: true,
              category: { select: { name: true } }, uom: { select: { code: true } },
            },
          },
        },
      });
      if (!revision) return apiError(UI_STRINGS.appApiProcurementRfqsRoute.approvedOrReleasedBOQRevisionNotFound, 404);
      if (revision.boq.projectId !== requestedProjectId) {
        return apiError(UI_STRINGS.appApiProcurementRfqsRoute.projectMustMatchTheProjectLinkedToTheBOQ, 400);
      }

      resolvedProjectId = requestedProjectId;
      resolvedBoqRevisionId = revision.id;
      boqRevisionCode = revision.revisionCode;
      const lineMap = new Map(revision.lines.map((line) => [line.id, line]));
      let targetLines = revision.lines;
      if (packageType === 'CATEGORY' && categoryName) {
        targetLines = targetLines.filter((line) => (line.category?.name || 'General') === categoryName);
      } else if (uniqueSelectedLineIds.length > 0) {
        const foreignIds = uniqueSelectedLineIds.filter((id) => !lineMap.has(id));
        if (foreignIds.length > 0) {
          return apiError(interpolateUiString(
            UI_STRINGS.appApiProcurementRfqsRoute.invalidLineItemSelectionLineIDSJoinDoNotBelongToTheSelectedBOQRevisionRevisionCode,
            { join: foreignIds.join(', '), revisionCode: revision.revisionCode },
          ), 400);
        }
        targetLines = targetLines.filter((line) => uniqueSelectedLineIds.includes(line.id));
      }
      if (targetLines.length === 0) {
        return apiError(UI_STRINGS.appApiProcurementRfqsRoute.atLeastOneBOQLineMustBeSelectedForTheRFQScope, 400);
      }

      rfqLinesData = targetLines.map((line) => {
        const sourceLine = line as typeof line & { aiUnitCost?: number | null; benchmarkRate?: number | null };
        const benchmarkRate = sourceLine.aiUnitCost || sourceLine.benchmarkRate || 100;
        const quantity = line.quantity ?? 1;
        const benchmarkAmount = quantity * benchmarkRate;
        totalBenchmarkValue += benchmarkAmount;
        return {
          tenantId: ctx.tenantId,
          projectId: resolvedProjectId,
          costCentreId: revision.costCentreId || null,
          boqId: revision.boqId,
          boqRevisionId: revision.id,
          boqLineId: line.id,
          prLineId: null,
          lineNumber: line.lineNumber || line.itemCode || 'L-1',
          description: line.standardDescription || line.originalDescription || UI_STRINGS.common.lineItem,
          specification: line.specification || 'Commercial standard specification',
          category: line.category?.name || 'General',
          subcategory: line.subcategoryId || null,
          uom: line.uom?.code || line.uomRaw || 'NOS',
          quantity,
          benchmarkRate,
          benchmarkAmount,
        };
      });
    }

    if (!resolvedProjectId || !resolvedBoqRevisionId || !resolvedTitle) {
      return apiError(UI_STRINGS.appApiProcurementRfqsRoute.projectApprovedBOQRevisionAndTitleAreRequired, 400);
    }
    projectId = resolvedProjectId;
    boqRevisionId = resolvedBoqRevisionId;
    const authorized = await isUserAuthorizedForProject(ctx.userId, ctx.role, resolvedProjectId, ctx.tenantId);
    if (!authorized) {
      return apiError(UI_STRINGS.common.forbiddenInsufficientPermissions, 403);
    }
    if (rfqLinesData.length === 0) return apiError(UI_STRINGS.appApiProcurementRfqsRoute.atLeastOneBOQLineMustBeSelectedForTheRFQScope, 400);
    if (uniqueVendorIds.length > 0) {
      const matchedVendors = await readByD1FilterChunks(uniqueVendorIds, (chunk) => prisma.vendor.findMany({
        where: { tenantId: ctx.tenantId, id: { in: chunk } },
        select: { id: true },
      }));
      if (matchedVendors.length !== uniqueVendorIds.length) {
        return apiError(UI_STRINGS.appApiProcurementRfqsRoute.oneOrMoreVendorsNotFoundInThisTenant, 400);
      }
    }

    if (1 + rfqLinesData.length + uniqueVendorIds.length + auditCount > MAX_D1_BATCH_STATEMENTS) {
      return apiError(interpolateUiString(UI_STRINGS.appApiProcurementRfqsRoute.rfqExceedsAtomicWriteLimit, {
        maxLines: MAX_D1_BATCH_STATEMENTS - 1 - uniqueVendorIds.length - auditCount,
      }), 400);
    }

    const commercialValidity = commercialValidityDays || RFQ_DEFAULT_COMMERCIAL_VALIDITY_DAYS;
    const initialStatus = isRelease ? 'RELEASED' : 'DRAFT';
    const rfqPackageName = optionalText(body.packageName) || `${packageType} ${RFQ_DEFAULT_PACKAGE_SUFFIX}`;
    const normalizedTitle = resolvedTitle.trim();
    const createdAt = new Date();
    const releasedAt = isRelease ? createdAt : null;
    const createdRfqId = crypto.randomUUID();
    rfqId = createdRfqId;
    const createAuditId = crypto.randomUUID();
    const releaseAuditId = isRelease ? crypto.randomUUID() : undefined;
    const releaseNotificationPayload = isRelease
      ? await notifyNextResponsibleParty({
        tenantId: ctx.tenantId, event: 'RFQ_RELEASED', recordNumber: '__RFQ_NUMBER__',
        entityId: createdRfqId, actorName: ctx.userName,
      }, { prepareOnly: true })
      : undefined;
    const preparedNotification = releaseNotificationPayload && releaseAuditId
      ? prepareRfqNotificationOutbox(releaseNotificationPayload, createdRfqId, createdAt, releaseAuditId)
      : null;
    const rfqValues = [
      rfqId, ctx.tenantId, resolvedProjectId, resolvedBoqRevisionId, String(createdAt.getFullYear()), normalizedTitle,
      scopeOfWork, packageType, rfqPackageName, initialStatus,
      submissionDeadline?.toISOString() || null, clarificationDeadline?.toISOString() || null, commercialValidity,
      deliveryRequirement, paymentTerms, taxTerms, JSON.stringify(requiredDocuments), technicalRequirements,
      commercialRequirements, Math.round(totalBenchmarkValue * 100) / 100, rfqLinesData.length,
      releasedAt?.toISOString() || null, prId || null, createdAt.toISOString(), createdAt.toISOString(), ctx.userId,
    ];
    const batch: Array<{ sql: string; values: unknown[] }> = [{ sql: RFQ_INSERT_IF_VALID_SQL, values: rfqValues }];
    for (const line of rfqLinesData) {
      batch.push({
        sql: RFQ_LINE_INSERT_AFTER_HEADER_SQL,
        values: [
          crypto.randomUUID(), line.tenantId, rfqId, line.projectId, line.costCentreId, line.boqId, line.boqRevisionId,
          line.boqLineId, line.prLineId, line.lineNumber, line.description, line.specification, line.category,
          line.subcategory, line.uom, line.quantity, line.benchmarkRate, line.benchmarkAmount, createdAt.toISOString(),
          rfqId, ctx.tenantId, resolvedProjectId,
        ],
      });
    }
    for (const vendorId of uniqueVendorIds) {
      batch.push({
        sql: RFQ_VENDOR_INVITATION_INSERT_AFTER_CHANGE_SQL,
        values: [
          crypto.randomUUID(), ctx.tenantId, rfqId, vendorId, isRelease ? 'INVITED' : 'PENDING', vendorId, ctx.tenantId,
        ],
      });
    }

    batch.push({
      sql: AUDIT_LOG_INSERT_FAIL_CLOSED_SQL,
      values: auditValues({
        id: createAuditId, tenantId: ctx.tenantId, userId: ctx.userId, projectId: resolvedProjectId,
        rfqId, action: 'RFQ_CREATED', description: UI_STRINGS.appApiProcurementRfqsRoute.rfqCreatedAuditDescription,
        newValue: {
          title: normalizedTitle, packageType, boqRevisionCode, totalLines: rfqLinesData.length,
          benchmarkValue: Math.round(totalBenchmarkValue * 100) / 100, status: initialStatus,
        }, createdAt,
      }),
    });
    if (isRelease) {
      batch.push({
        sql: AUDIT_LOG_INSERT_FAIL_CLOSED_SQL,
        values: auditValues({
          id: releaseAuditId!, tenantId: ctx.tenantId, userId: ctx.userId, projectId: resolvedProjectId,
          rfqId, action: 'RFQ_RELEASED',
          description: UI_STRINGS.appApiProcurementRfqsRoute.rfqReleasedAuditDescription,
          newValue: { status: 'RELEASED', invitedVendors: uniqueVendorIds.length }, createdAt,
        }),
      });
    }
    if (preparedNotification) batch.push(preparedNotification.statement);

    if (!isD1BatchWithinLimits(batch)) {
      return apiError(UI_STRINGS.appApiProcurementRfqsRoute.rfqExceedsAtomicWriteLimit, 400);
    }

    const results = await writeD1BatchAtomically(batch);
    const createdRfq = results[0]?.results?.[0] as { id?: string; rfqNumber?: string } | undefined;
    if (!createdRfq?.id || !createdRfq.rfqNumber
      || results.slice(1).some((result) => Number(result.meta?.changes || 0) !== 1)) {
      const competingRfq = prId ? await prisma.rfq.findFirst({
        where: { tenantId: ctx.tenantId, prId, status: { not: 'CANCELLED' } },
        select: { rfqNumber: true },
      }) : null;
      if (competingRfq) {
        return apiError(interpolateUiString(
          UI_STRINGS.appApiProcurementRfqsRoute.anActiveRFQRfqNumberAlreadyExistsForThisApprovedPRDuplicateSourcingEventsAreBlocked,
          { rfqNumber: competingRfq.rfqNumber },
        ), 409);
      }
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }

    const rfq = {
      id: createdRfq.id,
      tenantId: ctx.tenantId,
      projectId: resolvedProjectId,
      boqRevisionId: resolvedBoqRevisionId,
      prId: prId || null,
      rfqNumber: createdRfq.rfqNumber,
      title: normalizedTitle,
      scopeOfWork,
      packageType,
      packageName: rfqPackageName,
      status: initialStatus,
      submissionDeadline,
      clarificationDeadline,
      commercialValidityDays: commercialValidity,
      deliveryRequirement,
      paymentTerms,
      taxTerms,
      requiredDocuments: JSON.stringify(requiredDocuments),
      technicalRequirements,
      commercialRequirements,
      estimatedBenchmarkValue: Math.round(totalBenchmarkValue * 100) / 100,
      totalLines: rfqLinesData.length,
      releasedAt,
      createdById: ctx.userId,
      createdAt,
      updatedAt: createdAt,
      lines: rfqLinesData,
      invitedVendors: uniqueVendorIds.map((vendorId) => ({ vendorId, invitationStatus: isRelease ? 'INVITED' : 'PENDING' })),
    };

    if (preparedNotification) {
      try {
        await dispatchPreparedWorkflowNotification(preparedNotification.id, createdAt, {
          tenantId: ctx.tenantId, entityType: 'RFQ', entityId: createdRfq.id,
          route: '/api/procurement/rfqs',
        });
      } catch (error) {
        await writeStructuredLog('warn', 'rfq.release_notification_dispatch_failed', {
          operation: 'dispatch_notification_outbox', route: '/api/procurement/rfqs', requestId: requestId(req),
          tenantId: ctx.tenantId, projectId: resolvedProjectId, recordId: createdRfq.id,
          rfqNumber: createdRfq.rfqNumber,
          error: error instanceof Error ? { name: error.name } : { type: typeof error },
        }, 'next');
      }
    }

    return apiSuccess({
      rfq,
      message: interpolateUiString(UI_STRINGS.appApiProcurementRfqsRoute.rFQRfqNumberSuccessfullyCreated, {
        rfqNumber: createdRfq.rfqNumber,
      }),
    }, 201);
  } catch (error) {
    let competingRfq = null;
    if (prId) {
      try {
        competingRfq = await prisma.rfq.findFirst({
          where: { tenantId: ctx.tenantId, prId, status: { not: 'CANCELLED' } },
          select: { rfqNumber: true },
        });
      } catch {
        // Preserve the original failure for the structured diagnostic event.
      }
    }
    if (competingRfq) {
      return apiError(interpolateUiString(
        UI_STRINGS.appApiProcurementRfqsRoute.anActiveRFQRfqNumberAlreadyExistsForThisApprovedPRDuplicateSourcingEventsAreBlocked,
        { rfqNumber: competingRfq.rfqNumber },
      ), 409);
    }
    logEvent('error', 'rfq.create_failed', {
      operation: 'create', route: '/api/procurement/rfqs', requestId: requestId(req),
      tenantId: ctx.tenantId, projectId, boqRevisionId, recordId: rfqId, prId,
      durationMs: Date.now() - startedAt, error,
    }, 'next');
    return apiError(UI_STRINGS.common.userMessages.failedToCreateRfq, 500);
  }
}
