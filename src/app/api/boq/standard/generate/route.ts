import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { chunkRowsForJsonBinding, sumD1BatchChanges, writeD1BatchAtomically } from '@/lib/d1-batch';
import { MAX_BOQ_BATCH_LINES, BOQ_TEMPLATE_REVISION_INSERT_NEXT_SQL } from '@/lib/d1-batch.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import type { D1BatchInputStatement, D1BatchResult } from '@app-types/lib/d1-batch.types';
import type { StandardBoqGenerationBody, StandardBoqLineInput, StandardBoqPreparedLine } from '@app-types/app/api/boq/standard/generate.types';
import {
  BOQ_STANDARD_GENERATE_AUDIT_AFTER_LINES_SQL,
  BOQ_STANDARD_GENERATE_AUDIT_ACTION,
  BOQ_STANDARD_GENERATE_COST_METHOD,
  BOQ_STANDARD_GENERATE_COST_SOURCE,
  BOQ_STANDARD_GENERATE_DEFAULT_CATEGORY,
  BOQ_STANDARD_GENERATE_DEFAULT_PURPOSE,
  BOQ_STANDARD_GENERATE_DEFAULT_UOM,
  BOQ_STANDARD_GENERATE_INSERT_BOQ_SQL,
  BOQ_STANDARD_GENERATE_INSERT_LINES_JSON_SQL,
  BOQ_STANDARD_GENERATE_SOURCE_TYPE,
  BOQ_STANDARD_GENERATE_UPDATE_BOQ_SQL,
  BOQ_STANDARD_GENERATE_UPDATE_EMPTY_REVISION_SQL,
} from './route.constants';


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() || null : null;
}

function optionalNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getChangedCount(result: D1BatchResult | undefined): number {
  return Number(result?.meta?.changes || 0);
}

function dateOrNull(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function getReturnedString(result: D1BatchResult | undefined, key: string): string | null {
  const value = result?.results?.[0]?.[key];
  return typeof value === 'string' ? value : null;
}

function invalidStringField(body: StandardBoqGenerationBody): boolean {
  const values = [body.projectId, body.costCentreId, body.sector, body.projectType, body.fileName,
    body.boqId, body.title, body.description, body.purpose, body.category, body.scope];
  return values.some((value) => value !== undefined && value !== null && typeof value !== 'string');
}

function prepareLine(
  input: StandardBoqLineInput,
  index: number,
  categories: Map<string, { id: string; name: string }>,
  uoms: Map<string, { id: string; code: string }>,
  timestamp: string,
): StandardBoqPreparedLine {
  const originalDescription = optionalText(input.originalDescription)
    || optionalText(input.description)
    || optionalText(input.itemDescription)
    || 'Standard Item';
  const quantity = optionalNumber(input.quantity);
  const rawBenchmark = optionalNumber(input.benchmarkRate);
  const benchmarkRate = rawBenchmark !== null && rawBenchmark !== 0 ? rawBenchmark : null;
  const categoryName = optionalText(input.category);
  const uomText = optionalText(input.uom) || BOQ_STANDARD_GENERATE_DEFAULT_UOM;
  const matchedCategory = categoryName ? categories.get(categoryName.toLowerCase()) : undefined;
  const matchedUom = uoms.get(uomText.toUpperCase());
  const standardDescription = optionalText(input.standardDescription) || optionalText(input.description)
    || optionalText(input.itemDescription) || 'Standard Item';
  const specification = optionalText(input.specification) || optionalText(input.description)
    || optionalText(input.itemDescription) || '';
  const aiSuggestedDescription = optionalText(input.aiSuggestedDescription) || optionalText(input.description)
    || optionalText(input.itemDescription) || 'Standard Item';
  const totalCost = benchmarkRate !== null && quantity !== null && quantity > 0
    ? Math.round(benchmarkRate * quantity * 100) / 100
    : null;
  const validationStatus = quantity === null
    ? 'QUANTITY_REQUIRED'
    : quantity <= 0
      ? 'WARNING'
      : optionalText(input.validationStatus) || 'VALID';
  const validationMessages = JSON.stringify(quantity === null
    ? [{ level: 'WARNING', code: 'QUANTITY_REQUIRED', message: UI_STRINGS.common.quantityIsRequiredBeforeBudgetingOrPR }]
    : []);

  return {
    id: crypto.randomUUID(),
    lineNumber: String(index + 1),
    itemCode: optionalText(input.itemCode) || `STD-L${index + 1}`,
    originalDescription,
    standardDescription,
    specification,
    aiSuggestedDescription,
    aiConfidence: 0.95,
    aiUnitCost: benchmarkRate,
    aiTotalCost: totalCost,
    costConfidence: 0.92,
    costSource: BOQ_STANDARD_GENERATE_COST_SOURCE,
    costMethod: BOQ_STANDARD_GENERATE_COST_METHOD,
    categoryId: matchedCategory?.id || null,
    uomId: matchedUom?.id || null,
    uomRaw: uomText,
    quantity,
    brand: optionalText(input.brand),
    model: optionalText(input.model),
    location: optionalText(input.areaZone),
    drawingReference: optionalText(input.drawingReference),
    remarks: optionalText(input.remarks),
    validationStatus,
    validationMessages,
    benchmarkEligible: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

// Each chunk is guarded by the revision's total line count, so all chunks of one large BOQ share one guard.
function lineInsertStatements(tenantId: string, revisionId: string, boqId: string, lines: StandardBoqPreparedLine[], timestamp: string): D1BatchInputStatement[] {
  return chunkRowsForJsonBinding(lines).map((chunk) => ({
    sql: BOQ_STANDARD_GENERATE_INSERT_LINES_JSON_SQL,
    values: [tenantId, revisionId, JSON.stringify(chunk), revisionId, tenantId, boqId, lines.length, timestamp],
  }));
}

function buildAuditStatement(input: {
  tenantId: string;
  userId: string;
  revisionId: string;
  boqId: string;
  projectId: string;
  auditId: string;
  lineCount: number;
  costCentreCode: string | null;
  descriptionTemplate: string;
  newValue: string;
  userAgent: string | null;
  now: Date;
}): D1BatchInputStatement {
  return {
    sql: BOQ_STANDARD_GENERATE_AUDIT_AFTER_LINES_SQL,
    values: [input.lineCount, input.now, input.lineCount, input.auditId, input.tenantId, input.userId,
      BOQ_STANDARD_GENERATE_AUDIT_ACTION, input.descriptionTemplate, input.lineCount,
      input.costCentreCode || UI_STRINGS.common.none, input.newValue, input.userAgent, input.now,
      input.revisionId, input.boqId, input.tenantId, input.projectId],
  };
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BOQ_EDIT');
  if (!isApiContext(ctx)) return ctx;

  const startedAt = Date.now();
  let targetProjectId: string | null = null;
  let targetBoqId: string | null = null;
  let targetRevisionId: string | null = null;
  let targetAuditId: string | null = null;
  let expectedLines = 0;
  let expectedQualityScore = 0;
  let batchStarted = false;

  try {
    const parsedBody: unknown = await req.json();
    if (!isRecord(parsedBody)) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    const body = parsedBody as StandardBoqGenerationBody;
    if (invalidStringField(body)) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    const projectId = optionalText(body.projectId);
    const costCentreIdInput = optionalText(body.costCentreId);
    const requestedBoqId = optionalText(body.boqId);
    const sector = optionalText(body.sector);
    const projectType = optionalText(body.projectType);
    const fileName = optionalText(body.fileName);
    const requestedTitle = optionalText(body.title);
    const descriptionInput = optionalText(body.description);
    const purposeInput = optionalText(body.purpose);
    const categoryInput = optionalText(body.category);
    const scopeInput = optionalText(body.scope);
    const validLines = body.validLines;

    if (!projectId) return apiError(UI_STRINGS.common.projectIDIsRequired, 400);
    if (!Array.isArray(validLines) || validLines.length === 0) {
      return apiError(UI_STRINGS.appApiBoqStandardGenerateRoute.noValidLineItemsToGenerateBOQFrom, 400);
    }
    if (validLines.length > MAX_BOQ_BATCH_LINES || validLines.some((line) => !isRecord(line))) {
      return apiError(UI_STRINGS.common.boqLineBatchLimitExceeded, 400);
    }
    targetProjectId = projectId;
    expectedLines = validLines.length;

    const linesInput = validLines as StandardBoqLineInput[];
    const [project, costCentre, existingBoq] = await Promise.all([
      prisma.project.findFirst({
        where: { id: projectId, tenantId: ctx.tenantId },
        select: { id: true, name: true, sector: true },
      }),
      costCentreIdInput
        ? prisma.costCentre.findFirst({
          where: { id: costCentreIdInput, projectId, tenantId: ctx.tenantId },
          select: { id: true, code: true },
        })
        : Promise.resolve(null),
      requestedBoqId
        ? prisma.boq.findFirst({
          where: { id: requestedBoqId, tenantId: ctx.tenantId, projectId },
          select: {
            id: true, tenantId: true, projectId: true, costCentreId: true, boqCode: true, title: true,
            description: true, purpose: true, category: true, scope: true, status: true,
            createdAt: true, updatedAt: true, createdBy: true,
            revisions: {
              orderBy: [{ revisionNumber: 'desc' }, { id: 'desc' }],
              take: 1,
              select: { id: true, revisionCode: true, revisionNumber: true, status: true, totalLines: true, updatedAt: true },
            },
          },
        })
        : Promise.resolve(null),
    ]);
    if (!project) return apiError(UI_STRINGS.common.projectNotFound2, 404);
    if (costCentreIdInput && !costCentre) {
      return apiError(UI_STRINGS.appApiBoqRoute.costCentreDoesNotBelongToTheSelectedProject, 400);
    }
    if (requestedBoqId && !existingBoq) return apiError(UI_STRINGS.appApiBoqRevisionIdRoute.bOQNotFound, 404);

    const categoryNames = [...new Set(linesInput.map((line) => optionalText(line.category)).filter((value): value is string => Boolean(value)))];
    const uomCodes = [...new Set(linesInput.map((line) => (optionalText(line.uom) || BOQ_STANDARD_GENERATE_DEFAULT_UOM).toUpperCase()))];
    const [categories, uoms] = await Promise.all([
      categoryNames.length > 0
        ? prisma.category.findMany({ where: { tenantId: ctx.tenantId, name: { in: categoryNames } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      prisma.uomMaster.findMany({ where: { tenantId: ctx.tenantId, code: { in: uomCodes } }, select: { id: true, code: true } }),
    ]);
    const categoryMap = new Map(categories.map((entry) => [entry.name.toLowerCase(), entry]));
    const uomMap = new Map(uoms.map((entry) => [entry.code.toUpperCase(), entry]));

    const firstLineCategory = optionalText(linesInput[0]?.category);
    const derivedCategory = categoryInput || firstLineCategory || BOQ_STANDARD_GENERATE_DEFAULT_CATEGORY;
    const derivedTitle = requestedTitle || `${derivedCategory} — ${project.name}`;
    const derivedPurpose = purposeInput || BOQ_STANDARD_GENERATE_DEFAULT_PURPOSE;
    const derivedDescription = descriptionInput || scopeInput || null;
    const finalTitle = requestedTitle || existingBoq?.title || derivedTitle;
    const finalDescription = derivedDescription || existingBoq?.description || null;
    const finalPurpose = purposeInput || existingBoq?.purpose || derivedPurpose;
    const finalCategory = derivedCategory;
    const finalScope = scopeInput || existingBoq?.scope || null;
    const finalCostCentreId = costCentreIdInput || existingBoq?.costCentreId || null;
    const nowMillis = Math.max(
      Date.now(),
      dateOrNull(existingBoq?.updatedAt)?.getTime() ?? 0,
      dateOrNull(existingBoq?.revisions[0]?.updatedAt)?.getTime() ?? 0,
    ) + 1;
    const now = new Date(nowMillis);
    const nowIso = now.toISOString();
    const preparedLines = linesInput.map((line, index) => prepareLine(line, index, categoryMap, uomMap, nowIso));
    const pendingQtyLines = preparedLines.filter((line) => line.quantity === null).length;
    const validQtyLines = preparedLines.length - pendingQtyLines;
    const revisionScore = Math.round((validQtyLines / preparedLines.length) * 100);
    expectedQualityScore = revisionScore;
    const sourceReference = fileName ? `Uploaded: ${fileName}` : 'Standard BOQ Download & Upload';
    const notes = `Generated via Standard BOQ Download → Fill → Upload (${sector || project.sector || 'Standard'} - ${projectType || 'Standard'}) with ${preparedLines.length} items (${pendingQtyLines} require quantity)`;

    targetBoqId = existingBoq?.id || crypto.randomUUID();
    const latestRevision = existingBoq?.revisions[0] || null;
    let reusableRevision = latestRevision?.status === 'DRAFT' && latestRevision.totalLines === 0 ? latestRevision : null;
    if (reusableRevision) {
      const existingLineCount = await prisma.boqLine.count({
        where: { tenantId: ctx.tenantId, boqRevisionId: reusableRevision.id, isDeleted: false },
      });
      if (existingLineCount !== 0) reusableRevision = null;
    }
    targetRevisionId = reusableRevision?.id || crypto.randomUUID();
    const revisionCodeFallback = reusableRevision?.revisionCode || null;
    const auditId = crypto.randomUUID();
    targetAuditId = auditId;
    const auditDescriptionTemplate = UI_STRINGS.appApiBoqStandardGenerateRoute.draftBOQBoqCodeGeneratedFromCompletedStandardBOQUploadLengthLinesCostCentreValue3;
    const newValue = JSON.stringify({
      sourceType: BOQ_STANDARD_GENERATE_SOURCE_TYPE,
      totalLines: preparedLines.length,
      validLines: validQtyLines,
      warningLines: pendingQtyLines,
      qualityScore: revisionScore,
      sourceReference,
    });

    const statements: D1BatchInputStatement[] = [];
    if (existingBoq) {
      const expectedUpdatedAt = dateOrNull(existingBoq.updatedAt);
      if (!expectedUpdatedAt) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
      statements.push({
        sql: BOQ_STANDARD_GENERATE_UPDATE_BOQ_SQL,
        values: [finalTitle, finalDescription, finalPurpose, finalCategory, finalCostCentreId, finalScope, now,
          existingBoq.id, ctx.tenantId, projectId, expectedUpdatedAt,
          finalCostCentreId, finalCostCentreId, ctx.tenantId, projectId],
      });
    } else {
      statements.push({
        sql: BOQ_STANDARD_GENERATE_INSERT_BOQ_SQL,
        values: [targetBoqId, ctx.tenantId, projectId, finalCostCentreId, finalTitle, finalDescription, finalCategory,
          finalScope, 'DRAFT', finalPurpose, ctx.userId, now, now],
      });
    }

    if (reusableRevision) {
      const expectedRevisionUpdatedAt = dateOrNull(reusableRevision.updatedAt);
      if (!expectedRevisionUpdatedAt) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
      statements.push({
        sql: BOQ_STANDARD_GENERATE_UPDATE_EMPTY_REVISION_SQL,
        values: [finalCostCentreId, finalPurpose === BOQ_STANDARD_GENERATE_DEFAULT_PURPOSE ? 'BUDGET_DRAFT' : 'NOT_ADDED_TO_BUDGET',
          finalPurpose === 'PR' ? 'PR_DRAFT' : 'PR_NOT_CREATED', sourceReference, notes, preparedLines.length,
          validQtyLines, pendingQtyLines, revisionScore, now, now, reusableRevision.id, ctx.tenantId,
          targetBoqId, expectedRevisionUpdatedAt],
      });
    } else {
      statements.push({
        sql: BOQ_TEMPLATE_REVISION_INSERT_NEXT_SQL,
        values: [targetRevisionId, ctx.tenantId, targetBoqId, finalCostCentreId, 'DRAFT', 'STANDARDISED',
          finalPurpose === BOQ_STANDARD_GENERATE_DEFAULT_PURPOSE ? 'BUDGET_DRAFT' : 'NOT_ADDED_TO_BUDGET', finalPurpose === 'PR' ? 'PR_DRAFT' : 'PR_NOT_CREATED',
          BOQ_STANDARD_GENERATE_SOURCE_TYPE, null, sourceReference, null, null, null, null, notes, preparedLines.length,
          validQtyLines, 0, pendingQtyLines, revisionScore, ctx.userId, now, now, now],
      });
    }
    const lineStatements = lineInsertStatements(ctx.tenantId, targetRevisionId, targetBoqId, preparedLines, nowIso);
    statements.push(...lineStatements);
    statements.push(buildAuditStatement({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      revisionId: targetRevisionId,
      boqId: targetBoqId,
      projectId,
      auditId,
      lineCount: preparedLines.length,
      costCentreCode: costCentre?.code || null,
      descriptionTemplate: auditDescriptionTemplate,
      newValue,
      userAgent: req.headers.get('user-agent'),
      now,
    }));

    batchStarted = true;
    const results = await writeD1BatchAtomically(statements);
    if (getChangedCount(results[0]) !== 1 || getChangedCount(results[1]) !== 1
      || sumD1BatchChanges(results, 2, lineStatements.length) !== preparedLines.length
      || getChangedCount(results[2 + lineStatements.length]) !== 1) {
      throw new Error(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh);
    }

    const boqCode = getReturnedString(results[0], 'boqCode') || existingBoq?.boqCode || null;
    const revisionCode = getReturnedString(results[1], 'revisionCode') || revisionCodeFallback;
    if (!boqCode || !revisionCode) throw new Error(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh);
    const revision = {
      id: targetRevisionId,
      revisionCode,
      status: 'DRAFT',
      preparationStatus: 'STANDARDISED',
      totalLines: preparedLines.length,
      validLines: validQtyLines,
      warningLines: pendingQtyLines,
      errorLines: 0,
      qualityScore: revisionScore,
      costCentreId: finalCostCentreId,
      sourceType: BOQ_STANDARD_GENERATE_SOURCE_TYPE,
      sourceReference,
      updatedAt: now,
    };
    const boq = {
      ...(existingBoq || {}),
      id: targetBoqId,
      tenantId: ctx.tenantId,
      projectId,
      costCentreId: finalCostCentreId,
      boqCode,
      title: finalTitle,
      description: finalDescription,
      purpose: finalPurpose,
      category: finalCategory,
      scope: finalScope,
      status: existingBoq?.status || 'DRAFT',
      createdBy: existingBoq?.createdBy || ctx.userId,
      updatedAt: now,
      project,
      costCentre,
      latestRevision: revision,
      revisions: [revision],
    };
    return apiSuccess({
      success: true,
      boq,
      boqId: targetBoqId,
      revisionId: targetRevisionId,
      boqCode,
      revisionCode,
      totalLines: preparedLines.length,
      qualityScore: revisionScore,
      sourceType: BOQ_STANDARD_GENERATE_SOURCE_TYPE,
    }, 201);
  } catch (error: unknown) {
    if (batchStarted && targetBoqId && targetRevisionId && targetAuditId) {
      try {
        const recoveredRevision = await prisma.boqRevision.findFirst({
          where: { id: targetRevisionId, tenantId: ctx.tenantId, boqId: targetBoqId },
          select: {
            id: true,
            revisionCode: true,
            totalLines: true,
            boq: { select: { id: true, boqCode: true, projectId: true, tenantId: true } },
          },
        });
        const [lineCount, audit] = recoveredRevision
          ? await Promise.all([
            prisma.boqLine.count({ where: { tenantId: ctx.tenantId, boqRevisionId: targetRevisionId, isDeleted: false } }),
            prisma.auditLog.findFirst({ where: { id: targetAuditId, tenantId: ctx.tenantId }, select: { id: true } }),
          ])
          : [0, null];
        if (recoveredRevision && recoveredRevision.totalLines === expectedLines && lineCount === expectedLines && audit) {
          try {
            await writeStructuredLog('warn', 'boq.standard_generation_result_recovered', {
              operation: 'generate_boq_from_standard_upload',
              route: '/api/boq/standard/generate',
              requestId: req.headers.get('x-request-id') || null,
              tenantId: ctx.tenantId,
              userId: ctx.userId,
              projectId: targetProjectId,
              boqId: targetBoqId,
              revisionId: targetRevisionId,
              lineCount: expectedLines,
              durationMs: Date.now() - startedAt,
            });
          } catch {
            // Return the verified result if optional log storage is unavailable.
          }
          return apiSuccess({
            success: true,
            boq: recoveredRevision.boq,
            boqId: targetBoqId,
            revisionId: targetRevisionId,
            boqCode: recoveredRevision.boq.boqCode,
            revisionCode: recoveredRevision.revisionCode,
            totalLines: expectedLines,
            qualityScore: expectedQualityScore,
            sourceType: BOQ_STANDARD_GENERATE_SOURCE_TYPE,
          }, 201);
        }
      } catch {
        // Continue to the generic failure path when D1 cannot verify the completed batch.
      }
    }

    try {
      await writeStructuredLog('error', 'boq.standard_generation_failed', {
        operation: 'generate_boq_from_standard_upload',
        route: '/api/boq/standard/generate',
        requestId: req.headers.get('x-request-id') || null,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        role: ctx.role,
        projectId: targetProjectId,
        boqId: targetBoqId,
        revisionId: targetRevisionId,
        lineCount: expectedLines,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
      });
    } catch {
      // Preserve a stable client error if optional log storage fails.
    }
    return apiError(UI_STRINGS.common.userMessages.failedToGenerateDraftBoq2, 500);
  }
}
