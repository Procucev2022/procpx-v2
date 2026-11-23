import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { processDrawingFile } from '@/lib/drawing-parser';
import type { DrawingDraftLine, DrawingDraftRequest, PreparedDrawingBoqLine } from '@app-types/app/api/boq/drawing-extract.types';
import { deleteUpload, saveUpload } from '@/lib/storage';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import { toBulkBoqLineInsertStatements, writeD1BatchAtomically } from '@/lib/d1-batch';
import {
  AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
  BOQ_INSERT_NEXT_CODE_SQL,
  BOQ_LINE_INSERT_AFTER_AUDIT_SQL,
  BOQ_REVISION_UPDATE_MANUAL_METRICS_AFTER_AUDIT_SQL,
  BOQ_TEMPLATE_ASSERT_COMPLETE_SQL,
  BOQ_TEMPLATE_REVISION_INSERT_NEXT_SQL,
} from '@/lib/d1-batch.constants';
import type { D1BatchInputStatement } from '@app-types/lib/d1-batch.types';
import { logEvent, writeStructuredLog } from '@/lib/observability/server-logger';
import { MAX_BOQ_UPLOAD_BYTES } from '@/lib/boq-upload.constants';
import { loadActiveBoqReferenceCatalog } from '@/lib/boq-reference-catalog';
import { DRAWING_BOQ_AUDIT_ACTION, DRAWING_BOQ_SOURCE_TYPE, MAX_DRAWING_BOQ_LINES, SUPPORTED_DRAWING_EXTENSIONS } from './route.constants';
import {
  PROJECT_DOCUMENT_AUDIT_DELETE_IF_PRESENT_SQL,
  PROJECT_DOCUMENT_DELETE_IF_PRESENT_SQL,
  PROJECT_DOCUMENT_INSERT_SQL,
} from '../../projects/[id]/documents/route.constants';

class InvalidDrawingRequestError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim();
}

function isUpload(value: FormDataEntryValue | null): value is File {
  return typeof value === 'object' && value !== null && 'name' in value && 'size' in value
    && 'arrayBuffer' in value && typeof value.arrayBuffer === 'function';
}

function drawingLineStatement(line: PreparedDrawingBoqLine, revisionId: string, tenantId: string, auditId: string, now: Date): D1BatchInputStatement {
  return {
    sql: BOQ_LINE_INSERT_AFTER_AUDIT_SQL,
    values: [
      crypto.randomUUID(), tenantId, revisionId, line.lineNumber, line.description, line.description, line.specification,
      line.categoryId, null, line.uomId, line.uomRaw, line.quantity, line.location, line.drawingReference, null,
      null, null, null, null, null, line.sourceSheet, null, line.sourceReference, line.confidence, true, line.status,
      JSON.stringify(line.validationMessages), false, null, null, line.description, line.specification,
      line.aiReason, line.confidence, null, null, null, null, null, null, null, null, null, now, now,
      auditId, tenantId, revisionId, tenantId,
    ],
  };
}

function prepareDrawingLines(lines: DrawingDraftLine[], categories: Array<{ id: string; name: string }>, uoms: Array<{ id: string; code: string }>, drawingNumber: string): {
  lines: PreparedDrawingBoqLine[];
  validCount: number;
  warningCount: number;
  errorCount: number;
} {
  const categoryByName = new Map(categories.map((category) => [category.name.trim().toLowerCase(), category.id]));
  const uomByCode = new Map(uoms.map((uom) => [uom.code.trim().toUpperCase(), uom.id]));
  const prepared: PreparedDrawingBoqLine[] = [];
  let validCount = 0;
  let warningCount = 0;
  let errorCount = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const item = lines[index];
    const description = text(item.description);
    if (!description) throw new InvalidDrawingRequestError(UI_STRINGS.common.descriptionIsRequired);
    const rawQuantity = item.quantity;
    const hasQuantity = rawQuantity !== null && rawQuantity !== undefined && text(rawQuantity) !== '' && Number.isFinite(Number(rawQuantity));
    const numericQuantity = hasQuantity ? Number(rawQuantity) : null;
    const negativeQuantity = numericQuantity !== null && numericQuantity < 0;
    const uncertain = item.quantityType === 'UNCERTAIN' || !hasQuantity || numericQuantity === 0;
    const messages: PreparedDrawingBoqLine['validationMessages'] = [];
    let status = 'VALID';
    if (negativeQuantity) {
      status = 'ERROR';
      messages.push({ level: 'ERROR', code: 'QTY_NEGATIVE', message: UI_STRINGS.appApiBoqUploadTemplateRoute.quantityCannotBeNegative });
    } else if (uncertain) {
      status = 'WARNING';
      messages.push({ level: 'WARNING', code: 'UNVERIFIED_QUANTITY', message: text(item.uncertainReason) || UI_STRINGS.appApiBoqDrawingExtractRoute.quantityUnverifiedInDrawingFieldVerificationRequired });
    } else {
      messages.push({
        level: 'INFO', code: 'DRAWING_EXTRACTED',
        message: interpolateUiString(UI_STRINGS.appApiBoqDrawingExtractRoute.extractedFromDrawingValue1Value2, {
          value1: drawingNumber,
          value2: item.location ? interpolateUiString(UI_STRINGS.appApiBoqDrawingExtractRoute.locationValue1, { value1: text(item.location) }) : '',
        }),
      });
    }
    if (status === 'VALID') validCount += 1;
    else if (status === 'WARNING') warningCount += 1;
    else errorCount += 1;

    const rawUom = text(item.uom) || 'NOS';
    const categoryName = text(item.category).toLowerCase();
    const confidence = Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : 0.9;
    const mark = text(item.mark);
    prepared.push({
      lineNumber: String(index + 1), description,
      specification: text(item.specification) || description,
      categoryId: categoryByName.get(categoryName) || null,
      uomId: uomByCode.get(rawUom.toUpperCase()) || null,
      uomRaw: rawUom,
      quantity: hasQuantity ? numericQuantity : null,
      location: text(item.location) || null,
      drawingReference: text(item.drawingReference) || drawingNumber,
      sourceSheet: text(item.sheet) || 'Sheet 01',
      sourceReference: mark ? `${mark} - ${description}` : description,
      confidence,
      aiReason: text(item.uncertainReason) || `Extracted from drawing ${drawingNumber}`,
      status,
      validationMessages: messages,
    });
  }
  return { lines: prepared, validCount, warningCount, errorCount };
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BOQ_UPLOAD');
  if (!isApiContext(ctx)) return ctx;
  const startedAt = Date.now();
  let projectIdForLog: string | undefined;
  let boqIdForLog: string | undefined;
  let revisionIdForLog: string | undefined;
  let lineCount = 0;
  let savedFilePath: string | undefined;
  let documentPersisted = false;
  let uploadCreatedInRequest = false;
  let documentPersistenceUncertain = false;
  let uploadedDocumentId: string | undefined;
  let uploadedAuditId: string | undefined;
  let uploadedDrawingResponse: unknown;

  try {
    const contentType = req.headers.get('content-type') || '';
    const contentLength = Number(req.headers.get('content-length'));
    if (!contentType.includes('application/json') && Number.isFinite(contentLength) && contentLength > MAX_BOQ_UPLOAD_BYTES + 64 * 1024) {
      return apiError(interpolateUiString(UI_STRINGS.appApiBoqDrawingExtractRoute.drawingFileMustBeBetweenOneByteAndMaxBytes, { maxBytes: MAX_BOQ_UPLOAD_BYTES }), 413);
    }
    if (contentType.includes('application/json')) {
      const parsed: unknown = await req.json();
      if (!isRecord(parsed)) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      const body = parsed as DrawingDraftRequest;
      projectIdForLog = text(body.projectId) || undefined;
      const projectId = text(body.projectId);
      const drawingNumber = text(body.drawingNumber) || 'DWG-A-101';
      const fileName = text(body.fileName) || `${drawingNumber || 'drawing'}.pdf`;
      const fileSize = Number(body.fileSize);
      const lines = body.lines;
      if (!projectId) return apiError(UI_STRINGS.appApiBoqDrawingExtractRoute.projectIDIsRequiredToGenerateDraftBOQ, 400);
      if (!Array.isArray(lines) || lines.length === 0) return apiError(UI_STRINGS.appApiBoqDrawingExtractRoute.atLeastOneBOQLineItemIsRequired, 400);
      if (lines.length > MAX_DRAWING_BOQ_LINES) return apiError(UI_STRINGS.common.boqLineBatchLimitExceeded, 400);
      if (!lines.every(isRecord)) return apiError(UI_STRINGS.common.invalidRequestBody, 400);

      const project = await prisma.project.findFirst({ where: { id: projectId, tenantId: ctx.tenantId } });
      if (!project) return apiError(UI_STRINGS.common.projectNotFound2, 404);
      const costCentreId = text(body.costCentreId) || null;
      if (costCentreId) {
        const costCentre = await prisma.costCentre.findFirst({ where: { id: costCentreId, projectId, tenantId: ctx.tenantId }, select: { id: true } });
        if (!costCentre) return apiError(UI_STRINGS.common.costCentreNotFoundForThisProject, 404);
      }
      if (body.savedDocumentId) {
        const document = await prisma.projectDocument.findFirst({
          where: { id: text(body.savedDocumentId), projectId, tenantId: ctx.tenantId, category: 'DRAWING' },
          select: { id: true, filePath: true, fileSize: true, name: true },
        });
        if (!document) return apiError(UI_STRINGS.appApiBoqDrawingExtractRoute.uploadedDrawingNotFound, 404);
        savedFilePath = String(document.filePath);
      }

      const references = await loadActiveBoqReferenceCatalog({
        tenantId: ctx.tenantId, userId: ctx.userId, route: '/api/boq/drawing-extract',
        requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray'),
      });
      if (!references.ok) return apiError(references.message, 413);
      const { categories, uoms } = references;
      const prepared = prepareDrawingLines(lines, categories, uoms, drawingNumber);
      lineCount = prepared.lines.length;
      const qualityScore = Math.round((prepared.validCount / prepared.lines.length) * 100) || 0;
      const now = new Date();
      const newBoqId = crypto.randomUUID();
      const newRevisionId = crypto.randomUUID();
      const auditId = crypto.randomUUID();
      boqIdForLog = newBoqId;
      revisionIdForLog = newRevisionId;
      const title = text(body.title) || interpolateUiString(UI_STRINGS.appApiBoqDrawingExtractRoute.architecturalDrawingTitleForProject, { projectName: project.name });
      const description = text(body.description) || interpolateUiString(UI_STRINGS.appApiBoqDrawingExtractRoute.extractedFromArchitecturalDrawingNumber, { drawingNumber });
      const purpose = text(body.purpose) || 'BUDGET';
      const validFileSize = Number.isFinite(fileSize) && fileSize >= 0 ? Math.min(Math.floor(fileSize), 2_147_483_647) : 0;
      const statements: D1BatchInputStatement[] = [
        {
          sql: BOQ_INSERT_NEXT_CODE_SQL,
          values: [newBoqId, ctx.tenantId, projectId, costCentreId, title, description, null, null, 'DRAFT', purpose, ctx.userId, now, now],
        },
        {
          sql: BOQ_TEMPLATE_REVISION_INSERT_NEXT_SQL,
          values: [newRevisionId, ctx.tenantId, newBoqId, costCentreId, 'DRAFT', 'AI_REVIEW', 'NOT_ADDED_TO_BUDGET',
            'PR_NOT_CREATED', DRAWING_BOQ_SOURCE_TYPE, fileName, drawingNumber, 0.9, fileName, savedFilePath || null,
            validFileSize, `Extracted via Architectural Drawing Parser from ${fileName} (Ref: ${drawingNumber})`,
            prepared.lines.length, prepared.validCount, prepared.errorCount, prepared.warningCount, qualityScore,
            ctx.userId, savedFilePath ? now : null, now, now],
        },
        {
          sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
          values: [auditId, ctx.tenantId, ctx.userId, projectId, 'BOQ', newBoqId, DRAWING_BOQ_AUDIT_ACTION,
            interpolateUiString(UI_STRINGS.appApiBoqDrawingExtractRoute.drawingBOQCreatedFromDrawingWithLineCount, { drawingNumber, length: prepared.lines.length }),
            null, JSON.stringify({ drawingNumber, totalLines: prepared.lines.length, validLines: prepared.validCount,
              warningLines: prepared.warningCount, errorLines: prepared.errorCount, qualityScore }), null,
            req.headers.get('user-agent'), now],
        },
        // JSON bulk statements keep large drawing BOQs inside this one atomic batch.
        ...toBulkBoqLineInsertStatements(prepared.lines.map((line) => drawingLineStatement(line, newRevisionId, ctx.tenantId, auditId, now))),
        {
          sql: BOQ_REVISION_UPDATE_MANUAL_METRICS_AFTER_AUDIT_SQL,
          values: [prepared.lines.length, prepared.validCount, prepared.errorCount, prepared.warningCount,
            qualityScore, now, newRevisionId, ctx.tenantId, auditId, ctx.tenantId],
        },
        {
          sql: BOQ_TEMPLATE_ASSERT_COMPLETE_SQL,
          values: [newBoqId, ctx.tenantId, newRevisionId, ctx.tenantId, newBoqId, auditId, ctx.tenantId,
            newBoqId, newRevisionId, ctx.tenantId, prepared.lines.length, newRevisionId, ctx.tenantId,
            prepared.lines.length, prepared.validCount, prepared.errorCount, prepared.warningCount, qualityScore],
        },
      ];
      const results = await writeD1BatchAtomically(statements);
      const boqCode = String(results[0]?.results?.[0]?.boqCode || '');
      const revisionCode = String(results[1]?.results?.[0]?.revisionCode || '');
      const expectedWrites = results.slice(0, statements.length - 1).every((result) => result.success !== false);
      if (!boqCode || !revisionCode || !expectedWrites) {
        await writeStructuredLog('error', 'boq.drawing_draft_batch_invariant_failed', {
          operation: 'persist_drawing_boq', route: '/api/boq/drawing-extract', requestId: req.headers.get('x-request-id'),
          tenantId: ctx.tenantId, userId: ctx.userId, projectId, boqId: newBoqId, revisionId: newRevisionId,
          lineCount, durationMs: Date.now() - startedAt, hasBoqCode: Boolean(boqCode), hasRevisionCode: Boolean(revisionCode),
        });
        return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
      }
      return apiSuccess({
        boqId: newBoqId, revisionId: newRevisionId, boqCode, revisionCode,
        totalLines: prepared.lines.length, validLines: prepared.validCount, drawingNumber,
      }, 201);
    }

    const formData = await req.formData();
    const fileValue = formData.get('file');
    const projectId = text(formData.get('projectId'));
    const drawingNumber = text(formData.get('drawingNumber')) || 'DWG-A-101';
    if (!isUpload(fileValue) || !projectId) return apiError(UI_STRINGS.appApiBoqDrawingExtractRoute.drawingFileAndProjectIDAreRequired, 400);
    projectIdForLog = projectId;

    const project = await prisma.project.findFirst({ where: { id: projectId, tenantId: ctx.tenantId } });
    if (!project) return apiError(UI_STRINGS.common.projectNotFound2, 404);
    if (fileValue.size <= 0 || fileValue.size > MAX_BOQ_UPLOAD_BYTES) {
      return apiError(interpolateUiString(UI_STRINGS.appApiBoqDrawingExtractRoute.drawingFileMustBeBetweenOneByteAndMaxBytes, { maxBytes: MAX_BOQ_UPLOAD_BYTES }), 413);
    }
    const extension = fileValue.name.split('.').pop()?.toLowerCase();
    if (!extension || !SUPPORTED_DRAWING_EXTENSIONS.includes(extension as typeof SUPPORTED_DRAWING_EXTENSIONS[number])) {
      return apiError(interpolateUiString(UI_STRINGS.appApiBoqDrawingExtractRoute.unsupportedDrawingFormatExtSupportedFormatsArePDFPNGJPGAndJPEG, { ext: extension || '' }), 400);
    }

    const safeOriginalName = (fileValue.name.split(/[\\/]/).pop() || '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim();
    if (!safeOriginalName || safeOriginalName.length > 200) return apiError(UI_STRINGS.appApiBoqDrawingExtractRoute.drawingFileAndProjectIDAreRequired, 400);
    const fileBuffer = Buffer.from(await fileValue.arrayBuffer());
    const parseResult = await processDrawingFile(fileBuffer, safeOriginalName, drawingNumber);
    const documentId = crypto.randomUUID();
    const auditId = crypto.randomUUID();
    uploadedDocumentId = documentId;
    uploadedAuditId = auditId;
    const uploadedAt = new Date();
    savedFilePath = await saveUpload([ctx.tenantId, projectId, 'drawings'], `${documentId}.${extension}`, fileBuffer);
    uploadCreatedInRequest = true;
    const fileType = extension === 'pdf' ? 'application/pdf' : extension === 'png' ? 'image/png' : 'image/jpeg';
    const auditDescription = interpolateUiString(UI_STRINGS.appApiProjectsIdDocumentsRoute.projectDocumentAddedNameCategory, {
      name: safeOriginalName,
      category: 'DRAWING',
    });
    uploadedDrawingResponse = {
      success: true, fileName: safeOriginalName, fileSize: fileValue.size, documentId,
      drawingNumber: parseResult.drawingReference || drawingNumber, parserUsed: parseResult.parserUsed,
      providerMessage: parseResult.providerMessage, totalDetected: parseResult.totalDetected,
      explicitCount: parseResult.explicitCount, uncertainCount: parseResult.uncertainCount,
      items: parseResult.items, warnings: parseResult.warnings,
    };
    const documentResults = await writeD1BatchAtomically([
      {
        sql: PROJECT_DOCUMENT_INSERT_SQL,
        values: [documentId, projectId, ctx.tenantId, safeOriginalName, fileType, fileValue.size,
          savedFilePath, ctx.userId, uploadedAt, 'DRAWING'],
      },
      {
        sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
        values: [auditId, ctx.tenantId, ctx.userId, projectId, 'PROJECT', projectId, 'CREATE', auditDescription,
          null, JSON.stringify({ documentId, name: safeOriginalName, category: 'DRAWING', fileSize: fileValue.size }),
          null, req.headers.get('user-agent'), uploadedAt],
      },
    ]);
    const documentInserted = Number(documentResults[0]?.meta?.changes || 0) === 1;
    const auditInserted = Number(documentResults[1]?.meta?.changes || 0) === 1;
    documentPersisted = documentInserted;
    if (!documentInserted || !auditInserted) {
      try {
        await writeD1BatchAtomically([
          { sql: PROJECT_DOCUMENT_AUDIT_DELETE_IF_PRESENT_SQL, values: [auditId, ctx.tenantId, projectId] },
          { sql: PROJECT_DOCUMENT_DELETE_IF_PRESENT_SQL, values: [documentId, projectId, ctx.tenantId] },
        ]);
      } catch (compensationError) {
        // Keep the drawing blob available if the document row may still reference it.
        savedFilePath = undefined;
        logEvent('error', 'boq.drawing_upload_compensation_failed', {
          operation: 'compensate_drawing_document_upload', route: '/api/boq/drawing-extract',
          requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
          projectId, documentId, auditId, fileSize: fileValue.size, durationMs: Date.now() - startedAt,
          documentPersisted, storagePreserved: true,
          error: compensationError instanceof Error ? { name: compensationError.name } : { type: typeof compensationError },
        });
        return apiError(UI_STRINGS.appApiProjectsIdDocumentsRoute.documentUploadFailed, 500);
      }
      await deleteUpload(savedFilePath, [ctx.tenantId, projectId, 'drawings']);
      savedFilePath = undefined;
      documentPersisted = false;
      return apiError(UI_STRINGS.appApiProjectsIdDocumentsRoute.projectDocumentChangedPleaseRetry, 409);
    }
    documentPersisted = true;

    return apiSuccess(uploadedDrawingResponse, 200);
  } catch (error) {
    if (error instanceof InvalidDrawingRequestError) return apiError(UI_STRINGS.common.descriptionIsRequired, 400);
    if (savedFilePath && uploadCreatedInRequest && !documentPersisted && projectIdForLog && uploadedDocumentId && uploadedAuditId) {
      try {
        const [persistedDocument, persistedAudit] = await Promise.all([
          prisma.projectDocument.findFirst({
            where: { id: uploadedDocumentId, projectId: projectIdForLog, tenantId: ctx.tenantId },
            select: { id: true },
          }),
          prisma.auditLog.findFirst({
            where: { id: uploadedAuditId, tenantId: ctx.tenantId, entityType: 'PROJECT', entityId: projectIdForLog },
            select: { id: true },
          }),
        ]);
        if (persistedDocument && persistedAudit) {
          documentPersisted = true;
          logEvent('warn', 'boq.drawing_upload_acknowledgement_lost', {
            operation: 'reconcile_drawing_document_upload', route: '/api/boq/drawing-extract',
            requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
            projectId: projectIdForLog, documentId: uploadedDocumentId, auditId: uploadedAuditId,
            durationMs: Date.now() - startedAt,
          });
          return apiSuccess(uploadedDrawingResponse, 200);
        }
        if (persistedDocument || persistedAudit) {
          documentPersisted = Boolean(persistedDocument);
          documentPersistenceUncertain = true;
          savedFilePath = undefined;
          logEvent('error', 'boq.drawing_upload_persistence_incomplete', {
            operation: 'reconcile_drawing_document_upload', route: '/api/boq/drawing-extract',
            requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
            projectId: projectIdForLog, documentId: uploadedDocumentId, auditId: uploadedAuditId,
            documentRowPresent: Boolean(persistedDocument), auditRowPresent: Boolean(persistedAudit),
            durationMs: Date.now() - startedAt,
          });
        }
      } catch (reconciliationError) {
        documentPersistenceUncertain = true;
        savedFilePath = undefined;
        logEvent('warn', 'boq.drawing_upload_reconciliation_failed', {
          operation: 'reconcile_drawing_document_upload', route: '/api/boq/drawing-extract',
          requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
          projectId: projectIdForLog, documentId: uploadedDocumentId, auditId: uploadedAuditId,
          durationMs: Date.now() - startedAt,
          error: reconciliationError instanceof Error ? { name: reconciliationError.name } : { type: typeof reconciliationError },
        });
      }
    }
    if (savedFilePath && uploadCreatedInRequest && !documentPersisted && projectIdForLog) {
      try {
        await deleteUpload(savedFilePath, [ctx.tenantId, projectIdForLog, 'drawings']);
        savedFilePath = undefined;
      } catch (cleanupError) {
        await writeStructuredLog('error', 'boq.drawing_upload_cleanup_failed', {
          operation: 'remove_unreferenced_drawing', route: '/api/boq/drawing-extract',
          requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, projectId: projectIdForLog,
          error: cleanupError instanceof Error ? { name: cleanupError.name, message: cleanupError.message.slice(0, 300) } : { type: typeof cleanupError },
        });
      }
    }
    await writeStructuredLog('error', 'boq.drawing_processing_failed', {
      operation: 'process_drawing_or_create_draft', route: '/api/boq/drawing-extract',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
      projectId: projectIdForLog, boqId: boqIdForLog, revisionId: revisionIdForLog, documentId: uploadedDocumentId,
      lineCount, durationMs: Date.now() - startedAt, documentPersisted, documentPersistenceUncertain,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.appApiBoqDrawingExtractRoute.drawingProcessingFailed, 500);
  }
}
