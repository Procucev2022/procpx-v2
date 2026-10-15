// app/api/dashboard/route.ts - Role-aware dashboard stats
import { requireAuth, isApiContext, apiSuccess } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const ctx = await requireAuth('PROJECT_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const tenantId = ctx.tenantId;
  const userId = ctx.userId;

  // ── SUPER_ADMIN ──────────────────────────────────────────
  if (ctx.role === 'SUPER_ADMIN') {
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
        include: {
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
      prisma.tenant.findUnique({ where: { id: tenantId } }),
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
    const users = await prisma.user.findMany({
      where: { tenantId },
      select: { id: true, name: true, role: true, email: true },
    });
    const userMap = new Map<string, { name: string; email: string }>();
    users.forEach(u => {
      userMap.set(u.id, { name: u.name, email: u.email });
      userMap.set(u.email, { name: u.name, email: u.email });
    });

    const [pendingPrCount, approvedPrCount, rejectedPrCount, rawPendingPrs] = await Promise.all([
      prisma.procurementRequest.count({ where: { tenantId, status: 'PR_PENDING_PROJECT_APPROVAL' } }),
      prisma.procurementRequest.count({ where: { tenantId, status: { in: ['PR_APPROVED', 'PR_RELEASED_TO_PROCUREMENT'] } } }),
      prisma.procurementRequest.count({ where: { tenantId, status: { in: ['PR_REJECTED', 'PR_RETURNED_FOR_CORRECTION'] } } }),
      prisma.procurementRequest.findMany({
        where: { tenantId, status: 'PR_PENDING_PROJECT_APPROVAL' },
        orderBy: { requestedDate: 'desc' },
        include: {
          project: { select: { id: true, projectCode: true, name: true, sector: true } },
          costCentre: { select: { id: true, code: true, name: true, areaSqFt: true } },
          boq: { select: { id: true, boqCode: true, title: true, description: true, category: true } },
          boqRevision: { select: { id: true, revisionNumber: true, revisionCode: true } },
          lines: {
            include: {
              boqLine: true,
            },
          },
          approvals: { orderBy: { timestamp: 'desc' } },
        },
      }),
    ]);

    const pendingPrs = rawPendingPrs.map(pr => {
      const requester = userMap.get(pr.requestedBy);
      const categories = Array.from(new Set(pr.lines.map(l => l.category).filter(Boolean)));
      return {
        ...pr,
        requesterName: requester?.name || pr.requestedBy,
        requesterEmail: requester?.email || '',
        categories: categories.length > 0 ? categories : (pr.boq?.category ? [pr.boq.category] : ['Standard']),
        hasEnquiry: (pr.approvals || []).some(a => a.status === 'ENQUIRY'),
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
      approvedPrsReceivedCount,
      rfqsInProgressCount,
      negotiationsCount,
      pendingAwardsCount,
      approvedAwardsWithoutPpoCount,
      approvedBoqsCount,
    ] = await Promise.all([
      // 1. PRs Received — approved PRs available to Procurement and not yet fully sourced
      prisma.procurementRequest.count({
        where: {
          tenantId,
          status: { in: ['PR_APPROVED', 'PR_RELEASED_TO_PROCUREMENT'] },
          rfqs: { none: { ppos: { some: {} } } },
        },
      }),
      // 2. RFQs in Progress
      prisma.rfq.count({
        where: {
          tenantId,
          status: { in: ['DRAFT', 'RELEASED', 'VENDOR_RESPONSE_OPEN', 'RESPONSE_CLOSED', 'COMPARISON', 'NEGOTIATION', 'FINAL_RATE_LOCKED'] },
        },
      }),
      // 3. Negotiations Pending
      prisma.rfq.count({
        where: {
          tenantId,
          OR: [
            { status: { in: ['NEGOTIATION', 'FINAL_RATE_LOCKED'] } },
            { negotiations: { some: { status: 'ACTIVE' } } },
          ],
        },
      }),
      // 4. Awards / PPO Pending
      prisma.awardRecommendation.count({
        where: { tenantId, status: 'PENDING_APPROVAL' },
      }),
      prisma.awardRecommendation.count({
        where: { tenantId, status: 'APPROVED', ppos: { none: {} } },
      }),
      // Legacy compatibility
      prisma.boqRevision.count({ where: { tenantId, status: 'APPROVED' } }),
    ]);

    const awardsPpoPendingCount = pendingAwardsCount + approvedAwardsWithoutPpoCount;

    // Helper to map RFQ status to Enterprise Sourcing Stage
    const mapStage = (rfq: any): string => {
      if (!rfq) return 'Approved PR — Awaiting RFQ';
      if (rfq.ppos?.length > 0 || rfq.status === 'AWARDED') return 'PPO Created';
      const hasApprovedAward = rfq.awards?.some((a: any) => a.status === 'APPROVED');
      if (hasApprovedAward || rfq.status === 'APPROVED') return 'Award Approved';
      const hasPendingAward = rfq.awards?.some((a: any) => a.status === 'PENDING_APPROVAL');
      if (hasPendingAward || rfq.status === 'AWARD_RECOMMENDED') return 'Award Pending Approval';
      if (rfq.status === 'FINAL_RATE_LOCKED' || rfq.status === 'NEGOTIATION' || (rfq.negotiations?.[0]?.rounds?.length > 0)) {
        return 'Negotiation';
      }
      if (rfq.status === 'RESPONSE_CLOSED' || rfq.status === 'COMPARISON' || (rfq.quotes?.length > 0)) {
        return 'Quotation Comparison';
      }
      if (rfq.status === 'VENDOR_RESPONSE_OPEN' || rfq.status === 'RELEASED') return 'RFQ Issued / Awaiting Quotations';
      if (rfq.status === 'DRAFT') return 'RFQ Preparation';
      if (rfq.status === 'CANCELLED') return 'Closed / Cancelled';
      return 'RFQ Preparation';
    };

    // A. Fetch all PRs relevant to Procurement for Tenant
    const prs = await prisma.procurementRequest.findMany({
      where: {
        tenantId,
        status: { in: ['PR_APPROVED', 'PR_RELEASED_TO_PROCUREMENT', 'PR_PENDING_PROJECT_APPROVAL', 'CLOSED', 'COMPLETED'] },
      },
      include: {
        project: { select: { id: true, projectCode: true, name: true, location: true, city: true } },
        costCentre: { select: { id: true, code: true, name: true } },
        boq: { select: { id: true, boqCode: true, title: true } },
        boqRevision: { select: { id: true, revisionCode: true } },
        lines: {
          select: { id: true, itemDescription: true, category: true, quantity: true, estimatedRate: true, estimatedValue: true },
        },
        rfqs: {
          include: {
            invitedVendors: { include: { vendor: { select: { id: true, name: true, code: true } } } },
            quotes: { select: { id: true, quoteNumber: true, totalQuoteAmount: true, quoteVersion: true, vendorId: true } },
            negotiations: {
              include: {
                rounds: { select: { id: true, roundNumber: true, status: true, counterOfferAmount: true, revisedQuoteAmount: true } },
              },
            },
            awards: {
              include: { recommendedVendor: { select: { id: true, name: true } } },
            },
            ppos: { select: { id: true, ppoNumber: true, status: true, totalValue: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Check rate cards in tenant to flag rate card eligibility
    const rateCardsCount = await prisma.vendorRateCard.count({
      where: { tenantId, status: 'APPROVED' },
    });

    // B. Build the PR-First Register
    const prRegister: any[] = (prs as any[]).map((pr: any) => {
      const categories = Array.from(new Set(pr.lines.map((l: any) => l.category).filter(Boolean)));
      const linkedRfqs = pr.rfqs || [];

      // Derive overall PR sourcing stage
      let overallStage = 'Approved PR — Awaiting RFQ';
      if (linkedRfqs.some((r: any) => r.ppos?.length > 0 || r.status === 'AWARDED')) {
        overallStage = 'PPO Created';
      } else if (linkedRfqs.some((r: any) => r.awards?.some((a: any) => a.status === 'APPROVED') || r.status === 'APPROVED')) {
        overallStage = 'Award Approved';
      } else if (linkedRfqs.some((r: any) => r.awards?.some((a: any) => a.status === 'PENDING_APPROVAL') || r.status === 'AWARD_RECOMMENDED')) {
        overallStage = 'Award Pending Approval';
      } else if (linkedRfqs.some((r: any) => r.status === 'NEGOTIATION' || r.status === 'FINAL_RATE_LOCKED' || (r.negotiations?.[0]?.rounds?.length || 0) > 0)) {
        overallStage = 'Negotiation';
      } else if (linkedRfqs.some((r: any) => r.status === 'COMPARISON' || r.status === 'RESPONSE_CLOSED' || (r.quotes?.length || 0) > 0)) {
        overallStage = 'Quotation Comparison';
      } else if (linkedRfqs.some((r: any) => r.status === 'RELEASED' || r.status === 'VENDOR_RESPONSE_OPEN')) {
        overallStage = 'RFQ Issued / Awaiting Quotations';
      } else if (linkedRfqs.some((r: any) => r.status === 'DRAFT')) {
        overallStage = 'RFQ Preparation';
      }

      // Format nested RFQ records
      const formattedRfqs = linkedRfqs.map((rfq: any) => {
        const quotesCount = rfq.quotes?.length || 0;
        const invitedCount = rfq.invitedVendors?.length || 0;
        const vendorInvitationProgress = `${quotesCount} submitted / ${invitedCount} invited`;

        // Quotation Stage
        let quotationStage = '—';
        if (quotesCount > 0) {
          quotationStage = `${quotesCount} Quotes Recorded`;
        } else if (rfq.status === 'RELEASED' || rfq.status === 'VENDOR_RESPONSE_OPEN') {
          quotationStage = 'Awaiting Quotes';
        } else if (rfq.status === 'DRAFT') {
          quotationStage = 'Draft';
        }

        // Negotiation Stage
        let negotiationStage = '—';
        const rounds = rfq.negotiations?.[0]?.rounds || [];
        if (rfq.status === 'FINAL_RATE_LOCKED') {
          negotiationStage = 'Rates Locked';
        } else if (rounds.length > 0) {
          negotiationStage = `Round ${rounds.length} (${rounds[rounds.length - 1]?.status?.replace(/_/g, ' ') || 'Active'})`;
        } else if (rfq.status === 'NEGOTIATION') {
          negotiationStage = 'In Negotiation';
        }

        // Award Status
        let awardStatus = 'Not Prepared';
        if (rfq.awards?.some((a: any) => a.status === 'APPROVED')) {
          awardStatus = 'Approved';
        } else if (rfq.awards?.some((a: any) => a.status === 'PENDING_APPROVAL')) {
          awardStatus = 'Pending Approval';
        } else if (rfq.awards?.some((a: any) => a.status === 'REJECTED')) {
          awardStatus = 'Rejected';
        }

        // PPO Status
        let ppoStatus = '—';
        if (rfq.ppos?.length > 0) {
          ppoStatus = `${rfq.ppos[0].ppoNumber} (${rfq.ppos[0].status})`;
        } else if (rfq.awards?.some((a: any) => a.status === 'APPROVED')) {
          ppoStatus = 'PPO Pending';
        }

        return {
          id: rfq.id,
          rfqNumber: rfq.rfqNumber,
          description: rfq.title || rfq.packageName || 'Commercial Sourcing Package',
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
      });

      return {
        id: pr.id,
        prId: pr.id,
        prNumber: pr.prNumber,
        description: pr.title || pr.boq?.title || 'Procurement Package',
        boqCode: pr.boq?.boqCode || pr.boqRevision?.revisionCode || '—',
        projectName: pr.project?.name || 'Project',
        projectCode: pr.project?.projectCode || '',
        costCentre: pr.costCentre ? `${pr.costCentre.code} - ${pr.costCentre.name}` : 'General',
        category: categories.join(', ') || 'General',
        requestedValue: pr.totalEstimatedValue || 0,
        prApprovalStatus: pr.status,
        sourcingStage: overallStage,
        currentStage: overallStage,
        rfqCount: linkedRfqs.length,
        canCreateRfq: !linkedRfqs.some((r: any) => r.status !== 'CANCELLED'),
        hasRateCardMatch: rateCardsCount > 0,
        rfqs: formattedRfqs,
        lastUpdated: pr.updatedAt || pr.createdAt,
      };
    });

    // Also build consolidatedRegister for backwards compatibility with existing callers
    const consolidatedRegister = prRegister.map((pr: any) => {
      const firstRfq = pr.rfqs[0] || null;
      return {
        id: `pr-${pr.id}`,
        prId: pr.id,
        prNumber: pr.prNumber,
        rfqId: firstRfq?.id || null,
        rfqNumber: firstRfq?.rfqNumber || null,
        description: pr.description,
        projectName: pr.projectName,
        projectCode: pr.projectCode,
        costCentre: pr.costCentre,
        category: pr.category,
        estimatedValue: firstRfq?.estimatedBenchmarkValue || pr.requestedValue,
        currentStage: pr.sourcingStage,
        lastUpdated: pr.lastUpdated,
        canCreateRfq: pr.canCreateRfq,
        hasRateCardMatch: pr.hasRateCardMatch,
        rfqStatus: firstRfq?.status || null,
        ppoNumber: firstRfq?.ppoStatus !== '—' ? firstRfq?.ppoStatus : null,
      };
    });

    return apiSuccess({
      role: ctx.role,
      summaryCards: {
        prsReceived: approvedPrsReceivedCount,
        rfqsInProgress: rfqsInProgressCount,
        negotiationsPending: negotiationsCount,
        awardsPpoPending: awardsPpoPendingCount,
        // Compatibility keys
        approvedPrsReceived: approvedPrsReceivedCount,
        awaitingQuotations: rfqsInProgressCount,
        pendingAwardPpo: awardsPpoPendingCount,
      },
      prRegister,
      consolidatedRegister,
      // Compatibility fields
      approvedBoqsCount,
      activeRfqsCount: rfqsInProgressCount,
      comparisonRequiredCount: rfqsInProgressCount,
      negotiationsCount,
      awardsPendingCount: awardsPpoPendingCount,
      approvedPrsCount: approvedPrsReceivedCount,
    });
  }

  // ── FINANCE_USER ─────────────────────────────────────────
  if (ctx.role === 'FINANCE_USER') {
    const projects = await prisma.project.findMany({
      where: { tenantId },
      include: {
        boqs: {
          include: {
            revisions: {
              orderBy: { revisionNumber: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const totalBudget = projects.reduce((acc, p) => acc + (p.budget || 0), 0);
    const approvedCount = projects.filter(p => p.status === 'BOQ_APPROVED').length;

    return apiSuccess({
      role: ctx.role,
      projects,
      totalBudget,
      totalProjects: projects.length,
      approvedProjects: approvedCount,
    });
  }

  // ── CATEGORY_MANAGER ─────────────────────────────────────
  // ── CATEGORY_MANAGER ─────────────────────────────────────
  if (ctx.role === 'CATEGORY_MANAGER') {
    const [
      categories,
      uoms,
      revisionsWithExceptions,
      totalLines,
      approvedRevisions,
      approvedPrs,
      rateCardsCount,
      activeRfqsCount,
      negotiationsCount,
      pendingAwardsCount,
      approvedAwardsWithoutPpoCount,
    ] = await Promise.all([
      prisma.category.findMany({
        where: { tenantId, isActive: true },
        include: { children: true },
      }),
      prisma.uomMaster.findMany({ where: { tenantId, isActive: true } }),
      prisma.boqRevision.findMany({
        where: { tenantId, OR: [{ warningLines: { gt: 0 } }, { errorLines: { gt: 0 } }] },
        include: { boq: { include: { project: true } } },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.boqLine.count({ where: { tenantId, isDeleted: false } }),
      prisma.boqRevision.findMany({
        where: {
          tenantId,
          OR: [
            { status: 'APPROVED' },
            { prStatus: 'PR_RELEASED_TO_PROCUREMENT' },
            { prStatus: 'PR_APPROVED' },
            { prs: { some: { status: { in: ['PR_APPROVED', 'PR_RELEASED_TO_PROCUREMENT'] } } } },
          ],
        },
        include: {
          boq: {
            include: {
              project: { select: { id: true, projectCode: true, name: true, location: true, city: true } },
              costCentre: { select: { id: true, code: true, name: true } },
            },
          },
          lines: {
            where: { isDeleted: false },
            include: {
              category: { select: { id: true, name: true } },
              uom: { select: { id: true, code: true } },
            },
          },
          rfqs: {
            include: {
              invitedVendors: { include: { vendor: { select: { id: true, name: true, code: true } } } },
              quotes: {
                include: { vendor: { select: { id: true, name: true } } },
                orderBy: { totalQuoteAmount: 'asc' },
              },
              negotiations: {
                include: {
                  rounds: {
                    include: { vendor: { select: { id: true, name: true } } },
                    orderBy: { roundNumber: 'desc' },
                  },
                },
              },
              awards: {
                include: { recommendedVendor: { select: { id: true, name: true } } },
              },
              ppos: {
                select: { id: true, ppoNumber: true, status: true, totalValue: true, createdAt: true },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { approvedAt: 'desc' },
      }),
      prisma.procurementRequest.findMany({
        where: {
          tenantId,
          status: { in: ['PR_APPROVED', 'PR_RELEASED_TO_PROCUREMENT'] },
        },
        include: {
          project: { select: { id: true, projectCode: true, name: true, location: true, city: true } },
          costCentre: { select: { id: true, code: true, name: true } },
          boq: { select: { id: true, boqCode: true, title: true } },
          boqRevision: { select: { id: true, revisionCode: true } },
          lines: { select: { id: true, category: true, quantity: true, estimatedRate: true, estimatedValue: true } },
          rfqs: {
            include: {
              invitedVendors: { include: { vendor: { select: { id: true, name: true, code: true } } } },
              quotes: {
                include: { vendor: { select: { id: true, name: true } } },
                orderBy: { totalQuoteAmount: 'asc' },
              },
              negotiations: {
                include: {
                  rounds: {
                    include: { vendor: { select: { id: true, name: true } } },
                    orderBy: { roundNumber: 'desc' },
                  },
                },
              },
              awards: {
                include: { recommendedVendor: { select: { id: true, name: true } } },
              },
              ppos: {
                select: { id: true, ppoNumber: true, status: true, totalValue: true, createdAt: true },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { updatedAt: 'desc' },
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

    // Helpers to map lifecycle stages and pending actions
    const mapRfqLifecycleStage = (rfq: any): string => {
      if (!rfq) return 'Approved BOQ — Awaiting RFQ';
      if (rfq.ppos?.length > 0 || rfq.status === 'AWARDED') return 'PPO Created';
      const hasApprovedAward = rfq.awards?.some((a: any) => a.status === 'APPROVED');
      if (hasApprovedAward || rfq.status === 'APPROVED') return 'Award Approved';
      const hasPendingAward = rfq.awards?.some((a: any) => a.status === 'PENDING_APPROVAL');
      if (hasPendingAward || rfq.status === 'AWARD_RECOMMENDED') return 'Award Pending Approval';
      if (rfq.status === 'FINAL_RATE_LOCKED') return 'Rates Locked';
      if (rfq.status === 'NEGOTIATION' || (rfq.negotiations?.[0]?.rounds?.length || 0) > 0) return 'Negotiation';
      if (rfq.status === 'RESPONSE_CLOSED' || rfq.status === 'COMPARISON' || (rfq.quotes?.length || 0) > 0) return 'Quotation Comparison';
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
      if ((rfq.quotes?.length || 0) > 0) {
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
      const quotesCount = rfq.quotes?.length || 0;
      const invitedCount = rfq.invitedVendors?.length || 0;
      const { pendingAction, nextResponsibleParty } = deriveActionDetails(rfq);
      const stage = mapRfqLifecycleStage(rfq);

      const lowestQuote = rfq.quotes?.[0];
      const comparisonStatus = quotesCount > 0
        ? `L1: ${lowestQuote?.vendor?.name || 'Vendor'} (₹${lowestQuote?.totalQuoteAmount?.toLocaleString('en-IN')})`
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
        title: rfq.title || rfq.packageName || 'Commercial Sourcing Package',
        description: rfq.title || rfq.packageName || 'Commercial Sourcing Package',
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
      const cats = Array.from(new Set(pr.lines.map((l: any) => l.category).filter(Boolean)));
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
        title: pr.title || pr.boq?.title || 'Procurement Package',
        description: pr.title || pr.boq?.title || 'Procurement Package',
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
        totalLines: pr.lines.length,
        benchmarkValue: pr.totalEstimatedValue || 0,
        amount: pr.totalEstimatedValue || 0,
        requestedValue: pr.totalEstimatedValue || 0,
        rfqCount: prRfqs.length,
        sourcingStage: overallStage,
        currentStage: overallStage,
        overallStage,
        canCreateRfq: !prRfqs.some((r: any) => r.status !== 'CANCELLED'),
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
            item.rfqCount = item.rfqs.length;
            if (item.rfqs.some((r: any) => r.stage === 'PPO Created')) item.overallStage = 'PPO Created';
            else if (item.rfqs.some((r: any) => r.stage === 'Award Approved')) item.overallStage = 'Award Approved';
            else if (item.rfqs.some((r: any) => r.stage === 'Award Pending Approval')) item.overallStage = 'Award Pending Approval';
            else if (item.rfqs.some((r: any) => r.stage === 'Rates Locked')) item.overallStage = 'Rates Locked';
            else if (item.rfqs.some((r: any) => r.stage === 'Negotiation')) item.overallStage = 'Negotiation';
            else if (item.rfqs.some((r: any) => r.stage === 'Quotation Comparison')) item.overallStage = 'Quotation Comparison';
            item.sourcingStage = item.overallStage;
            item.currentStage = item.overallStage;
            item.canCreateRfq = !item.rfqs.some((r: any) => r.status !== 'CANCELLED');
          }
        }
        continue;
      }

      const boqCode = rev.boq.boqCode;
      const categories = Array.from(new Set(rev.lines.map((l: any) => l.category?.name).filter(Boolean)));
      const benchmarkVal = rev.lines.reduce((s: number, l: any) => s + ((l.quantity || 0) * ((l as any).benchmarkRate || 100)), 0);
      const rfqs = (rev.rfqs || []).map(formatRfqItem);

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
        title: rev.boq.title || `${rev.boq.project.name} — Commercial Baseline`,
        description: rev.boq.title || `${rev.boq.project.name} — Commercial Baseline`,
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
        totalLines: rev.lines.length,
        benchmarkValue: benchmarkVal,
        amount: benchmarkVal,
        requestedValue: benchmarkVal,
        rfqCount: rfqs.length,
        sourcingStage: overallStage,
        currentStage: overallStage,
        overallStage,
        canCreateRfq: !rfqs.some((r: any) => r.status !== 'CANCELLED'),
        hasRateCardMatch: rateCardsCount > 0,
        createRfqUrl: `/procurement/rfqs/new?revisionId=${rev.id}&projectId=${rev.boq.project.id}`,
        rfqs,
        lastUpdated: rev.updatedAt || rev.createdAt,
      });
    }

    const boqRegister = Array.from(boqMap.values());
    const awaitingRfqCount = boqRegister.filter(
      (b) =>
        b.sourcingStage.includes('Awaiting RFQ') ||
        b.sourcingStage === 'RFQ Preparation' ||
        !b.rfqs ||
        b.rfqs.length === 0
    ).length;
    const awardsPpoPendingCount = pendingAwardsCount + approvedAwardsWithoutPpoCount;
    const topCategories = categories.filter(c => !c.parentId);
    const totalSubcategories = categories.filter(c => c.parentId).length;

    return apiSuccess({
      role: ctx.role,
      summaryCards: {
        approvedBoqs: boqRegister.length,
        prsReceived: awaitingRfqCount,
        awaitingRfq: awaitingRfqCount,
        rfqsInProgress: activeRfqsCount,
        negotiationsPending: negotiationsCount,
        awardsPpoPending: awardsPpoPendingCount,
      },
      boqRegister,
      prRegister: boqRegister,
      consolidatedRegister: boqRegister,
      approvedBoqsList: boqRegister,
      approvedBoqsCount: boqRegister.length,
      activeRfqsCount,
      negotiationsCount,
      awardsPendingCount: awardsPpoPendingCount,
      // Retain taxonomy & quality controls for category manager governance
      categoryCount: topCategories.length,
      categories: topCategories,
      subcategoryCount: totalSubcategories,
      uomCount: uoms.length,
      uoms,
      revisionsWithExceptions,
      totalLines,
    });
  }

  // ── VIEWER ───────────────────────────────────────────────
  if (ctx.role === 'VIEWER') {
    const projects = await prisma.project.findMany({
      where: { tenantId },
      include: {
        boqs: {
          include: {
            revisions: {
              select: { id: true, revisionCode: true, status: true, totalLines: true, qualityScore: true },
              orderBy: { revisionNumber: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return apiSuccess({
      role: ctx.role,
      projects,
      totalProjects: projects.length,
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
    const boqsWithLines = await prisma.boq.findMany({
      where: { tenantId },
      include: {
        revisions: {
          orderBy: { revisionNumber: 'desc' },
          take: 1,
          include: {
            lines: {
              where: { isDeleted: false },
              select: { aiTotalCost: true, quantity: true, aiUnitCost: true },
            },
          },
        },
      },
    });
    totalProposedBudget = boqsWithLines.reduce((acc, b) => {
      const rev = b.revisions[0];
      const val = rev?.lines?.reduce((s, l) => s + (l.aiTotalCost || (l.quantity && l.aiUnitCost ? l.quantity * l.aiUnitCost : 0) || 0), 0) || 0;
      return acc + val;
    }, 0);
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
        include: {
          lines: {
            where: { isDeleted: false },
            select: { aiTotalCost: true, quantity: true, aiUnitCost: true },
          },
        },
      },
    },
  });

  const recentBoqs = recentBoqsData.map((b) => {
    const latestRev = b.revisions[0];
    let estimatedValue = latestRev?.lines?.reduce((sum, l) => sum + (l.aiTotalCost || (l.quantity && l.aiUnitCost ? l.quantity * l.aiUnitCost : 0) || 0), 0) || 0;
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
      title: b.title || 'Untitled BOQ',
      description: b.description || '',
      status: b.status,
      actionText: b.status === 'REJECTED' ? 'Revise and resubmit rejected BOQ' : 'Complete and submit draft BOQ',
      link: `/boq/studio?boqId=${b.id}`,
      severity: b.status === 'REJECTED' ? 'danger' : 'warning',
      updatedAt: b.updatedAt,
    }));
  } else if ((ctx.role as string) === 'PROJECT_APPROVER') {
    const reviewBoqs = await prisma.boq.findMany({
      where: {
        tenantId,
        status: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      include: {
        costCentre: { select: { code: true, name: true } },
      },
    });

    pendingActions = reviewBoqs.map((b) => ({
      id: b.id,
      boqCode: b.boqCode,
      title: b.title || 'Untitled BOQ',
      description: b.description || '',
      status: b.status,
      actionText: 'Review and approve pending BOQ submission',
      link: `/boq/studio?boqId=${b.id}`,
      severity: 'warning',
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
}

