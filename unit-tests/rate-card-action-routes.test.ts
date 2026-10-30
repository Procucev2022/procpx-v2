import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { POST as submitRateCard } from '../src/app/api/procurement/rate-cards/[id]/submit/route';
import { POST as rejectRateCard } from '../src/app/api/procurement/rate-cards/[id]/reject/route';
import { POST as revertRateCard } from '../src/app/api/procurement/rate-cards/[id]/revert/route';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    vendorRateCard: { findUnique: jest.fn(), update: jest.fn() },
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

const db = prisma as unknown as {
  vendorRateCard: { findUnique: jest.Mock; update: jest.Mock };
};
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
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

describe('vendor rate card submit, reject, and correction routes', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    audit.mockResolvedValue(undefined);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('submits only eligible rate cards, stores approval remarks, and maps failures', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(submitRateCard(request({ remarks: 'Reviewed' }), params())).resolves.toBe(denied);
    db.vendorRateCard.findUnique.mockResolvedValueOnce(null);
    await expect(submitRateCard(request(), params())).resolves.toEqual({ ok: false, error: 'Rate Card not found', status: 404 });
    db.vendorRateCard.findUnique.mockResolvedValueOnce(card({ tenantId: 'other-tenant' }));
    await expect(submitRateCard(request(), params())).resolves.toEqual({ ok: false, error: 'Rate Card not found', status: 404 });
    db.vendorRateCard.findUnique.mockResolvedValueOnce(card({ items: [] }));
    await expect(submitRateCard(request(), params())).resolves.toEqual({ ok: false, error: 'Cannot submit rate card with no items', status: 400 });
    db.vendorRateCard.findUnique.mockResolvedValueOnce(card({ status: 'APPROVED' }));
    await expect(submitRateCard(request(), params())).resolves.toMatchObject({ ok: false, error: expect.stringContaining('APPROVED'), status: 400 });

    const updated = { id: 'card-1', status: 'PENDING_PROJECT_APPROVAL' };
    db.vendorRateCard.findUnique.mockResolvedValueOnce(card({ status: 'RETURNED_FOR_CORRECTION' }));
    db.vendorRateCard.update.mockResolvedValueOnce(updated);
    await expect(submitRateCard(request({ remarks: '  Re-submitted with changes  ' }), params())).resolves.toEqual({
      ok: true, data: { rateCard: updated, message: 'Rate Card submitted for Project Approval' }, status: 200,
    });
    expect(db.vendorRateCard.update).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: 'card-1' },
      data: expect.objectContaining({
        status: 'PENDING_PROJECT_APPROVAL', approvalLevel: 'LEVEL_1_PROJECT', submittedBy: 'Approver One', submittedAt: expect.any(Date),
        rejectionReason: null, revertReason: null,
        approvals: { create: expect.objectContaining({ approverName: 'Approver One', approverEmail: 'approver@example.test', remarks: '  Re-submitted with changes  ' }) },
      }),
    }));
    expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'RATE_CARD_SUBMITTED', entityId: 'vendor-1' }));

    auth.mockResolvedValueOnce({ ...context, userName: '', userEmail: 'fallback@example.test' });
    db.vendorRateCard.findUnique.mockResolvedValueOnce(card({ status: 'UNDER_REVIEW' }));
    db.vendorRateCard.update.mockResolvedValueOnce(updated);
    await submitRateCard(request(), params());
    expect(db.vendorRateCard.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        submittedBy: 'fallback@example.test',
        approvals: { create: expect.objectContaining({
          approverName: 'Category Manager', approverEmail: 'fallback@example.test', remarks: 'Submitted for Level 1 Project Approval',
        }) },
      }),
    }));

    db.vendorRateCard.findUnique.mockRejectedValueOnce(new Error('submit database error'));
    await expect(submitRateCard(request(), params())).resolves.toEqual({ ok: false, error: 'submit database error', status: 500 });
    db.vendorRateCard.findUnique.mockRejectedValueOnce({});
    await expect(submitRateCard(request(), params())).resolves.toEqual({ ok: false, error: 'Failed to submit rate card', status: 500 });
  });

  it('rejects pending rate cards with a reason at the correct approval level', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(rejectRateCard(request({ reason: 'Incomplete quote' }), params())).resolves.toBe(denied);
    await expect(rejectRateCard(request({ reason: ' ' }), params())).resolves.toEqual({ ok: false, error: 'Rejection reason / remarks is mandatory', status: 400 });
    await expect(rejectRateCard(request(), params())).resolves.toMatchObject({ ok: false, status: 500 });
    db.vendorRateCard.findUnique.mockResolvedValueOnce(null);
    await expect(rejectRateCard(request({ reason: 'Incomplete quote' }), params())).resolves.toEqual({ ok: false, error: 'Rate Card not found', status: 404 });
    db.vendorRateCard.findUnique.mockResolvedValueOnce(card({ tenantId: 'other-tenant' }));
    await expect(rejectRateCard(request({ reason: 'Incomplete quote' }), params())).resolves.toEqual({ ok: false, error: 'Rate Card not found', status: 404 });
    db.vendorRateCard.findUnique.mockResolvedValueOnce(card({ status: 'DRAFT' }));
    await expect(rejectRateCard(request({ reason: 'Incomplete quote' }), params())).resolves.toMatchObject({ ok: false, status: 400 });

    const updated = { id: 'card-1', status: 'REJECTED' };
    db.vendorRateCard.findUnique.mockResolvedValueOnce(card({ status: 'PENDING_PROJECT_APPROVAL' }));
    db.vendorRateCard.update.mockResolvedValueOnce(updated);
    await expect(rejectRateCard(request({ remarks: '  Pricing needs correction  ' }), params())).resolves.toEqual({
      ok: true, data: { rateCard: updated, message: 'Rate Card rejected with reason recorded' }, status: 200,
    });
    expect(db.vendorRateCard.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'REJECTED', rejectionReason: 'Pricing needs correction',
        approvals: { create: expect.objectContaining({ level: 'LEVEL_1_PROJECT', action: 'REJECTED', remarks: 'Pricing needs correction' }) },
      }),
    }));

    auth.mockResolvedValueOnce({ ...context, userName: '', userEmail: '' });
    db.vendorRateCard.findUnique.mockResolvedValueOnce(card({ status: 'PENDING_FINANCE_APPROVAL' }));
    db.vendorRateCard.update.mockResolvedValueOnce(updated);
    await rejectRateCard(request({ reason: 'Budget not approved' }), params());
    expect(db.vendorRateCard.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ approvals: { create: expect.objectContaining({
        level: 'LEVEL_2_FINANCE', approverName: 'PROJECT_APPROVER', approverEmail: null,
      }) } }),
    }));

    db.vendorRateCard.findUnique.mockRejectedValueOnce(new Error('reject database error'));
    await expect(rejectRateCard(request({ reason: 'Other' }), params())).resolves.toEqual({ ok: false, error: 'reject database error', status: 500 });
    db.vendorRateCard.findUnique.mockRejectedValueOnce({});
    await expect(rejectRateCard(request({ reason: 'Other' }), params())).resolves.toEqual({ ok: false, error: 'Failed to reject rate card', status: 500 });
  });

  it('returns pending cards for correction and records the reason and audit', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(revertRateCard(request({ reason: 'Update documents' }), params())).resolves.toBe(denied);
    await expect(revertRateCard(request({ reason: '   ' }), params())).resolves.toEqual({
      ok: false, error: 'Remarks / reason for returning for correction is mandatory', status: 400,
    });
    await expect(revertRateCard(request(), params())).resolves.toMatchObject({ ok: false, status: 500 });
    db.vendorRateCard.findUnique.mockResolvedValueOnce(null);
    await expect(revertRateCard(request({ reason: 'Update documents' }), params())).resolves.toEqual({ ok: false, error: 'Rate Card not found', status: 404 });
    db.vendorRateCard.findUnique.mockResolvedValueOnce(card({ tenantId: 'other-tenant' }));
    await expect(revertRateCard(request({ reason: 'Update documents' }), params())).resolves.toEqual({ ok: false, error: 'Rate Card not found', status: 404 });
    db.vendorRateCard.findUnique.mockResolvedValueOnce(card({ status: 'DRAFT' }));
    await expect(revertRateCard(request({ reason: 'Update documents' }), params())).resolves.toMatchObject({ ok: false, status: 400 });

    const updated = { id: 'card-1', status: 'RETURNED_FOR_CORRECTION' };
    db.vendorRateCard.findUnique.mockResolvedValueOnce(card({ status: 'PENDING_FINANCE_APPROVAL' }));
    db.vendorRateCard.update.mockResolvedValueOnce(updated);
    await expect(revertRateCard(request({ remarks: '  Attach current tax certificate  ' }), params())).resolves.toEqual({
      ok: true, data: { rateCard: updated, message: 'Rate Card returned for correction with remarks recorded' }, status: 200,
    });
    expect(db.vendorRateCard.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'RETURNED_FOR_CORRECTION', revertReason: 'Attach current tax certificate',
        approvals: { create: expect.objectContaining({ level: 'LEVEL_2_FINANCE', action: 'RETURNED_FOR_CORRECTION' }) },
      }),
    }));
    expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'RATE_CARD_RETURNED_FOR_CORRECTION' }));

    auth.mockResolvedValueOnce({ ...context, userName: '', userEmail: '' });
    db.vendorRateCard.findUnique.mockResolvedValueOnce(card({ status: 'PENDING_PROJECT_APPROVAL' }));
    db.vendorRateCard.update.mockResolvedValueOnce(updated);
    await revertRateCard(request({ reason: 'Update insurance certificate' }), params());
    expect(db.vendorRateCard.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        revertReason: 'Update insurance certificate',
        approvals: { create: expect.objectContaining({ level: 'LEVEL_1_PROJECT', approverName: 'PROJECT_APPROVER', approverEmail: null }) },
      }),
    }));

    db.vendorRateCard.findUnique.mockRejectedValueOnce(new Error('revert database error'));
    await expect(revertRateCard(request({ reason: 'Other' }), params())).resolves.toEqual({ ok: false, error: 'revert database error', status: 500 });
    db.vendorRateCard.findUnique.mockRejectedValueOnce({});
    await expect(revertRateCard(request({ reason: 'Other' }), params())).resolves.toEqual({
      ok: false, error: 'Failed to return rate card for correction', status: 500,
    });
  });
});
