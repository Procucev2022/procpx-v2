import crypto from 'crypto';
import path from 'path';
import type { NextRequest } from 'next/server';
import { apiError, apiSuccess, isApiContext, requireAuth } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import { deleteUpload, saveUpload } from '@/lib/storage';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { BOQ_UPLOAD_PREVIEW_ROWS, MAX_BOQ_UPLOAD_BYTES } from '@/lib/boq-upload.constants';
import {
  BOQ_UPLOAD_AUDIT_INSERT_SQL,
  BOQ_UPLOAD_CONTENT_LENGTH_OVERHEAD_BYTES,
  BOQ_UPLOAD_CREATE_HEADER_SQL,
  BOQ_UPLOAD_INSERT_NEXT_REVISION_SQL,
  BOQ_UPLOAD_PERSISTENCE_ATTEMPTS,
  BOQ_UPLOAD_PROJECT_DOCUMENT_INSERT_SQL,
  BOQ_UPLOAD_ROUTE,
  BOQ_UPLOAD_UPDATE_EMPTY_DRAFT_SQL,
} from './route.constants';

async function logUploadError(event: string, context: Record<string, unknown>): Promise<void> {
  try {
    await writeStructuredLog('error', event, context);
  } catch {
    // Preserve the upload response when optional log persistence is unavailable.
  }
}

function getRequestId(req: NextRequest): string | undefined {
  return req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined;
}

async function handleUpload(req: NextRequest, startedAt: number) {
  const ctx = await requireAuth('BOQ_UPLOAD');
  if (!isApiContext(ctx)) return ctx;

  const contentLength = Number(req.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_BOQ_UPLOAD_BYTES + BOQ_UPLOAD_CONTENT_LENGTH_OVERHEAD_BYTES) {
    return apiError(interpolateUiString(UI_STRINGS.appApiBoqUploadRoute.boqUploadFileMustBeBetweenOneByteAndMaxBytes, { maxBytes: MAX_BOQ_UPLOAD_BYTES }), 413);
  }

  const formData = await req.formData();
  const fileEntry = formData.get('file');
  const projectIdEntry = formData.get('projectId');
  const boqIdEntry = formData.get('boqId');
  const file = fileEntry && typeof fileEntry !== 'string' && typeof fileEntry.arrayBuffer === 'function' ? fileEntry : null;
  const projectId = typeof projectIdEntry === 'string' ? projectIdEntry.trim() : '';
  const requestedBoqId = typeof boqIdEntry === 'string' && boqIdEntry.trim() ? boqIdEntry.trim() : null;

  if (!file) return apiError(UI_STRINGS.appApiBoqUploadRoute.noFileProvided);
  if (!projectId) return apiError(UI_STRINGS.common.projectIDIsRequired);
  if (file.size <= 0 || file.size > MAX_BOQ_UPLOAD_BYTES) {
    return apiError(interpolateUiString(UI_STRINGS.appApiBoqUploadRoute.boqUploadFileMustBeBetweenOneByteAndMaxBytes, { maxBytes: MAX_BOQ_UPLOAD_BYTES }), 413);
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!project) return apiError(UI_STRINGS.common.projectNotFound2, 404);

  const allowedExts = ['.xlsx', '.xls', '.csv'];
  const fileExt = path.extname(file.name).toLowerCase();
  if (!allowedExts.includes(fileExt)) {
    return apiError(UI_STRINGS.appApiBoqUploadRoute.bOQUploadFailedOnlyXlsxXlsAndCsvFilesAreSupported);
  }

  const allowedTypesByExtension: Record<string, string[]> = {
    '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'],
    '.xls': ['application/vnd.ms-excel', 'application/octet-stream'],
    '.csv': ['text/csv', 'text/plain', 'application/csv', 'application/octet-stream'],
  };
  if (file.type && !allowedTypesByExtension[fileExt].includes(file.type)) {
    return apiError(UI_STRINGS.appApiBoqUploadRoute.boqUploadFileContentDoesNotMatchItsExtension, 415);
  }
  const storedFileType = file.type || allowedTypesByExtension[fileExt][0];

  const buffer = Buffer.from(await file.arrayBuffer());
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  let sheets: string[] = [];
  let columns: string[] = [];
  let previewRows: Record<string, string>[] = [];

  try {
    const XLSX = (await import('xlsx')).default;
    const workbook = XLSX.read(buffer, { type: 'buffer', sheetRows: BOQ_UPLOAD_PREVIEW_ROWS });
    sheets = workbook.SheetNames;
    if (sheets.length > 0) {
      const firstSheet = workbook.Sheets[sheets[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '', blankrows: false }) as unknown[][];
      if (rows.length > 0) {
        const headerRow = rows[0];
        columns = headerRow.map((value, index) => String(value ?? '').trim() || `Column_${index + 1}`);
        previewRows = rows.slice(1, 6).map((row) => columns.reduce<Record<string, string>>((result, column, index) => {
          result[column] = String(row[index] ?? '');
          return result;
        }, {}));
      }
    }
  } catch (error) {
    await logUploadError('boq.upload_preview_parse_failed', {
      operation: 'parse_boq_upload_preview', route: BOQ_UPLOAD_ROUTE,
      requestId: getRequestId(req), tenantId: ctx.tenantId, userId: ctx.userId, projectId,
      fileSize: file.size, durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name } : { type: typeof error },
    });
    return apiError(UI_STRINGS.appApiBoqUploadTemplateRoute.uploadedSpreadsheetIsEmptyOrHasNoRecognizableRows, 400);
  }

  if (sheets.length === 0 || columns.length === 0) {
    return apiError(UI_STRINGS.appApiBoqUploadTemplateRoute.uploadedSpreadsheetIsEmptyOrHasNoRecognizableRows, 400);
  }

  if (requestedBoqId) {
    const ownedBoq = await prisma.boq.findFirst({
      where: { id: requestedBoqId, tenantId: ctx.tenantId, projectId },
      select: { id: true },
    });
    if (!ownedBoq) return apiError(UI_STRINGS.appApiBoqUploadRoute.failedToCreateOrLocateTargetBOQ, 404);
  }

  const targetBoqId = requestedBoqId || crypto.randomUUID();
  const latestRevision = await prisma.boqRevision.findFirst({
    where: { tenantId: ctx.tenantId, boqId: targetBoqId },
    orderBy: { revisionNumber: 'desc' },
    select: {
      id: true,
      revisionCode: true,
      revisionNumber: true,
      status: true,
      totalLines: true,
      originalFileName: true,
      originalFilePath: true,
      originalFileHash: true,
      updatedAt: true,
    },
  });

  const sameDraftFile = Boolean(latestRevision?.status === 'DRAFT' && latestRevision.originalFileHash === hash);
  const existingFilePath = sameDraftFile ? latestRevision?.originalFilePath || null : null;
  const uploadCreated = !existingFilePath;
  const filePath = existingFilePath || await saveUpload([ctx.tenantId, projectId], `${crypto.randomUUID()}${fileExt}`, buffer);
  const now = new Date();
  const emptyDraft = latestRevision && latestRevision.status === 'DRAFT' && (latestRevision.totalLines || 0) === 0 && !existingFilePath
    ? latestRevision
    : null;
  const revisionId = crypto.randomUUID();
  const descriptionTemplate = interpolateUiString(UI_STRINGS.appApiBoqUploadRoute.bOQFileUploadedNameRevisionRevisionCode, {
    name: file.name,
    revisionCode: '__REVISION_CODE__',
  });
  const statements: Array<{ sql: string; values: unknown[] }> = [];

  if (!requestedBoqId) {
    statements.push({
      sql: BOQ_UPLOAD_CREATE_HEADER_SQL,
      values: [targetBoqId, ctx.tenantId, projectId, ctx.userId, now, now],
    });
  }

  statements.push({
    sql: BOQ_UPLOAD_UPDATE_EMPTY_DRAFT_SQL,
    values: [
      file.name, filePath, file.size, hash, now, now,
      emptyDraft?.id ?? null, ctx.tenantId, targetBoqId,
      emptyDraft?.updatedAt ?? null, emptyDraft?.originalFilePath ?? null,
      emptyDraft?.originalFileHash ?? null, emptyDraft?.originalFileName ?? null,
      ctx.tenantId, projectId,
    ],
  });
  statements.push({
    sql: BOQ_UPLOAD_INSERT_NEXT_REVISION_SQL,
    values: [revisionId, ctx.tenantId, targetBoqId, file.name, filePath, file.size, hash, now, ctx.userId, now, now],
  });
  statements.push({
    sql: BOQ_UPLOAD_AUDIT_INSERT_SQL,
    values: [
      crypto.randomUUID(), ctx.userId, projectId, descriptionTemplate, now,
      ctx.tenantId, targetBoqId, hash, filePath,
      ctx.tenantId, targetBoqId, hash, descriptionTemplate,
    ],
  });
  statements.push({
    sql: BOQ_UPLOAD_PROJECT_DOCUMENT_INSERT_SQL,
    values: [
      crypto.randomUUID(), projectId, storedFileType, ctx.userId, now,
      ctx.tenantId, targetBoqId, hash, filePath,
      ctx.tenantId, targetBoqId, hash, projectId,
    ],
  });

  let persistenceSucceeded = false;
  let lastPersistenceError: unknown;
  for (let attempt = 1; attempt <= BOQ_UPLOAD_PERSISTENCE_ATTEMPTS; attempt += 1) {
    try {
      await writeD1BatchAtomically(statements);
      persistenceSucceeded = true;
      break;
    } catch (error) {
      lastPersistenceError = error;
      await logUploadError('boq.upload_persistence_attempt_failed', {
        operation: 'persist_boq_upload_batch', route: BOQ_UPLOAD_ROUTE,
        requestId: getRequestId(req), tenantId: ctx.tenantId, userId: ctx.userId, projectId,
        boqId: targetBoqId, attempt, attemptLimit: BOQ_UPLOAD_PERSISTENCE_ATTEMPTS,
        fileSize: file.size, durationMs: Date.now() - startedAt,
        error: error instanceof Error ? { name: error.name } : { type: typeof error },
      });
    }
  }

  let revision;
  try {
    revision = await prisma.boqRevision.findFirst({
      where: { tenantId: ctx.tenantId, boqId: targetBoqId, originalFilePath: filePath, originalFileHash: hash, status: 'DRAFT' },
      orderBy: { revisionNumber: 'desc' },
      select: { id: true, revisionCode: true, originalFilePath: true },
    });
    if (!revision) {
      revision = await prisma.boqRevision.findFirst({
        where: { tenantId: ctx.tenantId, boqId: targetBoqId, originalFileHash: hash, status: 'DRAFT' },
        orderBy: { revisionNumber: 'desc' },
        select: { id: true, revisionCode: true, originalFilePath: true },
      });
    }
  } catch (error) {
    await logUploadError('boq.upload_commit_recovery_check_failed', {
      operation: 'recover_boq_upload_commit', route: BOQ_UPLOAD_ROUTE,
      requestId: getRequestId(req), tenantId: ctx.tenantId, userId: ctx.userId, projectId,
      boqId: targetBoqId, durationMs: Date.now() - startedAt, fileSize: file.size,
      uploadPreservedForRecovery: uploadCreated,
      error: error instanceof Error ? { name: error.name } : { type: typeof error },
    });
    return apiError(UI_STRINGS.appApiBoqUploadRoute.failedToCreateOrLocateTargetBOQ, 500);
  }

  if (revision && persistenceSucceeded) {
    if (uploadCreated && revision.originalFilePath !== filePath) {
      try {
        await deleteUpload(filePath, [ctx.tenantId, projectId]);
      } catch (error) {
        await logUploadError('boq.upload_duplicate_file_cleanup_failed', {
          operation: 'cleanup_duplicate_boq_upload', route: BOQ_UPLOAD_ROUTE,
          requestId: getRequestId(req), tenantId: ctx.tenantId, userId: ctx.userId, projectId,
          boqId: targetBoqId, revisionId: revision.id, durationMs: Date.now() - startedAt,
          error: error instanceof Error ? { name: error.name } : { type: typeof error },
        });
      }
    }
    return apiSuccess({
      boqId: targetBoqId,
      revisionId: revision.id,
      revisionCode: revision.revisionCode,
      sheets,
      columns,
      previewRows,
      fileName: file.name,
    }, 201);
  }

  if (revision && !persistenceSucceeded) {
    let document;
    let audit;
    try {
      [document, audit] = await Promise.all([
        revision.originalFilePath
          ? prisma.projectDocument.findFirst({
            where: { tenantId: ctx.tenantId, projectId, category: 'ORIGINAL_BOQ', filePath: revision.originalFilePath },
            select: { id: true },
          })
          : Promise.resolve(null),
        prisma.auditLog.findFirst({
          where: {
            tenantId: ctx.tenantId,
            entityType: 'BOQ_REVISION',
            entityId: revision.id,
            action: 'UPLOAD',
            OR: [
              { newValue: { contains: hash } },
              { description: descriptionTemplate.replace('__REVISION_CODE__', revision.revisionCode) },
            ],
          },
          select: { id: true },
        }),
      ]);
    } catch (error) {
      await logUploadError('boq.upload_commit_verification_failed', {
        operation: 'verify_boq_upload_commit', route: BOQ_UPLOAD_ROUTE,
        requestId: getRequestId(req), tenantId: ctx.tenantId, userId: ctx.userId,
        projectId, boqId: targetBoqId, revisionId: revision.id,
        uploadPreservedForRecovery: uploadCreated,
        error: error instanceof Error ? { name: error.name } : { type: typeof error },
      });
      return apiError(UI_STRINGS.appApiBoqUploadRoute.failedToCreateOrLocateTargetBOQ, 500);
    }
    if (document && audit) {
      if (uploadCreated && revision.originalFilePath !== filePath) {
        try {
          await deleteUpload(filePath, [ctx.tenantId, projectId]);
        } catch (error) {
          await logUploadError('boq.upload_duplicate_file_cleanup_failed', {
            operation: 'cleanup_duplicate_boq_upload', route: BOQ_UPLOAD_ROUTE,
            requestId: getRequestId(req), tenantId: ctx.tenantId, userId: ctx.userId, projectId,
            boqId: targetBoqId, revisionId: revision.id,
            error: error instanceof Error ? { name: error.name } : { type: typeof error },
          });
        }
      }
      await logUploadError('boq.upload_commit_confirmed_after_retry_failure', {
        operation: 'confirm_boq_upload_commit', route: BOQ_UPLOAD_ROUTE,
        requestId: getRequestId(req), tenantId: ctx.tenantId, userId: ctx.userId,
        projectId, boqId: targetBoqId, revisionId: revision.id, durationMs: Date.now() - startedAt,
        error: lastPersistenceError instanceof Error ? { name: lastPersistenceError.name } : { type: typeof lastPersistenceError },
      });
      return apiSuccess({
        boqId: targetBoqId,
        revisionId: revision.id,
        revisionCode: revision.revisionCode,
        sheets,
        columns,
        previewRows,
        fileName: file.name,
      }, 201);
    }
  }

  if (uploadCreated) {
    try {
      await deleteUpload(filePath, [ctx.tenantId, projectId]);
    } catch (error) {
      await logUploadError('boq.upload_file_cleanup_failed', {
        operation: 'cleanup_unreferenced_boq_upload', route: BOQ_UPLOAD_ROUTE,
        requestId: getRequestId(req), tenantId: ctx.tenantId, userId: ctx.userId, projectId,
        boqId: targetBoqId, fileSize: file.size,
        error: error instanceof Error ? { name: error.name } : { type: typeof error },
      });
    }
  }

  await logUploadError('boq.upload_persistence_failed', {
    operation: 'persist_boq_upload', route: BOQ_UPLOAD_ROUTE,
    requestId: getRequestId(req), tenantId: ctx.tenantId, userId: ctx.userId,
    projectId, boqId: targetBoqId, revisionId: revision?.id,
    durationMs: Date.now() - startedAt, fileSize: file.size, persistenceSucceeded,
    error: lastPersistenceError instanceof Error ? { name: lastPersistenceError.name } : { type: typeof lastPersistenceError },
  });
  return apiError(UI_STRINGS.appApiBoqUploadRoute.failedToCreateOrLocateTargetBOQ, 500);
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    return await handleUpload(req, startedAt);
  } catch (error) {
    await logUploadError('boq.upload_request_failed', {
      operation: 'handle_boq_upload_request', route: BOQ_UPLOAD_ROUTE,
      requestId: getRequestId(req), durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name } : { type: typeof error },
    });
    return apiError(UI_STRINGS.appApiBoqUploadRoute.failedToCreateOrLocateTargetBOQ, 500);
  }
}
