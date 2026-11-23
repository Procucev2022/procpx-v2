import { NextRequest } from 'next/server';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import { standardiseUom } from '@/lib/uom-standardise';
import { validateBoqLine, computeQualityScore } from '@/lib/boq-validate';
import { readUpload } from '@/lib/storage';
import type { BoqImportRequest, ColumnMapping } from '@app-types/app/api/boq/import/route.types';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import { sumD1BatchChanges, toBulkBoqLineInsertStatements, writeD1BatchAtomically } from '@/lib/d1-batch';
import {
  AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
  BOQ_LINE_DELETE_AFTER_AUDIT_SQL,
  BOQ_LINE_INSERT_AFTER_AUDIT_SQL,
  BOQ_REVISION_TOUCH_IF_CURRENT_SQL,
  BOQ_REVISION_UPDATE_IMPORT_METRICS_AFTER_AUDIT_SQL,
  MAX_BOQ_BATCH_LINES,
} from '@/lib/d1-batch.constants';
import type { D1BatchInputStatement, D1BatchResult } from '@app-types/lib/d1-batch.types';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { MAX_BOQ_IMPORT_SHEET_ROWS, MAX_BOQ_UPLOAD_BYTES } from '@/lib/boq-upload.constants';
import { loadActiveBoqReferenceCatalog } from '@/lib/boq-reference-catalog';

type ImportedLine = {
  lineNumber: string;
  originalDescription: string;
  standardDescription: string;
  specification: string | null;
  uomRaw: string;
  uomId: string | null;
  quantity: number | null;
  location: string | null;
  drawingReference: string | null;
  brand: string | null;
  model: string | null;
  material: string | null;
  grade: string | null;
  remarks: string | null;
  sourceSheet: string;
  sourceRow: number;
  confidenceScore: number;
  validationStatus: string;
  validationMessages: unknown[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cellText(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim();
}

function getChangedCount(result: D1BatchResult | undefined): number {
  return Number(result?.meta?.changes || 0);
}

function lineStatement(line: ImportedLine, revisionId: string, tenantId: string, auditId: string, now: Date): D1BatchInputStatement {
  return {
    sql: BOQ_LINE_INSERT_AFTER_AUDIT_SQL,
    values: [
      crypto.randomUUID(), tenantId, revisionId, line.lineNumber, line.originalDescription, line.standardDescription,
      line.specification, null, null, line.uomId, line.uomRaw || null, line.quantity, line.location, line.drawingReference,
      line.brand, line.model, line.material, line.grade, line.remarks, null, line.sourceSheet, line.sourceRow,
      null, line.confidenceScore, true, line.validationStatus, JSON.stringify(line.validationMessages), false,
      null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
      now, now, auditId, tenantId, revisionId, tenantId,
    ],
  };
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BOQ_UPLOAD');
  if (!isApiContext(ctx)) return ctx;
  const startedAt = Date.now();
  let revisionId: string | undefined;
  let importedCount = 0;

  try {
    let body: BoqImportRequest;
    try {
      const parsed: unknown = await req.json();
      if (!isRecord(parsed)) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      body = parsed as BoqImportRequest;
    } catch {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }

    revisionId = typeof body.revisionId === 'string' ? body.revisionId : undefined;
    const sheetName = typeof body.sheetName === 'string' && body.sheetName ? body.sheetName : undefined;
    if (!revisionId) return apiError(UI_STRINGS.appApiBoqImportRoute.revisionIDIsRequired);
    if (!isRecord(body.columnMapping)) return apiError(UI_STRINGS.common.columnMappingIsIncompletePleaseMapDescriptionUOMAndQuantity);
    const columnMapping = body.columnMapping as unknown as ColumnMapping;
    if (typeof columnMapping.description !== 'string' || !columnMapping.description) {
      return apiError(UI_STRINGS.common.columnMappingIsIncompletePleaseMapDescriptionUOMAndQuantity);
    }
    if (typeof columnMapping.uom !== 'string' || !columnMapping.uom) {
      return apiError(UI_STRINGS.common.columnMappingIsIncompletePleaseMapUOM);
    }
    if (typeof columnMapping.quantity !== 'string' || !columnMapping.quantity) {
      return apiError(UI_STRINGS.common.columnMappingIsIncompletePleaseMapQuantity);
    }
    if (Object.values(columnMapping).some((value) => value !== undefined && typeof value !== 'string')) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }

    const revision = await prisma.boqRevision.findFirst({
      where: { id: revisionId, tenantId: ctx.tenantId },
      select: {
        id: true, tenantId: true, status: true, updatedAt: true, originalFilePath: true, originalFileSize: true,
        boq: { select: { projectId: true, boqCode: true } },
      },
    });
    if (!revision) return apiError(UI_STRINGS.common.bOQRevisionNotFound, 404);
    if (revision.status !== 'DRAFT') return apiError(UI_STRINGS.appApiBoqImportRoute.onlyDRAFTRevisionsCanBeImported);
    if (!revision.originalFilePath) return apiError(UI_STRINGS.appApiBoqImportRoute.noUploadedFileFoundForThisRevision);
    if (revision.originalFileSize !== null && revision.originalFileSize > MAX_BOQ_UPLOAD_BYTES) {
      return apiError(interpolateUiString(UI_STRINGS.appApiBoqUploadRoute.boqUploadFileMustBeBetweenOneByteAndMaxBytes, { maxBytes: MAX_BOQ_UPLOAD_BYTES }), 413);
    }

    const buffer = await readUpload(revision.originalFilePath);
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_BOQ_UPLOAD_BYTES) {
      return apiError(interpolateUiString(UI_STRINGS.appApiBoqUploadRoute.boqUploadFileMustBeBetweenOneByteAndMaxBytes, { maxBytes: MAX_BOQ_UPLOAD_BYTES }), 413);
    }
    const XLSX = (await import('xlsx')).default;
    const workbook = XLSX.read(buffer, { type: 'buffer', sheetRows: MAX_BOQ_IMPORT_SHEET_ROWS });
    const targetSheetName = sheetName || workbook.SheetNames[0];
    const sheet = targetSheetName ? workbook.Sheets[targetSheetName] : undefined;
    if (!sheet || !targetSheetName) return apiError(UI_STRINGS.appApiBoqImportRoute.sheetNotFoundInUploadedFile);

    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Array<Record<string, unknown>>;
    if (rows.length > MAX_BOQ_BATCH_LINES) return apiError(UI_STRINGS.common.boqLineBatchLimitExceeded, 400);
    const referenceCatalog = await loadActiveBoqReferenceCatalog({
      tenantId: ctx.tenantId, userId: ctx.userId, route: '/api/boq/import',
      requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray'),
    }, { categories: false, uoms: true });
    if (!referenceCatalog.ok) return apiError(referenceCatalog.message, 413);
    const uomMasters = referenceCatalog.uoms;
    const uomByCode = new Map(uomMasters.map((uom) => [uom.code.toUpperCase(), uom.id]));
    const importedLines: ImportedLine[] = [];
    const lineNumbers = new Set<string>();

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const description = cellText(row[columnMapping.description]);
      if (!description) continue;
      const rawUom = cellText(row[columnMapping.uom]);
      const rawQuantity = cellText(row[columnMapping.quantity]).replace(/,/g, '');
      const parsedQuantity = rawQuantity ? Number(rawQuantity) : null;
      const quantity = parsedQuantity !== null && Number.isFinite(parsedQuantity) ? parsedQuantity : null;
      const standardizedUom = standardiseUom(rawUom);
      const uomId = uomByCode.get(standardizedUom.code.toUpperCase()) || null;
      const lineNumber = (columnMapping.lineNumber ? cellText(row[columnMapping.lineNumber]) : '') || String(importedLines.length + 1);
      if (lineNumbers.has(lineNumber)) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      lineNumbers.add(lineNumber);

      const line = {
        originalDescription: description,
        standardDescription: description,
        uomRaw: rawUom,
        uomId: uomId ?? undefined,
        quantity,
        categoryId: undefined,
      };
      const validation = validateBoqLine(line);
      importedLines.push({
        lineNumber,
        originalDescription: description,
        standardDescription: description,
        specification: columnMapping.specification ? cellText(row[columnMapping.specification]) || null : null,
        uomRaw: rawUom,
        uomId,
        quantity,
        location: columnMapping.location ? cellText(row[columnMapping.location]) || null : null,
        drawingReference: columnMapping.drawingReference ? cellText(row[columnMapping.drawingReference]) || null : null,
        brand: columnMapping.brand ? cellText(row[columnMapping.brand]) || null : null,
        model: columnMapping.model ? cellText(row[columnMapping.model]) || null : null,
        material: columnMapping.material ? cellText(row[columnMapping.material]) || null : null,
        grade: columnMapping.grade ? cellText(row[columnMapping.grade]) || null : null,
        remarks: columnMapping.remarks ? cellText(row[columnMapping.remarks]) || null : null,
        sourceSheet: targetSheetName,
        sourceRow: index + 2,
        confidenceScore: uomId ? 1 : 0.5,
        validationStatus: validation.status,
        validationMessages: validation.messages,
      });
    }
    importedCount = importedLines.length;

    const validCount = importedLines.filter((line) => line.validationStatus === 'VALID').length;
    const errorCount = importedLines.filter((line) => line.validationStatus === 'ERROR').length;
    const warnCount = importedLines.filter((line) => line.validationStatus === 'WARNING').length;
    const qualityScore = computeQualityScore(importedLines.map((line) => ({
      originalDescription: line.originalDescription,
      standardDescription: line.standardDescription,
      uomRaw: line.uomRaw,
      uomId: line.uomId ?? undefined,
      quantity: line.quantity,
      categoryId: undefined,
    })));
    const previousUpdatedAt = revision.updatedAt instanceof Date ? revision.updatedAt : new Date(String(revision.updatedAt));
    if (!Number.isFinite(previousUpdatedAt.getTime())) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    const now = new Date(Math.max(Date.now(), previousUpdatedAt.getTime() + 1));
    const auditId = crypto.randomUUID();
    const description = interpolateUiString(UI_STRINGS.appApiBoqImportRoute.bOQImportedLengthLinesValidCountValidWarnCountWarningsErrorCountErrors, {
      length: importedLines.length, validCount, warnCount, errorCount,
    });
    const auditNewValue = JSON.stringify({ totalLines: importedLines.length, validCount, errorCount, warnCount, qualityScore });
    // JSON bulk statements keep large imports inside this one atomic batch.
    const lineStatements = toBulkBoqLineInsertStatements(importedLines.map((line) => lineStatement(line, revisionId as string, ctx.tenantId, auditId, now)));
    const statements: D1BatchInputStatement[] = [
      { sql: BOQ_REVISION_TOUCH_IF_CURRENT_SQL, values: [now, revisionId, ctx.tenantId, revision.status, revision.updatedAt] },
      {
        sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
        values: [auditId, ctx.tenantId, ctx.userId, revision.boq.projectId, 'BOQ_REVISION', revisionId, 'IMPORT', description,
          null, auditNewValue, null, req.headers.get('user-agent'), now],
      },
      { sql: BOQ_LINE_DELETE_AFTER_AUDIT_SQL, values: [revisionId, ctx.tenantId, auditId, ctx.tenantId] },
      ...lineStatements,
      {
        sql: BOQ_REVISION_UPDATE_IMPORT_METRICS_AFTER_AUDIT_SQL,
        values: [JSON.stringify(columnMapping), importedLines.length, validCount, errorCount, warnCount, qualityScore, now,
          revisionId, ctx.tenantId, auditId, ctx.tenantId],
      },
    ];
    const results = await writeD1BatchAtomically(statements);
    const insertedLines = sumD1BatchChanges(results, 3, lineStatements.length) === importedLines.length;
    if (getChangedCount(results[0]) !== 1 || getChangedCount(results[1]) !== 1
      || !insertedLines || getChangedCount(results[results.length - 1]) !== 1) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }

    return apiSuccess({ imported: importedLines.length, valid: validCount, warnings: warnCount, errors: errorCount, qualityScore });
  } catch (error) {
    await writeStructuredLog('error', 'boq.import_failed', {
      operation: 'import_boq_lines', route: '/api/boq/import',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
      revisionId, importedCount, durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToImportStandardBoqItems, 500);
  }
}
