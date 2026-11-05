import { NextRequest } from 'next/server';
import { apiError, isApiContext, requireAuth } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import { readUpload } from '@/lib/storage';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { UI_STRINGS } from '@/lib/ui-strings.constants';

function encodeDownloadName(name: string): string {
  return encodeURIComponent(name).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; documentId: string }> },
) {
  const ctx = await requireAuth('PROJECT_VIEW');
  if (!isApiContext(ctx)) return ctx;
  const { id: projectId, documentId } = await params;
  const startedAt = Date.now();

  try {
    const document = await prisma.projectDocument.findFirst({
      where: { id: documentId, projectId, tenantId: ctx.tenantId },
      select: { id: true, name: true, filePath: true },
    });
    if (!document) return apiError(UI_STRINGS.appApiProjectsIdDocumentsRoute.projectDocumentNotFound, 404);

    const content = await readUpload(document.filePath);
    return new Response(new Uint8Array(content), {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(content.byteLength),
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeDownloadName(document.name)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    await writeStructuredLog('error', 'project.document_download_failed', {
      operation: 'download_project_document',
      route: '/api/projects/[id]/documents/[documentId]',
      requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      projectId,
      documentId,
      durationMs: Date.now() - startedAt,
      error: { name: error instanceof Error ? error.name : 'UnknownError' },
    });
    return apiError(UI_STRINGS.appApiProjectsIdDocumentsRoute.projectDocumentDownloadFailed, 500);
  }
}
