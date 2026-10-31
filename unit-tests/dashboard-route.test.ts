import { uiStringPattern } from '@/lib/i18n';
import { GET } from '../src/app/api/dashboard/route';
import { prisma } from '../src/lib/prisma';
import { apiSuccess, isApiContext, requireAuth } from '../src/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => {
  const model = () => ({
    count: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue({ _sum: {} }),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
  });
  return {
    prisma: {
      tenant: model(), user: model(), project: model(), auditLog: model(),
      boqRevision: model(), procurementRequest: model(), rfq: model(),
      awardRecommendation: model(), vendorRateCard: model(), boqLine: model(),
      category: model(), uomMaster: model(), boq: model(),
      budgetContribution: model(), budgetTransaction: model(),
    },
  };
});

jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ data, status })),
}));

const db = prisma as any;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const success = apiSuccess as jest.Mock;
const baseContext = { tenantId: 'tenant-1', userId: 'user-1', role: 'PROJECT_USER' };

function rfq(id: string, status: string, extra: Record<string, any> = {}) {
  return {
    id, rfqNumber: `RFQ-${id}`, title: '', packageName: `Package ${id}`, status,
    createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-02-01'),
    estimatedBenchmarkValue: 0, invitedVendors: [], quotes: [], negotiations: [], awards: [], ppos: [],
    ...extra,
  };
}

function revision(id: string, boqId: string, rfqs: any[] = [], overrides: Record<string, any> = {}) {
  return {
    id, revisionNumber: 1, revisionCode: 'R1', totalLines: 0,
    createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-02-01'), approvedAt: null, submittedAt: null,
    boq: {
      id: boqId, boqCode: boqId.toUpperCase(), title: 'Title', description: null,
      project: { id: 'project-1', name: 'Project', projectCode: 'P-1' }, costCentre: null,
    },
    costCentre: null, lines: [], prs: [], rfqs,
    ...overrides,
  };
}

function resetDatabase() {
  for (const delegate of Object.values(db) as any[]) {
    for (const method of Object.values(delegate) as jest.Mock[]) {
      method.mockReset();
      if (method.getMockName() === 'jest.fn()') method.mockResolvedValue(undefined);
    }
  }
  for (const name of Object.keys(db)) {
    db[name].count?.mockResolvedValue(0);
    db[name].aggregate?.mockResolvedValue({ _sum: {} });
    db[name].findMany?.mockResolvedValue([]);
    db[name].findUnique?.mockResolvedValue(null);
  }
}

describe('dashboard API role responses', () => {
  beforeEach(() => {
    resetDatabase();
    jest.clearAllMocks();
    auth.mockResolvedValue(baseContext);
    isContext.mockReturnValue(true);
  });

  it('returns the auth response directly when the caller has no API context', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET()).resolves.toBe(denied);
    expect(auth).toHaveBeenCalledWith('PROJECT_VIEW');
  });

  it('builds the global super administrator summary and tenant counts', async () => {
    auth.mockResolvedValue({ ...baseContext, role: 'SUPER_ADMIN' });
    db.tenant.count.mockResolvedValue(2);
    db.user.count.mockResolvedValue(7);
    db.project.count.mockResolvedValue(4);
    db.auditLog.findMany.mockResolvedValue([{ id: 'log-1' }]);
    db.tenant.findMany.mockResolvedValue([{
      id: 'tenant-1', name: 'Buyer', slug: 'buyer', status: 'ACTIVE',
      _count: { projects: 3, users: 5 },
    }]);

    await GET();

    expect(success).toHaveBeenCalledWith(expect.objectContaining({
      role: 'SUPER_ADMIN', tenants: 2, users: 7, projects: 4,
      tenantList: [{ id: 'tenant-1', name: UI_STRINGS.appLoginPageConstants.buyer, slug: 'buyer', status: UI_STRINGS.common.aCTIVE, projectCount: 3, userCount: 5 }],
    }));
    expect(db.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
  });

  it('returns tenant scoped client administrator metrics and activity', async () => {
    auth.mockResolvedValue({ ...baseContext, role: 'CLIENT_ADMIN' });
    db.project.count.mockResolvedValueOnce(5).mockResolvedValueOnce(2);
    db.boqRevision.count.mockResolvedValue(3);
    db.user.count.mockResolvedValue(8);
    db.auditLog.findMany.mockResolvedValue([{ id: 'activity-1' }]);
    db.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', name: 'Buyer' });

    await GET();

    expect(success).toHaveBeenCalledWith(expect.objectContaining({
      role: 'CLIENT_ADMIN', totalProjects: 5, activeProjects: 2, pendingApprovals: 3,
      totalUsers: 8, recentActivity: [{ id: 'activity-1' }], tenant: { id: 'tenant-1', name: UI_STRINGS.appLoginPageConstants.buyer },
    }));
    expect(db.project.count).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { tenantId: 'tenant-1', status: { in: ['BOQ_PREPARATION', 'BOQ_REVIEW', 'DRAFT'] } },
    }));
  });

  it('enriches project approver pending requests and falls back through requester/category details', async () => {
    auth.mockResolvedValue({ ...baseContext, role: 'PROJECT_APPROVER' });
    db.user.findMany.mockResolvedValue([{ id: 'user-2', email: 'known@test', name: 'Known', role: 'PROJECT_USER' }]);
    db.procurementRequest.count.mockResolvedValueOnce(2).mockResolvedValueOnce(4).mockResolvedValueOnce(1);
    db.procurementRequest.findMany
      .mockResolvedValueOnce([{
        id: 'pr-1', requestedBy: 'known@test', lines: [{ category: 'Civil' }, { category: 'Civil' }, { category: null }],
        boq: { category: 'Fallback' }, approvals: [{ status: 'ENQUIRY', note: 'Clarify' }],
      }, {
        id: 'pr-2', requestedBy: 'unknown', lines: [], boq: { category: null }, approvals: [],
      }])
      .mockResolvedValueOnce([{ id: 'approved-1' }])
      .mockResolvedValueOnce([{ id: 'rejected-1' }]);

    await GET();

    expect(success).toHaveBeenCalledWith(expect.objectContaining({
      pending: 2, recentApproved: 4, recentRejected: 1,
      pendingPrs: [
        expect.objectContaining({ requesterName: 'Known', requesterEmail: 'known@test', categories: ['Civil'], hasEnquiry: true, latestMessage: { status: 'ENQUIRY', note: 'Clarify' } }),
        expect.objectContaining({ requesterName: 'unknown', requesterEmail: '', categories: [UI_STRINGS.common.standard], hasEnquiry: false, latestMessage: null }),
      ],
    }));
  });

  it('returns procurement counts and maps approved revisions, deduplicated RFQs, and sourcing stages', async () => {
    auth.mockResolvedValue({ ...baseContext, role: 'PROCUREMENT_USER' });
    db.vendorRateCard.count.mockResolvedValue(1);
    const firstRevision = {
      id: 'rev-1', revisionNumber: 1, revisionCode: 'R1', totalLines: 2, createdAt: new Date('2026-01-01'),
      approvedAt: null, submittedAt: null, updatedAt: new Date('2026-02-01'),
      boq: { id: 'boq-1', boqCode: 'B-1', title: '', description: 'Baseline', project: { id: 'p-1', name: 'Project One', projectCode: 'P-1' }, costCentre: null },
      costCentre: null,
      lines: [{ quantity: 2, benchmarkRate: 50, category: { name: 'Civil' } }], prs: [],
      rfqs: [
        rfq('draft', 'DRAFT'),
        rfq('issued', 'RELEASED', { invitedVendors: [{}] }),
        rfq('quotes', 'COMPARISON', { quotes: [{ vendor: { name: 'Vendor A' }, totalQuoteAmount: 1000 }] }),
        rfq('negotiation', 'NEGOTIATION', { negotiations: [{ rounds: [{ roundNumber: 2, status: 'ROUND_ACTIVE', nextResponsibleParty: 'VENDOR' }] }] }),
        rfq('locked', 'FINAL_RATE_LOCKED'),
        rfq('pending-award', 'AWARD_RECOMMENDED', { awards: [{ status: 'PENDING_APPROVAL' }] }),
        rfq('approved-award', 'APPROVED', { awards: [{ status: 'APPROVED', recommendedVendor: { name: 'Vendor B' } }] }),
        rfq('awarded', 'AWARDED'),
        rfq('ppo', 'AWARDED', { ppos: [{ id: 'ppo-1', ppoNumber: 'PPO-1', status: 'ACCEPTED' }] }),
        rfq('cancelled', 'CANCELLED'),
        rfq('negotiation-empty-rounds', 'NEGOTIATION'),
        rfq('negotiation-round-fallback', 'COMPARISON', { negotiations: [{ rounds: [{ roundNumber: 3 }] }] }),
        rfq('rejected-award', 'COMPARISON', { awards: [{ status: 'REJECTED' }] }),
        rfq('empty-labels', 'UNKNOWN', { title: null, packageName: null, updatedAt: null, createdAt: null }),
      ],
    };
    const secondRevision = { ...firstRevision, id: 'rev-2', revisionNumber: 2, lines: [], rfqs: [] };
    const emptyFirst = { ...firstRevision, id: 'rev-empty', revisionNumber: 0, lines: [], rfqs: [] };
    const moreRfqs = {
      ...firstRevision, id: 'rev-more-rfqs', revisionNumber: 3,
      rfqs: [...firstRevision.rfqs, rfq('additional-a', 'DRAFT'), rfq('additional-b', 'RELEASED')],
    };
    const latestRevision = { ...moreRfqs, id: 'rev-latest', revisionNumber: 4 };
    const otherBoq = {
      ...firstRevision, id: 'rev-3', revisionNumber: 1,
      boq: { ...firstRevision.boq, id: 'boq-2', boqCode: 'B-2', title: 'Second', project: { id: 'p-1', name: 'Project One', projectCode: 'P-1' } },
      lines: [], rfqs: [], prs: [{ totalEstimatedValue: 400, lines: [{ id: 'line-1' }] }],
    };
    const stageRevisions = [
      revision('rev-awaiting', 'boq-awaiting'),
      revision('rev-issued', 'boq-issued', [rfq('stage-issued', 'RELEASED')]),
      revision('rev-quotes', 'boq-quotes', [rfq('stage-quotes', 'COMPARISON', { quotes: [{ totalQuoteAmount: 200 }] })]),
      revision('rev-negotiation', 'boq-negotiation', [rfq('stage-negotiation', 'NEGOTIATION')]),
      revision('rev-pending-award', 'boq-pending-award', [rfq('stage-pending-award', 'AWARD_RECOMMENDED')]),
      revision('rev-approved-award', 'boq-approved-award', [rfq('stage-approved-award', 'APPROVED')]),
      revision('rev-locked', 'boq-locked', [rfq('stage-locked', 'FINAL_RATE_LOCKED')]),
      revision('rev-cancelled', 'boq-cancelled', [rfq('stage-cancelled', 'CANCELLED')]),
    ];
    db.boqRevision.findMany.mockResolvedValue([emptyFirst, firstRevision, secondRevision, moreRfqs, latestRevision, otherBoq, ...stageRevisions]);

    await GET();

    const payload = success.mock.calls.at(-1)[0];
    expect(payload.summaryCards).toEqual(expect.objectContaining({ approvedBoqs: 10, prsReceived: 3, rfqsInProgress: 0, negotiationsPending: 0, awardsPpoPending: 0 }));
    expect(payload.boqRegister).toHaveLength(10);
    const mapped = payload.boqRegister.find((item: any) => item.boqId === 'boq-1');
    expect(mapped).toEqual(expect.objectContaining({ amount: 100, itemCount: 1, hasRateCardMatch: true, procurementStage: 'PPO' }));
    expect(mapped.rfqCount).toBeGreaterThanOrEqual(13);
    expect(mapped.rfqs.map((item: any) => item.id)).toEqual(expect.arrayContaining(['draft', 'issued', 'quotes', 'negotiation', 'locked', 'pending-award', 'approved-award', 'awarded', 'ppo', 'cancelled', 'negotiation-empty-rounds', 'rejected-award', 'empty-labels']));
    expect(mapped.rfqs.find((item: any) => item.id === 'draft')).toEqual(expect.objectContaining({ quotationStage: UI_STRINGS.common.draft, awardStatus: 'Not Prepared' }));
    expect(mapped.rfqs.find((item: any) => item.id === 'ppo')).toEqual(expect.objectContaining({ ppoStatus: 'PPO-1 (ACCEPTED)' }));
    expect(db.boqRevision.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-1' }) }));
  });

  it('serves finance summaries and safely sums missing project budgets as zero', async () => {
    auth.mockResolvedValue({ ...baseContext, role: 'FINANCE_USER' });
    db.project.findMany.mockResolvedValue([
      { id: 'p1', budget: 100, status: 'BOQ_APPROVED' },
      { id: 'p2', budget: null, status: 'DRAFT' },
    ]);

    await GET();

    expect(success).toHaveBeenCalledWith({ role: 'FINANCE_USER', projects: expect.any(Array), totalBudget: 100, totalProjects: 2, approvedProjects: 1 });
  });

  it('returns category manager taxonomy, exception, and approved procurement summaries', async () => {
    auth.mockResolvedValue({ ...baseContext, role: 'CATEGORY_MANAGER' });
    const lifecycleRfqs = [
      rfq('life-ppo-accepted', 'AWARDED', { ppos: [{ id: 'ppo-a', ppoNumber: 'PPO-A', status: 'ACCEPTED' }] }),
      rfq('life-ppo-pending', 'APPROVED', { ppos: [{ id: 'ppo-b', ppoNumber: 'PPO-B', status: 'ISSUED' }] }),
      rfq('life-awarded', 'AWARDED'),
      rfq('life-award-recommended', 'AWARD_RECOMMENDED'),
      rfq('life-award-approved', 'APPROVED', { awards: [{ status: 'APPROVED', recommendedVendor: { name: 'Winner' } }] }),
      rfq('life-award-pending', 'AWARD_RECOMMENDED', { awards: [{ status: 'PENDING_APPROVAL' }] }),
      rfq('life-locked', 'FINAL_RATE_LOCKED'),
      rfq('life-neg-vendor', 'NEGOTIATION', { negotiations: [{ rounds: [{ roundNumber: 1, status: 'ROUND_ACTIVE', nextResponsibleParty: 'VENDOR' }] }] }),
      rfq('life-neg-buyer', 'NEGOTIATION', { negotiations: [{ rounds: [{ roundNumber: 2, status: 'REVISED_SUBMITTED', nextResponsibleParty: 'BUYER' }] }] }),
      rfq('life-neg-default', 'NEGOTIATION'),
      rfq('life-quote', 'COMPARISON', { quotes: [{ totalQuoteAmount: 125000, vendor: null }], negotiations: [{ rounds: [{ roundNumber: 3 }] }] }),
      rfq('life-quote-single', 'RESPONSE_CLOSED', { quotes: [{ totalQuoteAmount: 100 }] }),
      rfq('life-released', 'VENDOR_RESPONSE_OPEN'),
      rfq('life-draft', 'DRAFT'),
      rfq('life-cancelled', 'CANCELLED'),
      rfq('life-unknown', 'UNKNOWN', { title: null, packageName: null, updatedAt: null, createdAt: null }),
      rfq('life-award-rejected', 'COMPARISON', { awards: [{ status: 'REJECTED' }] }),
      rfq('life-nonfinal-round', 'COMPARISON', { negotiations: [{ rounds: [{ roundNumber: 4, status: null, nextResponsibleParty: 'OBSERVER' }] }] }),
    ];
    const approvedPr = (id: string, linkedRfqs: any[], revisionId: string | null = null): any => ({
      id, prNumber: `PR-${id}`, title: '', boqId: `boq-${id}`, boqRevisionId: revisionId,
      projectId: 'p-1', costCentreId: null, project: { name: 'Project', projectCode: 'P-1' }, costCentre: null,
      boq: null, boqRevision: null, lines: [], rfqs: linkedRfqs,
      totalEstimatedValue: 25, updatedAt: null, createdAt: new Date(),
    });
    const fallbackPr = approvedPr('fallback-fields', [], null);
    fallbackPr.rfqs = null as any;
    fallbackPr.project = null as any;
    fallbackPr.costCentre = { code: 'CC-X', name: 'Fallback' };
    fallbackPr.boq = { boqCode: 'B-X', title: '' };
    fallbackPr.boqRevision = { revisionCode: 'R7' };
    fallbackPr.totalEstimatedValue = 0;
    db.category.findMany.mockResolvedValue([
      { id: 'cat-1', name: 'Civil', parentId: null, children: [] },
      { id: 'cat-2', name: 'Concrete', parentId: 'cat-1', children: [] },
    ]);
    db.uomMaster.findMany.mockResolvedValue([{ id: 'uom-1', code: 'EA' }]);
    db.boqRevision.findMany
      .mockResolvedValueOnce([{ id: 'exception-1', warningLines: 1, boq: { project: { name: 'Project' } } }])
      .mockResolvedValueOnce([{
        id: 'rev-1', revisionNumber: 1, revisionCode: 'R1', totalLines: 1, createdAt: new Date(), updatedAt: new Date(),
        boq: { id: 'boq-1', boqCode: 'B-1', title: 'Approved', project: { id: 'p-1', name: 'Project', projectCode: 'P-1' }, costCentre: { id: 'cc-1', code: 'CC', name: 'Main' } },
        lines: [{ quantity: 2, benchmarkRate: 25, category: { name: 'Civil' } }],
        rfqs: [rfq('pr-rfq', 'DRAFT'), lifecycleRfqs[0]],
      },
      ...lifecycleRfqs.map((item, index) => revision(`standalone-${index}`, `boq-standalone-${index}`, [item], {
        revisionCode: `R${index + 1}`,
        lines: index === 0 ? [{ quantity: 2, benchmarkRate: 20, category: { name: 'Civil' } }, { quantity: 0, benchmarkRate: 0, category: null }] : [],
        approvedAt: index === 1 ? new Date() : null,
        updatedAt: index === 2 ? null : new Date(),
        boq: {
          id: `boq-standalone-${index}`, boqCode: `B-${index}`, title: index === 0 ? null : 'Title',
          project: { id: 'p-1', name: 'Project', projectCode: 'P-1' },
          costCentre: index === 1 ? { id: 'cc-1', code: 'CC', name: 'Main' } : null,
        },
      })),
    ]);
    db.procurementRequest.findMany.mockResolvedValue([
      approvedPr('pr-1', [rfq('pr-rfq', 'DRAFT'), lifecycleRfqs[0]], 'rev-1'),
      ...lifecycleRfqs.map((item, index) => approvedPr(`stage-${index}`, [item])),
      approvedPr('stage-empty', []), fallbackPr,
    ]);
    db.boqLine.count.mockResolvedValue(12);
    db.vendorRateCard.count.mockResolvedValue(3);
    db.rfq.count.mockResolvedValueOnce(4).mockResolvedValueOnce(2);
    db.awardRecommendation.count.mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    await GET();

    const payload = success.mock.calls.at(-1)[0];
    expect(payload).toEqual(expect.objectContaining({
      role: 'CATEGORY_MANAGER', categoryCount: 1, subcategoryCount: 1, uomCount: 1, totalLines: 12,
      categories: [{ id: 'cat-1', name: 'Civil', parentId: null, children: [] }],
      summaryCards: expect.objectContaining({ approvedBoqs: expect.any(Number), rfqsInProgress: 4, negotiationsPending: 2, awardsPpoPending: 3 }),
    }));
    expect(payload.boqRegister).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'pr-1', rfqCount: expect.any(Number), hasRateCardMatch: true }),
      expect.objectContaining({ id: 'standalone-0', amount: 40, category: 'Civil' }),
      expect.objectContaining({ id: 'standalone-1', costCentre: 'CC - Main' }),
    ]));
    expect(payload.revisionsWithExceptions).toHaveLength(1);
  });

  it('returns viewer projects with only the latest BOQ revision', async () => {
    auth.mockResolvedValue({ ...baseContext, role: 'VIEWER' });
    db.project.findMany.mockResolvedValue([{ id: 'p1', boqs: [{ id: 'b1' }] }]);
    await GET();
    expect(success).toHaveBeenCalledWith({ role: 'VIEWER', projects: [{ id: 'p1', boqs: [{ id: 'b1' }] }], totalProjects: 1 });
  });

  it('computes project user budget fallbacks, recent BOQs, and rejected versus draft actions', async () => {
    db.boq.count.mockResolvedValueOnce(5).mockResolvedValueOnce(2).mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    db.budgetContribution.aggregate.mockResolvedValueOnce({ _sum: { totalEstimatedValue: 0 } }).mockResolvedValueOnce({ _sum: { acceptedEstimatedValue: 0 } });
    db.boq.findMany
      .mockResolvedValueOnce([{ revisions: [{ lines: [{ aiTotalCost: 30 }, { quantity: 2, aiUnitCost: 10 }, { quantity: 4, aiUnitCost: 0 }] }] }])
      .mockResolvedValueOnce([{
        id: 'b1', boqCode: 'B-1', description: '', status: 'REJECTED', updatedAt: new Date(),
        costCentre: { name: 'Main', code: 'CC' }, budgetContributions: [],
        revisions: [{ id: 'r1', lines: [{ aiTotalCost: 0, quantity: 2, aiUnitCost: 15 }] }],
      }, {
        id: 'b2', boqCode: 'B-2', description: 'Draft desc', status: 'DRAFT', updatedAt: new Date(),
        costCentre: null, budgetContributions: [{ totalEstimatedValue: 40 }], revisions: [],
      }])
      .mockResolvedValueOnce([
        { id: 'b1', boqCode: 'B-1', status: 'REJECTED', title: '', description: '', updatedAt: new Date() },
        { id: 'b2', boqCode: 'B-2', status: 'DRAFT', title: 'Ready', description: 'Description', updatedAt: new Date() },
      ]);
    db.budgetTransaction.aggregate.mockResolvedValue({ _sum: { amount: 90 } });

    await GET();

    const payload = success.mock.calls.at(-1)[0];
    expect(payload).toEqual(expect.objectContaining({
      role: 'PROJECT_USER', totalBoqsRaised: 5, boqsPendingApproval: 2, approvedBoqs: 1, boqsRequiringAction: 2,
      totalProposedBudget: 50, totalApprovedBudget: 90,
      recentBoqs: expect.arrayContaining([
        expect.objectContaining({ id: 'b1', estimatedValue: 30, costCentre: 'Main (CC)', latestRevisionId: 'r1' }),
        expect.objectContaining({ id: 'b2', estimatedValue: 40, costCentre: UI_STRINGS.common.copy4s9bsz, latestRevisionId: null }),
      ]),
      pendingActions: expect.arrayContaining([
        expect.objectContaining({ id: 'b1', actionText: 'Revise and resubmit rejected BOQ', severity: 'danger' }),
        expect.objectContaining({ id: 'b2', title: 'Ready', actionText: 'Complete and submit draft BOQ', severity: UI_STRINGS.componentsUiToast.warning }),
      ]),
    }));
  });

  it('uses approved contribution totals and returns no pending actions for an unhandled role', async () => {
    auth.mockResolvedValue({ ...baseContext, role: 'CUSTOM_ROLE' });
    db.boq.count.mockResolvedValue(0);
    db.budgetContribution.aggregate.mockResolvedValueOnce({ _sum: { totalEstimatedValue: 120 } }).mockResolvedValueOnce({ _sum: { acceptedEstimatedValue: 80 } });
    db.boq.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await GET();

    expect(success).toHaveBeenCalledWith(expect.objectContaining({
      role: 'CUSTOM_ROLE', totalProposedBudget: 120, totalApprovedBudget: 80, pendingActions: [],
    }));
  });

  it('returns the default dashboard with empty aggregates for other roles', async () => {
    auth.mockResolvedValue({ ...baseContext, role: 'AUDITOR' });
    db.budgetContribution.aggregate.mockResolvedValueOnce({ _sum: { totalEstimatedValue: 10 } }).mockResolvedValueOnce({ _sum: { acceptedEstimatedValue: 5 } });
    await GET();
    expect(success).toHaveBeenCalledWith(expect.objectContaining({ role: 'AUDITOR', recentBoqs: [], pendingActions: [] }));
    expect(db.boq.findMany).toHaveBeenCalledTimes(1);
  });
});
