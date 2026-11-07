import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { createAuditLog } from '../src/lib/audit';
import { isApiContext, requireAuth } from '../src/lib/api-utils';
import { POST as approveBoq } from '../src/app/api/boq/[revisionId]/approve/route';
import { POST as rejectBoq } from '../src/app/api/boq/[revisionId]/reject/route';
import { POST as submitBoq } from '../src/app/api/boq/[revisionId]/submit/route';
import { GET as getPr } from '../src/app/api/pr/[id]/route';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { writeStructuredLog } from '../src/lib/observability/server-logger';


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    boqRevision: { findFirst: jest.fn(), update: jest.fn() },
    boq: { update: jest.fn() },
    project: { updateMany: jest.fn() },
    procurementRequest: { findFirst: jest.fn() },
  },
}));
jest.mock('../src/lib/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));

const db = prisma as unknown as {
  boqRevision: { findFirst: jest.Mock; update: jest.Mock };
  boq: { update: jest.Mock };
  project: { updateMany: jest.Mock };
  procurementRequest: { findFirst: jest.Mock };
};
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
const request = (body?: unknown) => new NextRequest(new URL('http://localhost/api/test'), {
  method: body === undefined ? 'POST' : 'POST',
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const params = (id: string) => ({ params: Promise.resolve({ revisionId: id }) });
const context = { tenantId: 'tenant-1', userId: 'user-1' };

describe('BOQ and PR workflow routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    audit.mockResolvedValue(undefined);
    (writeD1BatchAtomically as jest.Mock).mockReset().mockResolvedValue(Array.from({ length: 4 }, () => ({ meta: { changes: 1 } })));
  });

  it('submits only valid draft revisions and updates the related records', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(submitBoq(request(), params('rev-1'))).resolves.toBe(denied);

    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    await expect(submitBoq(request(), params('missing'))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.revisionNotFound, status: 404 });
    db.boqRevision.findFirst.mockResolvedValueOnce({ status: 'APPROVED' });
    await expect(submitBoq(request(), params('approved'))).resolves.toEqual({ ok: false, error: 'Cannot submit a BOQ in APPROVED status.', status: 400 });
    db.boqRevision.findFirst.mockResolvedValueOnce({ status: 'DRAFT', errorLines: 2 });
    await expect(submitBoq(request(), params('invalid'))).resolves.toEqual({
      ok: false, error: 'BOQ cannot be submitted because 2 lines contain errors.', status: 400,
    });

    db.boqRevision.findFirst.mockResolvedValueOnce({
      id: 'rev-1', status: 'DRAFT', errorLines: 0, boqId: 'boq-1', revisionCode: 'R2', boq: { projectId: 'project-1' },
    });
    await expect(submitBoq(request(), params('rev-1'))).resolves.toEqual({
      ok: true, data: { message: UI_STRINGS.appApiBoqRevisionIdSubmitRoute.bOQSubmittedForApproval, revisionCode: 'R2' }, status: 200,
    });
    const submitBatch = (writeD1BatchAtomically as jest.Mock).mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(submitBatch).toHaveLength(4);
    expect(submitBatch[0].sql).toContain('"status" = \'DRAFT\'');
    expect(submitBatch[1].sql).toContain('WHERE changes() = 1');
    expect(submitBatch[2].sql).toContain('"boqs"');
    expect(submitBatch[3].sql).toContain('"projects"');
    expect(db.boqRevision.update).not.toHaveBeenCalled();
    expect(db.boq.update).not.toHaveBeenCalled();
    expect(db.project.updateMany).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('approves submitted revisions and rejects missing or non-submitted revisions', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(approveBoq(request(), params('rev-2'))).resolves.toBe(denied);

    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    await expect(approveBoq(request(), params('missing'))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.revisionNotFound, status: 404 });
    db.boqRevision.findFirst.mockResolvedValueOnce({ status: 'DRAFT' });
    await expect(approveBoq(request(), params('draft'))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRevisionIdApproveRoute.onlySubmittedBOQsCanBeApproved, status: 400 });

    db.boqRevision.findFirst.mockResolvedValueOnce({
      id: 'rev-2', status: 'SUBMITTED', boqId: 'boq-2', revisionCode: 'R3', boq: { projectId: 'project-2' },
    });
    await expect(approveBoq(request(), params('rev-2'))).resolves.toEqual({
      ok: true, data: { message: UI_STRINGS.common.bOQApprovedSuccessfully, revisionCode: 'R3' }, status: 200,
    });
    const approveBatch = (writeD1BatchAtomically as jest.Mock).mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(approveBatch[0].sql).toContain('"status" = \'SUBMITTED\'');
    expect(approveBatch[0].values).toContain('user-1');
    expect(approveBatch[2].sql).toContain('"boqs"');
    expect(db.boqRevision.update).not.toHaveBeenCalled();
    expect(db.boq.update).not.toHaveBeenCalled();
    expect(db.project.updateMany).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('validates rejection reasons and rejects only submitted revisions', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(rejectBoq(request({ reason: 'Missing drawing' }), params('rev-3'))).resolves.toBe(denied);

    await expect(rejectBoq(request({ reason: '   ' }), params('rev-3'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBoqRevisionIdRejectRoute.rejectionReasonIsRequired, status: 400,
    });
    await expect(rejectBoq(request({ reason: 42 }), params('rev-3'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBoqRevisionIdRejectRoute.rejectionReasonIsRequired, status: 400,
    });
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    await expect(rejectBoq(request({ reason: 'Incomplete scope' }), params('missing'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.revisionNotFound, status: 404,
    });
    db.boqRevision.findFirst.mockResolvedValueOnce({ status: 'APPROVED' });
    await expect(rejectBoq(request({ reason: 'Incomplete scope' }), params('approved'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBoqRevisionIdRejectRoute.onlySubmittedBOQsCanBeRejected, status: 400,
    });

    db.boqRevision.findFirst.mockResolvedValueOnce({
      id: 'rev-3', status: 'SUBMITTED', boqId: 'boq-3', revisionCode: 'R4', boq: { projectId: 'project-3' },
    });
    await expect(rejectBoq(request({ reason: '  Missing drawing  ' }), params('rev-3'))).resolves.toEqual({
      ok: true, data: { message: UI_STRINGS.appApiBoqRevisionIdRejectRoute.bOQRejected, revisionCode: 'R4' }, status: 200,
    });
    const rejectBatch = (writeD1BatchAtomically as jest.Mock).mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(rejectBatch[0].sql).toContain('"rejectionReason" = ?');
    expect(rejectBatch[0].values).toContain('Missing drawing');
    expect(rejectBatch[2].sql).toContain('"boqs"');
    expect(db.boqRevision.update).not.toHaveBeenCalled();
    expect(db.boq.update).not.toHaveBeenCalled();
    expect(db.project.updateMany).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('returns conflict responses for stale BOQ workflow state and logs D1 batch failures', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce({
      id: 'rev-approve-race', status: 'SUBMITTED', boqId: 'boq-1', revisionCode: 'R1', boq: { projectId: 'project-1' },
    });
    (writeD1BatchAtomically as jest.Mock).mockResolvedValueOnce([{ meta: { changes: 0 } }]);
    await expect(approveBoq(request(), params('rev-approve-race'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409,
    });

    db.boqRevision.findFirst.mockResolvedValueOnce({
      id: 'rev-reject-race', status: 'SUBMITTED', boqId: 'boq-1', revisionCode: 'R1', boq: { projectId: 'project-1' },
    });
    (writeD1BatchAtomically as jest.Mock).mockResolvedValueOnce([{ meta: { changes: 0 } }]);
    await expect(rejectBoq(request({ reason: 'Incomplete details' }), params('rev-reject-race'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409,
    });

    db.boqRevision.findFirst.mockResolvedValueOnce({
      id: 'rev-submit-race', status: 'DRAFT', errorLines: 0, boqId: 'boq-1', revisionCode: 'R1', boq: { projectId: 'project-1' },
    });
    (writeD1BatchAtomically as jest.Mock).mockResolvedValueOnce([{ meta: { changes: 0 } }]);
    await expect(submitBoq(request(), params('rev-submit-race'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409,
    });

    db.boqRevision.findFirst.mockRejectedValueOnce(new Error('BOQ database unavailable'));
    await expect(approveBoq(request(), params('rev-error'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToApproveBoq, status: 500,
    });
    db.boqRevision.findFirst.mockRejectedValueOnce(new Error('BOQ database unavailable'));
    await expect(rejectBoq(request({ reason: 'Incomplete details' }), params('rev-error'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToProcessApproverDecision, status: 500,
    });
    db.boqRevision.findFirst.mockRejectedValueOnce('D1 binding unavailable');
    await expect(rejectBoq(request({ reason: 'Incomplete details' }), params('rev-error'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToProcessApproverDecision, status: 500,
    });
    expect(writeStructuredLog).toHaveBeenCalledWith('error', 'boq.revision_rejection_failed', expect.objectContaining({
      error: { type: 'string' },
    }));
    db.boqRevision.findFirst.mockRejectedValueOnce(new Error('BOQ database unavailable'));
    await expect(submitBoq(request(), params('rev-error'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToSubmitBoq, status: 500,
    });
  });

  it('returns tenant-scoped PR details or a not-found response', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(getPr(request(), { params: Promise.resolve({ id: 'pr-1' }) })).resolves.toBe(denied);

    db.procurementRequest.findFirst.mockResolvedValueOnce(null);
    await expect(getPr(request(), { params: Promise.resolve({ id: 'missing' }) })).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.procurementRequestNotFound, status: 404,
    });
    db.procurementRequest.findFirst.mockResolvedValueOnce({ id: 'pr-1', prNumber: 'PR-001', lines: [] });
    await expect(getPr(request(), { params: Promise.resolve({ id: 'pr-1' }) })).resolves.toEqual({
      ok: true,
      data: {
        id: 'pr-1', prNumber: 'PR-001', lines: [], linePagination: { hasMore: false, nextCursor: null, pageSize: 25 },
        rfqs: [], rfqCount: 0, rfqPreviewTruncated: false,
      },
      status: 200,
    });
    expect(db.procurementRequest.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: 'pr-1', tenantId: 'tenant-1' },
      select: expect.objectContaining({
        project: expect.any(Object), costCentre: expect.any(Object), boq: expect.any(Object), boqRevision: expect.any(Object), rfqs: expect.any(Object),
        lines: expect.objectContaining({ take: 26 }),
      }),
    }));
  });
});
