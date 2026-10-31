import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createWorkflowNotification } from '../src/lib/notifications';
import { POST as submitPr } from '../src/app/api/pr/[id]/submit/route';
import { POST as approvePr } from '../src/app/api/pr/[id]/approve/route';
import { POST as rejectPr } from '../src/app/api/pr/[id]/reject/route';
import { POST as revertPr } from '../src/app/api/pr/[id]/revert/route';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    procurementRequest: { findFirst: jest.fn(), update: jest.fn() },
    boqRevision: { update: jest.fn() },
    pRApproval: { create: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));
jest.mock('../src/lib/notifications', () => ({ createWorkflowNotification: jest.fn() }));

const db = prisma as unknown as {
  procurementRequest: { findFirst: jest.Mock; update: jest.Mock };
  boqRevision: { update: jest.Mock };
  pRApproval: { create: jest.Mock };
  auditLog: { create: jest.Mock };
};
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const notify = createWorkflowNotification as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'approver-1', userName: 'A. Approver' };
const params = (id = 'pr-1') => ({ params: Promise.resolve({ id }) });
const request = (body?: unknown) => new NextRequest('http://localhost/api/pr/pr-1/workflow', {
  method: 'POST',
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const prRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'pr-1', prNumber: 'PR-001', title: 'Electrical works', status: 'PR_PENDING_PROJECT_APPROVAL',
  projectId: 'project-1', boqRevisionId: 'revision-1', requestedBy: 'requester-1', totalEstimatedValue: 12500,
  ...overrides,
});

describe('PR workflow routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
  });

  it('submits draft PRs and resubmits returned PRs while syncing revisions and audit history', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(submitPr(request(), params())).resolves.toBe(denied);

    db.procurementRequest.findFirst.mockResolvedValueOnce(null);
    await expect(submitPr(request(), params('missing'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.procurementRequestNotFound, status: 404,
    });
    db.procurementRequest.findFirst.mockResolvedValueOnce(prRecord({ status: 'PR_APPROVED' }));
    await expect(submitPr(request(), params())).resolves.toEqual({
      ok: false,
      error: 'Cannot submit PR in status PR_APPROVED. Expected PR_DRAFT or PR_RETURNED_FOR_CORRECTION.',
      status: 400,
    });

    const draft = prRecord({ status: 'PR_DRAFT', boqRevisionId: null });
    db.procurementRequest.findFirst.mockResolvedValueOnce(draft);
    db.procurementRequest.update.mockResolvedValueOnce({ ...draft, status: 'PR_PENDING_PROJECT_APPROVAL' });
    await expect(submitPr(request(), params())).resolves.toMatchObject({
      ok: true, data: { status: 'PR_PENDING_PROJECT_APPROVAL' },
    });
    expect(db.procurementRequest.update).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: 'pr-1' },
      data: expect.objectContaining({ status: 'PR_PENDING_PROJECT_APPROVAL', requestedBy: 'approver-1', requestedDate: expect.any(Date) }),
    }));
    expect(db.boqRevision.update).not.toHaveBeenCalled();
    expect(db.auditLog.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ action: 'PR_SUBMITTED', entityId: 'pr-1' }) });

    const returned = prRecord({ status: 'PR_RETURNED_FOR_CORRECTION' });
    db.procurementRequest.findFirst.mockResolvedValueOnce(returned);
    db.procurementRequest.update.mockResolvedValueOnce({ ...returned, status: 'PR_PENDING_PROJECT_APPROVAL' });
    await submitPr(request(), params());
    expect(db.boqRevision.update).toHaveBeenCalledWith({
      where: { id: 'revision-1' }, data: { prStatus: 'PR_PENDING_PROJECT_APPROVAL' },
    });
    expect(db.auditLog.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ action: 'PR_RESUBMITTED' }) });
  });

  it('approves pending PRs, defaults remarks for malformed or empty input, and reports failures', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(approvePr(request(), params())).resolves.toBe(denied);

    db.procurementRequest.findFirst.mockResolvedValueOnce(null);
    await expect(approvePr(request(), params('missing'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.procurementRequestNotFound, status: 404,
    });
    db.procurementRequest.findFirst.mockResolvedValueOnce(prRecord({ status: 'PR_DRAFT' }));
    await expect(approvePr(request(), params())).resolves.toMatchObject({
      ok: false, error: expect.stringContaining('Cannot approve PR in status PR_DRAFT'), status: 400,
    });

    db.procurementRequest.findFirst.mockResolvedValueOnce(prRecord());
    db.procurementRequest.update.mockResolvedValueOnce({ id: 'pr-1', status: 'PR_RELEASED_TO_PROCUREMENT' });
    await expect(approvePr(request({ remarks: 'Checked quantities' }), params())).resolves.toMatchObject({
      ok: true, data: { status: 'PR_RELEASED_TO_PROCUREMENT' },
    });
    expect(db.pRApproval.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({
      tenantId: 'tenant-1', prId: 'pr-1', approverId: 'approver-1', status: UI_STRINGS.common.aPPROVED, remarks: 'Checked quantities',
    }) });
    expect(db.boqRevision.update).toHaveBeenCalledWith({ where: { id: 'revision-1' }, data: { prStatus: 'PR_APPROVED' } });

    db.procurementRequest.findFirst.mockResolvedValueOnce(prRecord());
    db.procurementRequest.update.mockResolvedValueOnce({ id: 'pr-1' });
    await approvePr(request(), params());
    expect(db.pRApproval.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({
      remarks: 'Procurement request technical specification and quantity approved.',
    }) });

    db.procurementRequest.findFirst.mockRejectedValueOnce(new Error('approval database error'));
    await expect(approvePr(request(), params())).resolves.toEqual({
      ok: false, error: 'approval database error', status: 500,
    });
    db.procurementRequest.findFirst.mockRejectedValueOnce({});
    await expect(approvePr(request(), params())).resolves.toEqual({ ok: false, error: 'PR approval failed.', status: 500 });
  });

  it('validates PR rejection reasons and records the rejection workflow', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(rejectPr(request({ reason: 'No longer needed' }), params())).resolves.toBe(denied);
    await expect(rejectPr(request({ reason: '  ' }), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.mandatoryRejectionReasonMustBeProvided, status: 400,
    });
    await expect(rejectPr(request(), params())).resolves.toMatchObject({ ok: false, status: 500 });

    db.procurementRequest.findFirst.mockResolvedValueOnce(null);
    await expect(rejectPr(request({ reason: 'Incomplete details' }), params('missing'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.procurementRequestNotFound, status: 404,
    });

    const updated = { id: 'pr-1', status: 'PR_REJECTED' };
    db.procurementRequest.findFirst.mockResolvedValueOnce(prRecord());
    db.procurementRequest.update.mockResolvedValueOnce(updated);
    await expect(rejectPr(request({ reason: '  Incomplete scope  ' }), params())).resolves.toEqual({
      ok: true, data: { pr: updated, status: 'PR_REJECTED' }, status: 200,
    });
    expect(db.procurementRequest.update).toHaveBeenCalledWith({ where: { id: 'pr-1' }, data: {
      status: 'PR_REJECTED', rejectionReason: 'Incomplete scope',
    } });
    expect(db.pRApproval.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ status: 'REJECTED', remarks: 'Incomplete scope' }) });
    expect(db.boqRevision.update).toHaveBeenLastCalledWith({ where: { id: 'revision-1' }, data: { prStatus: 'PR_REJECTED' } });
    expect(db.auditLog.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ action: 'PR_REJECTED' }) });

    db.procurementRequest.findFirst.mockRejectedValueOnce(new Error('reject database error'));
    await expect(rejectPr(request({ reason: 'Other' }), params())).resolves.toEqual({
      ok: false, error: 'reject database error', status: 500,
    });
    db.procurementRequest.findFirst.mockRejectedValueOnce({});
    await expect(rejectPr(request({ reason: 'Other' }), params())).resolves.toEqual({ ok: false, error: 'PR rejection failed.', status: 500 });
  });

  it('returns pending PRs for correction, records reason and notification, and handles failure cases', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(revertPr(request({ reason: 'Fix quantities' }), params())).resolves.toBe(denied);
    await expect(revertPr(request({ reason: '  ' }), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiPrIdRevertRoute.mandatoryReasonForRevertingForCorrectionMustBeProvided, status: 400,
    });
    await expect(revertPr(request(), params())).resolves.toMatchObject({ ok: false, status: 500 });

    db.procurementRequest.findFirst.mockResolvedValueOnce(null);
    await expect(revertPr(request({ reason: 'Fix quantities' }), params('missing'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.procurementRequestNotFound, status: 404,
    });
    db.procurementRequest.findFirst.mockResolvedValueOnce(prRecord({ status: 'PR_DRAFT' }));
    await expect(revertPr(request({ reason: 'Fix quantities' }), params())).resolves.toMatchObject({
      ok: false, error: expect.stringContaining('Cannot revert BOQ in status PR_DRAFT'), status: 400,
    });

    const returned = { id: 'pr-1', status: 'PR_RETURNED_FOR_CORRECTION' };
    db.procurementRequest.findFirst.mockResolvedValueOnce(prRecord());
    db.procurementRequest.update.mockResolvedValueOnce(returned);
    await expect(revertPr(request({ reason: '  Update quantities  ' }), params())).resolves.toEqual({
      ok: true, data: expect.objectContaining({ pr: returned, status: 'PR_RETURNED_FOR_CORRECTION' }), status: 200,
    });
    expect(db.boqRevision.update).toHaveBeenLastCalledWith({ where: { id: 'revision-1' }, data: {
      prStatus: 'PR_RETURNED_FOR_CORRECTION', rejectionReason: 'Update quantities',
    } });
    expect(db.auditLog.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({
      action: 'PR_RETURNED_FOR_CORRECTION', newValue: expect.stringContaining('Update quantities'),
    }) });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1', userId: 'requester-1', type: 'WARNING', entityId: 'pr-1',
    }));

    const withoutRevision = prRecord({ boqRevisionId: null, requestedBy: null });
    auth.mockResolvedValueOnce({ ...context, userName: undefined });
    db.procurementRequest.findFirst.mockResolvedValueOnce(withoutRevision);
    db.procurementRequest.update.mockResolvedValueOnce(returned);
    await revertPr(request({ reason: 'Fix descriptions' }), params());
    expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({ userId: null, message: expect.stringContaining(UI_STRINGS.common.projectApprover) }));

    db.procurementRequest.findFirst.mockRejectedValueOnce(new Error('revert database error'));
    await expect(revertPr(request({ reason: 'Other' }), params())).resolves.toEqual({
      ok: false, error: 'revert database error', status: 500,
    });
    db.procurementRequest.findFirst.mockRejectedValueOnce({});
    await expect(revertPr(request({ reason: 'Other' }), params())).resolves.toEqual({
      ok: false, error: 'Failed to revert BOQ for correction.', status: 500,
    });
    consoleError.mockRestore();
  });
});
