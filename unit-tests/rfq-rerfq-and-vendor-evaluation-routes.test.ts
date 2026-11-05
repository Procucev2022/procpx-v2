import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { dispatchPreparedWorkflowNotification, notifyNextResponsibleParty } from '../src/lib/notifications';
import { evaluateVendorProfile } from '../src/lib/vendor-ai-evaluator';
import { POST as lockRates } from '../src/app/api/procurement/rfqs/[id]/lock-rates/route';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { persistVendorEvaluationAtomically } from '../src/lib/vendor-evaluation-persistence';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { POST as createReRfq } from '../src/app/api/procurement/rfqs/[id]/re-rfq/route';
import { POST as submitEvaluation } from '../src/app/api/procurement/vendors/[id]/evaluation/route';
import { POST as evaluateVendorAi } from '../src/app/api/procurement/vendors/[id]/evaluate-ai/route';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    rfq: { findFirst: jest.fn(), update: jest.fn(), count: jest.fn(), create: jest.fn() },
    rfqLine: { count: jest.fn() },
    rfqVendor: { findFirst: jest.fn(), createMany: jest.fn(), count: jest.fn() },
    quote: { findFirst: jest.fn() },
    vendor: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    vendorEvaluation: { create: jest.fn(), findFirst: jest.fn() },
    auditLog: { findFirst: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));
jest.mock('../src/lib/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('../src/lib/notifications', () => ({
  dispatchPreparedWorkflowNotification: jest.fn(),
  notifyNextResponsibleParty: jest.fn(),
}));
jest.mock('../src/lib/vendor-ai-evaluator', () => ({ evaluateVendorProfile: jest.fn() }));
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
const notify = notifyNextResponsibleParty as jest.Mock;
const dispatchPrepared = dispatchPreparedWorkflowNotification as jest.Mock;
const evaluateProfile = evaluateVendorProfile as jest.Mock;
const d1Batch = writeD1BatchAtomically as jest.Mock;
const structuredLog = writeStructuredLog as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1', userName: 'Buyer', role: 'PROCUREMENT_MANAGER' };
const post = (body: unknown) => new NextRequest('http://localhost/api/test', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const routeParams = { params: Promise.resolve({ id: 'record-1' }) };

const vendor = {
  id: 'vendor-1', tenantId: 'tenant-1', name: 'Acme Works', vendorType: 'STANDARD', code: 'AC-1',
  updatedAt: new Date('2025-01-01T00:00:00.000Z'), qualificationStatus: 'NOT_EVALUATED',
  qualificationScore: null, qualificationDecision: null, empanelmentStatus: 'PENDING',
};
const reRfqSource = (overrides: Record<string, unknown> = {}) => ({
  id: 'rfq-1', tenantId: 'tenant-1', originalRfqId: null, rfqNumber: 'RFQ-1', title: 'Package',
  projectId: 'project-1', boqRevisionId: 'revision-1', lines: [], invitedVendors: [], ...overrides,
});
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
    d1Batch.mockImplementation((statements: unknown[]) => Promise.resolve(statements.map(() => ({ meta: { changes: 1 } }))));
    notify.mockImplementation((input: Record<string, unknown>, options?: { prepareOnly?: boolean }) => options?.prepareOnly ? ({
      tenantId: input.tenantId, targetRole: 'PROCUREMENT_USER', title: 'Rates locked', message: 'Prepare award',
      type: 'ACTION_REQUIRED', entityType: 'RFQ', entityId: input.entityId, recordNumber: input.recordNumber,
      link: '/procurement/rfqs/rfq-1?tab=awarding',
    }) : undefined);
    dispatchPrepared.mockResolvedValue(undefined);
  });

  it('checks authorization, required vendor, RFQ and vendor before locking', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(lockRates(post({ vendorId: 'vendor-1' }), routeParams)).resolves.toBe(denied);
    await expect(lockRates(post({}), routeParams)).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementRfqsIdLockRatesRoute.winningVendorIDIsRequiredToLockRates, status: 400 });

    db.rfq.findFirst.mockResolvedValueOnce(null);
    await expect(lockRates(post({ vendorId: 'vendor-1' }), routeParams)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rFQNotFoundOrAccessDenied, status: 404 });
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', tenantId: 'tenant-1', rfqNumber: 'RFQ-1', projectId: 'project-1', status: 'COMPARISON', estimatedBenchmarkValue: 1000 });
    db.vendor.findFirst.mockResolvedValueOnce(null);
    await expect(lockRates(post({ vendorId: 'vendor-1' }), routeParams)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.vendorNotFound, status: 404 });

    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', status: 'DRAFT', estimatedBenchmarkValue: 1000 });
    await expect(lockRates(post({ vendorId: 'vendor-1' }), routeParams)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409 });
  });

  it('locks a quoted vendor at the supplied final value and records savings', async () => {
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', tenantId: 'tenant-1', rfqNumber: 'RFQ-1', projectId: 'project-1', status: 'NEGOTIATION', estimatedBenchmarkValue: 1000 });
    db.vendor.findFirst.mockResolvedValueOnce(vendor);
    db.rfqVendor.findFirst.mockResolvedValueOnce({ id: 'invite-1' });
    db.quote.findFirst.mockResolvedValueOnce({ id: 'quote-1', totalQuoteAmount: 800 });

    await expect(lockRates(post({ vendorId: 'vendor-1', finalCommercialValue: '0', remarks: 'Final offer' }), routeParams)).resolves.toMatchObject({
      ok: true, data: { rfq: { id: 'rfq-1', status: 'FINAL_RATE_LOCKED', finalLockedById: 'user-1' }, finalVendor: vendor, finalCommercialValue: 0, savings: 1000, savingsPercent: 100 },
    });
    expect(db.rfq.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'record-1', tenantId: 'tenant-1' } }));
    const lockBatch = d1Batch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(lockBatch).toEqual(expect.arrayContaining([
      expect.objectContaining({ sql: expect.stringContaining("SET \"status\" = 'FINAL_RATE_LOCKED'"), values: expect.arrayContaining(['record-1', 'tenant-1', 'NEGOTIATION', 'vendor-1']) }),
      expect.objectContaining({ sql: expect.stringContaining('INSERT INTO "audit_logs"'), values: expect.arrayContaining(['FINAL_RATE_LOCKED']) }),
      expect.objectContaining({ sql: expect.stringContaining('notification_outbox') }),
    ]));
    expect(JSON.parse(String(lockBatch[2].values[2])).recordNumber).toBe('RFQ-1');
    expect(audit).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'FINAL_RATES_LOCKED', entityId: 'rfq-1', details: { vendorName: 'Acme Works', amount: 0 } }), { prepareOnly: true });
    expect(dispatchPrepared).toHaveBeenCalledWith(expect.any(String), expect.any(Date), expect.objectContaining({ entityId: 'rfq-1' }));
  });

  it('uses the latest quote when no value is supplied and verifies the invited quote evidence', async () => {
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', tenantId: 'tenant-1', rfqNumber: 'RFQ-1', projectId: 'project-1', status: 'COMPARISON', estimatedBenchmarkValue: 0 });
    db.vendor.findFirst.mockResolvedValueOnce(vendor);
    db.rfqVendor.findFirst.mockResolvedValueOnce({ id: 'invite-1' });
    db.quote.findFirst.mockResolvedValueOnce({ id: 'quote-1', totalQuoteAmount: 125 });
    await expect(lockRates(post({ vendorId: 'vendor-1' }), routeParams)).resolves.toMatchObject({ ok: true, data: { finalCommercialValue: 125, savings: -125, savingsPercent: 0 } });

    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', tenantId: 'tenant-1', rfqNumber: 'RFQ-1', projectId: 'project-1', status: 'COMPARISON', estimatedBenchmarkValue: 0 });
    db.vendor.findFirst.mockResolvedValueOnce(vendor);
    db.rfqVendor.findFirst.mockResolvedValueOnce(null);
    await expect(lockRates(post({ vendorId: 'vendor-1' }), routeParams)).resolves.toMatchObject({ ok: false, status: 403 });

    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', tenantId: 'tenant-1', rfqNumber: 'RFQ-1', projectId: 'project-1', status: 'COMPARISON', estimatedBenchmarkValue: 0 });
    db.vendor.findFirst.mockResolvedValueOnce(vendor);
    db.rfqVendor.findFirst.mockResolvedValueOnce({ id: 'invite-1' });
    db.quote.findFirst.mockResolvedValueOnce(null);
    await expect(lockRates(post({ vendorId: 'vendor-1' }), routeParams)).resolves.toMatchObject({ ok: false, status: 409 });
  });

  it('returns conflict on a stale D1 transition and records failures without leaking exception text', async () => {
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', tenantId: 'tenant-1', rfqNumber: 'RFQ-1', projectId: 'project-1', status: 'COMPARISON', estimatedBenchmarkValue: 0 });
    db.vendor.findFirst.mockResolvedValueOnce(vendor);
    db.rfqVendor.findFirst.mockResolvedValueOnce({ id: 'invite-1' });
    db.quote.findFirst.mockResolvedValueOnce({ id: 'quote-1', totalQuoteAmount: 125 });
    d1Batch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 0 } }]);
    await expect(lockRates(post({ vendorId: 'vendor-1' }), routeParams)).resolves.toMatchObject({ ok: false, status: 409 });

    db.rfq.findFirst.mockRejectedValueOnce(new Error('private database detail'));
    await expect(lockRates(post({ vendorId: 'vendor-1' }), routeParams)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToLockFinalRates, status: 500 });
    expect(structuredLog).toHaveBeenCalledWith('error', 'procurement.final_rates_lock_failed', expect.objectContaining({ rfqId: 'record-1', tenantId: 'tenant-1' }), 'application');
  });

  it('commits the rate-lock notification with the transition for scheduled retry', async () => {
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', tenantId: 'tenant-1', rfqNumber: 'RFQ-1', projectId: 'project-1', status: 'NEGOTIATION', estimatedBenchmarkValue: 1000 });
    db.vendor.findFirst.mockResolvedValueOnce(vendor);
    db.rfqVendor.findFirst.mockResolvedValueOnce({ id: 'invite-1' });
    db.quote.findFirst.mockResolvedValueOnce({ id: 'quote-1', totalQuoteAmount: 800 });
    await expect(lockRates(post({ vendorId: 'vendor-1' }), routeParams)).resolves.toMatchObject({ ok: true });
    const statements = d1Batch.mock.calls.at(-1)?.[0] as Array<{ sql: string }>;
    expect(statements.some(({ sql }) => sql.includes('notification_outbox'))).toBe(true);
    expect(dispatchPrepared).toHaveBeenCalledTimes(1);
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

  it('rejects malformed Re-RFQ payloads and bounded-scope violations before writing', async () => {
    const badJson = new NextRequest('http://localhost/api/test', { method: 'POST', body: '{' });
    await expect(createReRfq(badJson, routeParams)).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(createReRfq(post(null), routeParams)).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(createReRfq(post({ reason: 7 }), routeParams)).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(createReRfq(post({ reason: 'x'.repeat(1_001) }), routeParams)).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(createReRfq(post({ reason: 'Valid', vendorIds: 'vendor-1' }), routeParams)).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(createReRfq(post({ reason: 'Valid', vendorIds: [''] }), routeParams)).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(createReRfq(post({ reason: 'Valid', vendorIds: [7] }), routeParams)).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(createReRfq(post({ reason: 'Valid', vendorIds: ['v'.repeat(129)] }), routeParams)).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(createReRfq(post({ reason: 'Valid', vendorIds: Array.from({ length: 501 }, (_, index) => `vendor-${index}`) }), routeParams)).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(createReRfq(post({ reason: 'Valid', submissionDeadline: 1 }), routeParams)).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(createReRfq(post({ reason: 'Valid', submissionDeadline: 'not-a-date' }), routeParams)).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(createReRfq(post({ reason: 'Valid', submissionDeadline: '2000-01-01T00:00:00.000Z' }), routeParams)).resolves.toMatchObject({ ok: false, status: 400 });
    expect(db.rfq.findFirst).not.toHaveBeenCalled();
  });

  it('rejects oversized inherited records, missing Re-RFQ roots, and vendors outside the tenant scope', async () => {
    db.rfq.findFirst.mockResolvedValueOnce(reRfqSource({ lines: Array.from({ length: 501 }, () => ({})) }));
    await expect(createReRfq(post({ reason: 'Too many lines' }), routeParams)).resolves.toMatchObject({ ok: false, status: 400 });

    db.rfq.findFirst.mockResolvedValueOnce(reRfqSource({ originalRfqId: 'root-rfq' }));
    db.rfq.findFirst.mockResolvedValueOnce(null);
    await expect(createReRfq(post({ reason: 'Missing root' }), routeParams)).resolves.toMatchObject({ ok: false, status: 404 });

    db.rfq.findFirst.mockResolvedValueOnce(reRfqSource());
    db.vendor.findMany.mockResolvedValueOnce([]);
    await expect(createReRfq(post({ reason: 'Unknown vendor', vendorIds: ['foreign-vendor'] }), routeParams)).resolves.toMatchObject({ ok: false, status: 400 });

    db.rfq.findFirst.mockResolvedValueOnce(reRfqSource({ lines: [{ lineNumber: '1', description: 'x'.repeat(1_800_000), uom: 'EA', quantity: 1 }] }));
    await expect(createReRfq(post({ reason: 'Oversized source line' }), routeParams)).resolves.toMatchObject({ ok: false, status: 400 });
    expect(d1Batch).not.toHaveBeenCalled();
  });

  it('recovers a committed Re-RFQ after an ambiguous D1 response and logs incomplete failures', async () => {
    const original = reRfqSource();
    db.rfq.findFirst.mockResolvedValueOnce(original);
    d1Batch.mockImplementationOnce(async (statements: Array<{ values: unknown[] }>) => {
      const generatedRfqId = statements[0].values[0] as string;
      const generatedAuditId = statements[3].values[0] as string;
      db.rfq.findFirst.mockResolvedValueOnce({ id: generatedRfqId, rfqNumber: 'RFQ-1-R1' });
      db.auditLog.findFirst.mockResolvedValueOnce({ id: generatedAuditId });
      db.rfqLine.count.mockResolvedValueOnce(0);
      db.rfqVendor.count.mockResolvedValueOnce(0);
      structuredLog.mockRejectedValueOnce(new Error('optional log write failed'));
      throw new Error('D1 response was lost after commit');
    });
    await expect(createReRfq(post({ reason: 'Confirm the successful commit' }), routeParams)).resolves.toMatchObject({ ok: true, status: 201, data: { reRfq: { rfqNumber: 'RFQ-1-R1' } } });

    db.rfq.findFirst.mockResolvedValueOnce(original);
    d1Batch.mockRejectedValueOnce({ detail: 'not confirmed' });
    db.rfq.findFirst.mockResolvedValueOnce(null);
    db.auditLog.findFirst.mockResolvedValueOnce(null);
    db.rfqLine.count.mockResolvedValueOnce(0);
    db.rfqVendor.count.mockResolvedValueOnce(0);
    structuredLog.mockRejectedValueOnce(new Error('optional error log unavailable'));
    await expect(createReRfq(post({ reason: 'Unconfirmed result' }), routeParams)).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToInitiateReRfq, status: 500,
    });
  });

  it('atomically clones RFQ scope, lines, invited vendors, and audit with preserved source references', async () => {
    const original = {
      id: 'rfq-1', tenantId: 'tenant-1', originalRfqId: null, rfqNumber: 'RFQ-1', title: 'Lighting', projectId: 'project-1', boqRevisionId: 'rev-1',
      scopeOfWork: 'Supply lights', packageType: 'GOODS', packageName: 'Lighting package', commercialValidityDays: 30,
      deliveryRequirement: '30 days', paymentTerms: 'Net 30', taxTerms: 'GST', estimatedBenchmarkValue: 5000, totalLines: 1,
      lines: [{ projectId: 'project-1', costCentreId: 'cc-1', boqId: 'boq-1', boqRevisionId: 'rev-1', boqLineId: 'line-1', prLineId: 'pr-line-1', lineNumber: '1', description: 'LED', specification: 'Commercial', category: 'Electrical', subcategory: 'Lights', uom: 'NOS', quantity: 5, benchmarkRate: 100, benchmarkAmount: 500 }],
      invitedVendors: [{ vendorId: 'vendor-1' }, { vendorId: 'vendor-2' }],
    };
    db.rfq.findFirst.mockResolvedValueOnce(original);
    const created = { id: 'rfq-2', rfqNumber: 'RFQ-1-R1' };
    db.rfq.findFirst.mockResolvedValueOnce(created);
    db.vendor.findMany.mockResolvedValueOnce([{ id: 'vendor-1' }, { id: 'vendor-2' }]);
    d1Batch.mockResolvedValueOnce([{ meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 2 } }, { meta: { changes: 1 } }]);

    await expect(createReRfq(post({ reason: 'Clarify delivery scope', submissionDeadline: '2026-12-01T00:00:00.000Z' }), routeParams)).resolves.toEqual({
      ok: true, data: { reRfq: created, message: 'Re-RFQ RFQ-1-R1 created successfully' }, status: 201,
    });
    const statements = d1Batch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(statements).toHaveLength(4);
    expect(statements[0].sql).toContain('MAX(CAST(substr(candidate."rfqNumber"');
    expect(statements[0].sql).toContain("'-R' ||");
    expect(statements[0].values).toEqual([
      expect.any(String), 'Re-RFQ: Lighting', new Date('2026-12-01T00:00:00.000Z'), 1, 'Clarify delivery scope',
      expect.any(Date), expect.any(Date), expect.any(Date), 'user-1', 'record-1', 'tenant-1',
    ]);
    const copiedLines = JSON.parse(String(statements[1].values[2]));
    expect(copiedLines).toEqual([expect.objectContaining({ projectId: 'project-1', costCentreId: 'cc-1', boqId: 'boq-1', boqRevisionId: 'rev-1', boqLineId: 'line-1', prLineId: 'pr-line-1', quantity: 5, benchmarkAmount: 500 })]);
    expect(JSON.parse(String(statements[2].values[3]))).toEqual([
      expect.objectContaining({ vendorId: 'vendor-1' }), expect.objectContaining({ vendorId: 'vendor-2' }),
    ]);
    expect(statements[3].sql).toContain('INSERT INTO "audit_logs"');
    expect(statements[3].values).toEqual([
      expect.any(String), 'tenant-1', 'user-1', expect.any(String), expect.any(String),
      JSON.stringify({ id: 'rfq-1', rfqNumber: 'RFQ-1' }),
      JSON.stringify({ originalRfqId: 'rfq-1', newRfqId: statements[0].values[0], reason: 'Clarify delivery scope', lineCount: 1, vendorCount: 2 }),
      null, expect.any(Date), statements[0].values[0], 'tenant-1',
    ]);
    expect(db.vendor.findMany).toHaveBeenCalledWith({ where: {
      id: { in: ['vendor-1', 'vendor-2'] }, OR: [{ tenantId: 'tenant-1' }, { vendorType: 'PROCUCEV_VENDOR' }], isBlacklisted: false,
    }, select: { id: true } });
    expect(audit).not.toHaveBeenCalled();
  });

  it('uses explicitly selected vendors, allows an empty invitation list, and reports creation failures', async () => {
    const original = { id: 'rfq-1', tenantId: 'tenant-1', originalRfqId: null, rfqNumber: 'RFQ-1', title: 'Package', projectId: 'project-1', lines: [], invitedVendors: [{ vendorId: 'old-vendor' }] };
    db.rfq.findFirst.mockResolvedValueOnce(original);
    db.vendor.findMany.mockResolvedValueOnce([{ id: 'new-vendor' }]);
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-2', rfqNumber: 'RFQ-1-R1' });
    d1Batch.mockResolvedValueOnce([{ meta: { changes: 1 } }, { meta: { changes: 0 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    await expect(createReRfq(post({ reason: 'Use selected vendors', vendorIds: ['new-vendor'] }), routeParams)).resolves.toMatchObject({ ok: true, status: 201 });
    expect(JSON.parse(String(d1Batch.mock.calls.at(-1)?.[0][2].values[3]))).toEqual([expect.objectContaining({ vendorId: 'new-vendor' })]);

    db.rfq.findFirst.mockResolvedValueOnce({ ...original, invitedVendors: [] });
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-3', rfqNumber: 'RFQ-1-R2' });
    d1Batch.mockResolvedValueOnce([{ meta: { changes: 1 } }, { meta: { changes: 0 } }, { meta: { changes: 0 } }, { meta: { changes: 1 } }]);
    await expect(createReRfq(post({ reason: 'No vendors yet' }), routeParams)).resolves.toMatchObject({ ok: true, status: 201 });
    expect(db.vendor.findMany).toHaveBeenCalledTimes(1);

    db.rfq.findFirst.mockRejectedValueOnce(new Error('re-rfq failed'));
    await expect(createReRfq(post({ reason: 'Retry' }), routeParams)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToInitiateReRfq, status: 500 });
    db.rfq.findFirst.mockRejectedValueOnce({});
    await expect(createReRfq(post({ reason: 'Retry' }), routeParams)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToInitiateReRfq, status: 500 });
  });
});

describe('vendor qualification endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    d1Batch.mockImplementation((statements: unknown[]) => Promise.resolve(statements.map(() => ({ meta: { changes: 1 } }))));
  });

  it('checks atomic vendor-evaluation row counts for owned and shared vendors', async () => {
    const input = {
      tenantId: 'tenant-1', vendorId: 'vendor-1', expectedVendorUpdatedAt: new Date('2025-01-01T00:00:00.000Z'),
      requiresVendorUpdate: false,
      vendorUpdate: {
        qualificationStatus: 'QUALIFIED', qualificationScore: 90, qualificationDecision: 'RECOMMENDED',
        evaluatedAt: null, evaluatedById: null, empanelmentStatus: 'APPROVED', updatedAt: new Date(),
      },
      evaluation: { id: 'evaluation-1', evaluatedBy: 'user-1' },
      audit: {
        id: 'audit-1', userId: 'user-1', action: 'VENDOR_QUALIFIED', description: 'Qualified',
        oldValue: {}, newValue: {}, userAgent: null, createdAt: new Date(),
      },
    };
    d1Batch.mockResolvedValueOnce([{}, { meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    await expect(persistVendorEvaluationAtomically(input)).resolves.toBeUndefined();

    d1Batch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    await expect(persistVendorEvaluationAtomically({ ...input, requiresVendorUpdate: true })).rejects.toThrow();
    d1Batch.mockResolvedValueOnce([{ meta: { changes: 1 } }, { meta: { changes: 0 } }, { meta: { changes: 1 } }]);
    await expect(persistVendorEvaluationAtomically({ ...input, requiresVendorUpdate: true })).rejects.toThrow();
    d1Batch.mockResolvedValueOnce([{ meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 0 } }]);
    await expect(persistVendorEvaluationAtomically({ ...input, requiresVendorUpdate: true })).rejects.toThrow();
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
      const body = {
        qualificationStatus: testCase.qualificationStatus,
        scores: testCase.scores,
        ...('overallWeightedScore' in testCase ? { overallWeightedScore: testCase.overallWeightedScore } : {}),
        ...(index === 0 ? { criteriaDetails: { source: 'review' }, decisionRemarks: 'Reviewed', qualificationDecision: 'RECOMMENDED' } : {}),
      };
      await expect(submitEvaluation(post(body), routeParams)).resolves.toMatchObject({
        ok: true, data: { vendor: { qualificationStatus: testCase.qualificationStatus, empanelmentStatus: testCase.empanelment }, evaluation: { status: testCase.qualificationStatus, qualificationOutcome: testCase.outcome } },
      });
      expect(db.vendor.update).not.toHaveBeenCalled();
      const [vendorUpdate, evaluationInsert, auditInsert] = d1Batch.mock.calls.at(-1)?.[0] as Array<{ sql: string; values: unknown[] }>;
      expect(vendorUpdate.sql).toContain('UPDATE "vendors"');
      expect(evaluationInsert.sql).toContain('INSERT INTO "vendor_evaluations"');
      expect(JSON.parse(String(evaluationInsert.values[0]))).toMatchObject({
        tenantId: 'tenant-1', vendorId: 'vendor-1', status: testCase.qualificationStatus, qualificationOutcome: testCase.outcome,
      });
      expect(auditInsert.sql).toContain('INSERT INTO "audit_logs"');
    }
    const firstEvaluation = JSON.parse(String(d1Batch.mock.calls[0][0][1].values[0]));
    const secondEvaluation = JSON.parse(String(d1Batch.mock.calls[1][0][1].values[0]));
    const thirdEvaluation = JSON.parse(String(d1Batch.mock.calls[2][0][1].values[0]));
    expect(firstEvaluation.overallWeightedScore).toBe(84);
    expect(firstEvaluation.criteriaDetails).toBe(JSON.stringify({ source: 'review' }));
    expect(firstEvaluation.decisionRemarks).toBe('Reviewed');
    expect(secondEvaluation.criteriaDetails).toBeNull();
    expect(thirdEvaluation.overallWeightedScore).toBe(0);
    expect(audit).not.toHaveBeenCalled();
  });

  it('keeps qualification outcomes tenant-scoped for shared network vendors', async () => {
    db.vendor.findFirst.mockResolvedValueOnce({ ...vendor, tenantId: 'network-tenant', vendorType: 'PROCUCEV_VENDOR' });
    d1Batch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    const response = await submitEvaluation(post({ qualificationStatus: 'QUALIFIED', overallWeightedScore: 91 }), routeParams);
    expect(response).toMatchObject({ ok: true, data: { vendor: { tenantId: 'network-tenant', qualificationStatus: 'QUALIFIED' } } });
    const [vendorUpdate, evaluationInsert] = d1Batch.mock.calls.at(-1)?.[0] as Array<{ values: unknown[] }>;
    expect(vendorUpdate.values[8]).toBe('tenant-1');
    expect(JSON.parse(String(evaluationInsert.values[0]))).toMatchObject({ tenantId: 'tenant-1', vendorId: 'vendor-1', status: 'QUALIFIED' });
    expect(db.vendor.update).not.toHaveBeenCalled();
  });

  it('rejects invalid scores and decisions before persisting vendor qualification', async () => {
    db.vendor.findFirst.mockResolvedValue(vendor);
    await expect(submitEvaluation(post({ qualificationStatus: 'QUALIFIED', scores: { businessProfile: 101 } }), routeParams)).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(submitEvaluation(post({ qualificationStatus: 'QUALIFIED', scores: { businessProfile: 'invalid' } }), routeParams)).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(submitEvaluation(post({ qualificationStatus: 'QUALIFIED', scores: [] }), routeParams)).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(submitEvaluation(post({ qualificationStatus: 'QUALIFIED', scores: { businessProfile: {} } }), routeParams)).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(submitEvaluation(post({ qualificationStatus: 'QUALIFIED', overallWeightedScore: 101 }), routeParams)).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(submitEvaluation(post({ qualificationStatus: 'QUALIFIED', overallWeightedScore: {} }), routeParams)).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(submitEvaluation(post({ qualificationStatus: 'QUALIFIED', qualificationDecision: 'MAYBE' }), routeParams)).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(submitEvaluation(post({ qualificationStatus: 'QUALIFIED', decisionRemarks: 'x'.repeat(4_001) }), routeParams)).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(submitEvaluation(post({ qualificationStatus: 'QUALIFIED', decisionRemarks: 7 }), routeParams)).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(submitEvaluation(post({ qualificationStatus: 'QUALIFIED', criteriaDetails: true }), routeParams)).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(submitEvaluation(post({ qualificationStatus: 'QUALIFIED', criteriaDetails: 'x'.repeat(40_001) }), routeParams)).resolves.toMatchObject({ ok: false, status: 400 });
    expect(d1Batch).not.toHaveBeenCalled();
  });

  it('recovers a committed category-manager evaluation after a lost D1 response', async () => {
    db.vendor.findFirst.mockResolvedValueOnce({ ...vendor, updatedAt: '2025-01-01T00:00:00.000Z' });
    d1Batch.mockImplementationOnce(async (statements: Array<{ values: unknown[] }>) => {
      const evaluation = JSON.parse(String(statements[1].values[0])) as { id: string; status: string; overallWeightedScore: number };
      const auditId = statements[2].values[0] as string;
      db.vendorEvaluation.findFirst.mockResolvedValueOnce(evaluation);
      db.auditLog.findFirst.mockResolvedValueOnce({ id: auditId });
      throw new Error('D1 response lost after commit');
    });
    await expect(submitEvaluation(post({ qualificationStatus: 'QUALIFIED', overallWeightedScore: 95 }), routeParams)).resolves.toMatchObject({
      ok: true, data: { evaluation: { status: 'QUALIFIED', overallWeightedScore: 95 } },
    });
    expect(structuredLog).toHaveBeenCalledWith('warn', 'vendor.evaluation_submit_result_recovered', expect.objectContaining({ vendorId: 'record-1' }));
  });

  it('rejects a vendor record without a usable compare-and-set timestamp', async () => {
    db.vendor.findFirst.mockResolvedValueOnce({ ...vendor, updatedAt: null });
    await expect(submitEvaluation(post({ qualificationStatus: 'QUALIFIED' }), routeParams)).resolves.toMatchObject({ ok: false, status: 409 });
    expect(d1Batch).not.toHaveBeenCalled();
  });

  it('accepts explicit scores and decisions and returns useful failures', async () => {
    db.vendor.findFirst.mockResolvedValueOnce(vendor);
    await submitEvaluation(post({ qualificationStatus: 'QUALIFIED', overallWeightedScore: 70, qualificationDecision: 'CONDITIONAL', criteriaDetails: 'manual review' }), routeParams);
    const explicitEvaluation = JSON.parse(String(d1Batch.mock.calls.at(-1)?.[0][1].values[0]));
    expect(explicitEvaluation).toMatchObject({ overallWeightedScore: 70, qualificationOutcome: UI_STRINGS.appAppProcurementVendorsIdPage.cONDITIONAL, criteriaDetails: 'manual review' });

    db.vendor.findFirst.mockRejectedValueOnce(new Error('evaluation failed'));
    await expect(submitEvaluation(post({ qualificationStatus: 'QUALIFIED' }), routeParams)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToSubmitVendorQualification, status: 500 });
    db.vendor.findFirst.mockRejectedValueOnce({});
    await expect(submitEvaluation(post({ qualificationStatus: 'QUALIFIED' }), routeParams)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToSubmitVendorQualification, status: 500 });
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
    await expect(evaluateVendorAi(post({}), routeParams)).resolves.toMatchObject({
      ok: true, data: { evaluation: { status: 'AI_GENERATED', overallWeightedScore: 78 }, report: evaluationReport, message: 'AI Evaluation completed. Suggested score: 78% (CONDITIONAL).' },
    });
    expect(evaluateProfile).toHaveBeenCalledWith(expect.objectContaining({ id: 'vendor-1', email: 'acme@example.test', categories: [UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical] }));
    const [vendorUpdate, evaluationInsert, auditInsert] = d1Batch.mock.calls.at(-1)?.[0] as Array<{ sql: string; values: unknown[] }>;
    expect(JSON.parse(String(evaluationInsert.values[0]))).toMatchObject({
      tenantId: 'tenant-1', vendorId: 'vendor-1', status: 'AI_GENERATED', overallWeightedScore: 78,
      criteriaDetails: JSON.stringify(evaluationReport.criteria), criticalRiskFlags: '[]',
    });
    expect(vendorUpdate.sql).toContain('UPDATE "vendors"');
    expect(auditInsert.sql).toContain('INSERT INTO "audit_logs"');
    expect(db.vendor.update).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('stores AI assessments for shared vendors without changing their global qualification fields', async () => {
    db.vendor.findFirst.mockResolvedValueOnce({ ...vendor, tenantId: 'network-tenant', vendorType: 'PROCUCEV_VENDOR', updatedAt: '2025-01-01T00:00:00.000Z', evaluatedAt: new Date('2024-01-01T00:00:00.000Z') });
    evaluateProfile.mockReturnValueOnce(evaluationReport);
    d1Batch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    await expect(evaluateVendorAi(post({}), routeParams)).resolves.toMatchObject({ ok: true, data: { evaluation: { tenantId: 'tenant-1', status: 'AI_GENERATED' } } });
    const [vendorUpdate, evaluationInsert] = d1Batch.mock.calls.at(-1)?.[0] as Array<{ values: unknown[] }>;
    expect(vendorUpdate.values[8]).toBe('tenant-1');
    expect(JSON.parse(String(evaluationInsert.values[0]))).toMatchObject({ tenantId: 'tenant-1', vendorId: 'vendor-1' });
    expect(db.vendor.update).not.toHaveBeenCalled();
  });

  it('recovers a committed AI evaluation after a lost D1 response', async () => {
    db.vendor.findFirst.mockResolvedValueOnce(vendor);
    evaluateProfile.mockReturnValueOnce(evaluationReport);
    d1Batch.mockImplementationOnce(async (statements: Array<{ values: unknown[] }>) => {
      const evaluation = JSON.parse(String(statements[1].values[0])) as { id: string; status: string };
      const auditId = statements[2].values[0] as string;
      db.vendorEvaluation.findFirst.mockResolvedValueOnce(evaluation);
      db.auditLog.findFirst.mockResolvedValueOnce({ id: auditId });
      structuredLog.mockRejectedValueOnce(new Error('optional recovery log failure'));
      throw new Error('D1 response lost after commit');
    });
    await expect(evaluateVendorAi(post({}), routeParams)).resolves.toMatchObject({ ok: true, data: { evaluation: { status: 'AI_GENERATED' } } });
    expect(structuredLog).toHaveBeenCalledWith('warn', 'vendor.ai_evaluation_result_recovered', expect.objectContaining({ vendorId: 'record-1' }));
  });

  it('rejects unusable AI compare-and-set timestamps and tolerates unavailable diagnostics', async () => {
    db.vendor.findFirst.mockResolvedValueOnce({ ...vendor, updatedAt: 'invalid timestamp' });
    evaluateProfile.mockReturnValueOnce(evaluationReport);
    await expect(evaluateVendorAi(post({}), routeParams)).resolves.toMatchObject({ ok: false, status: 409 });

    db.vendor.findFirst.mockResolvedValueOnce(vendor);
    evaluateProfile.mockReturnValueOnce(evaluationReport);
    d1Batch.mockRejectedValueOnce(new Error('D1 outcome unknown'));
    db.vendorEvaluation.findFirst.mockRejectedValueOnce(new Error('verification read failed'));
    structuredLog.mockRejectedValueOnce(new Error('diagnostics unavailable'));
    await expect(evaluateVendorAi(post({}), routeParams)).resolves.toMatchObject({ ok: false, status: 500 });
  });

  it('reports AI evaluation storage failures', async () => {
    db.vendor.findFirst.mockResolvedValueOnce(vendor);
    evaluateProfile.mockReturnValueOnce(evaluationReport);
    d1Batch.mockRejectedValueOnce(new Error('AI save failed'));
    db.vendorEvaluation.findFirst.mockResolvedValueOnce(null);
    db.auditLog.findFirst.mockResolvedValueOnce(null);
    await expect(evaluateVendorAi(post({}), routeParams)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToRunAiEvaluation, status: 500 });
    db.vendor.findFirst.mockRejectedValueOnce({});
    await expect(evaluateVendorAi(post({}), routeParams)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToRunAiEvaluation, status: 500 });
    expect(structuredLog).toHaveBeenCalledWith('error', 'vendor.ai_evaluation_failed', expect.objectContaining({ vendorId: 'record-1' }));
  });
});
