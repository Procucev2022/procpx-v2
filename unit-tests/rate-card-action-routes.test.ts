import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { writeRateCardTransitionAtomically } from '../src/lib/d1-batch';
import { POST as submitRateCard } from '../src/app/api/procurement/rate-cards/[id]/submit/route';
import { POST as rejectRateCard } from '../src/app/api/procurement/rate-cards/[id]/reject/route';
import { POST as revertRateCard } from '../src/app/api/procurement/rate-cards/[id]/revert/route';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { RATE_CARD_REJECT_UPDATE_SQL, RATE_CARD_REVERT_UPDATE_SQL, RATE_CARD_SUBMIT_UPDATE_SQL } from '../src/lib/d1-batch.constants';
import { RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE } from '../src/lib/rate-card-approval-history.constants';


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    vendorRateCard: { findFirst: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));
jest.mock('../src/lib/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('../src/lib/d1-batch', () => ({ writeRateCardTransitionAtomically: jest.fn() }));

const db = prisma as unknown as {
  vendorRateCard: { findFirst: jest.Mock; update: jest.Mock };
};
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
const transition = writeRateCardTransitionAtomically as jest.Mock;
const context = {
  tenantId: 'tenant-1', userId: 'user-1', userName: 'Approver One', userEmail: 'approver@example.test', role: 'PROJECT_APPROVER',
};
const request = (body?: unknown) => new NextRequest('http://localhost/api/rate-cards/card-1', {
  method: 'POST',
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const params = (id = 'card-1') => ({ params: Promise.resolve({ id }) });
const card = (overrides: Record<string, unknown> = {}) => ({
  id: 'card-1', tenantId: 'tenant-1', vendorId: 'vendor-1', rateCardNumber: 'RC-001', status: 'DRAFT',
  items: [{ id: 'item-1' }], vendor: { id: 'vendor-1' }, ...overrides,
});
const expectBoundedApprovalHistoryRead = () => expect(db.vendorRateCard.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
  where: { id: 'card-1', tenantId: 'tenant-1' },
  include: expect.objectContaining({ approvals: expect.objectContaining({
    orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
    take: RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE,
    select: { id: true, level: true, approverName: true, action: true, remarks: true, timestamp: true },
  }) }),
}));

describe('vendor rate card submit, reject, and correction routes', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    audit.mockResolvedValue(undefined);
    transition.mockResolvedValue(true);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('submits only eligible rate cards, stores approval remarks, and maps failures', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(submitRateCard(request({ remarks: 'Reviewed' }), params())).resolves.toBe(denied);
    db.vendorRateCard.findFirst.mockResolvedValueOnce(null);
    await expect(submitRateCard(request(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rateCardNotFound, status: 404 });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ tenantId: 'other-tenant' }));
    await expect(submitRateCard(request(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rateCardNotFound, status: 404 });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ items: [] }));
    await expect(submitRateCard(request(), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementRateCardsIdSubmitRoute.cannotSubmitRateCardWithNoItems, status: 400 });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'APPROVED' }));
    await expect(submitRateCard(request(), params())).resolves.toMatchObject({ ok: false, error: expect.stringContaining('APPROVED'), status: 400 });

    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'RETURNED_FOR_CORRECTION' }));
    await expect(submitRateCard(request({ remarks: '  Re-submitted with changes  ' }), params())).resolves.toMatchObject({
      ok: true, data: { rateCard: { id: 'card-1', status: 'PENDING_PROJECT_APPROVAL' }, message: UI_STRINGS.appApiProcurementRateCardsIdSubmitRoute.rateCardSubmittedForProjectApproval }, status: 200,
    });
    expectBoundedApprovalHistoryRead();
    expect(transition).toHaveBeenLastCalledWith(expect.objectContaining({
      updateSql: RATE_CARD_SUBMIT_UPDATE_SQL,
      updateValues: expect.arrayContaining(['Approver One', 'card-1', 'tenant-1', 'RETURNED_FOR_CORRECTION']),
      approvalValues: expect.arrayContaining(['LEVEL_1_PROJECT', 'user-1', 'Approver One', 'approver@example.test', 'SUBMITTED', '  Re-submitted with changes  ']),
    }));
    expect(transition).toHaveBeenLastCalledWith(expect.objectContaining({
      auditValues: expect.arrayContaining(['RATE_CARD_SUBMITTED', 'VENDOR', JSON.stringify({ status: 'PENDING_PROJECT_APPROVAL', level: 'LEVEL_1_PROJECT' })]),
    }));

    auth.mockResolvedValueOnce({ ...context, userName: '', userEmail: 'fallback@example.test' });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'UNDER_REVIEW' }));
    await submitRateCard(request(), params());
    expect(transition).toHaveBeenLastCalledWith(expect.objectContaining({
      updateSql: RATE_CARD_SUBMIT_UPDATE_SQL,
      updateValues: expect.arrayContaining(['fallback@example.test', 'card-1', 'tenant-1', 'UNDER_REVIEW']),
      approvalValues: expect.arrayContaining([UI_STRINGS.common.categoryManager, 'fallback@example.test', 'SUBMITTED', 'Submitted for Level 1 Project Approval']),
    }));

    auth.mockResolvedValueOnce({ ...context, userName: '', userEmail: '' });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'DRAFT' }));
    await submitRateCard(request(), params());
    expect(transition).toHaveBeenLastCalledWith(expect.objectContaining({
      updateSql: RATE_CARD_SUBMIT_UPDATE_SQL,
      updateValues: expect.arrayContaining(['Category Manager', 'card-1', 'tenant-1', 'DRAFT']),
      approvalValues: expect.arrayContaining(['Category Manager', null, 'SUBMITTED', 'Submitted for Level 1 Project Approval']),
    }));

    transition.mockResolvedValueOnce(false);
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'DRAFT' }));
    await expect(submitRateCard(request(), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409,
    });

    db.vendorRateCard.findFirst.mockRejectedValueOnce(new Error('submit database error'));
    await expect(submitRateCard(request(), params())).resolves.toEqual({ ok: false, error: 'submit database error', status: 500 });
    db.vendorRateCard.findFirst.mockRejectedValueOnce({});
    await expect(submitRateCard(request(), params())).resolves.toEqual({ ok: false, error: 'Failed to submit rate card', status: 500 });
  });

  it('rejects pending rate cards with a reason at the correct approval level', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(rejectRateCard(request({ reason: 'Incomplete quote' }), params())).resolves.toBe(denied);
    await expect(rejectRateCard(request({ reason: ' ' }), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rejectionReasonRemarksIsMandatory, status: 400 });
    await expect(rejectRateCard(request(), params())).resolves.toMatchObject({ ok: false, status: 500 });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(null);
    await expect(rejectRateCard(request({ reason: 'Incomplete quote' }), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rateCardNotFound, status: 404 });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ tenantId: 'other-tenant' }));
    await expect(rejectRateCard(request({ reason: 'Incomplete quote' }), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rateCardNotFound, status: 404 });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'DRAFT' }));
    await expect(rejectRateCard(request({ reason: 'Incomplete quote' }), params())).resolves.toMatchObject({ ok: false, status: 400 });

    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'PENDING_PROJECT_APPROVAL' }));
    await expect(rejectRateCard(request({ remarks: '  Pricing needs correction  ' }), params())).resolves.toMatchObject({
      ok: true, data: { rateCard: { id: 'card-1', status: 'REJECTED' }, message: UI_STRINGS.appApiProcurementRateCardsIdRejectRoute.rateCardRejectedWithReasonRecorded }, status: 200,
    });
    expectBoundedApprovalHistoryRead();
    expect(transition).toHaveBeenLastCalledWith(expect.objectContaining({
      updateSql: RATE_CARD_REJECT_UPDATE_SQL,
      updateValues: expect.arrayContaining(['Pricing needs correction', 'card-1', 'tenant-1', 'PENDING_PROJECT_APPROVAL']),
      approvalValues: expect.arrayContaining([UI_STRINGS.componentsVendorNegotiationWorkspace.lEVEL1PROJECT, 'REJECTED', 'Pricing needs correction']),
      auditValues: expect.arrayContaining(['RATE_CARD_REJECTED', 'VENDOR', JSON.stringify({ status: 'REJECTED', reason: 'Pricing needs correction' })]),
    }));

    auth.mockResolvedValueOnce({ ...context, userName: '', userEmail: '' });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'PENDING_FINANCE_APPROVAL' }));
    await rejectRateCard(request({ reason: 'Budget not approved' }), params());
    expect(transition).toHaveBeenLastCalledWith(expect.objectContaining({
      updateSql: RATE_CARD_REJECT_UPDATE_SQL,
      approvalValues: expect.arrayContaining(['LEVEL_2_FINANCE', 'PROJECT_APPROVER', null, 'REJECTED', 'Budget not approved']),
    }));

    db.vendorRateCard.findFirst.mockRejectedValueOnce(new Error('reject database error'));
    await expect(rejectRateCard(request({ reason: 'Other' }), params())).resolves.toEqual({ ok: false, error: 'reject database error', status: 500 });
    db.vendorRateCard.findFirst.mockRejectedValueOnce({});
    await expect(rejectRateCard(request({ reason: 'Other' }), params())).resolves.toEqual({ ok: false, error: 'Failed to reject rate card', status: 500 });
  });

  it('returns pending cards for correction and records the reason and audit', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(revertRateCard(request({ reason: 'Update documents' }), params())).resolves.toBe(denied);
    await expect(revertRateCard(request({ reason: '   ' }), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementRateCardsIdRevertRoute.remarksReasonForReturningForCorrectionIsMandatory, status: 400,
    });
    await expect(revertRateCard(request(), params())).resolves.toMatchObject({ ok: false, status: 500 });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(null);
    await expect(revertRateCard(request({ reason: 'Update documents' }), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rateCardNotFound, status: 404 });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ tenantId: 'other-tenant' }));
    await expect(revertRateCard(request({ reason: 'Update documents' }), params())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rateCardNotFound, status: 404 });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'DRAFT' }));
    await expect(revertRateCard(request({ reason: 'Update documents' }), params())).resolves.toMatchObject({ ok: false, status: 400 });

    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'PENDING_FINANCE_APPROVAL' }));
    await expect(revertRateCard(request({ remarks: '  Attach current tax certificate  ' }), params())).resolves.toMatchObject({
      ok: true, data: { rateCard: { id: 'card-1', status: 'RETURNED_FOR_CORRECTION' }, message: UI_STRINGS.appApiProcurementRateCardsIdRevertRoute.rateCardReturnedForCorrectionWithRemarksRecorded }, status: 200,
    });
    expectBoundedApprovalHistoryRead();
    expect(transition).toHaveBeenLastCalledWith(expect.objectContaining({
      updateSql: RATE_CARD_REVERT_UPDATE_SQL,
      updateValues: expect.arrayContaining(['Attach current tax certificate', 'card-1', 'tenant-1', 'PENDING_FINANCE_APPROVAL']),
      approvalValues: expect.arrayContaining(['LEVEL_2_FINANCE', 'RETURNED_FOR_CORRECTION', 'Attach current tax certificate']),
    }));
    expect(transition).toHaveBeenLastCalledWith(expect.objectContaining({
      auditValues: expect.arrayContaining(['RATE_CARD_RETURNED_FOR_CORRECTION', 'VENDOR', JSON.stringify({ status: 'RETURNED_FOR_CORRECTION', reason: 'Attach current tax certificate' })]),
    }));

    auth.mockResolvedValueOnce({ ...context, userName: '', userEmail: '' });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(card({ status: 'PENDING_PROJECT_APPROVAL' }));
    await revertRateCard(request({ reason: 'Update insurance certificate' }), params());
    expect(transition).toHaveBeenLastCalledWith(expect.objectContaining({
      updateSql: RATE_CARD_REVERT_UPDATE_SQL,
      approvalValues: expect.arrayContaining([UI_STRINGS.componentsVendorNegotiationWorkspace.lEVEL1PROJECT, 'PROJECT_APPROVER', null, 'RETURNED_FOR_CORRECTION', 'Update insurance certificate']),
    }));

    db.vendorRateCard.findFirst.mockRejectedValueOnce(new Error('revert database error'));
    await expect(revertRateCard(request({ reason: 'Other' }), params())).resolves.toEqual({ ok: false, error: 'revert database error', status: 500 });
    db.vendorRateCard.findFirst.mockRejectedValueOnce({});
    await expect(revertRateCard(request({ reason: 'Other' }), params())).resolves.toEqual({
      ok: false, error: 'Failed to return rate card for correction', status: 500,
    });
  });
});
