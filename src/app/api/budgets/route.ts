// src/app/api/budgets/route.ts - Project & Cost Centre Budget Listing API
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function GET(req: NextRequest) {
  const ctx = await requireAuth('BUDGET_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId') || '';
  const costCentreId = searchParams.get('costCentreId') || '';

  const whereProject: any = { tenantId: ctx.tenantId };
  if (projectId) whereProject.id = projectId;

  // Retrieve project with cost centres, contributions, transactions, and actual costs
  const projectsData: any = await prisma.project.findMany({
    where: whereProject,
    include: {
      costCentres: {
        where: costCentreId ? { id: costCentreId } : undefined,
        include: {
          budgets: true,
          budgetContributions: {
            include: {
              boq: true,
              boqRevision: true,
              approvals: true,
            },
            orderBy: { createdAt: 'desc' },
          },
          budgetTransactions: {
            include: {
              boqLine: { select: { id: true, itemCode: true, originalDescription: true, lineNumber: true } },
              boqRevision: {
                select: {
                  id: true,
                  revisionCode: true,
                  revisionNumber: true,
                  boq: { select: { id: true, boqCode: true, title: true } },
                },
              },
              contribution: {
                select: {
                  id: true,
                  status: true,
                  submittedAt: true,
                  submittedBy: true,
                  projectApprovedAt: true,
                  projectApprovedBy: true,
                  rejectionReason: true,
                  approvals: {
                    select: {
                      id: true,
                      approvalLevel: true,
                      approverId: true,
                      status: true,
                      reason: true,
                      timestamp: true,
                    },
                  },
                },
              },
            },
            orderBy: { budgetDate: 'desc' },
          },
          actualCosts: {
            where: { status: { in: ['APPROVED', 'VERIFIED'] } },
            select: {
              id: true,
              category: true,
              subcategory: true,
              actualAmount: true,
              totalActualAmount: true,
              status: true,
              transactionCode: true,
              actualDate: true,
            },
          },
        },
      },
    },
  });

  const projects: any[] = projectsData || [];

  // Fetch users for user name resolution in transactions ledger
  const allUsers = await prisma.user.findMany({
    where: { tenantId: ctx.tenantId },
    select: { id: true, name: true, email: true },
  });
  const userMap = new Map<string, string>();
  for (const u of allUsers) {
    userMap.set(u.id, u.name || u.email);
  }

  // Calculate project-wide and cost-centre level aggregates
  let totalProjectBudget = 0;
  let approvedProjectBudget = 0;
  let pendingProjectBudget = 0;
  let totalProjectActual = 0;
  let totalProjectArea = 0;

  const costCentreSummaries: any[] = [];
  const allTransactions: any[] = [];

  for (const proj of projects) {
    totalProjectArea += proj.areaSqFt || 0;

    for (const cc of (proj.costCentres || [])) {
      // 1. Contributions totals
      const ccApprovedContrib = (cc.budgetContributions || [])
        .filter((c: any) => c.status === 'APPROVED')
        .reduce((sum: number, c: any) => sum + (c.acceptedEstimatedValue || 0), 0);
      const ccPendingContrib = (cc.budgetContributions || [])
        .filter((c: any) => c.status === 'UNDER_APPROVAL' || c.status === 'PENDING_PROJECT_APPROVAL' || c.status === 'PENDING_FINANCE_APPROVAL')
        .reduce((sum: number, c: any) => sum + (c.totalEstimatedValue || 0), 0);

      // If transactions exist without contributions, fallback to transactions
      const txApproved = (cc.budgetTransactions || []).filter((t: any) => t.status === 'APPROVED').reduce((sum: number, t: any) => sum + t.amount, 0);
      const txPending = (cc.budgetTransactions || [])
        .filter((t: any) => t.status === 'UNDER_APPROVAL' || t.status === 'PENDING_PROJECT_APPROVAL' || t.status === 'PENDING_FINANCE_APPROVAL')
        .reduce((sum: number, t: any) => sum + t.amount, 0);

      const ccApproved = ccApprovedContrib > 0 ? ccApprovedContrib : txApproved;
      const ccPending = ccPendingContrib > 0 ? ccPendingContrib : txPending;
      const ccTotal = ccApproved + ccPending;

      // Actual costs for this cost centre
      const ccActual = (cc.actualCosts || []).reduce((sum: number, a: any) => sum + (a.totalActualAmount || a.actualAmount || 0), 0);
      // Available Balance must be against approved budget, NEVER unapproved pending!
      const ccBalance = Math.max(0, ccApproved - ccActual);

      totalProjectBudget += ccTotal;
      approvedProjectBudget += ccApproved;
      pendingProjectBudget += ccPending;
      totalProjectActual += ccActual;

      const ratePerSqFt = cc.areaSqFt && cc.areaSqFt > 0 ? Math.round((ccApproved / cc.areaSqFt) * 100) / 100 : null;
      const totalRatePerSqFt = cc.areaSqFt && cc.areaSqFt > 0 ? Math.round((ccTotal / cc.areaSqFt) * 100) / 100 : null;
      const actualRatePerSqFt = cc.areaSqFt && cc.areaSqFt > 0 ? Math.round((ccActual / cc.areaSqFt) * 100) / 100 : null;
      const balanceRatePerSqFt = cc.areaSqFt && cc.areaSqFt > 0 ? Math.round((ccBalance / cc.areaSqFt) * 100) / 100 : null;

      // Cost Centre Budget Status
      let budgetStatus = 'DRAFT';
      if ((cc.budgetContributions || []).length > 0) {
        const statuses = cc.budgetContributions.map((c: any) => c.status);
        if (statuses.every((s: string) => s === 'APPROVED')) {
          budgetStatus = 'APPROVED';
        } else if (statuses.some((s: string) => s === 'UNDER_APPROVAL' || s === 'PENDING_PROJECT_APPROVAL')) {
          budgetStatus = 'UNDER_APPROVAL';
        } else if (statuses.some((s: string) => s === 'PENDING_FINANCE_APPROVAL')) {
          budgetStatus = 'PENDING FINANCE APPROVAL';
        } else if (statuses.every((s: string) => s === 'REJECTED')) {
          budgetStatus = 'REJECTED';
        } else if (statuses.some((s: string) => s === 'APPROVED')) {
          budgetStatus = 'PARTIALLY APPROVED';
        } else {
          budgetStatus = 'DRAFT';
        }
      } else if ((cc.budgetTransactions || []).length > 0) {
        const txStatuses = cc.budgetTransactions.map((t: any) => t.status);
        if (txStatuses.every((s: string) => s === 'APPROVED')) budgetStatus = 'APPROVED';
        else if (txStatuses.some((s: string) => s === 'UNDER_APPROVAL' || s === 'PENDING_PROJECT_APPROVAL')) budgetStatus = 'UNDER_APPROVAL';
        else if (txStatuses.every((s: string) => s === 'REJECTED')) budgetStatus = 'REJECTED';
        else if (txStatuses.some((s: string) => s === 'APPROVED')) budgetStatus = 'PARTIALLY APPROVED';
      }

      // Group category totals for this cost centre (combining transactions and actuals)
      const categoryMap = new Map<string, {
        budget: number;
        approved: number;
        pending: number;
        actual: number;
        statuses: Set<string>;
        txCount: number;
      }>();

      for (const tx of (cc.budgetTransactions || [])) {
        const cat = tx.category || 'General';
        const ex = categoryMap.get(cat) || {
          budget: 0,
          approved: 0,
          pending: 0,
          actual: 0,
          statuses: new Set<string>(),
          txCount: 0,
        };
        ex.budget += tx.amount;
        if (tx.status === 'APPROVED') {
          ex.approved += tx.amount;
        } else if (tx.status === 'UNDER_APPROVAL' || tx.status === 'PENDING_PROJECT_APPROVAL' || tx.status === 'PENDING_FINANCE_APPROVAL') {
          ex.pending += tx.amount;
        }
        ex.statuses.add(tx.status);
        ex.txCount += 1;
        categoryMap.set(cat, ex);

        // Format for ledger with full traceability
        const boqCode = tx.boqRevision?.boq?.boqCode || (tx.reference?.match(/BOQ-[0-9]+/)?.[0] || '—');
        const boqRev = tx.boqRevision?.revisionCode || (tx.reference?.match(/R[0-9]+/)?.[0] || 'R0');
        const boqLineRef = tx.boqLine?.lineNumber || (tx.boqLineId ? `Line ${tx.boqLineId.slice(0, 8)}` : '—');

        const submitterId = tx.contribution?.submittedBy || tx.createdBy;
        const approverId = tx.contribution?.projectApprovedBy || (tx.contribution?.approvals?.find((a: any) => a.status === 'APPROVED')?.approverId) || null;
        const approvedAt = tx.contribution?.projectApprovedAt || (tx.contribution?.approvals?.find((a: any) => a.status === 'APPROVED')?.timestamp) || null;
        const rejectionReason = tx.contribution?.rejectionReason || (tx.contribution?.approvals?.find((a: any) => a.status === 'REJECTED')?.reason) || null;

        allTransactions.push({
          id: tx.id,
          transactionCode: tx.transactionCode,
          budgetDate: tx.budgetDate,
          projectId: proj.id,
          projectName: proj.name,
          costCentreId: cc.id,
          costCentreCode: cc.code,
          costCentreName: cc.name,
          category: tx.category,
          subcategory: tx.subcategory,
          boqId: tx.boqId,
          boqNumber: boqCode,
          boqRevision: boqRev,
          boqLineReference: boqLineRef,
          reference: tx.reference,
          description: interpolateUiString(UI_STRINGS.common.value1, { "value1": tx.reference || `${tx.category} Budget Allocation` }),
          amount: tx.amount,
          quantity: tx.quantity,
          rate: tx.rate,
          transactionType: tx.isReversal ? 'REVERSAL' : 'ALLOCATION',
          status: tx.status,
          isReversal: tx.isReversal,
          reversalReason: tx.reversalReason,
          createdBy: tx.createdBy,
          createdByName: userMap.get(tx.createdBy) || tx.createdBy,
          submitter: submitterId,
          submitterName: userMap.get(submitterId) || submitterId,
          submittedAt: tx.contribution?.submittedAt || tx.createdAt,
          approver: approverId,
          approverName: approverId ? (userMap.get(approverId) || approverId) : null,
          approvedAt: approvedAt,
          rejectionReason: rejectionReason,
        });
      }

      // Add actuals to categoryMap
      for (const act of (cc.actualCosts || [])) {
        const cat = act.category || 'General';
        const ex = categoryMap.get(cat) || {
          budget: 0,
          approved: 0,
          pending: 0,
          actual: 0,
          statuses: new Set<string>(),
          txCount: 0,
        };
        ex.actual += (act.totalActualAmount || act.actualAmount || 0);
        categoryMap.set(cat, ex);
      }

      const categories = Array.from(categoryMap.entries()).map(([catName, cData]) => {
        const catApproved = cData.approved;
        const catPending = cData.pending;
        const catBudget = catApproved + catPending;
        const catActual = cData.actual;
        const catBalance = Math.max(0, catApproved - catActual);

        let catStatus = 'DRAFT';
        if (cData.statuses.has('APPROVED') && !cData.statuses.has('UNDER_APPROVAL') && !cData.statuses.has('PENDING_PROJECT_APPROVAL')) {
          catStatus = 'APPROVED';
        } else if (cData.statuses.has('UNDER_APPROVAL') || cData.statuses.has('PENDING_PROJECT_APPROVAL')) {
          catStatus = 'UNDER_APPROVAL';
        } else if (cData.statuses.has('REJECTED') && !cData.statuses.has('APPROVED')) {
          catStatus = 'REJECTED';
        } else if (cData.statuses.has('APPROVED')) {
          catStatus = 'PARTIALLY APPROVED';
        } else if (cData.statuses.has('DRAFT')) {
          catStatus = 'DRAFT';
        } else if (catBudget > 0) {
          catStatus = budgetStatus;
        }

        return {
          category: catName,
          budget: catBudget,
          approvedBudget: catApproved,
          pendingBudget: catPending,
          actual: catActual,
          balance: catBalance,
          ratePerSqFt: cc.areaSqFt && cc.areaSqFt > 0 ? Math.round((catApproved / cc.areaSqFt) * 100) / 100 : null,
          actualRatePerSqFt: cc.areaSqFt && cc.areaSqFt > 0 ? Math.round((catActual / cc.areaSqFt) * 100) / 100 : null,
          balanceRatePerSqFt: cc.areaSqFt && cc.areaSqFt > 0 ? Math.round((catBalance / cc.areaSqFt) * 100) / 100 : null,
          status: catStatus,
          txCount: cData.txCount,
        };
      });

      costCentreSummaries.push({
        id: cc.id,
        projectId: proj.id,
        projectCode: proj.projectCode,
        projectName: proj.name,
        code: cc.code,
        name: cc.name,
        areaSqFt: cc.areaSqFt,
        location: cc.location,
        floorZone: cc.floorZone,
        totalBudget: ccTotal,
        approvedBudget: ccApproved,
        pendingBudget: ccPending,
        actual: ccActual,
        balance: ccBalance,
        budgetStatus,
        ratePerSqFt,
        totalRatePerSqFt,
        actualRatePerSqFt,
        balanceRatePerSqFt,
        categories,
        contributions: cc.budgetContributions,
        transactionsCount: (cc.budgetTransactions || []).length,
      });
    }
  }

  const overallBalance = Math.max(0, approvedProjectBudget - totalProjectActual);
  const overallRatePerSqFt = totalProjectArea > 0 ? Math.round((approvedProjectBudget / totalProjectArea) * 100) / 100 : null;
  const overallActualRatePerSqFt = totalProjectArea > 0 ? Math.round((totalProjectActual / totalProjectArea) * 100) / 100 : null;
  const overallBalanceRatePerSqFt = totalProjectArea > 0 ? Math.round((overallBalance / totalProjectArea) * 100) / 100 : null;

  return apiSuccess({
    kpis: {
      totalBudget: totalProjectBudget,
      approvedBudget: approvedProjectBudget,
      pendingApproval: pendingProjectBudget,
      actual: totalProjectActual,
      balance: overallBalance,
      totalAreaSqFt: totalProjectArea,
      ratePerSqFt: overallRatePerSqFt,
      actualRatePerSqFt: overallActualRatePerSqFt,
      balanceRatePerSqFt: overallBalanceRatePerSqFt,
    },
    costCentres: costCentreSummaries,
    transactions: allTransactions,
  });
}
