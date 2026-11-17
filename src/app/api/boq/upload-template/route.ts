import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { deleteUpload, saveUpload } from '@/lib/storage';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import { BOQ_TEMPLATE_UPLOAD_EXTENSIONS } from '@/lib/boq-upload.constants';
import path from 'node:path';
import {
  AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
  BOQ_TEMPLATE_ASSERT_COMPLETE_SQL,
  BOQ_INSERT_NEXT_CODE_SQL,
  BOQ_LINE_DELETE_AFTER_AUDIT_SQL,
  BOQ_LINE_INSERT_AFTER_AUDIT_SQL,
  BOQ_REVISION_TOUCH_IF_CURRENT_SQL,
  BOQ_REVISION_UPDATE_MANUAL_METRICS_AFTER_AUDIT_SQL,
  BOQ_TEMPLATE_REVISION_INSERT_NEXT_SQL,
  BOQ_TEMPLATE_UPDATE_METADATA_IF_CURRENT_SQL,
  MAX_BOQ_BATCH_LINES,
} from '@/lib/d1-batch.constants';
import type { D1BatchInputStatement, D1BatchResult } from '@app-types/lib/d1-batch.types';
import type { TemplateBoqException, TemplateBoqLine, TemplateValidationMessage } from '@app-types/app/api/boq/upload-template/route.types';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { loadActiveBoqReferenceCatalog } from '@/lib/boq-reference-catalog';
import { COST_CENTRE_LOOKUP_MAX_OPTIONS } from '@/app/api/cost-centres/route.constants';
import {
  BOQ_TEMPLATE_AUDIT_ACTION,
  BOQ_TEMPLATE_COST_CENTRE_LOOKUP_LIMIT_EVENT,
  BOQ_TEMPLATE_CREATE_NOTES,
  BOQ_TEMPLATE_SOURCE_TYPE,
} from './route.constants';

class InvalidTemplateError extends Error {}

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim();
}

function changed(result: D1BatchResult | undefined): number {
  return Number(result?.meta?.changes || 0);
}

function insertLineStatement(line: TemplateBoqLine, revisionId: string, tenantId: string, auditId: string, now: Date): D1BatchInputStatement {
  return {
    sql: BOQ_LINE_INSERT_AFTER_AUDIT_SQL,
    values: [
      crypto.randomUUID(), tenantId, revisionId, line.lineNumber, line.originalDescription, line.standardDescription,
      line.specification, line.categoryId, null, line.uomId, line.uomRaw || null, line.quantity, line.location,
      line.drawingReference, line.brand, null, null, null, line.remarks, line.itemCode, line.sourceSheet, line.sourceRow,
      null, null, true, line.validationStatus, JSON.stringify(line.validationMessages), false, null, null, null, null,
      null, null, null, null, null, null, null, null, null, null, null, now, now, auditId, tenantId, revisionId, tenantId,
    ],
  };
}

function parseTemplateRows(rows: Array<Record<string, unknown>>, sheetName: string, categories: Array<{ id: string; name: string }>, uoms: Array<{ id: string; code: string }>): {
  lines: TemplateBoqLine[];
  exceptions: TemplateBoqException[];
  validCount: number;
  warningCount: number;
  errorCount: number;
} {
  const categoryByName = new Map(categories.map((category) => [category.name.trim().toLowerCase(), category.id]));
  const uomByCode = new Map(uoms.map((uom) => [uom.code.trim().toUpperCase(), uom.id]));
  const exceptions: TemplateBoqException[] = [];
  const lines: TemplateBoqLine[] = [];
  const lineNumbers = new Set<string>();
  let validCount = 0;
  let warningCount = 0;
  let errorCount = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const lineNumber = text(row['Line No'] || row['Line Number'] || row['S.No.'] || row['S.No'] || row.SNo || row['Sl No'] || row['#']) || String(index + 1);
    if (lineNumbers.has(lineNumber)) throw new InvalidTemplateError(UI_STRINGS.common.invalidRequestBody);
    lineNumbers.add(lineNumber);

    const description = text(row['Item Description *'] || row['Item Description'] || row.Description || row.Item);
    const specification = text(row['BOQ Description'] || row['Detailed Specification'] || row.Specification || row['Specification / Scope'] || row.Scope);
    const categoryName = text(row['Category *'] || row.Category);
    const uomRaw = text(row['UOM *'] || row.UOM || row.Unit);
    const rawQuantity = row['Quantity *'] !== undefined ? row['Quantity *'] : row.Quantity !== undefined ? row.Quantity : row.Qty;
    const cleanQuantity = text(rawQuantity).replace(/,/g, '');
    const parsedQuantity = cleanQuantity === '' ? null : Number(cleanQuantity);
    const messages: TemplateValidationMessage[] = [];
    let status = 'VALID';
    let quantity: number | null = null;

    if (!description) {
      messages.push({ level: 'ERROR', code: 'DESC_MISSING', message: UI_STRINGS.appApiBoqUploadTemplateRoute.itemDescriptionIsRequired });
      status = 'ERROR';
    }
    if (cleanQuantity === '') {
      status = 'QUANTITY_REQUIRED';
      messages.push({ level: 'WARNING', code: 'QUANTITY_REQUIRED', message: UI_STRINGS.appApiBoqUploadTemplateRoute.quantityIsRequiredBeforeBudgetingOrPR });
    } else if (parsedQuantity === null || !Number.isFinite(parsedQuantity)) {
      messages.push({ level: 'ERROR', code: 'QTY_INVALID', message: interpolateUiString(UI_STRINGS.appApiBoqUploadTemplateRoute.quantityCleanQtyStrMustBeNumeric, { cleanQtyStr: cleanQuantity }) });
      status = 'ERROR';
    } else if (parsedQuantity < 0) {
      messages.push({ level: 'ERROR', code: 'QTY_NEGATIVE', message: UI_STRINGS.appApiBoqUploadTemplateRoute.quantityCannotBeNegative });
      status = 'ERROR';
    } else {
      quantity = parsedQuantity;
      if (parsedQuantity === 0) {
        messages.push({ level: 'WARNING', code: 'QTY_ZERO', message: UI_STRINGS.appApiBoqUploadTemplateRoute.quantityMustBeGreaterThanZero });
        if (status !== 'ERROR') status = 'WARNING';
      }
    }

    const categoryId = categoryByName.get(categoryName.toLowerCase()) || null;
    if (categoryName && !categoryId) {
      messages.push({ level: 'WARNING', code: 'CAT_UNRECOGNIZED', message: interpolateUiString(UI_STRINGS.appApiBoqUploadTemplateRoute.categoryCatNameNotInStandardTaxonomy, { catName: categoryName }) });
      if (status !== 'ERROR') status = 'WARNING';
    }
    const uomId = uomByCode.get(uomRaw.toUpperCase()) || null;
    if (uomRaw && !uomId) {
      messages.push({ level: 'WARNING', code: 'UOM_NON_STANDARD', message: interpolateUiString(UI_STRINGS.appApiBoqUploadTemplateRoute.uOMUomRawMappedToRawText, { uomRaw }) });
      if (status !== 'ERROR') status = 'WARNING';
    }

    if (status === 'VALID') validCount += 1;
    else if (status === 'ERROR') {
      errorCount += 1;
      exceptions.push({ line: lineNumber, description: description || '(blank)', errors: messages });
    } else warningCount += 1;

    const label = description || UI_STRINGS.common.untitledItemFallback;
    lines.push({
      lineNumber,
      itemCode: text(row['Item Code']) || null,
      originalDescription: label,
      standardDescription: label,
      specification: specification || null,
      categoryId,
      uomId,
      uomRaw: uomRaw || 'NOS',
      quantity,
      brand: text(row['Brand / Make'] || row.Brand || row.Make) || null,
      location: text(row['Location / Area'] || row.Location || row.Area) || null,
      remarks: text(row.Remarks || row.Remark) || null,
      drawingReference: text(row['Drawing Reference'] || row['Drawing Ref']) || null,
      sourceSheet: sheetName,
      sourceRow: index + 2,
      validationStatus: status,
      validationMessages: messages,
    });
  }
  return { lines, exceptions, validCount, warningCount, errorCount };
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BOQ_UPLOAD');
  if (!isApiContext(ctx)) return ctx;
  const startedAt = Date.now();
  let targetBoqId: string | undefined;
  let revisionId: string | undefined;
  let projectIdForLog: string | undefined;
  let uploadedPath: string | undefined;
  let lineCount = 0;

  const discardUnreferencedUpload = async () => {
    if (!uploadedPath || !projectIdForLog) return;
    try {
      await deleteUpload(uploadedPath, [ctx.tenantId, projectIdForLog]);
      uploadedPath = undefined;
    } catch (cleanupError) {
      await writeStructuredLog('error', 'boq.template_upload_cleanup_failed', {
        operation: 'remove_unreferenced_upload', route: '/api/boq/upload-template',
        requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
        projectId: projectIdForLog, boqId: targetBoqId, revisionId,
        error: cleanupError instanceof Error ? { name: cleanupError.name, message: cleanupError.message.slice(0, 300) } : { type: typeof cleanupError },
      });
    }
  };

  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const projectId = text(formData.get('projectId'));
    projectIdForLog = projectId || undefined;
    const requestedCostCentreId = text(formData.get('costCentreId')) || null;
    const requestedBoqId = text(formData.get('boqId')) || null;
    const titleInput = formData.get('title');
    const descriptionInput = formData.get('description');
    const purposeInput = text(formData.get('purpose'));
    const categoryInput = text(formData.get('category'));

    if (!(file instanceof File) || !projectId) {
      return apiError(UI_STRINGS.appApiBoqUploadTemplateRoute.spreadsheetFileAndProjectIDAreRequired, 400);
    }
    const project = await prisma.project.findFirst({ where: { id: projectId, tenantId: ctx.tenantId } });
    if (!project) return apiError(UI_STRINGS.common.projectNotFound2, 404);

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames.find((name) => name.toLowerCase().includes('data') || name.toLowerCase().includes('boq')) || workbook.SheetNames[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
    const rows = sheet ? XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Array<Record<string, unknown>> : [];
    if (rows.length === 0) {
      return apiError(UI_STRINGS.appApiBoqUploadTemplateRoute.uploadedSpreadsheetIsEmptyOrHasNoRecognizableRows, 400);
    }
    if (rows.length > MAX_BOQ_BATCH_LINES) return apiError(UI_STRINGS.common.boqLineBatchLimitExceeded, 400);

    const rowCode = text(rows[0]['Cost Centre Code *'] || rows[0]['Cost Centre Code'] || rows[0]['Cost Centre']).toUpperCase();
    const [allCostCentres, referenceCatalog] = await Promise.all([
      prisma.costCentre.findMany({
        where: {
          projectId, tenantId: ctx.tenantId,
          ...(requestedCostCentreId ? { id: requestedCostCentreId } : {}),
        },
        select: { id: true, code: true },
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
        take: COST_CENTRE_LOOKUP_MAX_OPTIONS + 1,
      }),
      loadActiveBoqReferenceCatalog({
        tenantId: ctx.tenantId, userId: ctx.userId, route: '/api/boq/upload-template',
        requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray'),
      }),
    ]);
    if (!referenceCatalog.ok) return apiError(referenceCatalog.message, 413);
    const hasMoreCostCentres = allCostCentres.length > COST_CENTRE_LOOKUP_MAX_OPTIONS;
    if (hasMoreCostCentres) {
      await writeStructuredLog('warn', BOQ_TEMPLATE_COST_CENTRE_LOOKUP_LIMIT_EVENT, {
        operation: 'resolve_template_cost_centre', route: '/api/boq/upload-template',
        requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray'),
        tenantId: ctx.tenantId, userId: ctx.userId, projectId,
        resultCountAtLeast: allCostCentres.length, maxItems: COST_CENTRE_LOOKUP_MAX_OPTIONS,
        status: 'truncated',
      });
    }
    const costCentreOptions = hasMoreCostCentres
      ? allCostCentres.slice(0, COST_CENTRE_LOOKUP_MAX_OPTIONS)
      : allCostCentres;
    const allCategories = referenceCatalog.categories;
    const allUoms = referenceCatalog.uoms;
    const ccByCode = new Map(costCentreOptions.map((centre) => [centre.code.toUpperCase(), centre]));
    let costCentreId = requestedCostCentreId;
    if (!costCentreId && costCentreOptions.length > 0) {
      const costCentreByCode = rowCode ? ccByCode.get(rowCode) : undefined;
      if (rowCode && !costCentreByCode && hasMoreCostCentres) {
        return apiError(interpolateUiString(UI_STRINGS.appApiCostCentresRoute.activeCostCentreLookupExceedsMaximumSize, {
          maxItems: COST_CENTRE_LOOKUP_MAX_OPTIONS,
        }), 413);
      }
      costCentreId = costCentreByCode?.id || costCentreOptions[0].id;
    }
    if (requestedCostCentreId && !costCentreOptions.some((centre) => centre.id === requestedCostCentreId)) {
      return apiError(UI_STRINGS.common.costCentreNotFoundForThisProject, 404);
    }
    const prepared = parseTemplateRows(rows, sheetName || '', allCategories, allUoms);
    lineCount = prepared.lines.length;

    let existingBoq: Record<string, unknown> | null = null;
    let currentRevision: Record<string, unknown> | null = null;
    if (requestedBoqId) {
      existingBoq = await prisma.boq.findFirst({
        where: { id: requestedBoqId, tenantId: ctx.tenantId, projectId },
        include: { revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 } },
      }) as Record<string, unknown> | null;
      if (!existingBoq) return apiError(UI_STRINGS.common.bOQRevisionNotFound, 404);
      const revisions = existingBoq.revisions as Array<Record<string, unknown>> | undefined;
      currentRevision = revisions?.[0] || null;
      if (currentRevision?.status !== 'DRAFT') currentRevision = null;
    }

    const now = new Date();
    let expectedRevisionUpdatedAt: Date | string | null = null;
    let expectedRevisionStatus: string | null = null;
    if (existingBoq && currentRevision) {
      const priorUpdatedAt = currentRevision.updatedAt instanceof Date
        ? currentRevision.updatedAt
        : new Date(String(currentRevision.updatedAt || ''));
      if (!Number.isFinite(priorUpdatedAt.getTime())) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
      now.setTime(Math.max(now.getTime(), priorUpdatedAt.getTime() + 1));
      expectedRevisionUpdatedAt = currentRevision.updatedAt as Date | string;
      expectedRevisionStatus = String(currentRevision.status);
    }

    const isNewBoq = !existingBoq;
    targetBoqId = existingBoq ? String(existingBoq.id) : crypto.randomUUID();
    const requestedTitle = text(titleInput);
    const descriptionProvided = descriptionInput !== null;
    const requestedDescription = descriptionInput === null ? null : text(descriptionInput) || null;
    const purpose = purposeInput || String(existingBoq?.purpose || 'BUDGET');
    const category = categoryInput || String(existingBoq?.category || '');
    const defaultTitle = category ? `${category} — ${project.name}` : `${project.name} BOQ`;
    const boqTitle = requestedTitle || String(existingBoq?.title || defaultTitle);
    const boqDescription = requestedDescription ?? (existingBoq?.description as string | null | undefined) ?? null;
    const qualityScore = Math.max(0, Math.round(((prepared.validCount + prepared.warningCount * 0.5) / prepared.lines.length) * 100));

    // Upload only after validation, so malformed/oversized workbooks do not leave storage artifacts.
    const uploadExtension = path.extname(file.name).toLowerCase();
    if (!BOQ_TEMPLATE_UPLOAD_EXTENSIONS.includes(uploadExtension)) {
      return apiError(UI_STRINGS.appApiBoqUploadRoute.bOQUploadFailedOnlyXlsxXlsAndCsvFilesAreSupported, 400);
    }
    uploadedPath = await saveUpload([ctx.tenantId, projectId], `${crypto.randomUUID()}${uploadExtension}`, buffer);
    const auditId = crypto.randomUUID();
    const newRevisionId = currentRevision ? String(currentRevision.id) : crypto.randomUUID();
    revisionId = newRevisionId;
    const revisionStatus = currentRevision ? 'DRAFT' : null;
    const revisionUpdatedAt = currentRevision ? now : expectedRevisionUpdatedAt;
    const statements: D1BatchInputStatement[] = [];
    let headerIndex: number | null = null;
    let revisionInsertIndex: number | null = null;
    let touchIndex: number | null = null;
    let metadataIndex: number | null = null;

    if (isNewBoq) {
      headerIndex = statements.length;
      statements.push({
        sql: BOQ_INSERT_NEXT_CODE_SQL,
        values: [targetBoqId, ctx.tenantId, projectId, costCentreId, boqTitle, boqDescription, category || null, null,
          'DRAFT', purpose, ctx.userId, now, now],
      });
    } else {
      if (currentRevision) {
        touchIndex = statements.length;
        statements.push({
          sql: BOQ_REVISION_TOUCH_IF_CURRENT_SQL,
          values: [now, newRevisionId, ctx.tenantId, expectedRevisionStatus, expectedRevisionUpdatedAt],
        });
      }
      metadataIndex = statements.length;
      statements.push({
        sql: BOQ_TEMPLATE_UPDATE_METADATA_IF_CURRENT_SQL,
        values: [
          requestedTitle ? 1 : 0, requestedTitle || null,
          descriptionProvided ? 1 : 0, requestedDescription,
          purposeInput ? 1 : 0, purposeInput || null,
          categoryInput ? 1 : 0, categoryInput || null,
          0, null, now, targetBoqId, ctx.tenantId, projectId,
          currentRevision ? newRevisionId : null, currentRevision ? newRevisionId : null,
          ctx.tenantId, revisionStatus, revisionUpdatedAt,
        ],
      });
    }

    if (!currentRevision) {
      revisionInsertIndex = statements.length;
      statements.push({
        sql: BOQ_TEMPLATE_REVISION_INSERT_NEXT_SQL,
        values: [newRevisionId, ctx.tenantId, targetBoqId, costCentreId, 'DRAFT',
          prepared.errorCount > 0 ? 'VALIDATION_REQUIRED' : 'DRAFT', 'NOT_ADDED_TO_BUDGET', 'PR_NOT_CREATED',
          BOQ_TEMPLATE_SOURCE_TYPE, file.name, sheetName || null, null, file.name, uploadedPath, file.size,
          `${BOQ_TEMPLATE_CREATE_NOTES} (${file.name})`, prepared.lines.length, prepared.validCount,
          prepared.errorCount, prepared.warningCount, qualityScore, ctx.userId, now, now, now],
      });
    }

    const auditIndex = statements.length;
    const auditDescription = interpolateUiString(UI_STRINGS.appApiBoqUploadTemplateRoute.templateBOQUploadedNameWithLengthLinesQualityScoreQualityScore, {
      name: file.name, length: prepared.lines.length, qualityScore,
    });
    statements.push({
      sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
      values: [auditId, ctx.tenantId, ctx.userId, projectId, 'BOQ', targetBoqId, BOQ_TEMPLATE_AUDIT_ACTION,
        auditDescription, null, JSON.stringify({ totalLines: prepared.lines.length, validLines: prepared.validCount,
          warningLines: prepared.warningCount, errorLines: prepared.errorCount, qualityScore }), null,
        req.headers.get('user-agent'), now],
    });

    let deleteIndex: number | null = null;
    if (currentRevision) {
      deleteIndex = statements.length;
      statements.push({ sql: BOQ_LINE_DELETE_AFTER_AUDIT_SQL, values: [newRevisionId, ctx.tenantId, auditId, ctx.tenantId] });
    }
    const lineStartIndex = statements.length;
    for (const line of prepared.lines) statements.push(insertLineStatement(line, newRevisionId, ctx.tenantId, auditId, now));
    const metricsIndex = statements.length;
    statements.push({
      sql: BOQ_REVISION_UPDATE_MANUAL_METRICS_AFTER_AUDIT_SQL,
      values: [prepared.lines.length, prepared.validCount, prepared.errorCount, prepared.warningCount,
        qualityScore, now, newRevisionId, ctx.tenantId, auditId, ctx.tenantId],
    });
    statements.push({
      sql: BOQ_TEMPLATE_ASSERT_COMPLETE_SQL,
      values: [targetBoqId, ctx.tenantId, newRevisionId, ctx.tenantId, targetBoqId, auditId, ctx.tenantId,
        targetBoqId, newRevisionId, ctx.tenantId, prepared.lines.length, newRevisionId, ctx.tenantId,
        prepared.lines.length, prepared.validCount, prepared.errorCount, prepared.warningCount, qualityScore],
    });

    const results = await writeD1BatchAtomically(statements);
    const header = headerIndex === null ? null : results[headerIndex]?.results?.[0];
    const insertedRevision = revisionInsertIndex === null ? null : results[revisionInsertIndex]?.results?.[0];
    const boqCode = String(header?.boqCode || existingBoq?.boqCode || '');
    const revisionCode = String(insertedRevision?.revisionCode || currentRevision?.revisionCode || '');
    const headerOk = headerIndex === null || changed(results[headerIndex]) === 1;
    const touchOk = touchIndex === null || changed(results[touchIndex]) === 1;
    const metadataOk = metadataIndex === null || changed(results[metadataIndex]) === 1;
    const revisionOk = revisionInsertIndex === null || changed(results[revisionInsertIndex]) === 1;
    const auditOk = changed(results[auditIndex]) === 1;
    const linesOk = prepared.lines.every((_, index) => changed(results[lineStartIndex + index]) === 1);
    const metricsOk = changed(results[metricsIndex]) === 1;
    // A delete may legitimately affect zero rows when replacing an empty draft.
    void deleteIndex;
    if (!headerOk || !touchOk || !metadataOk || !revisionOk || !auditOk || !linesOk || !metricsOk || !boqCode || !revisionCode) {
      await writeStructuredLog('error', 'boq.template_upload_batch_invariant_failed', {
        operation: 'persist_template_boq', route: '/api/boq/upload-template', requestId: req.headers.get('x-request-id'),
        tenantId: ctx.tenantId, userId: ctx.userId, projectId, boqId: targetBoqId, revisionId,
        lineCount: prepared.lines.length, durationMs: Date.now() - startedAt,
        invariant: { headerOk, touchOk, metadataOk, revisionOk, auditOk, linesOk, metricsOk, hasBoqCode: Boolean(boqCode), hasRevisionCode: Boolean(revisionCode) },
      });
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }

    return apiSuccess({
      boqId: targetBoqId,
      revisionId: newRevisionId,
      boqCode,
      revisionCode,
      totalLines: prepared.lines.length,
      validLines: prepared.validCount,
      warningLines: prepared.warningCount,
      errorLines: prepared.errorCount,
      qualityScore,
      exceptions: prepared.exceptions,
    }, isNewBoq ? 201 : 200);
  } catch (error) {
    await discardUnreferencedUpload();
    if (error instanceof InvalidTemplateError) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    await writeStructuredLog('error', 'boq.template_upload_failed', {
      operation: 'upload_template', route: '/api/boq/upload-template', requestId: req.headers.get('x-request-id'),
      tenantId: ctx.tenantId, userId: ctx.userId, projectId: projectIdForLog, boqId: targetBoqId, revisionId,
      lineCount, durationMs: Date.now() - startedAt, uploadStored: Boolean(uploadedPath),
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.appApiBoqUploadTemplateRoute.templateUploadFailed, 500);
  }
}
