import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { notifyNextResponsibleParty } from '../src/lib/notifications';
import { evaluateVendorProfile } from '../src/lib/vendor-ai-evaluator';
import { POST as lockRates } from '../src/app/api/procurement/rfqs/[id]/lock-rates/route';
import { POST as createReRfq } from '../src/app/api/procurement/rfqs/[id]/re-rfq/route';
import { POST as submitEvaluation } from '../src/app/api/procurement/vendors/[id]/evaluation/route';
import { POST as evaluateVendorAi } from '../src/app/api/procurement/vendors/[id]/evaluate-ai/route';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    rfq: { findFirst: jest.fn(), update: jest.fn(), count: jest.fn(), create: jest.fn() },
    vendor: { findFirst: jest.fn(), update: jest.fn() },
    vendorEvaluation: { create: jest.fn() },
    rfqVendor: { createMany: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));
jest.mock('../src/lib/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('../src/lib/notifications', () => ({ notifyNextResponsibleParty: jest.fn() }));
jest.mock('../src/lib/vendor-ai-evaluator', () => ({ evaluateVendorProfile: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
const notify = notifyNextResponsibleParty as jest.Mock;
const evaluateProfile = evaluateVendorProfile as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1', userName: 'Buyer', role: 'PROCUREMENT_MANAGER' };
const post = (body: unknown) => new NextRequest('http://localhost/api/test', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const routeParams = { params: Promise.resolve({ id: 'record-1' }) };

const vendor = { id: 'vendor-1', name: 'Acme Works', vendorType: 'STANDARD', code: 'AC-1' };
const evaluationReport = {
  criteria: {
    businessProfile: { suggestedScore: 80 }, financialStrength: { suggestedScore: 70 },
    previousClients: { suggestedScore: 75 }, references: { suggestedScore: 65 },
    technicalCapability: { suggestedScore: 90 }, complianceRisk: { suggestedScore: 85 },
  },
  overallWeightedScore: 78,
  qualificationOutcome: 'CONDITIONAL',
  strengths: ['Relevant experience'], weaknesses: ['Limited references'],
  verificationGaps: ['Tax certificate'], contradictions: [], criticalRiskFlags: [],
};

describe('RFQ final-rate lock and Re-RFQ endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
  });

  it('checks authorization, required vendor, RFQ and vendor before locking', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(lockRates(post({ vendorId: 'vendor-1' }), routeParams)).resolves.toBe(denied);
    await expect(lockRates(post({}), routeParams)).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementRfqsIdLockRatesRoute.winningVendorIDIsRequiredToLockRates, status: 400 });

    db.rfq.findFirst.mockResolvedValueOnce(null);
    await expect(lockRates(post({ vendorId: 'vendor-1' }), routeParams)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rFQNotFoundOrAccessDenied, status: 404 });
    db.rfq.findFirst.mockResolvedValueOnce({ estimatedBenchmarkValue: 1000, quotes: [] });
    db.vendor.findFirst.mockResolvedValueOnce(null);
    await expect(lockRates(post({ vendorId: 'vendor-1' }), routeParams)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.vendorNotFound, status: 404 });
  });

  it('locks a quoted vendor at the supplied final value and records savings', async () => {
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', rfqNumber: 'RFQ-1', projectId: 'project-1', estimatedBenchmarkValue: 1000, quotes: [{ totalQuoteAmount: 800 }] });
    db.vendor.findFirst.mockResolvedValueOnce(vendor);
    const updated = { id: 'rfq-1', status: 'FINAL_RATE_LOCKED' };
    db.rfq.update.mockResolvedValueOnce(updated);

    await expect(lockRates(post({ vendorId: 'vendor-1', finalCommercialValue: '750', remarks: 'Final offer' }), routeParams)).resolves.toMatchObject({
      ok: true, data: { rfq: updated, finalVendor: vendor, finalCommercialValue: 750, savings: 250, savingsPercent: 25 },
    });
    expect(db.rfq.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'record-1', tenantId: 'tenant-1' } }));
    expect(db.rfq.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'record-1' }, data: expect.objectContaining({ status: 'FINAL_RATE_LOCKED', finalLockedById: 'user-1' }) }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'FINAL_RATE_LOCKED', entityId: 'rfq-1', newValue: expect.objectContaining({ vendorId: 'vendor-1', finalCommercialValue: 750, savingsPercent: 25, remarks: 'Final offer' }) }));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'FINAL_RATES_LOCKED', entityId: 'rfq-1', details: { vendorName: 'Acme Works', amount: 750 } }));
  });

  it('uses the latest quote as fallback and handles a zero benchmark and failures', async () => {
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', rfqNumber: 'RFQ-1', projectId: 'project-1', estimatedBenchmarkValue: 0, quotes: [{ totalQuoteAmount: 125 }] });
    db.vendor.findFirst.mockResolvedValueOnce(vendor);
    db.rfq.update.mockResolvedValueOnce({ status: 'FINAL_RATE_LOCKED' });
    await expect(lockRates(post({ vendorId: 'vendor-1' }), routeParams)).resolves.toMatchObject({ ok: true, data: { finalCommercialValue: 125, savings: -125, savingsPercent: 0 } });

    db.rfq.findFirst.mockRejectedValueOnce(new Error('lock failed'));
    await expect(lockRates(post({ vendorId: 'vendor-1' }), routeParams)).resolves.toEqual({ ok: false, error: 'lock failed', status: 500 });
    db.rfq.findFirst.mockRejectedValueOnce({});
    await expect(lockRates(post({ vendorId: 'vendor-1' }), routeParams)).resolves.toEqual({ ok: false, error: 'Failed to lock final rates', status: 500 });
  });

  it('validates the Re-RFQ reason and original RFQ access', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(createReRfq(post({ reason: 'reopen' }), routeParams)).resolves.toBe(denied);
    await expect(createReRfq(post({ reason: '' }), routeParams)).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementRfqsIdReRfqRoute.mandatoryJustificationReasonIsRequiredForReRFQ, status: 400 });
    await expect(createReRfq(post({ reason: '   ' }), routeParams)).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementRfqsIdReRfqRoute.mandatoryJustificationReasonIsRequiredForReRFQ, status: 400 });
    db.rfq.findFirst.mockResolvedValueOnce(null);
    await expect(createReRfq(post({ reason: 'Need revised terms' }), routeParams)).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementRfqsIdReRfqRoute.originalRFQNotFoundOrAccessDenied, status: 404 });
  });

  it('clones the RFQ scope, deadline, and original invitees when creating a Re-RFQ', async () => {
    const original = {
      id: 'rfq-1', rfqNumber: 'RFQ-1', title: 'Lighting', projectId: 'project-1', boqRevisionId: 'rev-1',
      scopeOfWork: 'Supply lights', packageType: 'GOODS', packageName: 'Lighting package', commercialValidityDays: 30,
      deliveryRequirement: '30 days', paymentTerms: 'Net 30', taxTerms: 'GST', estimatedBenchmarkValue: 5000, totalLines: 1,
      lines: [{ boqLineId: 'line-1', lineNumber: '1', description: 'LED', specification: 'Commercial', category: 'Electrical', subcategory: 'Lights', uom: 'NOS', quantity: 5, benchmarkRate: 100, benchmarkAmount: 500 }],
      invitedVendors: [{ vendorId: 'vendor-1' }, { vendorId: 'vendor-2' }],
    };
    db.rfq.findFirst.mockResolvedValueOnce(original);
    db.rfq.count.mockResolvedValueOnce(5);
    const created = { id: 'rfq-2', rfqNumber: 'RFQ-1-R1' };
    db.rfq.create.mockResolvedValueOnce(created);
    db.rfqVendor.createMany.mockResolvedValueOnce({ count: 2 });

    await expect(createReRfq(post({ reason: 'Clarify delivery scope', submissionDeadline: '2026-12-01T00:00:00.000Z' }), routeParams)).resolves.toEqual({
      ok: true, data: { reRfq: created, message: 'Re-RFQ RFQ-1-R1 created successfully' }, status: 201,
    });
    expect(db.rfq.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      tenantId: 'tenant-1', projectId: 'project-1', rfqNumber: 'RFQ-1-R1', title: 'Re-RFQ: Lighting', status: 'RELEASED',
      submissionDeadline: new Date('2026-12-01T00:00:00.000Z'), isReRfq: true, originalRfqId: 'rfq-1',
      lines: { create: [expect.objectContaining({ boqLineId: 'line-1', quantity: 5, benchmarkAmount: 500 })] },
    }) });
    expect(db.rfqVendor.createMany).toHaveBeenCalledWith({ data: [
      expect.objectContaining({ tenantId: 'tenant-1', rfqId: 'rfq-2', vendorId: 'vendor-1', invitationStatus: UI_STRINGS.appAppProcurementRfqsNewPage.iNVITED, submissionStatus: UI_STRINGS.common.pENDING }),
      expect.objectContaining({ tenantId: 'tenant-1', rfqId: 'rfq-2', vendorId: 'vendor-2', invitationStatus: UI_STRINGS.appAppProcurementRfqsNewPage.iNVITED, submissionStatus: UI_STRINGS.common.pENDING }),
    ] });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'RERFQ_CREATED', newValue: expect.objectContaining({ vendorCount: 2 }) }));
  });

  it('uses explicitly selected vendors, allows an empty invitation list, and reports creation failures', async () => {
    const original = { id: 'rfq-1', rfqNumber: 'RFQ-1', title: 'Package', projectId: 'project-1', lines: [], invitedVendors: [{ vendorId: 'old-vendor' }] };
    db.rfq.findFirst.mockResolvedValueOnce(original);
    db.rfq.count.mockResolvedValueOnce(1);
    db.rfq.create.mockResolvedValueOnce({ id: 'rfq-2' });
    await createReRfq(post({ reason: 'Use selected vendors', vendorIds: ['new-vendor'] }), routeParams);
    expect(db.rfq.create).toHaveBeenCalledWith({ data: expect.objectContaining({ submissionDeadline: null }) });
    expect(db.rfqVendor.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ vendorId: 'new-vendor' })] });

    db.rfq.findFirst.mockResolvedValueOnce({ ...original, invitedVendors: [] });
    db.rfq.count.mockResolvedValueOnce(1);
    db.rfq.create.mockResolvedValueOnce({ id: 'rfq-3' });
    await createReRfq(post({ reason: 'No vendors yet' }), routeParams);
    expect(db.rfqVendor.createMany).toHaveBeenCalledTimes(1);

    db.rfq.findFirst.mockRejectedValueOnce(new Error('re-rfq failed'));
    await expect(createReRfq(post({ reason: 'Retry' }), routeParams)).resolves.toEqual({ ok: false, error: 're-rfq failed', status: 500 });
    db.rfq.findFirst.mockRejectedValueOnce({});
    await expect(createReRfq(post({ reason: 'Retry' }), routeParams)).resolves.toEqual({ ok: false, error: 'Failed to initiate Re-RFQ', status: 500 });
  });
});

describe('vendor qualification endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
  });

  it('checks access and qualification status before saving a category-manager decision', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(submitEvaluation(post({ qualificationStatus: 'QUALIFIED' }), routeParams)).resolves.toBe(denied);
    db.vendor.findFirst.mockResolvedValueOnce(null);
    await expect(submitEvaluation(post({ qualificationStatus: 'QUALIFIED' }), routeParams)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.vendorNotFoundOrAccessDenied2, status: 404 });
    db.vendor.findFirst.mockResolvedValueOnce(vendor);
    await expect(submitEvaluation(post({ qualificationStatus: 'PENDING' }), routeParams)).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementVendorsIdEvaluationRoute.aValidQualificationStatusIsRequiredQUALIFIEDCONDITIONALLYQUALIFIEDOrNOTQUALIFIED, status: 400,
    });
    expect(db.vendor.findFirst).toHaveBeenLastCalledWith({ where: { id: 'record-1', OR: [{ tenantId: 'tenant-1' }, { vendorType: 'PROCUCEV_VENDOR' }] } });
  });

  it('calculates weighted scores and maps qualification status to empanelment outcomes', async () => {
    const cases = [
      { qualificationStatus: 'QUALIFIED', scores: { businessProfile: 100, financialStrength: 80, previousClients: 75, references: 90, technicalCapability: 85, complianceRisk: 70 }, outcome: 'RECOMMENDED', empanelment: 'APPROVED' },
      { qualificationStatus: 'CONDITIONALLY_QUALIFIED', scores: { businessProfile: 70, financialStrength: 70, previousClients: 70, references: 70, technicalCapability: 70, complianceRisk: 70 }, outcome: 'CONDITIONAL', empanelment: 'PROVISIONAL' },
      { qualificationStatus: 'NOT_QUALIFIED', scores: {}, outcome: 'NOT_RECOMMENDED', empanelment: 'REJECTED' },
      { qualificationStatus: 'NOT_QUALIFIED', scores: { businessProfile: 0, financialStrength: 100, previousClients: 0, references: 0, technicalCapability: 0, complianceRisk: 0 }, outcome: 'NOT_RECOMMENDED', empanelment: 'REJECTED' },
      { qualificationStatus: 'QUALIFIED', scores: {}, overallWeightedScore: 90, outcome: 'RECOMMENDED', empanelment: 'APPROVED' },
    ];

    for (const [index, testCase] of cases.entries()) {
      db.vendor.findFirst.mockResolvedValueOnce(vendor);
      const evaluation = { id: `evaluation-${index}`, qualificationOutcome: testCase.outcome };
      db.vendorEvaluation.create.mockResolvedValueOnce(evaluation);
      const updatedVendor = { ...vendor, qualificationStatus: testCase.qualificationStatus };
      db.vendor.update.mockResolvedValueOnce(updatedVendor);
      const body = {
        qualificationStatus: testCase.qualificationStatus,
        scores: testCase.scores,
        ...('overallWeightedScore' in testCase ? { overallWeightedScore: testCase.overallWeightedScore } : {}),
        ...(index === 0 ? { criteriaDetails: { source: 'review' }, decisionRemarks: 'Reviewed', qualificationDecision: 'RECOMMENDED' } : {}),
      };
      await expect(submitEvaluation(post(body), routeParams)).resolves.toMatchObject({ ok: true, data: { vendor: updatedVendor, evaluation } });
      expect(db.vendor.update).toHaveBeenLastCalledWith({ where: { id: 'vendor-1' }, data: expect.objectContaining({ empanelmentStatus: testCase.empanelment }) });
      expect(db.vendorEvaluation.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({
        tenantId: 'tenant-1', vendorId: 'vendor-1', status: testCase.qualificationStatus, qualificationOutcome: testCase.outcome,
      }) });
    }
    expect(db.vendorEvaluation.create.mock.calls[0][0].data.overallWeightedScore).toBe(84);
    expect(db.vendorEvaluation.create.mock.calls[0][0].data.criteriaDetails).toBe(JSON.stringify({ source: 'review' }));
    expect(db.vendorEvaluation.create.mock.calls[0][0].data.decisionRemarks).toBe('Reviewed');
    expect(db.vendorEvaluation.create.mock.calls[1][0].data.criteriaDetails).toBeNull();
    expect(db.vendorEvaluation.create.mock.calls[2][0].data.overallWeightedScore).toBe(0);
    expect(audit).toHaveBeenCalledTimes(5);
  });

  it('accepts explicit scores and decisions and returns useful failures', async () => {
    db.vendor.findFirst.mockResolvedValueOnce(vendor);
    db.vendorEvaluation.create.mockResolvedValueOnce({ id: 'evaluation-explicit', qualificationOutcome: 'CONDITIONAL' });
    db.vendor.update.mockResolvedValueOnce(vendor);
    await submitEvaluation(post({ qualificationStatus: 'QUALIFIED', overallWeightedScore: 70, qualificationDecision: 'CONDITIONAL', criteriaDetails: 'manual review' }), routeParams);
    expect(db.vendorEvaluation.create).toHaveBeenCalledWith({ data: expect.objectContaining({ overallWeightedScore: 70, qualificationOutcome: UI_STRINGS.appAppProcurementVendorsIdPage.cONDITIONAL, criteriaDetails: 'manual review' }) });

    db.vendor.findFirst.mockRejectedValueOnce(new Error('evaluation failed'));
    await expect(submitEvaluation(post({ qualificationStatus: 'QUALIFIED' }), routeParams)).resolves.toEqual({ ok: false, error: 'evaluation failed', status: 500 });
    db.vendor.findFirst.mockRejectedValueOnce({});
    await expect(submitEvaluation(post({ qualificationStatus: 'QUALIFIED' }), routeParams)).resolves.toEqual({ ok: false, error: 'Failed to submit vendor qualification', status: 500 });
  });

  it('runs the AI evaluator, persists its evidence, and leaves final qualification for a person', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(evaluateVendorAi(post({}), routeParams)).resolves.toBe(denied);
    db.vendor.findFirst.mockResolvedValueOnce(null);
    await expect(evaluateVendorAi(post({}), routeParams)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.vendorNotFoundOrAccessDenied2, status: 404 });

    db.vendor.findFirst.mockResolvedValueOnce({ ...vendor, contactPerson: 'Buyer', email: 'acme@example.test', categories: ['Electrical'], documents: [] });
    evaluateProfile.mockReturnValueOnce(evaluationReport);
    const evaluation = { id: 'ai-evaluation-1' };
    db.vendorEvaluation.create.mockResolvedValueOnce(evaluation);
    db.vendor.update.mockResolvedValueOnce(vendor);
    await expect(evaluateVendorAi(post({}), routeParams)).resolves.toMatchObject({
      ok: true, data: { evaluation, report: evaluationReport, message: 'AI Evaluation completed. Suggested score: 78% (CONDITIONAL).' },
    });
    expect(evaluateProfile).toHaveBeenCalledWith(expect.objectContaining({ id: 'vendor-1', email: 'acme@example.test', categories: [UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical] }));
    expect(db.vendorEvaluation.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      tenantId: 'tenant-1', vendorId: 'vendor-1', status: 'AI_GENERATED', overallWeightedScore: 78,
      criteriaDetails: JSON.stringify(evaluationReport.criteria), criticalRiskFlags: '[]',
    }) });
    expect(db.vendor.update).toHaveBeenCalledWith({ where: { id: 'vendor-1' }, data: { qualificationStatus: UI_STRINGS.appAppProcurementVendorsPage.pENDINGREVIEW, qualificationScore: 78, qualificationDecision: UI_STRINGS.appAppProcurementVendorsIdPage.cONDITIONAL } });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'VENDOR_AI_EVALUATED', entityId: 'vendor-1' }));
  });

  it('reports AI evaluation storage failures', async () => {
    db.vendor.findFirst.mockResolvedValueOnce(vendor);
    evaluateProfile.mockReturnValueOnce(evaluationReport);
    db.vendorEvaluation.create.mockRejectedValueOnce(new Error('AI save failed'));
    await expect(evaluateVendorAi(post({}), routeParams)).resolves.toEqual({ ok: false, error: 'AI save failed', status: 500 });
    db.vendor.findFirst.mockRejectedValueOnce({});
    await expect(evaluateVendorAi(post({}), routeParams)).resolves.toEqual({ ok: false, error: 'Failed to run AI evaluation', status: 500 });
  });
});
