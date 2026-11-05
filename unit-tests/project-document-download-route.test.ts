import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/projects/[id]/documents/[documentId]/route';
import { prisma } from '../src/lib/prisma';
import { readUpload } from '../src/lib/storage';
import { isApiContext, requireAuth } from '../src/lib/api-utils';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { UI_STRINGS } from '@/lib/ui-strings.constants';

jest.mock('../src/lib/prisma', () => ({ prisma: { projectDocument: { findFirst: jest.fn() } } }));
jest.mock('../src/lib/storage', () => ({ readUpload: jest.fn(), saveUpload: jest.fn(), deleteUpload: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));

const db = prisma as unknown as { projectDocument: { findFirst: jest.Mock } };
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const readFile = readUpload as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1' };
const params = (projectId = 'project-1', documentId = 'doc-1') => ({ params: Promise.resolve({ id: projectId, documentId }) });
const request = () => new NextRequest('https://example.test/api/projects/project-1/documents/doc-1', {
  headers: { 'x-request-id': 'request-1' },
});

describe('project document download route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
  });

  it('requires project view permission and hides documents outside the tenant/project scope', async () => {
    auth.mockResolvedValueOnce({ status: 403 });
    isContext.mockReturnValueOnce(false);
    await expect(GET(request(), params())).resolves.toEqual({ status: 403 });

    db.projectDocument.findFirst.mockResolvedValueOnce(null);
    await expect(GET(request(), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProjectsIdDocumentsRoute.projectDocumentNotFound, status: 404,
    });
    expect(db.projectDocument.findFirst).toHaveBeenCalledWith({
      where: { id: 'doc-1', projectId: 'project-1', tenantId: 'tenant-1' },
      select: { id: true, name: true, filePath: true },
    });
    expect(readFile).not.toHaveBeenCalled();
  });

  it('streams stored bytes as a private attachment with safe response headers', async () => {
    db.projectDocument.findFirst.mockResolvedValueOnce({ id: 'doc-1', name: "Plan's (approved).pdf", filePath: 'r2://tenant-1/project-1/doc-1.pdf' });
    readFile.mockResolvedValueOnce(Buffer.from([80, 68, 70]));
    const response = await GET(request(), params()) as Response;
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.headers.get('content-disposition')).toBe("attachment; filename*=UTF-8''Plan%27s%20%28approved%29.pdf");
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([80, 68, 70]);
    expect(readFile).toHaveBeenCalledWith('r2://tenant-1/project-1/doc-1.pdf');
  });

  it('logs storage failures and returns a stable error response', async () => {
    db.projectDocument.findFirst.mockResolvedValueOnce({ id: 'doc-1', name: 'Plan.pdf', filePath: 'r2://tenant-1/project-1/doc-1.pdf' });
    readFile.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(GET(request(), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProjectsIdDocumentsRoute.projectDocumentDownloadFailed, status: 500,
    });
    expect(writeStructuredLog).toHaveBeenCalledWith('error', 'project.document_download_failed', expect.objectContaining({
      requestId: 'request-1', tenantId: 'tenant-1', projectId: 'project-1', documentId: 'doc-1',
      error: { name: 'Error' },
    }));
  });
});
