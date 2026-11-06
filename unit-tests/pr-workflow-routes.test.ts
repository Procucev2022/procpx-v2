import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { dispatchPreparedWorkflowNotification, notifyNextResponsibleParty } from '../src/lib/notifications';
import { NOTIFICATION_OUTBOX_INSERT_AFTER_AUDIT_SQL } from '../src/lib/notification-outbox.constants';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import {
  PR_APPROVAL_INSERT_AFTER_STATUS_UPDATE_SQL,
  PR_APPROVE_STATUS_UPDATE_SQL,
  PR_AUDIT_INSERT_AFTER_TRANSITION_SQL,
  PR_REJECT_STATUS_UPDATE_SQL,
  PR_REVISION_REVERT_UPDATE_AFTER_APPROVAL_SQL,
  PR_REVISION_STATUS_UPDATE_AFTER_APPROVAL_SQL,
  PR_REVERT_STATUS_UPDATE_SQL,
  PR_SUBMIT_STATUS_UPDATE_SQL,
} from '../src/lib/d1-batch.constants';
import { POST as submitPr } from '../src/app/api/pr/[id]/submit/route';
import { POST as approvePr } from '../src/app/api/pr/[id]/approve/route';
import { POST as rejectPr } from '../src/app/api/pr/[id]/reject/route';
import { POST as revertPr } from '../src/app/api/pr/[id]/revert/route';
import { POST as releasePr } from '../src/app/api/pr/[id]/release-to-procurement/route';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    procurementRequest: { findFirst: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));
jest.mock('../src/lib/notifications', () => ({
  dispatchPreparedWorkflowNotification: jest.fn(),
  notifyNextResponsibleParty: jest.fn(),
}));
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));

const db = prisma as unknown as { procurementRequest: { findFirst: jest.Mock } };
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const notifyNext = notifyNextResponsibleParty as jest.Mock;
const dispatchPrepared = dispatchPreparedWorkflowNotification as jest.Mock;
const writeBatch = writeD1BatchAtomically as jest.Mock;
const structuredLog = writeStructuredLog as jest.Mock;
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
    db.procurementRequest.findFirst.mockReset();
    writeBatch.mockReset().mockImplementation((statements: Array<{ sql: string }>) => Promise.resolve(statements.map(() => ({ meta: { changes: 1 } }))));
    structuredLog.mockReset().mockResolvedValue(undefined);
    notifyNext.mockReset().mockResolvedValue(undefined);
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
    await expect(submitPr(request(), params())).resolves.toMatchObject({
      ok: true, data: { status: 'PR_PENDING_PROJECT_APPROVAL' },
    });
    const draftBatch = writeBatch.mock.calls[0][0];
    expect(draftBatch.map((statement: { sql: string }) => statement.sql)).toEqual([
      PR_SUBMIT_STATUS_UPDATE_SQL, PR_AUDIT_INSERT_AFTER_TRANSITION_SQL,
    ]);
    expect(draftBatch[0].values).toEqual(expect.arrayContaining(['approver-1', 'pr-1', 'tenant-1']));
    expect(draftBatch[1].values[6]).toBe('PR_SUBMITTED');

    const returned = prRecord({ status: 'PR_RETURNED_FOR_CORRECTION' });
    db.procurementRequest.findFirst.mockResolvedValueOnce(returned);
    await submitPr(request(), params());
    const resubmissionBatch = writeBatch.mock.calls[1][0];
    expect(resubmissionBatch.map((statement: { sql: string }) => statement.sql)).toEqual([
      PR_SUBMIT_STATUS_UPDATE_SQL, PR_REVISION_STATUS_UPDATE_AFTER_APPROVAL_SQL, PR_AUDIT_INSERT_AFTER_TRANSITION_SQL,
    ]);
    expect(resubmissionBatch[2].values[6]).toBe('PR_RESUBMITTED');

    db.procurementRequest.findFirst.mockResolvedValueOnce(draft);
    writeBatch.mockResolvedValueOnce([{ meta: { changes: 0 } }]);
    await expect(submitPr(request(), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409,
    });
    db.procurementRequest.findFirst.mockRejectedValueOnce(new Error('submit read failed'));
    await expect(submitPr(request(), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToSubmitPr, status: 500,
    });
  });

  it('releases approved PRs idempotently and commits their notification outbox row with the transition', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(releasePr(request(), params())).resolves.toBe(denied);

    db.procurementRequest.findFirst.mockResolvedValueOnce(null);
    await expect(releasePr(request(), params('missing'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.procurementRequestNotFound, status: 404,
    });
    db.procurementRequest.findFirst.mockResolvedValueOnce(prRecord({ status: 'PR_RELEASED_TO_PROCUREMENT' }));
    await expect(releasePr(request(), params())).resolves.toMatchObject({ ok: true, data: { status: 'PR_RELEASED_TO_PROCUREMENT' } });
    expect(writeBatch).not.toHaveBeenCalled();

    db.procurementRequest.findFirst.mockResolvedValueOnce(prRecord({ status: 'PR_DRAFT' }));
    await expect(releasePr(request(), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiPrIdReleaseToProcurementRoute.pRMustBeApprovedBeforeReleasingToProcurement, status: 400,
    });
    db.procurementRequest.findFirst.mockResolvedValueOnce(prRecord({ status: 'PR_APPROVED' }));
    writeBatch.mockResolvedValueOnce([{ meta: { changes: 0 } }]);
    await expect(releasePr(request(), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409,
    });

    db.procurementRequest.findFirst.mockResolvedValueOnce(prRecord({ status: 'PR_APPROVED' }));
    notifyNext.mockResolvedValueOnce({
      tenantId: 'tenant-1', targetRole: 'PROCUREMENT_USER', title: 'Ready', message: 'Source PR-001',
      type: 'ACTION_REQUIRED', entityType: 'PR', entityId: 'pr-1', recordNumber: 'PR-001', link: '/procurement/rfqs/new?prId=pr-1',
    });
    await expect(releasePr(request(), params())).resolves.toMatchObject({ ok: true, data: { status: 'PR_RELEASED_TO_PROCUREMENT' } });
    const releaseBatch = writeBatch.mock.calls.at(-1)?.[0] as Array<{ sql: string; values: unknown[] }>;
    expect(releaseBatch).toHaveLength(3);
    expect(releaseBatch[2].sql).toContain('notification_outbox');
    expect(releaseBatch[2].values[6]).toBe(releaseBatch[1].values[0]);
    expect(dispatchPrepared).toHaveBeenCalledWith(releaseBatch[2].values[0], expect.any(Date), expect.objectContaining({ entityId: 'pr-1' }));

    db.procurementRequest.findFirst.mockRejectedValueOnce(new Error('release read failed'));
    await expect(releasePr(request(), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToReleaseProcurementRequest, status: 500,
    });
    expect(structuredLog).toHaveBeenCalledWith('error', 'purchase_request.release_failed', expect.objectContaining({ prId: 'pr-1' }), 'application');
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
    await expect(approvePr(request({ remarks: 'Checked quantities' }), params())).resolves.toMatchObject({
      ok: true, data: { status: 'PR_RELEASED_TO_PROCUREMENT' },
    });
    const approvalBatch = writeBatch.mock.calls[0][0];
    expect(approvalBatch.map((statement: { sql: string }) => statement.sql)).toEqual([
      PR_APPROVE_STATUS_UPDATE_SQL, PR_APPROVAL_INSERT_AFTER_STATUS_UPDATE_SQL,
      PR_REVISION_STATUS_UPDATE_AFTER_APPROVAL_SQL, PR_AUDIT_INSERT_AFTER_TRANSITION_SQL,
    ]);
    expect(approvalBatch[1].values).toEqual(expect.arrayContaining(['tenant-1', 'pr-1', 'approver-1', 'APPROVED', 'Checked quantities']));

    db.procurementRequest.findFirst.mockResolvedValueOnce(prRecord());
    await approvePr(request(), params());
    expect(writeBatch.mock.calls[1][0][1].values[5]).toBe(UI_STRINGS.appApiPrIdApproveRoute.procurementRequestTechnicalSpecificationAndQuantityApproved);

    db.procurementRequest.findFirst.mockResolvedValueOnce(prRecord());
    writeBatch.mockResolvedValueOnce([{ meta: { changes: 0 } }]);
    await expect(approvePr(request(), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409,
    });

    db.procurementRequest.findFirst.mockRejectedValueOnce(new Error('approval database error'));
    await expect(approvePr(request(), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.prApprovalFailed, status: 500,
    });
    expect(structuredLog).toHaveBeenCalledWith('error', 'purchase_request.approval_failed', expect.objectContaining({ prId: 'pr-1', error: expect.any(Error) }), 'application');
    db.procurementRequest.findFirst.mockRejectedValueOnce({});
    await expect(approvePr(request(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.prApprovalFailed, status: 500 });
  });

  it('validates PR rejection reasons and records the rejection workflow', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(rejectPr(request({ reason: 'No longer needed' }), params())).resolves.toBe(denied);
    await expect(rejectPr(request({ reason: '  ' }), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.mandatoryRejectionReasonMustBeProvided, status: 400,
    });
    await expect(rejectPr(request('not an object'), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.mandatoryRejectionReasonMustBeProvided, status: 400,
    });
    await expect(rejectPr(request(), params())).resolves.toMatchObject({ ok: false, status: 500 });

    db.procurementRequest.findFirst.mockResolvedValueOnce(null);
    await expect(rejectPr(request({ reason: 'Incomplete details' }), params('missing'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.procurementRequestNotFound, status: 404,
    });
    db.procurementRequest.findFirst.mockResolvedValueOnce(prRecord({ status: 'PR_APPROVED' }));
    await expect(rejectPr(request({ reason: 'Not awaiting approval' }), params())).resolves.toMatchObject({
      ok: false, error: expect.stringContaining('PR_APPROVED'), status: 400,
    });

    db.procurementRequest.findFirst.mockResolvedValueOnce(prRecord());
    await expect(rejectPr(request({ reason: '  Incomplete scope  ' }), params())).resolves.toEqual({
      ok: true, data: { pr: { ...prRecord(), status: 'PR_REJECTED', rejectionReason: 'Incomplete scope' }, status: 'PR_REJECTED' }, status: 200,
    });
    const rejectionBatch = writeBatch.mock.calls[0][0];
    expect(rejectionBatch.map((statement: { sql: string }) => statement.sql)).toEqual([
      PR_REJECT_STATUS_UPDATE_SQL, PR_APPROVAL_INSERT_AFTER_STATUS_UPDATE_SQL,
      PR_REVISION_STATUS_UPDATE_AFTER_APPROVAL_SQL, PR_AUDIT_INSERT_AFTER_TRANSITION_SQL,
    ]);
    expect(rejectionBatch[1].values).toEqual(expect.arrayContaining(['REJECTED', 'Incomplete scope']));
    expect(rejectionBatch[2].values[0]).toBe('PR_REJECTED');

    db.procurementRequest.findFirst.mockResolvedValueOnce(prRecord());
    writeBatch.mockResolvedValueOnce([{ meta: { changes: 0 } }]);
    await expect(rejectPr(request({ reason: 'Stale rejection' }), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409,
    });

    db.procurementRequest.findFirst.mockRejectedValueOnce(new Error('reject database error'));
    await expect(rejectPr(request({ reason: 'Other' }), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.prRejectionFailed, status: 500,
    });
    db.procurementRequest.findFirst.mockRejectedValueOnce({});
    await expect(rejectPr(request({ reason: 'Other' }), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.prRejectionFailed, status: 500 });
  });

  it('returns pending PRs for correction, records reason and notification, and handles failure cases', async () => {
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

    db.procurementRequest.findFirst.mockResolvedValueOnce(prRecord());
    await expect(revertPr(request({ reason: '  Update quantities  ' }), params())).resolves.toEqual({
      ok: true, data: expect.objectContaining({ pr: expect.objectContaining({ ...prRecord(), status: 'PR_RETURNED_FOR_CORRECTION', rejectionReason: 'Update quantities' }), status: 'PR_RETURNED_FOR_CORRECTION' }), status: 200,
    });
    const returnBatch = writeBatch.mock.calls[0][0];
    expect(returnBatch.map((statement: { sql: string }) => statement.sql)).toEqual([
      PR_REVERT_STATUS_UPDATE_SQL, PR_APPROVAL_INSERT_AFTER_STATUS_UPDATE_SQL,
      PR_REVISION_REVERT_UPDATE_AFTER_APPROVAL_SQL, PR_AUDIT_INSERT_AFTER_TRANSITION_SQL,
      NOTIFICATION_OUTBOX_INSERT_AFTER_AUDIT_SQL,
    ]);
    expect(returnBatch[2].values[0]).toBe('Update quantities');
    expect(returnBatch[3].values[6]).toBe('PR_RETURNED_FOR_CORRECTION');
    expect(JSON.parse(returnBatch[4].values[2] as string)).toMatchObject({
      tenantId: 'tenant-1', userId: 'requester-1', type: 'WARNING', entityId: 'pr-1',
    });
    expect(returnBatch[4].values[6]).toBe(returnBatch[3].values[0]);
    expect(dispatchPrepared).toHaveBeenCalledWith(returnBatch[4].values[0], expect.any(Date), expect.objectContaining({ entityId: 'pr-1' }));

    const withoutRevision = prRecord({ boqRevisionId: null, requestedBy: null });
    auth.mockResolvedValueOnce({ ...context, userName: undefined });
    db.procurementRequest.findFirst.mockResolvedValueOnce(withoutRevision);
    await revertPr(request({ reason: 'Fix descriptions' }), params());
    expect(writeBatch.mock.calls[1][0].map((statement: { sql: string }) => statement.sql)).toEqual([
      PR_REVERT_STATUS_UPDATE_SQL, PR_APPROVAL_INSERT_AFTER_STATUS_UPDATE_SQL, PR_AUDIT_INSERT_AFTER_TRANSITION_SQL,
      NOTIFICATION_OUTBOX_INSERT_AFTER_AUDIT_SQL,
    ]);
    expect(JSON.parse(writeBatch.mock.calls[1][0][3].values[2] as string)).toMatchObject({
      userId: null, message: expect.stringContaining(UI_STRINGS.common.projectApprover),
    });

    db.procurementRequest.findFirst.mockResolvedValueOnce(prRecord());
    writeBatch.mockResolvedValueOnce([{ meta: { changes: 0 } }]);
    await expect(revertPr(request({ reason: 'Race' }), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409,
    });

    db.procurementRequest.findFirst.mockRejectedValueOnce(new Error('revert database error'));
    await expect(revertPr(request({ reason: 'Other' }), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToRevertBoqForCorrection, status: 500,
    });
    expect(structuredLog).toHaveBeenCalledWith('error', 'purchase_request.revert_failed', expect.objectContaining({ prId: 'pr-1', error: expect.any(Error) }), 'application');
    db.procurementRequest.findFirst.mockRejectedValueOnce({});
    await expect(revertPr(request({ reason: 'Other' }), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToRevertBoqForCorrection, status: 500,
    });
  });
});
