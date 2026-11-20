// app/api/dashboard/route.ts - Role-aware dashboard stats
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { Prisma } from '@prisma/client';
import { requireAuth, isApiContext, apiSuccess, apiError, getListPageWindow } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { readByD1FilterChunks } from '@/lib/d1-query';
import { getPrLinePaginationMetadata, paginatePrLineRecords } from '@/lib/pr-line-pagination';
import { PR_DETAIL_LINE_PAGE_SIZE } from '@/lib/pr-line-pagination.constants';
import { PR_DETAIL_LINE_SELECT } from '@/app/api/pr/[id]/route.constants';
import {
  DASHBOARD_APPROVER_CATEGORY_PREVIEW_LIMIT,
  DASHBOARD_EXCEPTION_PREVIEW_LIMIT,
  DASHBOARD_REGISTER_PREVIEW_LIMIT,
  DASHBOARD_RFQ_PREVIEW_LIMIT,
  DASHBOARD_SUBCATEGORY_PREVIEW_LIMIT,
  DASHBOARD_TAXONOMY_PREVIEW_LIMIT,
  DASHBOARD_UOM_PREVIEW_LIMIT,
  DASHBOARD_VIEWER_PROJECT_PREVIEW_LIMIT,
} from './route.constants';
import type {
  DashboardApprovedBoqLineAggregate,
  DashboardRecentBoqLineValueAggregate,
} from '@app-types/app/api/dashboard/route.types';


export async function GET(request: Request) {
  const ctx = await requireAuth('PROJECT_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const tenantId = ctx.tenantId;
  const userId = ctx.userId;
  try {

  // ── SUPER_ADMIN ──────────────────────────────────────────
  if (ctx.role === 'SUPER_ADMIN') {
    const searchParams = new URL(request.url).searchParams;
    const { page, pageSize, skip } = getListPageWindow(searchParams);
    const [tenants, users, projects, recentLogs, tenantList] = await Promise.all([
      prisma.tenant.count(),
      prisma.user.count(),
      prisma.project.count(),
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { user: { select: { name: true, email: true } }, tenant: { select: { name: true, slug: true } } },
      }),
      prisma.tenant.findMany({
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip,
        take: pageSize,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          _count: { select: { projects: true, users: true } },
        },
      }),
    ]);
    return apiSuccess({
      role: ctx.role,
      tenants,
      users,
      projects,
      recentLogs,
      tenantListPage: page,
      tenantListPageSize: pageSize,
      tenantListTotal: tenants,
      tenantListTotalPages: Math.ceil(tenants / pageSize),
      tenantList: tenantList.map(t => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        status: t.status,
        projectCount: t._count.projects,
        userCount: t._count.users,
      })),
    });
  }

  // ── CLIENT_ADMIN ─────────────────────────────────────────
  if (ctx.role === 'CLIENT_ADMIN') {
    const [totalProjects, activeProjects, pendingApprovals, totalUsers, recentActivity, tenant] = await Promise.all([
      prisma.project.count({ where: { tenantId } }),
      prisma.project.count({ where: { tenantId, status: { in: ['BOQ_PREPARATION', 'BOQ_REVIEW', 'DRAFT'] } } }),
      prisma.boqRevision.count({ where: { tenantId, status: 'SUBMITTED' } }),
      prisma.user.count({ where: { tenantId, status: 'ACTIVE' } }),
      prisma.auditLog.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { user: { select: { name: true, email: true } } },
      }),
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, slug: true, status: true } }),
    ]);
    return apiSuccess({
      role: ctx.role,
      totalProjects,
      activeProjects,
      pendingApprovals,
      totalUsers,
      recentActivity,
      tenant,
    });
  }

  // ── PROJECT_APPROVER ─────────────────────────────────────
  if (ctx.role === 'PROJECT_APPROVER') {
    const [pendingPrCount, approvedPrCount, rejectedPrCount, rawPendingPrs] = await Promise.all([
      prisma.procurementRequest.count({ where: { tenantId, status: 'PR_PENDING_PROJECT_APPROVAL' } }),
      prisma.procurementRequest.count({ where: { tenantId, status: { in: ['PR_APPROVED', 'PR_RELEASED_TO_PROCUREMENT'] } } }),
      prisma.procurementRequest.count({ where: { tenantId, status: { in: ['PR_REJECTED', 'PR_RETURNED_FOR_CORRECTION'] } } }),
      prisma.procurementRequest.findMany({
        where: { tenantId, status: 'PR_PENDING_PROJECT_APPROVAL' },
        orderBy: [{ requestedDate: 'desc' }, { id: 'desc' }],
        take: 5,
        include: {
          project: { select: { id: true, projectCode: true, name: true, sector: true } },
          costCentre: { select: { id: true, code: true, name: true, areaSqFt: true } },
          boq: { select: { id: true, boqCode: true, title: true, description: true, category: true } },
          boqRevision: { select: { id: true, revisionNumber: true, revisionCode: true } },
          lines: {
            where: { tenantId },
            select: PR_DETAIL_LINE_SELECT,
            orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
            take: PR_DETAIL_LINE_PAGE_SIZE + 1,
          },
          _count: { select: { lines: true } },
          approvals: { orderBy: { timestamp: 'desc' }, take: 1 },
        },
      }),
    ]);

    const pendingPrIds = rawPendingPrs.map((pr) => pr.id);
    const requesterIds = Array.from(new Set(rawPendingPrs.map((pr) => pr.requestedBy).filter(Boolean)));
    const [users, categoryGroups] = await Promise.all([
      requesterIds.length > 0 ? prisma.user.findMany({
        where: { tenantId, id: { in: requesterIds } },
        select: { id: true, name: true, email: true },
      }) : Promise.resolve([]),
      pendingPrIds.length > 0 ? prisma.pRLine.groupBy({
        by: ['prId', 'category'],
        where: { tenantId, prId: { in: pendingPrIds } },
        orderBy: [{ prId: 'asc' }, { category: 'asc' }],
        take: DASHBOARD_APPROVER_CATEGORY_PREVIEW_LIMIT,
      }) : Promise.resolve([]),
    ]);
    const userMap = new Map<string, { name: string; email: string }>();
    users.forEach((user) => {
      userMap.set(user.id, { name: user.name, email: user.email });
      userMap.set(user.email, { name: user.name, email: user.email });
    });

    const categoriesByPr = new Map<string, string[]>();
    categoryGroups.forEach((group) => {
      const categories = categoriesByPr.get(group.prId) || [];
      categories.push(group.category);
      categoriesByPr.set(group.prId, categories);
    });

    const pendingPrs = rawPendingPrs.map(pr => {
      const requester = userMap.get(pr.requestedBy);
      const categories = categoriesByPr.get(pr.id) || [];
      const linePage = paginatePrLineRecords(pr.lines);
      return {
        ...pr,
        lines: linePage.lines,
        linePagination: getPrLinePaginationMetadata(linePage),
        lineCount: pr._count.lines,
        requesterName: requester?.name || pr.requestedBy,
        requesterEmail: requester?.email || '',
        categories: categories.length > 0 ? categories : (pr.boq?.category ? [pr.boq.category] : ['Standard']),
        hasEnquiry: pr.approvals?.[0]?.status === 'ENQUIRY',
        latestMessage: pr.approvals?.[0] || null,
      };
    });

    const [recentlyApprovedList, recentlyRejectedList] = await Promise.all([
      prisma.procurementRequest.findMany({
        where: { tenantId, status: { in: ['PR_APPROVED', 'PR_RELEASED_TO_PROCUREMENT'] } },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        include: {
          project: { select: { id: true, projectCode: true, name: true } },
          costCentre: { select: { id: true, code: true, name: true } },
          boq: { select: { id: true, boqCode: true, title: true } },
        },
      }),
      prisma.procurementRequest.findMany({
        where: { tenantId, status: { in: ['PR_REJECTED', 'PR_RETURNED_FOR_CORRECTION'] } },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        include: {
          project: { select: { id: true, projectCode: true, name: true } },
          costCentre: { select: { id: true, code: true, name: true } },
          boq: { select: { id: true, boqCode: true, title: true } },
        },
      }),
    ]);

    return apiSuccess({
      role: ctx.role,
      pending: pendingPrCount,
      recentApproved: approvedPrCount,
      recentRejected: rejectedPrCount,
      pendingPrs,
      recentlyApprovedList,
      recentlyRejectedList,
    });
  }

  // ── PROCUREMENT_USER ─────────────────────────────────────
  // ── PROCUREMENT_USER ─────────────────────────────────────
  if (ctx.role === 'PROCUREMENT_USER') {
    const [
      rfqsInProgressCount,
      negotiationsCount,
      pendingAwardsCount,
      approvedAwardsWithoutPpoCount,
      rateCardsCount,
    ] = await Promise.all([
      // 1. RFQs in Progress
      prisma.rfq.count({
        where: {
          tenantId,
          status: { in: ['DRAFT', 'RELEASED', 'VENDOR_RESPONSE_OPEN', 'RESPONSE_CLOSED', 'COMPARISON', 'NEGOTIATION', 'FINAL_RATE_LOCKED'] },
        },
      }),
      // 2. Negotiations Pending
      prisma.rfq.count({
        where: {
          tenantId,
          OR: [
            { status: { in: ['NEGOTIATION', 'FINAL_RATE_LOCKED'] } },
            { negotiations: { some: { status: 'ACTIVE' } } },
          ],
        },
      }),
      // 3. Awards / PPO Pending
      prisma.awardRecommendation.count({
        where: { tenantId, status: 'PENDING_APPROVAL' },
      }),
      prisma.awardRecommendation.count({
        where: { tenantId, status: 'APPROVED', ppos: { none: {} } },
      }),
      // Rate cards count
      prisma.vendorRateCard.count({
        where: { tenantId, status: 'APPROVED' },
      }),
    ]);

    const awardsPpoPendingCount = pendingAwardsCount + approvedAwardsWithoutPpoCount;

    // Helper to map RFQ status to concise Procurement Stage: Awaiting RFQ, RFQ Issued, Quotations, Negotiation, Award, PPO
    const mapConciseStage = (rfqs: any[]): string => {
      if (!rfqs || rfqs.length === 0) return 'Awaiting RFQ';
      if (rfqs.some(r => r.ppos?.length > 0 || r.status === 'AWARDED')) return 'PPO';
      const hasApprovedAward = rfqs.some(r => r.awards?.some((a: any) => a.status === 'APPROVED'));
      if (hasApprovedAward || rfqs.some(r => r.status === 'APPROVED')) return 'Award';
      const hasPendingAward = rfqs.some(r => r.awards?.some((a: any) => a.status === 'PENDING_APPROVAL'));
      if (hasPendingAward || rfqs.some(r => r.status === 'AWARD_RECOMMENDED')) return 'Award';
      if (rfqs.some(r => r.status === 'FINAL_RATE_LOCKED' || r.status === 'NEGOTIATION' || (r.negotiations?.[0]?.rounds?.length || 0) > 0)) {
        return 'Negotiation';
      }
      if (rfqs.some(r => r.status === 'RESPONSE_CLOSED' || r.status === 'COMPARISON' || (r._count?.quotes ?? r.quotes?.length ?? 0) > 0)) {
        return 'Quotations';
      }
      if (rfqs.some(r => r.status === 'RELEASED' || r.status === 'VENDOR_RESPONSE_OPEN')) {
        return 'RFQ Issued';
      }
      return 'Awaiting RFQ';
    };

    // Helper to format linked RFQ items
    const formatRfqItem = (rfq: any) => {
      const quotesCount = rfq._count?.quotes ?? rfq.quotes?.length ?? 0;
      const invitedCount = rfq._count?.invitedVendors ?? rfq.invitedVendors?.length ?? 0;
      const vendorInvitationProgress = `${quotesCount} submitted / ${invitedCount} invited`;

      let quotationStage = '—';
      if (quotesCount > 0) {
        quotationStage = `${quotesCount} Quotes Recorded`;
      } else if (rfq.status === 'RELEASED' || rfq.status === 'VENDOR_RESPONSE_OPEN') {
        quotationStage = 'Awaiting Quotes';
      } else if (rfq.status === 'DRAFT') {
        quotationStage = 'Draft';
      }

      let negotiationStage = '—';
      const rounds = rfq.negotiations?.[0]?.rounds || [];
      if (rfq.status === 'FINAL_RATE_LOCKED') {
        negotiationStage = 'Rates Locked';
      } else if (rounds.length > 0) {
        const latestRound = rounds[0];
        negotiationStage = `Round ${latestRound?.roundNumber || rounds.length} (${latestRound?.status?.replace(/_/g, ' ') || 'Active'})`;
      } else if (rfq.status === 'NEGOTIATION') {
        negotiationStage = 'In Negotiation';
      }

      let awardStatus = 'Not Prepared';
      if (rfq.awards?.some((a: any) => a.status === 'APPROVED')) {
        awardStatus = 'Approved';
      } else if (rfq.awards?.some((a: any) => a.status === 'PENDING_APPROVAL')) {
        awardStatus = 'Pending Approval';
      } else if (rfq.awards?.some((a: any) => a.status === 'REJECTED')) {
        awardStatus = 'Rejected';
      }

      let ppoStatus = '—';
      if (rfq.ppos?.length > 0) {
        ppoStatus = `${rfq.ppos[0].ppoNumber} (${rfq.ppos[0].status})`;
      } else if (rfq.awards?.some((a: any) => a.status === 'APPROVED')) {
        ppoStatus = 'PPO Pending';
      }

      return {
        id: rfq.id,
        rfqNumber: rfq.rfqNumber,
        description: interpolateUiString(UI_STRINGS.common.value1, { "value1": rfq.title || rfq.packageName || 'Commercial Sourcing Package' }),
        packageName: rfq.packageName,
        status: rfq.status,
        vendorInvitationProgress,
        invitedCount,
        quotesCount,
        quotationStage,
        negotiationStage,
        awardStatus,
        ppoStatus,
        estimatedBenchmarkValue: rfq.estimatedBenchmarkValue || 0,
        lastUpdated: rfq.updatedAt || rfq.createdAt,
        openUrl: `/procurement/rfqs/${rfq.id}`,
      };
    };

    // A. Query Authoritative Eligible Approved BOQs
    // Only BOQs that have completed the approval process and are eligible for procurement sourcing
    const eligibleRevisionWhere = {
      OR: [
        { status: 'APPROVED' },
        { prStatus: { in: ['PR_APPROVED', 'PR_RELEASED_TO_PROCUREMENT'] } },
        { prs: { some: { status: { in: ['PR_APPROVED', 'PR_RELEASED_TO_PROCUREMENT'] } } } },
        { boq: { status: 'APPROVED' } },
      ],
    };
    const approvedRevisions = await prisma.boqRevision.findMany({
      where: { tenantId, ...eligibleRevisionWhere },
      include: {
        _count: { select: { rfqs: true } },
        boq: {
          include: {
            project: { select: { id: true, projectCode: true, name: true, location: true, city: true, state: true } },
            costCentre: { select: { id: true, code: true, name: true } },
          },
        },
        costCentre: { select: { id: true, code: true, name: true } },
        prs: {
          where: { status: { in: ['PR_APPROVED', 'PR_RELEASED_TO_PROCUREMENT'] } },
          take: 1,
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          select: {
            id: true,
            prNumber: true,
            title: true,
            status: true,
            totalEstimatedValue: true,
            requestedDate: true,
            projectApprovedAt: true,
            releasedAt: true,
            updatedAt: true,
            createdAt: true,
            totalLines: true,
            costCentre: { select: { id: true, code: true, name: true } },
          },
        },
        rfqs: {
          take: DASHBOARD_RFQ_PREVIEW_LIMIT,
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          include: {
            _count: { select: { invitedVendors: true, quotes: true } },
            negotiations: {
              take: 1,
              orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
              include: {
                rounds: {
                  take: 1,
                  orderBy: [{ roundNumber: 'desc' }, { id: 'desc' }],
                  select: { id: true, roundNumber: true, status: true, counterOfferAmount: true, revisedQuoteAmount: true },
                },
              },
            },
            awards: {
              take: 2,
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              include: { recommendedVendor: { select: { id: true, name: true } } },
            },
            ppos: {
              take: 1,
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              select: { id: true, ppoNumber: true, status: true, totalValue: true },
            },
          },
        },
      },
      orderBy: [{ approvedAt: 'desc' }, { id: 'desc' }],
      take: DASHBOARD_REGISTER_PREVIEW_LIMIT,
    });

    const [approvedBoqCount, awaitingRfqCount] = await Promise.all([
      prisma.boq.count({
        where: { tenantId, revisions: { some: eligibleRevisionWhere } },
      }),
      prisma.boq.count({
        where: {
          tenantId,
          revisions: {
            some: eligibleRevisionWhere,
            none: { AND: [eligibleRevisionWhere, { rfqs: { some: {} } }] },
          },
        },
      }),
    ]);

    const lineGroups = approvedRevisions.length > 0
      ? await prisma.$queryRaw<DashboardApprovedBoqLineAggregate[]>(Prisma.sql`
        SELECT "boqRevisionId", COUNT(*) AS "lineCount",
          COALESCE(SUM(COALESCE("quantity", 0) * CASE WHEN "aiUnitCost" > 0 THEN "aiUnitCost" ELSE 100 END), 0) AS "amount"
        FROM "boq_lines"
        WHERE "tenantId" = ${tenantId}
          AND "boqRevisionId" IN (${Prisma.join(approvedRevisions.map((revision) => revision.id))})
          AND "isDeleted" = false
        GROUP BY "boqRevisionId"
        ORDER BY "boqRevisionId" ASC
      `)
      : [];
    const lineSummaryByRevision = new Map<string, { count: number; amount: number }>();
    for (const group of lineGroups) {
      lineSummaryByRevision.set(group.boqRevisionId, {
        count: Number(group.lineCount || 0),
        amount: Number(group.amount || 0),
      });
    }

    const revisionLineCount = (revisionId: string, fallbackCount = 0) => lineSummaryByRevision.get(revisionId)?.count ?? fallbackCount;

    // Map each unique BOQ to its authoritative approved revision, prioritizing non-zero lines
    const boqMap = new Map<string, any>();
    for (const r of approvedRevisions) {
      const existing = boqMap.get(r.boq.id);
      if (!existing) {
        boqMap.set(r.boq.id, r);
      } else {
        if (revisionLineCount(r.id, (r as unknown as { lines?: unknown[] }).lines?.length || 0) > 0 && revisionLineCount(existing.id, (existing as { lines?: unknown[] }).lines?.length || 0) === 0) {
          boqMap.set(r.boq.id, r);
        } else if (revisionLineCount(existing.id, (existing as { lines?: unknown[] }).lines?.length || 0) > 0 && revisionLineCount(r.id, (r as unknown as { lines?: unknown[] }).lines?.length || 0) === 0) {
          // keep existing
        } else if ((r._count?.rfqs ?? r.rfqs.length) > (existing._count?.rfqs ?? existing.rfqs.length)) {
          boqMap.set(r.boq.id, r);
        } else if (r.revisionNumber > existing.revisionNumber) {
          boqMap.set(r.boq.id, r);
        }
      }
    }

    // Collect all unique RFQs across revisions for each BOQ
    const boqRfqsMap = new Map<string, any[]>();
    const boqRfqCountsMap = new Map<string, number>();
    for (const r of approvedRevisions) {
      const list = boqRfqsMap.get(r.boq.id) || [];
      boqRfqCountsMap.set(r.boq.id, (boqRfqCountsMap.get(r.boq.id) || 0) + (r._count?.rfqs ?? r.rfqs.length));
      for (const rfq of r.rfqs) {
        if (!list.some(x => x.id === rfq.id)) {
          list.push(rfq);
        }
      }
      boqRfqsMap.set(r.boq.id, list);
    }

    // Build the BOQ Register
    const boqRegister: any[] = [];
    for (const [, r] of boqMap.entries()) {
      const allRfqs = boqRfqsMap.get(r.boq.id) || [];
      const fullRfqCount = boqRfqCountsMap.get(r.boq.id) || 0;
      const formattedRfqs = allRfqs.map(formatRfqItem);
      const stage = mapConciseStage(allRfqs);
      const costCentreCode = r.costCentre?.code || r.boq?.costCentre?.code || '—';
      const costCentreDisplay = r.costCentre ? `${r.costCentre.code} - ${r.costCentre.name}` : (r.boq?.costCentre ? `${r.boq.costCentre.code} - ${r.boq.costCentre.name}` : 'General');
      const lineSummary = lineSummaryByRevision.get(r.id);
      const legacyLines = (r as unknown as { lines?: Array<{ quantity?: number | null; aiUnitCost?: number | null; benchmarkRate?: number | null }> }).lines || [];
      const linesAmount = lineSummary?.amount ?? legacyLines.reduce((sum, line) => sum + ((line.quantity || 0) * (line.aiUnitCost || line.benchmarkRate || 100)), 0);
      const amount = linesAmount > 0 ? linesAmount : (r.prs[0]?.totalEstimatedValue || 0);
      const itemCount = revisionLineCount(r.id, legacyLines.length) > 0 ? revisionLineCount(r.id, legacyLines.length) : (r.prs[0]?.totalLines || r.totalLines || 0);
      const date = r.approvedAt || r.submittedAt || r.createdAt;
      const description = r.boq.title || r.boq.description || interpolateUiString(UI_STRINGS.common.commercialBaselineForProject, {
        projectName: r.boq.project?.name || UI_STRINGS.common.project,
      });

      boqRegister.push({
        id: r.id,
        boqId: r.boq.id,
        boqCode: r.boq.boqCode,
        boqNumber: r.boq.boqCode,
        prNumber: r.boq.boqCode, // backwards compatibility
        title: description,
        description,
        projectName: r.boq.project?.name || 'Project',
        projectCode: r.boq.project?.projectCode || '',
        projectId: r.boq.project?.id,
        costCentre: costCentreDisplay,
        costCentreCode,
        itemCount,
        amount,
        requestedValue: amount, // backwards compatibility
        procurementStage: stage,
        sourcingStage: stage, // backwards compatibility
        currentStage: stage, // backwards compatibility
        rfqCount: fullRfqCount,
        canCreateRfq: fullRfqCount === allRfqs.length && !allRfqs.some((x) => x.status !== 'CANCELLED'),
        hasRateCardMatch: rateCardsCount > 0,
        createRfqUrl: `/procurement/rfqs/new?revisionId=${r.id}&projectId=${r.boq.project.id}`,
        rfqs: formattedRfqs,
        date,
        lastUpdated: r.updatedAt || r.createdAt,
      });
    }

    // Sort by date descending
    boqRegister.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return apiSuccess({
      role: ctx.role,
      summaryCards: {
        boqsReceived: awaitingRfqCount,
        prsReceived: awaitingRfqCount, // backwards compatibility
        approvedBoqs: approvedBoqCount,
        rfqsInProgress: rfqsInProgressCount,
        negotiationsPending: negotiationsCount,
        awardsPpoPending: awardsPpoPendingCount,
      },
      boqRegister,
      prRegister: boqRegister, // backwards compatibility
      consolidatedRegister: boqRegister, // backwards compatibility
      approvedBoqsCount: approvedBoqCount,
      registerTotalCount: approvedBoqCount,
      registerPreviewLimit: DASHBOARD_REGISTER_PREVIEW_LIMIT,
      registerHasMore: approvedBoqCount > boqRegister.length,
      awaitingRfqCount,
      activeRfqsCount: rfqsInProgressCount,
      negotiationsCount,
      awardsPendingCount: awardsPpoPendingCount,
      approvedPrsCount: awaitingRfqCount,
    });
  }

  // ── FINANCE_USER ─────────────────────────────────────────
  if (ctx.role === 'FINANCE_USER') {
    const projectWhere = { tenantId };
    const [projects, totalProjects, budgetAggregate, approvedProjects] = await Promise.all([
      prisma.project.findMany({
        where: projectWhere,
        select: {
          id: true,
          projectCode: true,
          name: true,
          costCentre: true,
          budget: true,
          currency: true,
          status: true,
          projectOwner: true,
          updatedAt: true,
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 20,
      }),
      prisma.project.count({ where: projectWhere }),
      prisma.project.aggregate({ where: projectWhere, _sum: { budget: true } }),
      prisma.project.count({ where: { ...projectWhere, status: 'BOQ_APPROVED' } }),
    ]);

    return apiSuccess({
      role: ctx.role,
      projects,
      totalBudget: Number(budgetAggregate._sum.budget || 0),
      totalProjects,
      approvedProjects,
      projectPreviewLimit: 20,
    });
  }

  // ── CATEGORY_MANAGER ─────────────────────────────────────
  // ── CATEGORY_MANAGER ─────────────────────────────────────
  if (ctx.role === 'CATEGORY_MANAGER') {
    const eligibleCategoryRevisionWhere = {
      OR: [
        { status: 'APPROVED' },
        { prStatus: 'PR_RELEASED_TO_PROCUREMENT' },
        { prStatus: 'PR_APPROVED' },
        { prs: { some: { status: { in: ['PR_APPROVED', 'PR_RELEASED_TO_PROCUREMENT'] } } } },
      ],
    };
    const [
      categoryResults,
      uomResults,
      revisionsWithExceptions,
      totalLines,
      approvedRevisionResults,
      approvedPrResults,
      rateCardsCount,
      activeRfqsCount,
      negotiationsCount,
      pendingAwardsCount,
      approvedAwardsWithoutPpoCount,
    ] = await Promise.all([
      prisma.category.findMany({
        where: { tenantId, isActive: true, parentId: null },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: DASHBOARD_TAXONOMY_PREVIEW_LIMIT + 1,
        include: {
          children: {
            where: { isActive: true },
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
            take: DASHBOARD_SUBCATEGORY_PREVIEW_LIMIT + 1,
            select: { id: true, name: true, parentId: true },
          },
        },
      }),
      prisma.uomMaster.findMany({
        where: { tenantId, isActive: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: DASHBOARD_UOM_PREVIEW_LIMIT + 1,
      }),
      prisma.boqRevision.findMany({
        where: { tenantId, OR: [{ warningLines: { gt: 0 } }, { errorLines: { gt: 0 } }] },
        select: {
          id: true,
          revisionCode: true,
          warningLines: true,
          errorLines: true,
          qualityScore: true,
          updatedAt: true,
          boq: { select: { boqCode: true, project: { select: { name: true } } } },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: DASHBOARD_EXCEPTION_PREVIEW_LIMIT,
      }),
      prisma.boqLine.count({ where: { tenantId, isDeleted: false } }),
      prisma.boqRevision.findMany({
        where: { tenantId, ...eligibleCategoryRevisionWhere },
        take: DASHBOARD_REGISTER_PREVIEW_LIMIT + 1,
        include: {
          _count: { select: { rfqs: true } },
          boq: {
            include: {
              project: { select: { id: true, projectCode: true, name: true, location: true, city: true } },
              costCentre: { select: { id: true, code: true, name: true } },
            },
          },
          rfqs: {
            take: DASHBOARD_RFQ_PREVIEW_LIMIT,
            orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
            include: {
              _count: { select: { invitedVendors: true, quotes: true } },
              quotes: {
                take: 1,
                include: { vendor: { select: { id: true, name: true } } },
                orderBy: { totalQuoteAmount: 'asc' },
              },
              negotiations: {
                take: 1,
                orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
                include: {
                  rounds: {
                    take: 1,
                    select: { roundNumber: true, status: true, nextResponsibleParty: true },
                    orderBy: [{ roundNumber: 'desc' }, { id: 'desc' }],
                  },
                },
              },
              awards: {
                take: 2,
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                include: { recommendedVendor: { select: { id: true, name: true } } },
              },
              ppos: {
                take: 1,
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                select: { id: true, ppoNumber: true, status: true, totalValue: true, createdAt: true },
              },
            },
          },
        },
        orderBy: { approvedAt: 'desc' },
      }),
      prisma.procurementRequest.findMany({
        where: {
          tenantId,
          status: { in: ['PR_APPROVED', 'PR_RELEASED_TO_PROCUREMENT'] },
        },
        take: DASHBOARD_REGISTER_PREVIEW_LIMIT + 1,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        include: {
          _count: { select: { lines: true, rfqs: true } },
          project: { select: { id: true, projectCode: true, name: true, location: true, city: true } },
          costCentre: { select: { id: true, code: true, name: true } },
          boq: { select: { id: true, boqCode: true, title: true } },
          boqRevision: { select: { id: true, revisionCode: true } },
          rfqs: {
            take: DASHBOARD_RFQ_PREVIEW_LIMIT,
            orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
            include: {
              _count: { select: { invitedVendors: true, quotes: true } },
              quotes: {
                take: 1,
                include: { vendor: { select: { id: true, name: true } } },
                orderBy: { totalQuoteAmount: 'asc' },
              },
              negotiations: {
                take: 1,
                orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
                include: {
                  rounds: {
                    take: 1,
                    select: { roundNumber: true, status: true, nextResponsibleParty: true },
                    orderBy: [{ roundNumber: 'desc' }, { id: 'desc' }],
                  },
                },
              },
              awards: {
                take: 2,
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                include: { recommendedVendor: { select: { id: true, name: true } } },
              },
              ppos: {
                take: 1,
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                select: { id: true, ppoNumber: true, status: true, totalValue: true, createdAt: true },
              },
            },
          },
        },
      }),
      prisma.vendorRateCard.count({ where: { tenantId, status: 'APPROVED' } }),
      prisma.rfq.count({
        where: {
          tenantId,
          status: { in: ['DRAFT', 'RELEASED', 'VENDOR_RESPONSE_OPEN', 'RESPONSE_CLOSED', 'COMPARISON', 'NEGOTIATION', 'FINAL_RATE_LOCKED'] },
        },
      }),
      prisma.rfq.count({
        where: {
          tenantId,
          OR: [
            { status: { in: ['NEGOTIATION', 'FINAL_RATE_LOCKED'] } },
            { negotiations: { some: { status: 'ACTIVE' } } },
          ],
        },
      }),
      prisma.awardRecommendation.count({ where: { tenantId, status: 'PENDING_APPROVAL' } }),
      prisma.awardRecommendation.count({ where: { tenantId, status: 'APPROVED', ppos: { none: {} } } }),
    ]);

    const [approvedBoqTotalCount, awaitingRfqTotalCount, exceptionTotalCount] = await Promise.all([
      prisma.boq.count({ where: { tenantId, revisions: { some: eligibleCategoryRevisionWhere } } }),
      prisma.boq.count({
        where: {
          tenantId,
          revisions: {
            some: eligibleCategoryRevisionWhere,
            none: { AND: [eligibleCategoryRevisionWhere, { rfqs: { some: {} } }] },
          },
        },
      }),
      prisma.boqRevision.count({ where: { tenantId, OR: [{ warningLines: { gt: 0 } }, { errorLines: { gt: 0 } }] } }),
    ]);

    const taxonomyHasMore = categoryResults.length > DASHBOARD_TAXONOMY_PREVIEW_LIMIT ||
      categoryResults.some((category) => (category.children?.length || 0) > DASHBOARD_SUBCATEGORY_PREVIEW_LIMIT) ||
      uomResults.length > DASHBOARD_UOM_PREVIEW_LIMIT;
    const categories = categoryResults.slice(0, DASHBOARD_TAXONOMY_PREVIEW_LIMIT).map((category) => ({
      ...category,
      children: (category.children || []).slice(0, DASHBOARD_SUBCATEGORY_PREVIEW_LIMIT),
    }));
    const uoms = uomResults.slice(0, DASHBOARD_UOM_PREVIEW_LIMIT);
    const approvedRevisionHasMore = approvedRevisionResults.length > DASHBOARD_REGISTER_PREVIEW_LIMIT;
    const approvedPrHasMore = approvedPrResults.length > DASHBOARD_REGISTER_PREVIEW_LIMIT;
    const approvedRevisions = approvedRevisionResults.slice(0, DASHBOARD_REGISTER_PREVIEW_LIMIT);
    const approvedPrs = approvedPrResults.slice(0, DASHBOARD_REGISTER_PREVIEW_LIMIT);

    const [revisionLineGroups, prLineGroups] = await Promise.all([
      approvedRevisions.length > 0
        ? prisma.boqLine.groupBy({
          by: ['boqRevisionId', 'categoryId', 'aiUnitCost'],
          where: { tenantId, boqRevisionId: { in: approvedRevisions.map((revision) => revision.id) }, isDeleted: false },
          _count: { _all: true },
          _sum: { quantity: true },
        })
        : [],
      approvedPrs.length > 0
        ? prisma.pRLine.groupBy({
          by: ['prId', 'category'],
          where: { tenantId, prId: { in: approvedPrs.map((pr) => pr.id) } },
          _count: { _all: true },
        })
        : [],
    ]);
    const categoryIds = Array.from(new Set(revisionLineGroups.map((group) => group.categoryId).filter((id): id is string => Boolean(id))));
    const lineCategories = categoryIds.length > 0
      ? await readByD1FilterChunks(categoryIds, (chunk) => prisma.category.findMany({ where: { tenantId, id: { in: chunk } }, select: { id: true, name: true } }))
      : [];
    const categoryNameById = new Map(lineCategories.map((category) => [category.id, category.name]));
    const revisionLineSummary = new Map<string, { count: number; amount: number; categories: Set<string> }>();
    for (const group of revisionLineGroups) {
      const summary = revisionLineSummary.get(group.boqRevisionId) || { count: 0, amount: 0, categories: new Set<string>() };
      summary.count += Number(group._count._all || 0);
      summary.amount += Number(group._sum.quantity || 0) * (Number(group.aiUnitCost) > 0 ? Number(group.aiUnitCost) : 100);
      if (group.categoryId) {
        const name = categoryNameById.get(group.categoryId);
        if (name) summary.categories.add(name);
      }
      revisionLineSummary.set(group.boqRevisionId, summary);
    }
    const prCategoriesById = new Map<string, Set<string>>();
    for (const group of prLineGroups) {
      const names = prCategoriesById.get(group.prId) || new Set<string>();
      if (group.category) names.add(group.category);
      prCategoriesById.set(group.prId, names);
    }

    // Helpers to map lifecycle stages and pending actions
    const mapRfqLifecycleStage = (rfq: any): string => {
      if (rfq.ppos?.length > 0 || rfq.status === 'AWARDED') return 'PPO Created';
      const hasApprovedAward = rfq.awards?.some((a: any) => a.status === 'APPROVED');
      if (hasApprovedAward || rfq.status === 'APPROVED') return 'Award Approved';
      const hasPendingAward = rfq.awards?.some((a: any) => a.status === 'PENDING_APPROVAL');
      if (hasPendingAward || rfq.status === 'AWARD_RECOMMENDED') return 'Award Pending Approval';
      if (rfq.status === 'FINAL_RATE_LOCKED') return 'Rates Locked';
      if (rfq.status === 'NEGOTIATION' || (rfq.negotiations?.[0]?.rounds?.length || 0) > 0) return 'Negotiation';
      if (rfq.status === 'RESPONSE_CLOSED' || rfq.status === 'COMPARISON' || (rfq._count?.quotes ?? rfq.quotes?.length ?? 0) > 0) return 'Quotation Comparison';
      if (rfq.status === 'VENDOR_RESPONSE_OPEN' || rfq.status === 'RELEASED') return 'RFQ Issued / Awaiting Quotations';
      if (rfq.status === 'DRAFT') return 'RFQ Preparation';
      if (rfq.status === 'CANCELLED') return 'Closed / Cancelled';
      return 'RFQ Preparation';
    };

    const deriveActionDetails = (rfq: any): { pendingAction: string; nextResponsibleParty: string } => {
      if (rfq.ppos?.length > 0) {
        const ppo = rfq.ppos[0];
        if (ppo.status === 'ACCEPTED' || ppo.status === 'APPROVED') return { pendingAction: 'Order Confirmed & Active', nextResponsibleParty: 'VENDOR' };
        return { pendingAction: `PPO ${ppo.status} — Awaiting Acceptance`, nextResponsibleParty: 'VENDOR' };
      }
      if (rfq.status === 'AWARDED') {
        return { pendingAction: 'Issue PPO / Contract', nextResponsibleParty: 'BUYER' };
      }
      const hasApprovedAward = rfq.awards?.some((a: any) => a.status === 'APPROVED');
      if (hasApprovedAward) {
        return { pendingAction: 'Generate Purchase Order (PPO)', nextResponsibleParty: 'BUYER' };
      }
      const hasPendingAward = rfq.awards?.some((a: any) => a.status === 'PENDING_APPROVAL');
      if (hasPendingAward || rfq.status === 'AWARD_RECOMMENDED') {
        return { pendingAction: 'Award Sanction Approval Pending', nextResponsibleParty: 'APPROVER' };
      }
      if (rfq.status === 'FINAL_RATE_LOCKED') {
        return { pendingAction: 'Submit Award Recommendation', nextResponsibleParty: 'BUYER' };
      }
      const latestRound = rfq.negotiations?.[0]?.rounds?.[0];
      if (latestRound) {
        if (latestRound.nextResponsibleParty === 'VENDOR' || latestRound.status === 'ROUND_ACTIVE') {
          return { pendingAction: 'Vendor Revision Pending', nextResponsibleParty: 'VENDOR' };
        }
        if (latestRound.nextResponsibleParty === 'BUYER' || latestRound.status === 'REVISED_SUBMITTED') {
          return { pendingAction: 'Buyer Review & Counteroffer', nextResponsibleParty: 'BUYER' };
        }
      }
      if (rfq.status === 'NEGOTIATION') {
        return { pendingAction: 'Commercial Negotiation Active', nextResponsibleParty: 'BUYER' };
      }
      if ((rfq._count?.quotes ?? rfq.quotes?.length ?? 0) > 0) {
        return { pendingAction: 'Quotation Comparison & Evaluation', nextResponsibleParty: 'BUYER' };
      }
      if (rfq.status === 'RELEASED' || rfq.status === 'VENDOR_RESPONSE_OPEN') {
        return { pendingAction: 'Awaiting Vendor Bid Submission', nextResponsibleParty: 'VENDOR' };
      }
      if (rfq.status === 'DRAFT') {
        return { pendingAction: 'Release RFQ to Vendors', nextResponsibleParty: 'BUYER' };
      }
      return { pendingAction: 'Awaiting Action', nextResponsibleParty: 'BUYER' };
    };

    const formatRfqItem = (rfq: any) => {
      const quotesCount = rfq._count?.quotes ?? rfq.quotes?.length ?? 0;
      const invitedCount = rfq._count?.invitedVendors ?? rfq.invitedVendors?.length ?? 0;
      const { pendingAction, nextResponsibleParty } = deriveActionDetails(rfq);
      const stage = mapRfqLifecycleStage(rfq);

      const lowestQuote = rfq.quotes?.[0];
      const comparisonStatus = quotesCount > 0
        ? `L1: ${lowestQuote?.vendor?.name || 'Vendor'} (₹${lowestQuote?.totalQuoteAmount?.toLocaleString(I18N_CONFIG.defaultLocale)})`
        : (rfq.status === 'RELEASED' || rfq.status === 'VENDOR_RESPONSE_OPEN' ? 'Awaiting Bids' : 'No Quotes Yet');

      const rounds = rfq.negotiations?.[0]?.rounds || [];
      const negotiationRound = rfq.status === 'FINAL_RATE_LOCKED'
        ? 'Rates Locked'
        : (rounds.length > 0 ? `Round ${rounds[0].roundNumber} (${rounds[0].status?.replace(/_/g, ' ') || 'Active'})` : (rfq.status === 'NEGOTIATION' ? 'Round 1 Active' : '—'));

      const awardStatus = rfq.awards?.some((a: any) => a.status === 'APPROVED')
        ? 'Approved'
        : (rfq.awards?.some((a: any) => a.status === 'PENDING_APPROVAL')
          ? 'Pending Approval'
          : (rfq.status === 'AWARD_RECOMMENDED' ? 'Award Recommended' : (rfq.status === 'AWARDED' ? 'Awarded' : 'Not Prepared')));

      const ppoStatus = rfq.ppos?.length > 0
        ? `${rfq.ppos[0].ppoNumber} (${rfq.ppos[0].status})`
        : (rfq.status === 'AWARDED' || awardStatus === 'Approved' ? 'PPO Pending' : '—');

      return {
        id: rfq.id,
        rfqNumber: rfq.rfqNumber,
        title: interpolateUiString(UI_STRINGS.common.value1, { "value1": rfq.title || rfq.packageName || 'Commercial Sourcing Package' }),
        description: interpolateUiString(UI_STRINGS.common.value1, { "value1": rfq.title || rfq.packageName || 'Commercial Sourcing Package' }),
        packageName: rfq.packageName,
        status: rfq.status,
        stage,
        vendorInvitationProgress: `${quotesCount} submitted / ${invitedCount} invited`,
        invitedCount,
        quotesCount,
        quoteStatus: quotesCount > 0 ? `${quotesCount} Quote${quotesCount > 1 ? 's' : ''} Received` : 'Awaiting Bids',
        comparisonStatus,
        quotationStage: quotesCount > 0 ? `${quotesCount} Quotes Recorded` : 'Awaiting Quotes',
        negotiationRound,
        negotiationStage: negotiationRound,
        pendingAction,
        nextResponsibleParty,
        awardStatus,
        recommendedVendor: rfq.awards?.[0]?.recommendedVendor?.name || null,
        ppoStatus,
        orderStatus: rfq.ppos?.[0]?.status || '—',
        estimatedBenchmarkValue: rfq.estimatedBenchmarkValue || 0,
        lastUpdated: rfq.updatedAt || rfq.createdAt,
        openUrl: `/procurement/rfqs/${rfq.id}`,
        negotiationUrl: `/procurement/rfqs/${rfq.id}?tab=negotiation`,
        awardingUrl: `/procurement/rfqs/${rfq.id}?tab=awarding`,
        ppoUrl: rfq.ppos?.[0] ? `/procurement/ppos/${rfq.ppos[0].id}` : `/procurement/rfqs/${rfq.id}?tab=awarding`,
      };
    };

    // Track BOQs & PR packages uniquely to avoid swallowing records or colliding
    const boqMap = new Map<string, any>();
    const representedRevisionIds = new Set<string>();

    // 1. Process Approved PRs (Primary unit of procurement sourcing in PR-first model)
    for (const pr of approvedPrs) {
      if (pr.boqRevisionId) {
        representedRevisionIds.add(pr.boqRevisionId);
      }
      const prLines = (pr as unknown as { lines?: Array<{ category?: string }> }).lines || [];
      const cats = Array.from(prCategoriesById.get(pr.id) || new Set(prLines.map((line) => line.category).filter(Boolean)));
      const prRfqs = (pr.rfqs || []).map(formatRfqItem);

      let overallStage = 'Approved BOQ — Awaiting RFQ';
      if (prRfqs.some(r => r.stage === 'PPO Created')) overallStage = 'PPO Created';
      else if (prRfqs.some(r => r.stage === 'Award Approved')) overallStage = 'Award Approved';
      else if (prRfqs.some(r => r.stage === 'Award Pending Approval')) overallStage = 'Award Pending Approval';
      else if (prRfqs.some(r => r.stage === 'Rates Locked')) overallStage = 'Rates Locked';
      else if (prRfqs.some(r => r.stage === 'Negotiation')) overallStage = 'Negotiation';
      else if (prRfqs.some(r => r.stage === 'Quotation Comparison')) overallStage = 'Quotation Comparison';
      else if (prRfqs.some(r => r.stage.includes('Awaiting Quotations'))) overallStage = 'RFQ Issued / Awaiting Quotations';
      else if (prRfqs.length > 0) overallStage = 'RFQ Preparation';

      const key = `pr-${pr.id}`;
      boqMap.set(key, {
        id: pr.id,
        prId: pr.id,
        boqId: pr.boqId,
        boqCode: pr.boq?.boqCode || pr.prNumber,
        boqNumber: pr.prNumber,
        prNumber: pr.prNumber,
        title: interpolateUiString(UI_STRINGS.common.value1, { "value1": pr.title || pr.boq?.title || UI_STRINGS.appAppProcurementApprovedPrsPage.procurementPackage }),
        description: interpolateUiString(UI_STRINGS.common.value1, { "value1": pr.title || pr.boq?.title || UI_STRINGS.appAppProcurementApprovedPrsPage.procurementPackage }),
        projectName: pr.project?.name || 'Project',
        projectCode: pr.project?.projectCode || '',
        costCentre: pr.costCentre ? `${pr.costCentre.code} - ${pr.costCentre.name}` : 'General',
        costCentreCode: pr.costCentre?.code || '—',
        category: cats.join(', ') || 'General',
        approvedRevision: pr.boqRevision?.revisionCode || 'R0',
        revisionCode: pr.boqRevision?.revisionCode || 'R0',
        revisionId: pr.boqRevisionId,
        projectId: pr.projectId,
        costCentreId: pr.costCentreId,
        approvedAt: pr.projectApprovedAt || pr.releasedAt || pr.updatedAt,
        totalLines: pr.totalLines || pr._count?.lines || prLines.length || 0,
        benchmarkValue: pr.totalEstimatedValue || 0,
        amount: pr.totalEstimatedValue || 0,
        requestedValue: pr.totalEstimatedValue || 0,
        rfqCount: pr._count?.rfqs ?? prRfqs.length,
        sourcingStage: overallStage,
        currentStage: overallStage,
        overallStage,
        canCreateRfq: (pr._count?.rfqs ?? prRfqs.length) === prRfqs.length && !prRfqs.some((r) => r.status !== 'CANCELLED'),
        hasRateCardMatch: rateCardsCount > 0,
        createRfqUrl: `/procurement/rfqs/new?prId=${pr.id}`,
        rfqs: prRfqs,
        lastUpdated: pr.updatedAt || pr.createdAt,
      });
    }

    // 2. Process Approved BOQ Revisions (Include any approved revision that does not yet have an approved PR)
    for (const rev of approvedRevisions) {
      if (representedRevisionIds.has(rev.id)) {
        // Also ensure any RFQs attached to the revision are visible on the matching PR entry
        for (const [, item] of boqMap.entries()) {
          if (item.revisionId === rev.id) {
            const existingRfqIds = new Set(item.rfqs.map((r: any) => r.id));
            const revRfqs = (rev.rfqs || []).map(formatRfqItem);
            for (const rfq of revRfqs) {
              if (!existingRfqIds.has(rfq.id)) {
                item.rfqs.push(rfq);
                existingRfqIds.add(rfq.id);
              }
            }
            item.rfqCount = Math.max(item.rfqCount || item.rfqs.length, rev._count?.rfqs ?? rev.rfqs.length);
            if (item.rfqs.some((r: any) => r.stage === 'PPO Created')) item.overallStage = 'PPO Created';
            else if (item.rfqs.some((r: any) => r.stage === 'Award Approved')) item.overallStage = 'Award Approved';
            else if (item.rfqs.some((r: any) => r.stage === 'Award Pending Approval')) item.overallStage = 'Award Pending Approval';
            else if (item.rfqs.some((r: any) => r.stage === 'Rates Locked')) item.overallStage = 'Rates Locked';
            else if (item.rfqs.some((r: any) => r.stage === 'Negotiation')) item.overallStage = 'Negotiation';
            else if (item.rfqs.some((r: any) => r.stage === 'Quotation Comparison')) item.overallStage = 'Quotation Comparison';
            item.sourcingStage = item.overallStage;
            item.currentStage = item.overallStage;
            item.canCreateRfq = item.rfqCount === item.rfqs.length && !item.rfqs.some((r: any) => r.status !== 'CANCELLED');
          }
        }
        continue;
      }

      const boqCode = rev.boq.boqCode;
      const lineSummary = revisionLineSummary.get(rev.id);
      const revisionLines = (rev as unknown as { lines?: Array<{ category?: { name: string } | null; quantity?: number | null; aiUnitCost?: number | null; benchmarkRate?: number | null }> }).lines || [];
      const categories = Array.from(lineSummary?.categories || new Set(revisionLines.map((line) => line.category?.name).filter(Boolean)));
      const benchmarkVal = lineSummary?.amount ?? revisionLines.reduce((sum, line) => sum + ((line.quantity || 0) * (line.aiUnitCost || line.benchmarkRate || 100)), 0);
      const rfqs = (rev.rfqs || []).map(formatRfqItem);
      const rfqCount = rev._count?.rfqs ?? rfqs.length;

      let overallStage = 'Approved BOQ — Awaiting RFQ';
      if (rfqs.some(r => r.stage === 'PPO Created')) overallStage = 'PPO Created';
      else if (rfqs.some(r => r.stage === 'Award Approved')) overallStage = 'Award Approved';
      else if (rfqs.some(r => r.stage === 'Award Pending Approval')) overallStage = 'Award Pending Approval';
      else if (rfqs.some(r => r.stage === 'Rates Locked')) overallStage = 'Rates Locked';
      else if (rfqs.some(r => r.stage === 'Negotiation')) overallStage = 'Negotiation';
      else if (rfqs.some(r => r.stage === 'Quotation Comparison')) overallStage = 'Quotation Comparison';
      else if (rfqs.some(r => r.stage.includes('Awaiting Quotations'))) overallStage = 'RFQ Issued / Awaiting Quotations';
      else if (rfqs.length > 0) overallStage = 'RFQ Preparation';

      const key = `rev-${rev.id}`;
      boqMap.set(key, {
        id: rev.id,
        boqId: rev.boq.id,
        boqCode,
        boqNumber: boqCode,
        prNumber: boqCode,
        title: interpolateUiString(UI_STRINGS.common.value1, { "value1": rev.boq.title || `${rev.boq.project.name} — Commercial Baseline` }),
        description: interpolateUiString(UI_STRINGS.common.value1, { "value1": rev.boq.title || `${rev.boq.project.name} — Commercial Baseline` }),
        itemCount: lineSummary?.count ?? (revisionLines.length || rev.totalLines || 0),
        projectName: rev.boq.project.name,
        projectCode: rev.boq.project.projectCode,
        costCentre: rev.boq.costCentre ? `${rev.boq.costCentre.code} - ${rev.boq.costCentre.name}` : 'General',
        costCentreCode: rev.boq.costCentre?.code || '—',
        category: categories.join(', ') || 'General',
        approvedRevision: rev.revisionCode,
        revisionCode: rev.revisionCode,
        revisionId: rev.id,
        projectId: rev.boq.project.id,
        costCentreId: rev.boq.costCentre?.id || null,
        approvedAt: rev.approvedAt || rev.updatedAt,
        totalLines: lineSummary?.count ?? (revisionLines.length || rev.totalLines || 0),
        benchmarkValue: benchmarkVal,
        amount: benchmarkVal,
        requestedValue: benchmarkVal,
        rfqCount,
        sourcingStage: overallStage,
        currentStage: overallStage,
        overallStage,
        canCreateRfq: rfqCount === rfqs.length && !rfqs.some((r) => r.status !== 'CANCELLED'),
        hasRateCardMatch: rateCardsCount > 0,
        createRfqUrl: `/procurement/rfqs/new?revisionId=${rev.id}&projectId=${rev.boq.project.id}`,
        rfqs,
        lastUpdated: rev.updatedAt || rev.createdAt,
      });
    }

    const boqRegister = Array.from(boqMap.values());
    const awardsPpoPendingCount = pendingAwardsCount + approvedAwardsWithoutPpoCount;
    const topCategories = categories;

    return apiSuccess({
      role: ctx.role,
      summaryCards: {
        approvedBoqs: approvedBoqTotalCount,
        prsReceived: awaitingRfqTotalCount,
        awaitingRfq: awaitingRfqTotalCount,
        rfqsInProgress: activeRfqsCount,
        negotiationsPending: negotiationsCount,
        awardsPpoPending: awardsPpoPendingCount,
      },
      boqRegister,
      prRegister: boqRegister,
      consolidatedRegister: boqRegister,
      approvedBoqsList: boqRegister,
      approvedBoqsCount: approvedBoqTotalCount,
      awaitingRfqCount: awaitingRfqTotalCount,
      registerPreviewLimit: DASHBOARD_REGISTER_PREVIEW_LIMIT * 2,
      registerHasMore: approvedRevisionHasMore || approvedPrHasMore,
      exceptionTotalCount,
      taxonomyHasMore,
      activeRfqsCount,
      negotiationsCount,
      awardsPendingCount: awardsPpoPendingCount,
      // Retain taxonomy & quality controls for category manager governance
      categoryCount: categories.length,
      categories: topCategories,
      subcategoryCount: categories.reduce((count, category) => count + category.children.length, 0),
      uomCount: uoms.length,
      uoms,
      revisionsWithExceptions,
      totalLines,
    });
  }

  // ── VIEWER ───────────────────────────────────────────────
  if (ctx.role === 'VIEWER') {
    const projectWhere = { tenantId };
    const [projects, totalProjects] = await Promise.all([
      prisma.project.findMany({
        where: projectWhere,
        select: {
          id: true,
          projectCode: true,
          name: true,
          sector: true,
          status: true,
          boqs: {
            select: {
              id: true,
              revisions: {
                select: { id: true, revisionCode: true, status: true, totalLines: true, qualityScore: true },
                orderBy: [{ revisionNumber: 'desc' }, { id: 'desc' }],
                take: 1,
              },
            },
            orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
            take: 1,
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: DASHBOARD_VIEWER_PROJECT_PREVIEW_LIMIT,
      }),
      prisma.project.count({ where: projectWhere }),
    ]);

    return apiSuccess({
      role: ctx.role,
      projects,
      totalProjects,
      projectPreviewLimit: DASHBOARD_VIEWER_PROJECT_PREVIEW_LIMIT,
      projectsHasMore: totalProjects > projects.length,
    });
  }

  // ── PROJECT_USER (Default Procurement Transaction Dashboard) ────────
  // 1. Transactional Counts
  const [
    totalBoqsRaised,
    boqsPendingApproval,
    approvedBoqs,
    boqsRequiringAction,
  ] = await Promise.all([
    prisma.boq.count({ where: { tenantId } }),
    prisma.boq.count({ where: { tenantId, status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }),
    prisma.boq.count({ where: { tenantId, status: 'APPROVED' } }),
    prisma.boq.count({ where: { tenantId, status: { in: ['DRAFT', 'REJECTED'] } } }),
  ]);

  // 2. Budget Aggregates (Proposed Budget & Approved Budget)
  const [contribTotalAgg, contribApprovedAgg] = await Promise.all([
    prisma.budgetContribution.aggregate({
      where: { tenantId, isSuperSeded: false },
      _sum: { totalEstimatedValue: true },
    }),
    prisma.budgetContribution.aggregate({
      where: { tenantId, status: 'APPROVED', isSuperSeded: false },
      _sum: { acceptedEstimatedValue: true },
    }),
  ]);

  let totalProposedBudget = contribTotalAgg._sum.totalEstimatedValue || 0;
  let totalApprovedBudget = contribApprovedAgg._sum.acceptedEstimatedValue || 0;

  // Fallback if no contributions registered yet
  if (totalProposedBudget === 0) {
    const fallbackBudget = await prisma.$queryRaw<Array<{ total: number | bigint | null }>>`
      SELECT COALESCE(SUM(
        CASE
          WHEN line.aiTotalCost IS NOT NULL AND line.aiTotalCost != 0 THEN line.aiTotalCost
          WHEN line.quantity IS NOT NULL AND line.quantity != 0
            AND line.aiUnitCost IS NOT NULL AND line.aiUnitCost != 0 THEN line.quantity * line.aiUnitCost
          ELSE 0
        END
      ), 0) AS total
      FROM boq_lines AS line
      INNER JOIN boq_revisions AS revision
        ON revision.id = line.boqRevisionId AND revision.tenantId = line.tenantId
      WHERE line.tenantId = ${tenantId}
        AND line.isDeleted = 0
        AND revision.revisionNumber = (
          SELECT MAX(latest.revisionNumber)
          FROM boq_revisions AS latest
          WHERE latest.boqId = revision.boqId AND latest.tenantId = revision.tenantId
        )
    `;
    totalProposedBudget = Number(fallbackBudget[0]?.total || 0);
  }

  if (totalApprovedBudget === 0) {
    const txApproved = await prisma.budgetTransaction.aggregate({
      where: { tenantId, status: 'APPROVED' },
      _sum: { amount: true },
    });
    totalApprovedBudget = txApproved._sum.amount || 0;
  }

  // 3. Recent BOQs (Maximum 5 records)
  const recentBoqsData = await prisma.boq.findMany({
    where: { tenantId },
    orderBy: { updatedAt: 'desc' },
    take: 5,
    include: {
      costCentre: {
        select: { id: true, code: true, name: true },
      },
      project: {
        select: { id: true, projectCode: true, name: true },
      },
      budgetContributions: {
        where: { isSuperSeded: false },
        take: 1,
        orderBy: { createdAt: 'desc' },
        select: { totalEstimatedValue: true, acceptedEstimatedValue: true },
      },
      revisions: {
        orderBy: { revisionNumber: 'desc' },
        take: 1,
        select: { id: true },
      },
    },
  });

  const latestRevisionIds = Array.from(new Set(recentBoqsData.flatMap((boq) => {
    const revisionId = boq.revisions[0]?.id;
    return revisionId ? [revisionId] : [];
  })));
  const recentBoqLineValues = latestRevisionIds.length > 0
    ? await prisma.$queryRaw<DashboardRecentBoqLineValueAggregate[]>(Prisma.sql`
      SELECT "boqRevisionId",
        COALESCE(SUM(CASE
          WHEN "aiTotalCost" IS NOT NULL AND "aiTotalCost" != 0 THEN "aiTotalCost"
          WHEN "quantity" IS NOT NULL AND "quantity" != 0
            AND "aiUnitCost" IS NOT NULL AND "aiUnitCost" != 0 THEN "quantity" * "aiUnitCost"
          ELSE 0
        END), 0) AS "estimatedValue"
      FROM "boq_lines"
      WHERE "tenantId" = ${tenantId}
        AND "isDeleted" = 0
        AND "boqRevisionId" IN (${Prisma.join(latestRevisionIds)})
      GROUP BY "boqRevisionId"
    `)
    : [];
  const estimatedValueByRevision = new Map(recentBoqLineValues.map((row) => [row.boqRevisionId, Number(row.estimatedValue || 0)]));

  const recentBoqs = recentBoqsData.map((b) => {
    const latestRev = b.revisions[0];
    let estimatedValue = latestRev ? estimatedValueByRevision.get(latestRev.id) || 0 : 0;
    if (estimatedValue === 0 && b.budgetContributions?.[0]) {
      estimatedValue = b.budgetContributions[0].totalEstimatedValue || 0;
    }

    const costCentreLabel = b.costCentre
      ? (b.costCentre.name ? `${b.costCentre.name} (${b.costCentre.code})` : b.costCentre.code)
      : '—';

    return {
      id: b.id,
      boqNumber: b.boqCode,
      boqDescription: b.description || '—',
      costCentre: costCentreLabel,
      costCentreCode: b.costCentre?.code || '—',
      costCentreName: b.costCentre?.name || '—',
      estimatedValue,
      status: b.status,
      lastUpdated: b.updatedAt,
      latestRevisionId: latestRev?.id || null,
    };
  });

  // 4. Role-based Pending Actions
  let pendingActions: any[] = [];
  if (ctx.role === 'PROJECT_USER') {
    const actionBoqs = await prisma.boq.findMany({
      where: {
        tenantId,
        status: { in: ['DRAFT', 'REJECTED'] },
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      include: {
        costCentre: { select: { code: true, name: true } },
      },
    });

    pendingActions = actionBoqs.map((b) => ({
      id: b.id,
      boqCode: b.boqCode,
      title: interpolateUiString(UI_STRINGS.common.value1, { "value1": b.title || 'Untitled BOQ' }),
      description: interpolateUiString(UI_STRINGS.common.value1, { "value1": b.description || '' }),
      status: b.status,
      actionText: b.status === 'REJECTED' ? 'Revise and resubmit rejected BOQ' : 'Complete and submit draft BOQ',
      link: `/boq/studio?boqId=${b.id}`,
      severity: b.status === 'REJECTED' ? 'danger' : 'warning',
      updatedAt: b.updatedAt,
    }));
  }

  return apiSuccess({
    role: ctx.role,
    // 6 Transactional Cards
    totalBoqsRaised,
    boqsPendingApproval,
    approvedBoqs,
    boqsRequiringAction,
    totalProposedBudget,
    totalApprovedBudget,
    // Recent BOQs Table
    recentBoqs,
    // Pending Actions based on role
    pendingActions,
  });
  } catch (error) {
    await writeStructuredLog('error', 'dashboard.read_failed', {
      operation: 'load_role_dashboard',
      route: '/api/dashboard',
      requestId: request.headers.get('x-request-id') || null,
      tenantId,
      userId,
      role: ctx.role,
      error: error instanceof Error
        ? { name: error.name, message: error.message.slice(0, 400) }
        : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToFetchDashboardData, 500);
  }
}

