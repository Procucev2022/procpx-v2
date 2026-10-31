import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { createNextBoqRevision } from '../src/lib/boq-revision-utils';
import { GET as getProjectDocuments, POST as addProjectDocument } from '../src/app/api/projects/[id]/documents/route';
import { GET as getProject, PUT as updateProject } from '../src/app/api/projects/[id]/route';
import { POST as createNewRevision } from '../src/app/api/boq/[revisionId]/new-revision/route';
import { GET as getRateCardMessages, POST as addRateCardMessage } from '../src/app/api/procurement/rate-cards/[id]/message/route';
import { POST as rejectFinanceBudget } from '../src/app/api/budgets/finance-reject/route';
import { POST as rejectProjectBudget } from '../src/app/api/budgets/reject/route';
import { POST as approveProjectBudget } from '../src/app/api/budgets/approve/route';
import { POST as approveFinanceBudget } from '../src/app/api/budgets/finance-approve/route';
import { POST as reverseBudgetTransaction } from '../src/app/api/budgets/reverse/route';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    project: { findFirst: jest.fn(), update: jest.fn() },
    projectDocument: { findMany: jest.fn(), create: jest.fn() },
    boqRevision: { findFirst: jest.fn(), update: jest.fn() },
    boqLine: { createMany: jest.fn() },
    vendorRateCard: { findUnique: jest.fn() },
    rateCardApproval: { create: jest.fn() },
    budgetContribution: { findFirst: jest.fn(), update: jest.fn() },
    budgetApproval: { create: jest.fn() },
    budgetTransaction: { updateMany: jest.fn(), findFirst: jest.fn(), count: jest.fn(), create: jest.fn() },
    budget: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
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
jest.mock('../src/lib/boq-revision-utils', () => ({ createNextBoqRevision: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
const nextRevision = createNextBoqRevision as jest.Mock;
const context = {
  tenantId: 'tenant-1', userId: 'user-1', userName: 'Project User', userEmail: 'user@example.test', role: 'ADMIN',
};
const request = (body?: unknown) => new NextRequest('http://localhost/api/test', {
  method: body === undefined ? 'GET' : 'POST',
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const projectParams = (id = 'project-1') => ({ params: Promise.resolve({ id }) });
const revisionParams = (revisionId = 'revision-1') => ({ params: Promise.resolve({ revisionId }) });
const cardParams = (id = 'rate-card-1') => ({ params: Promise.resolve({ id }) });

describe('project document, project detail, BOQ revision, rate-card message and budget rejection routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    audit.mockResolvedValue(undefined);
  });

  it('lists and creates project documents with tenant scoping, defaults, and audit history', async () => {
    auth.mockResolvedValueOnce({ status: 403 });
    isContext.mockReturnValueOnce(false);
    const denied = await getProjectDocuments(request(), projectParams());
    expect(denied).toEqual({ status: 403 });

    db.project.findFirst.mockResolvedValueOnce(null);
    await expect(getProjectDocuments(request(), projectParams())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.projectNotFound, status: 404 });
    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1' });
    db.projectDocument.findMany.mockResolvedValueOnce([{ id: 'doc-1' }]);
    await expect(getProjectDocuments(request(), projectParams())).resolves.toEqual({ ok: true, data: [{ id: 'doc-1' }], status: 200 });
    expect(db.projectDocument.findMany).toHaveBeenCalledWith({
      where: { projectId: 'project-1', tenantId: 'tenant-1' }, orderBy: { uploadedAt: 'desc' },
    });

    auth.mockResolvedValueOnce({ status: 403 });
    isContext.mockReturnValueOnce(false);
    expect(await addProjectDocument(request({ name: 'Plans' }), projectParams())).toEqual({ status: 403 });
    db.project.findFirst.mockResolvedValueOnce(null);
    await expect(addProjectDocument(request({ name: 'Plans' }), projectParams())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.projectNotFound, status: 404 });
    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1' });
    await expect(addProjectDocument(request({ name: '  ' }), projectParams())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProjectsIdDocumentsRoute.documentNameIsRequired, status: 400 });

    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1' });
    db.projectDocument.create.mockResolvedValueOnce({ id: 'doc-2', name: 'Plan set', category: 'DRAWING' });
    await expect(addProjectDocument(request({
      name: '  Plan set  ', fileType: 'application/pdf', fileSize: 1200, filePath: '/custom/plan.pdf', category: 'DRAWING',
    }), projectParams())).resolves.toEqual({ ok: true, data: { id: 'doc-2', name: 'Plan set', category: 'DRAWING' }, status: 201 });
    expect(db.projectDocument.create).toHaveBeenLastCalledWith({ data: {
      tenantId: 'tenant-1', projectId: 'project-1', name: 'Plan set', fileType: 'application/pdf', fileSize: 1200,
      filePath: '/custom/plan.pdf', uploadedBy: 'user-1', category: 'DRAWING',
    } });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: UI_STRINGS.appAppAuditPage.cREATE, entityType: UI_STRINGS.appAppAuditPage.pROJECT, entityId: 'project-1' }));

    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1' });
    db.projectDocument.create.mockResolvedValueOnce({ id: 'doc-3', name: 'Attachment', category: 'OTHER' });
    await addProjectDocument(request({ name: 'Attachment', fileType: '', fileSize: 0, filePath: '', category: '' }), projectParams());
    expect(db.projectDocument.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({
      fileType: 'application/octet-stream', fileSize: 0, filePath: '/uploads/tenant-1/project-1/Attachment', category: UI_STRINGS.appAppProjectsIdPage.oTHER,
    }) });
  });

  it('reads and updates project details with tenant checks and keeps omitted values', async () => {
    auth.mockResolvedValueOnce({ status: 403 });
    isContext.mockReturnValueOnce(false);
    await expect(getProject(request(), projectParams())).resolves.toEqual({ status: 403 });
    db.project.findFirst.mockResolvedValueOnce(null);
    await expect(getProject(request(), projectParams())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.projectNotFound, status: 404 });
    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1', projectCode: 'P-1' });
    await expect(getProject(request(), projectParams())).resolves.toMatchObject({ ok: true, data: { projectCode: 'P-1' } });

    auth.mockResolvedValueOnce({ status: 403 });
    isContext.mockReturnValueOnce(false);
    await expect(updateProject(request({ name: 'Updated' }), projectParams())).resolves.toEqual({ status: 403 });
    db.project.findFirst.mockResolvedValueOnce(null);
    await expect(updateProject(request({ name: 'Updated' }), projectParams())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.projectNotFound, status: 404 });

    const existing = {
      id: 'project-1', projectCode: 'P-1', name: 'Old', description: 'Old description', sector: 'Retail', projectType: 'New',
      location: 'East', address: 'Old address', city: 'Pune', state: 'MH', country: 'IN', areaSqFt: 10,
      costCentre: 'CC-1', projectOwner: 'Owner', budget: 100, currency: 'INR', status: 'ACTIVE',
    };
    db.project.findFirst.mockResolvedValueOnce(existing);
    const updated = { ...existing, name: 'New', areaSqFt: 250.5, budget: 2000, updatedBy: 'user-1' };
    db.project.update.mockResolvedValueOnce(updated);
    await expect(updateProject(request({
      name: 'New', description: 'New description', sector: 'Health', projectType: 'Expansion', location: 'West', address: 'New address',
      city: 'Mumbai', state: 'MH', country: 'IN', areaSqFt: '250.5', costCentre: 'CC-2', projectOwner: 'New owner', budget: '2000',
      currency: 'USD', status: 'ON_HOLD',
    }), projectParams())).resolves.toEqual({ ok: true, data: updated, status: 200 });
    expect(db.project.update).toHaveBeenLastCalledWith({ where: { id: 'project-1' }, data: expect.objectContaining({
      name: 'New', areaSqFt: 250.5, budget: 2000, status: 'ON_HOLD', updatedBy: 'user-1',
    }) });

    db.project.findFirst.mockResolvedValueOnce(existing);
    db.project.update.mockResolvedValueOnce(existing);
    await updateProject(request({ areaSqFt: 0, budget: 0 }), projectParams());
    expect(db.project.update).toHaveBeenLastCalledWith({ where: { id: 'project-1' }, data: expect.objectContaining({
      name: 'Old', description: 'Old description', areaSqFt: 10, budget: 100, status: UI_STRINGS.common.aCTIVE,
    }) });
    expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ action: UI_STRINGS.appAppAuditPage.uPDATE, oldValue: { status: UI_STRINGS.common.aCTIVE, name: 'Old' } }));
  });

  it('creates revisions only from approved BOQs and copies available source lines', async () => {
    auth.mockResolvedValueOnce({ status: 403 });
    isContext.mockReturnValueOnce(false);
    await expect(createNewRevision(request(), revisionParams())).resolves.toEqual({ status: 403 });
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    await expect(createNewRevision(request(), revisionParams())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.revisionNotFound, status: 404 });
    db.boqRevision.findFirst.mockResolvedValueOnce({ status: 'DRAFT' });
    await expect(createNewRevision(request(), revisionParams())).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBoqRevisionIdNewRevisionRoute.newRevisionsCanOnlyBeCreatedFromAnApprovedRevision, status: 400,
    });

    const source = {
      id: 'revision-1', boqId: 'boq-1', costCentreId: 'cc-1', status: 'APPROVED', revisionCode: 'R1',
      totalLines: 2, validLines: 2, warningLines: 0, qualityScore: 100, lines: [],
    };
    db.boqRevision.findFirst.mockResolvedValueOnce(source);
    nextRevision.mockResolvedValueOnce({ id: 'revision-2', revisionCode: 'R2' });
    await expect(createNewRevision(request(), revisionParams())).resolves.toEqual({
      ok: true, data: { revisionId: 'revision-2', revisionCode: 'R2', copiedLines: 0 }, status: 201,
    });
    expect(db.boqLine.createMany).not.toHaveBeenCalled();

    const sourceLine = {
      lineNumber: 1, originalDescription: 'Cable', standardDescription: 'Copper cable', specification: null, categoryId: null,
      subcategoryId: null, uomId: null, uomRaw: null, quantity: 4, location: null, drawingReference: null, brand: null,
      model: null, material: null, grade: null, remarks: null, itemCode: null, validationStatus: 'VALID',
      validationMessages: null, benchmarkEligible: true,
    };
    db.boqRevision.findFirst.mockResolvedValueOnce({ ...source, lines: [sourceLine] });
    nextRevision.mockResolvedValueOnce({ id: 'revision-3', revisionCode: 'R3' });
    await createNewRevision(request(), revisionParams());
    expect(db.boqLine.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({
      tenantId: 'tenant-1', boqRevisionId: 'revision-3', lineNumber: 1, quantity: 4, benchmarkEligible: true,
    })] });
    expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ action: UI_STRINGS.appAppAuditPage.cREATE, entityId: 'revision-3' }));
  });

  it('records and lists rate-card clarification messages while enforcing tenant ownership', async () => {
    auth.mockResolvedValueOnce({ status: 403 });
    isContext.mockReturnValueOnce(false);
    await expect(addRateCardMessage(request({ message: 'Question' }), cardParams())).resolves.toEqual({ status: 403 });
    await expect(addRateCardMessage(request({ message: '  ' }), cardParams())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.messageTextIsRequired, status: 400,
    });
    db.vendorRateCard.findUnique.mockResolvedValueOnce(null);
    await expect(addRateCardMessage(request({ message: 'Question' }), cardParams())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rateCardNotFound, status: 404 });
    db.vendorRateCard.findUnique.mockResolvedValueOnce({ tenantId: 'other-tenant' });
    await expect(addRateCardMessage(request({ message: 'Question' }), cardParams())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rateCardNotFound, status: 404 });

    db.vendorRateCard.findUnique.mockResolvedValueOnce({ tenantId: 'tenant-1', approvalLevel: null });
    db.rateCardApproval.create.mockResolvedValueOnce({ id: 'message-1' });
    await expect(addRateCardMessage(request({ message: '  Please confirm lead time  ' }), cardParams())).resolves.toMatchObject({
      ok: true, data: { approvalEntry: { id: 'message-1' } },
    });
    expect(db.rateCardApproval.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({
      level: UI_STRINGS.componentsVendorNegotiationWorkspace.lEVEL1PROJECT, approverName: UI_STRINGS.common.projectUser, approverEmail: 'user@example.test',
      action: 'CLARIFICATION_MESSAGE', remarks: 'Please confirm lead time', timestamp: expect.any(Date),
    }) });

    auth.mockResolvedValueOnce({ ...context, userName: '', userEmail: 'fallback@example.test' });
    db.vendorRateCard.findUnique.mockResolvedValueOnce({ tenantId: 'tenant-1', approvalLevel: 'LEVEL_2_FINANCE' });
    db.rateCardApproval.create.mockResolvedValueOnce({ id: 'message-2' });
    await addRateCardMessage(request({ message: 'Noted' }), cardParams());
    expect(db.rateCardApproval.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({
      level: 'LEVEL_2_FINANCE', approverName: 'fallback@example.test', approverEmail: 'fallback@example.test',
    }) });
    auth.mockResolvedValueOnce({ ...context, userName: '', userEmail: '' });
    db.vendorRateCard.findUnique.mockResolvedValueOnce({ tenantId: 'tenant-1' });
    db.rateCardApproval.create.mockResolvedValueOnce({ id: 'message-3' });
    await addRateCardMessage(request({ message: 'Noted' }), cardParams());
    expect(db.rateCardApproval.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ approverName: 'ADMIN', approverEmail: null }) });

    auth.mockResolvedValueOnce({ status: 403 });
    isContext.mockReturnValueOnce(false);
    await expect(getRateCardMessages(request(), cardParams())).resolves.toEqual({ status: 403 });
    db.vendorRateCard.findUnique.mockResolvedValueOnce(null);
    await expect(getRateCardMessages(request(), cardParams())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rateCardNotFound, status: 404 });
    db.vendorRateCard.findUnique.mockResolvedValueOnce({ tenantId: 'other-tenant' });
    await expect(getRateCardMessages(request(), cardParams())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rateCardNotFound, status: 404 });
    db.vendorRateCard.findUnique.mockResolvedValueOnce({ tenantId: 'tenant-1', approvals: [{ id: 'message-1' }] });
    await expect(getRateCardMessages(request(), cardParams())).resolves.toEqual({ ok: true, data: { approvals: [{ id: 'message-1' }] }, status: 200 });
    expect(db.vendorRateCard.findUnique).toHaveBeenLastCalledWith(expect.objectContaining({ include: { approvals: { orderBy: { timestamp: 'desc' } } } }));
  });

  it('validates and performs finance and project budget rejections, including pending amount cleanup', async () => {
    auth.mockResolvedValueOnce({ status: 403 });
    isContext.mockReturnValueOnce(false);
    await expect(rejectFinanceBudget(request({ contributionId: 'budget-1', reason: 'Overrun' }))).resolves.toEqual({ status: 403 });
    await expect(rejectFinanceBudget(request({}))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.contributionIDIsRequired, status: 400 });
    await expect(rejectFinanceBudget(request({ contributionId: 'budget-1', reason: ' ' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBudgetsFinanceRejectRoute.mandatoryFinanceRejectionReasonIsRequired, status: 400,
    });
    db.budgetContribution.findFirst.mockResolvedValueOnce(null);
    await expect(rejectFinanceBudget(request({ contributionId: 'missing', reason: 'Overrun' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.budgetContributionNotFound, status: 404,
    });
    const contribution = {
      id: 'budget-1', projectId: 'project-1', boqRevisionId: 'revision-1', costCentreId: 'cc-1',
      costCentre: { code: 'CC-1' }, totalEstimatedValue: 800,
    };
    db.budgetContribution.findFirst.mockResolvedValueOnce(contribution);
    db.budgetContribution.update.mockResolvedValueOnce({ ...contribution, status: 'REJECTED' });
    await expect(rejectFinanceBudget(request({ contributionId: 'budget-1', reason: '  Over budget  ' }))).resolves.toMatchObject({
      ok: true, data: { status: 'REJECTED' },
    });
    expect(db.budgetApproval.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ approvalLevel: 'FINANCE', reason: 'Over budget' }) });
    expect(db.budgetTransaction.updateMany).toHaveBeenLastCalledWith({ where: { contributionId: 'budget-1' }, data: { status: 'REJECTED' } });
    expect(db.boqRevision.update).toHaveBeenLastCalledWith({ where: { id: 'revision-1' }, data: { budgetStatus: 'BUDGET_REJECTED' } });

    auth.mockResolvedValueOnce({ status: 403 });
    isContext.mockReturnValueOnce(false);
    await expect(rejectProjectBudget(request({ contributionId: 'budget-2', reason: 'Overrun' }))).resolves.toEqual({ status: 403 });
    await expect(rejectProjectBudget(request({}))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.contributionIDIsRequired, status: 400 });
    await expect(rejectProjectBudget(request({ contributionId: 'budget-2', reason: ' ' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.mandatoryRejectionReasonMustBeProvided, status: 400,
    });
    db.budgetContribution.findFirst.mockResolvedValueOnce(null);
    await expect(rejectProjectBudget(request({ contributionId: 'missing', reason: 'Overrun' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.budgetContributionNotFound, status: 404,
    });
    db.budgetContribution.findFirst.mockResolvedValueOnce({ ...contribution, id: 'budget-2' });
    db.budgetContribution.update.mockResolvedValueOnce({ id: 'budget-2', status: 'REJECTED' });
    db.budget.findFirst.mockResolvedValueOnce(null);
    await expect(rejectProjectBudget(request({ contributionId: 'budget-2', reason: 'Not aligned' }))).resolves.toMatchObject({
      ok: true, data: { status: 'REJECTED' },
    });
    expect(db.budget.update).not.toHaveBeenCalled();

    db.budgetContribution.findFirst.mockResolvedValueOnce({ ...contribution, id: 'budget-3' });
    db.budgetContribution.update.mockResolvedValueOnce({ id: 'budget-3', status: 'REJECTED' });
    db.budget.findFirst.mockResolvedValueOnce({ id: 'budget-record-1', pendingAmount: 200 });
    await rejectProjectBudget(request({ contributionId: 'budget-3', reason: 'Not aligned' }));
    expect(db.budget.update).toHaveBeenLastCalledWith({ where: { id: 'budget-record-1' }, data: { pendingAmount: 0 } });

    db.budgetContribution.findFirst.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(rejectFinanceBudget(request({ contributionId: 'budget-4', reason: 'Overrun' }))).resolves.toEqual({
      ok: false, error: 'database unavailable', status: 500,
    });
    db.budgetContribution.findFirst.mockRejectedValueOnce({});
    await expect(rejectProjectBudget(request({ contributionId: 'budget-4', reason: 'Overrun' }))).resolves.toEqual({
      ok: false, error: 'Project budget rejection failed.', status: 500,
    });
  });

  it('approves project and finance budgets with direct approval, budget aggregation, and validation', async () => {
    const contribution = {
      id: 'budget-approve-1', status: 'PENDING_PROJECT_APPROVAL', projectId: 'project-1', costCentreId: 'cc-1',
      boqRevisionId: 'revision-1', costCentre: { code: 'CC-1' }, acceptedEstimatedValue: 700, totalEstimatedValue: 850,
    };
    auth.mockResolvedValueOnce({ status: 403 });
    isContext.mockReturnValueOnce(false);
    await expect(approveProjectBudget(request({ contributionId: 'budget-approve-1' }))).resolves.toEqual({ status: 403 });
    await expect(approveProjectBudget(request({}))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.contributionIDIsRequired, status: 400 });
    db.budgetContribution.findFirst.mockResolvedValueOnce(null);
    await expect(approveProjectBudget(request({ contributionId: 'missing' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.budgetContributionNotFound, status: 404 });
    db.budgetContribution.findFirst.mockResolvedValueOnce({ ...contribution, status: 'REJECTED' });
    await expect(approveProjectBudget(request({ contributionId: 'budget-approve-1' }))).resolves.toMatchObject({ ok: false, status: 400 });

    db.budgetContribution.findFirst.mockResolvedValueOnce(contribution);
    db.budgetContribution.update.mockResolvedValueOnce({ status: 'PENDING_FINANCE_APPROVAL' });
    await approveProjectBudget(request({ contributionId: 'budget-approve-1', remarks: '' }));
    expect(db.budgetApproval.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({
      reason: 'Project level scope and commercial estimate approved.', approvalLevel: 'PROJECT_APPROVER',
    }) });
    expect(db.boqRevision.update).toHaveBeenLastCalledWith({ where: { id: 'revision-1' }, data: { budgetStatus: 'BUDGET_UNDER_FINANCE_APPROVAL' } });

    auth.mockResolvedValueOnce({ ...context, role: 'SUPER_ADMIN' });
    db.budgetContribution.findFirst.mockResolvedValueOnce({ ...contribution, status: 'UNDER_APPROVAL' });
    db.budgetContribution.update.mockResolvedValueOnce({ status: 'APPROVED' });
    db.budget.findFirst.mockResolvedValueOnce({ id: 'budget-record-1', approvedAmount: 100, pendingAmount: 1000 });
    await approveProjectBudget(request({ contributionId: 'budget-approve-1', directApprove: true, remarks: 'Approved' }));
    expect(db.budget.update).toHaveBeenLastCalledWith({ where: { id: 'budget-record-1' }, data: {
      approvedAmount: 800, pendingAmount: 150, status: UI_STRINGS.common.aPPROVED,
    } });

    auth.mockResolvedValueOnce({ ...context, role: 'CLIENT_ADMIN' });
    db.budgetContribution.findFirst.mockResolvedValueOnce(contribution);
    db.budgetContribution.update.mockResolvedValueOnce({ status: 'APPROVED' });
    db.budget.findFirst.mockResolvedValueOnce(null);
    await approveProjectBudget(request({ contributionId: 'budget-approve-1', directApprove: true }));
    expect(db.budget.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({
      tenantId: 'tenant-1', projectId: 'project-1', costCentreId: 'cc-1', totalAmount: 700, approvedAmount: 700,
    }) });

    auth.mockResolvedValueOnce({ ...context, role: 'PROJECT_USER' });
    db.budgetContribution.findFirst.mockResolvedValueOnce(contribution);
    db.budgetContribution.update.mockResolvedValueOnce({ status: 'PENDING_FINANCE_APPROVAL' });
    await approveProjectBudget(request({ contributionId: 'budget-approve-1', directApprove: true }));
    expect(db.budgetContribution.update).toHaveBeenLastCalledWith({ where: { id: 'budget-approve-1' }, data: expect.objectContaining({ status: 'PENDING_FINANCE_APPROVAL' }) });

    auth.mockResolvedValueOnce({ status: 403 });
    isContext.mockReturnValueOnce(false);
    await expect(approveFinanceBudget(request({ contributionId: 'budget-approve-1' }))).resolves.toEqual({ status: 403 });
    db.budgetContribution.findFirst.mockResolvedValueOnce(null);
    await expect(approveFinanceBudget(request({ contributionId: 'missing' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.budgetContributionNotFound, status: 404,
    });
    await expect(approveFinanceBudget(request({}))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.contributionIDIsRequired, status: 400 });
    db.budgetContribution.findFirst.mockResolvedValueOnce({ ...contribution, status: 'PENDING_PROJECT_APPROVAL' });
    await expect(approveFinanceBudget(request({ contributionId: 'budget-approve-1' }))).resolves.toMatchObject({ ok: false, status: 400 });

    db.budgetContribution.findFirst.mockResolvedValueOnce({ ...contribution, status: 'PROJECT_APPROVED' });
    db.budgetContribution.update.mockResolvedValueOnce({ status: 'APPROVED' });
    db.budget.findFirst.mockResolvedValueOnce({ id: 'budget-record-2', totalAmount: 500, approvedAmount: 250, pendingAmount: 500 });
    await expect(approveFinanceBudget(request({ contributionId: 'budget-approve-1', remarks: '' }))).resolves.toMatchObject({
      ok: true, data: { status: 'APPROVED', approvedAmount: 700 },
    });
    expect(db.budgetApproval.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({
      reason: 'Capex financial budget allocation validated and sanctioned.', approvalLevel: 'FINANCE',
    }) });
    expect(db.budget.update).toHaveBeenLastCalledWith({ where: { id: 'budget-record-2' }, data: {
      totalAmount: 1200, approvedAmount: 950, pendingAmount: 0, status: UI_STRINGS.common.aPPROVED,
    } });

    db.budgetContribution.findFirst.mockResolvedValueOnce({ ...contribution, status: 'PENDING_FINANCE_APPROVAL' });
    db.budgetContribution.update.mockResolvedValueOnce({ status: 'APPROVED' });
    db.budget.findFirst.mockResolvedValueOnce(null);
    await approveFinanceBudget(request({ contributionId: 'budget-approve-1', remarks: 'Sanctioned' }));
    expect(db.budget.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ totalAmount: 700, approvedAmount: 700, status: UI_STRINGS.common.aPPROVED }) });

    db.budgetContribution.findFirst.mockRejectedValueOnce(new Error('project approve failed'));
    await expect(approveProjectBudget(request({ contributionId: 'budget-1' }))).resolves.toEqual({
      ok: false, error: 'project approve failed', status: 500,
    });
    db.budgetContribution.findFirst.mockRejectedValueOnce({});
    await expect(approveFinanceBudget(request({ contributionId: 'budget-1' }))).resolves.toEqual({
      ok: false, error: 'Finance budget approval failed.', status: 500,
    });
  });

  it('validates reversals and creates linked negative budget transactions', async () => {
    auth.mockResolvedValueOnce({ status: 403 });
    isContext.mockReturnValueOnce(false);
    await expect(reverseBudgetTransaction(request({ transactionId: 'tx-1', reversalReason: 'Correction' }))).resolves.toEqual({ status: 403 });
    await expect(reverseBudgetTransaction(request({}))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBudgetsReverseRoute.transactionIDIsRequired, status: 400 });
    await expect(reverseBudgetTransaction(request({ transactionId: 'tx-1', reversalReason: ' ' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBudgetsReverseRoute.mandatoryReversalReasonMustBeProvided, status: 400,
    });
    db.budgetTransaction.findFirst = jest.fn();
    db.budgetTransaction.findFirst.mockResolvedValueOnce(null);
    await expect(reverseBudgetTransaction(request({ transactionId: 'missing', reversalReason: 'Fix' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBudgetsReverseRoute.budgetTransactionNotFound, status: 404,
    });
    db.budgetTransaction.findFirst.mockResolvedValueOnce({ isReversal: true });
    await expect(reverseBudgetTransaction(request({ transactionId: 'reverse', reversalReason: 'Fix' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBudgetsReverseRoute.cannotReverseATransactionThatIsAlreadyAReversal, status: 400,
    });
    db.budgetTransaction.findFirst.mockResolvedValueOnce({ isReversal: false, status: 'PENDING' });
    await expect(reverseBudgetTransaction(request({ transactionId: 'pending', reversalReason: 'Fix' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBudgetsReverseRoute.onlyApprovedBudgetTransactionsCanBeReversed, status: 400,
    });

    const transaction = {
      id: 'tx-1', tenantId: 'tenant-1', projectId: 'project-1', costCentreId: 'cc-1', boqId: 'boq-1',
      boqRevisionId: 'revision-1', boqLineId: 'line-1', contributionId: 'contribution-1', category: 'Materials',
      subcategory: 'Cable', amount: 900, quantity: 3, rate: 300, status: 'APPROVED', isReversal: false, transactionCode: 'BTX-0001',
    };
    db.budgetTransaction.findFirst.mockResolvedValueOnce(transaction);
    db.budgetTransaction.count.mockResolvedValueOnce(4);
    db.budgetTransaction.create.mockResolvedValueOnce({ id: 'tx-rev-1', transactionCode: 'BTX-REV-00005' });
    db.budget.findFirst.mockResolvedValueOnce({ id: 'budget-1', approvedAmount: 500, totalAmount: 650 });
    await expect(reverseBudgetTransaction(request({ transactionId: 'tx-1', reversalReason: '  Duplicate entry  ' }))).resolves.toEqual({
      ok: true, data: { originalTransaction: transaction, reversalTransaction: { id: 'tx-rev-1', transactionCode: 'BTX-REV-00005' }, reversedAmount: -900 }, status: 201,
    });
    expect(db.budgetTransaction.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({
      transactionCode: 'BTX-REV-00005', amount: -900, quantity: -3, isReversal: true,
      reversalReason: 'Duplicate entry', reversedTransactionId: 'tx-1', createdBy: 'user-1',
    }) });
    expect(db.budget.update).toHaveBeenLastCalledWith({ where: { id: 'budget-1' }, data: { approvedAmount: 0, totalAmount: 0 } });

    db.budgetTransaction.findFirst.mockResolvedValueOnce({ ...transaction, quantity: 0 });
    db.budgetTransaction.count.mockResolvedValueOnce(10);
    db.budgetTransaction.create.mockResolvedValueOnce({ id: 'tx-rev-2' });
    db.budget.findFirst.mockResolvedValueOnce(null);
    await reverseBudgetTransaction(request({ transactionId: 'tx-1', reversalReason: 'Correction' }));
    expect(db.budgetTransaction.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({
      transactionCode: 'BTX-REV-00011', quantity: null, amount: -900,
    }) });

    db.budgetTransaction.findFirst.mockRejectedValueOnce(new Error('reversal failed'));
    await expect(reverseBudgetTransaction(request({ transactionId: 'tx-1', reversalReason: 'Correction' }))).resolves.toEqual({
      ok: false, error: 'reversal failed', status: 500,
    });
    db.budgetTransaction.findFirst.mockRejectedValueOnce({});
    await expect(reverseBudgetTransaction(request({ transactionId: 'tx-1', reversalReason: 'Correction' }))).resolves.toEqual({
      ok: false, error: 'Transaction reversal failed.', status: 500,
    });
  });
});
