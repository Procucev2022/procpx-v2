// app/api/projects/[id]/documents/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess, getListPageWindow } from '@/lib/api-utils';
import { AUDIT_LOG_INSERT_AFTER_CHANGE_SQL } from '@/lib/d1-batch.constants';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import { saveUpload, deleteUpload } from '@/lib/storage';
import { PROJECT_DOCUMENT_CATEGORY_VALUES, PROJECT_DOCUMENT_MAX_BYTES, PROJECT_DOCUMENT_MIME_BY_EXTENSION } from '@/lib/project-document.constants';
import { PROJECT_DOCUMENT_AUDIT_DELETE_IF_PRESENT_SQL, PROJECT_DOCUMENT_DELETE_IF_PRESENT_SQL, PROJECT_DOCUMENT_INSERT_SQL } from './route.constants';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from "@/lib/i18n";
import { writeStructuredLog } from '@/lib/observability/server-logger';

function getChangedCount(result: { meta?: { changes?: number } } | undefined): number {
  return Number(result?.meta?.changes || 0);
}

function getRequestId(req: NextRequest): string | undefined {
  return req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth('PROJECT_VIEW');
  if (!isApiContext(ctx)) return ctx;
  const { id } = await params;

  const { page, pageSize, skip } = getListPageWindow(new URL(req.url).searchParams);
  const startedAt = Date.now();
  let docs;
  let total: number;
  try {
    const project = await prisma.project.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!project) return apiError(UI_STRINGS.common.projectNotFound, 404);
    [docs, total] = await Promise.all([
      prisma.projectDocument.findMany({
        where: { projectId: id, tenantId: ctx.tenantId },
        select: { id: true, projectId: true, name: true, fileType: true, fileSize: true, uploadedBy: true, uploadedAt: true, category: true },
        orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
      prisma.projectDocument.count({ where: { projectId: id, tenantId: ctx.tenantId } }),
    ]);
  } catch (error) {
    await writeStructuredLog('error', 'project.documents_read_failed', {
      operation: 'list_project_documents',
      route: '/api/projects/[id]/documents',
      requestId: getRequestId(req),
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      projectId: id,
      page,
      pageSize,
      durationMs: Date.now() - startedAt,
      error: { name: error instanceof Error ? error.name : 'UnknownError' },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToFetchProjects, 500);
  }

  return apiSuccess({ documents: docs, total, page, pageSize, hasMore: skip + docs.length < total });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth('PROJECT_EDIT');
  if (!isApiContext(ctx)) return ctx;
  const { id } = await params;
  const startedAt = Date.now();
  let storageRef: string | undefined;
  const storageSegments = [ctx.tenantId, id];

  let fileSize = 0;
  let category = 'OTHER';
  try {
    const contentLength = Number(req.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > PROJECT_DOCUMENT_MAX_BYTES + 64 * 1024) {
      return apiError(interpolateUiString(UI_STRINGS.appApiProjectsIdDocumentsRoute.documentFileSizeMustBeBetweenBytes, { maxBytes: PROJECT_DOCUMENT_MAX_BYTES }), 413);
    }
    const project = await prisma.project.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } });
    if (!project) return apiError(UI_STRINGS.common.projectNotFound, 404);

    const form = await req.formData();
    const file = form.get('file');
    const requestedCategory = form.get('category');
    if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function' || typeof file.name !== 'string') {
      return apiError(UI_STRINGS.appApiProjectsIdDocumentsRoute.aSupportedDocumentFileIsRequired, 400);
    }
    if (file.size <= 0 || file.size > PROJECT_DOCUMENT_MAX_BYTES) {
      return apiError(interpolateUiString(UI_STRINGS.appApiProjectsIdDocumentsRoute.documentFileSizeMustBeBetweenBytes, { maxBytes: PROJECT_DOCUMENT_MAX_BYTES }), 413);
    }

    const originalName = (file.name.split(/[\\/]/).pop() || '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim();
    const extension = originalName.split('.').pop()?.toLowerCase() || '';
    const expectedMimeType = PROJECT_DOCUMENT_MIME_BY_EXTENSION[extension];
    const fileType = file.type || expectedMimeType;
    if (!originalName || originalName.length > 200 || !expectedMimeType || fileType !== expectedMimeType) {
      return apiError(UI_STRINGS.appApiProjectsIdDocumentsRoute.documentFileTypeIsNotSupported, 415);
    }
    if (typeof requestedCategory === 'string') category = requestedCategory.trim().toUpperCase() || 'OTHER';
    if (!PROJECT_DOCUMENT_CATEGORY_VALUES.includes(category as (typeof PROJECT_DOCUMENT_CATEGORY_VALUES)[number])) {
      return apiError(UI_STRINGS.appApiProjectsIdDocumentsRoute.documentCategoryIsNotSupported, 400);
    }

    fileSize = file.size;
    const documentId = crypto.randomUUID();
    const auditId = crypto.randomUUID();
    const uploadedAt = new Date();
    const safeFileName = `${documentId}.${extension}`;
    storageRef = await saveUpload(storageSegments, safeFileName, Buffer.from(await file.arrayBuffer()));

    const auditDescription = interpolateUiString(UI_STRINGS.appApiProjectsIdDocumentsRoute.projectDocumentAddedNameCategory, {
      name: originalName,
      category,
    });
    const results = await writeD1BatchAtomically([
      {
        sql: PROJECT_DOCUMENT_INSERT_SQL,
        values: [documentId, id, ctx.tenantId, originalName, fileType, fileSize, storageRef, ctx.userId, uploadedAt, category],
      },
      {
        sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
        values: [auditId, ctx.tenantId, ctx.userId, id, 'PROJECT', id, 'CREATE', auditDescription, null,
          JSON.stringify({ documentId, name: originalName, category, fileSize }), null, req.headers.get('user-agent'), uploadedAt],
      },
    ]);
    if (getChangedCount(results[0]) !== 1 || getChangedCount(results[1]) !== 1) {
      try {
        await writeD1BatchAtomically([
          { sql: PROJECT_DOCUMENT_AUDIT_DELETE_IF_PRESENT_SQL, values: [auditId, ctx.tenantId, id] },
          { sql: PROJECT_DOCUMENT_DELETE_IF_PRESENT_SQL, values: [documentId, id, ctx.tenantId] },
        ]);
      } catch (compensationError) {
        // Keep the blob available if the D1 row may still reference it; an orphan is safer than a broken document.
        storageRef = undefined;
        await writeStructuredLog('error', 'project.document_upload_compensation_failed', {
          operation: 'compensate_project_document_upload',
          route: '/api/projects/[id]/documents',
          requestId: getRequestId(req),
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          projectId: id,
          documentId,
          auditId,
          fileSize,
          durationMs: Date.now() - startedAt,
          storagePreserved: true,
          error: { name: compensationError instanceof Error ? compensationError.name : 'UnknownError' },
        });
        return apiError(UI_STRINGS.appApiProjectsIdDocumentsRoute.documentUploadFailed, 500);
      }
      await deleteUpload(storageRef, storageSegments);
      storageRef = undefined;
      return apiError(UI_STRINGS.appApiProjectsIdDocumentsRoute.projectDocumentChangedPleaseRetry, 409);
    }

    return apiSuccess({
      id: documentId,
      projectId: id,
      name: originalName,
      fileType,
      fileSize,
      uploadedBy: ctx.userId,
      uploadedAt,
      category,
    }, 201);
  } catch (error) {
    if (storageRef) {
      try {
        await deleteUpload(storageRef, storageSegments);
      } catch (cleanupError) {
        await writeStructuredLog('error', 'project.document_upload_cleanup_failed', {
          operation: 'cleanup_project_document_upload',
          route: '/api/projects/[id]/documents',
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          projectId: id,
          durationMs: Date.now() - startedAt,
          error: { name: cleanupError instanceof Error ? cleanupError.name : 'UnknownError' },
        });
      }
    }
    await writeStructuredLog('error', 'project.document_upload_failed', {
      operation: 'upload_project_document',
      route: '/api/projects/[id]/documents',
      requestId: getRequestId(req),
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      projectId: id,
      fileSize,
      category,
      durationMs: Date.now() - startedAt,
      error: { name: error instanceof Error ? error.name : 'UnknownError' },
    });
    return apiError(UI_STRINGS.appApiProjectsIdDocumentsRoute.documentUploadFailed, 500);
  }
}
