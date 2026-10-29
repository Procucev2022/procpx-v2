// app/api/procurement/approved-boqs/route.ts
// Returns Approved BOQs eligible for Sourcing and RFQ creation
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';

export async function GET(req: NextRequest) {
  const ctx = await requireAuth('BOQ_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const search = searchParams.get('search') || '';

  try {
    const statusCondition = {
      OR: [
        { status: 'APPROVED' },
        { prStatus: 'PR_RELEASED_TO_PROCUREMENT' },
        { prStatus: 'PR_APPROVED' },
        { prs: { some: { status: { in: ['PR_APPROVED', 'PR_RELEASED_TO_PROCUREMENT'] } } } },
      ],
    };

    const where: any = {
      tenantId: ctx.tenantId,
      AND: [statusCondition],
    };

    if (projectId) {
      where.AND.push({ boq: { projectId } });
    }

    if (search) {
      where.AND.push({
        OR: [
          { revisionCode: { contains: search } },
          { boq: { boqCode: { contains: search } } },
          { boq: { project: { name: { contains: search } } } },
          { boq: { project: { projectCode: { contains: search } } } },
        ],
      });
    }

    const approvedRevisions = await prisma.boqRevision.findMany({
      where,
      include: {
        boq: {
          include: {
            project: {
              select: {
                id: true,
                projectCode: true,
                name: true,
                sector: true,
                location: true,
                city: true,
                state: true,
                budget: true,
                currency: true,
              },
            },
          },
        },
        approvedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        lines: {
          where: { isDeleted: false },
          include: {
            category: { select: { id: true, name: true, code: true } },
            uom: { select: { id: true, code: true, name: true } },
          },
        },
        costCentre: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        rfqs: {
          select: {
            id: true,
            rfqNumber: true,
            title: true,
            status: true,
            packageName: true,
            createdAt: true,
            ppos: {
              select: {
                id: true,
                ppoNumber: true,
                status: true,
                totalValue: true,
                issuedAt: true,
                completedAt: true,
                createdAt: true,
                vendor: { select: { id: true, name: true } },
              },
              take: 1,
            },
          },
        },
      },
      orderBy: { approvedAt: 'desc' },
    });

    // Compute summary metrics per approved revision
    const formatted = approvedRevisions.map((rev) => {
      // Calculate benchmark value and category breakdown
      const categoriesMap: Record<string, { category: string; lineCount: number; totalQty: number; estimatedValue: number }> = {};
      let totalBenchmarkValue = 0;

      for (const line of rev.lines) {
        const catName = line.category?.name || 'General';
        const benchmarkRate = (line as any).benchmarkRate || 100; // fallback if benchmark is not set
        const lineTotal = (line.quantity || 0) * benchmarkRate;
        totalBenchmarkValue += lineTotal;

        if (!categoriesMap[catName]) {
          categoriesMap[catName] = {
            category: catName,
            lineCount: 0,
            totalQty: 0,
            estimatedValue: 0,
          };
        }
        categoriesMap[catName].lineCount += 1;
        categoriesMap[catName].totalQty += line.quantity || 0;
        categoriesMap[catName].estimatedValue += lineTotal;
      }

      const linkedPpo = rev.rfqs.find((r: any) => r.ppos && r.ppos.length > 0)?.ppos[0] || null;

      return {
        id: rev.id,
        boqId: rev.boqId,
        boqCode: rev.boq.boqCode || `BOQ-${rev.boq.project.projectCode}`,
        costCentre: rev.costCentre ? `${rev.costCentre.code} - ${rev.costCentre.name}` : undefined,
        projectId: rev.boq.project.id,
        projectCode: rev.boq.project.projectCode,
        projectName: rev.boq.project.name,
        location: [rev.boq.project.city, rev.boq.project.state].filter(Boolean).join(', ') || rev.boq.project.location || '—',
        approvedRevisionCode: rev.revisionCode,
        approvedAt: rev.approvedAt,
        approvedBy: rev.approvedBy?.name || rev.approvedBy?.email || 'Project Approver',
        totalLines: rev.lines.length,
        estimatedBenchmarkValue: totalBenchmarkValue,
        categories: Object.values(categoriesMap),
        rfqCount: rev.rfqs.length,
        rfqs: rev.rfqs,
        linkedPpo,
        lines: rev.lines.map((l) => ({
          id: l.id,
          lineNumber: l.lineNumber || l.itemCode || 'L-1',
          description: l.standardDescription || l.originalDescription,
          specification: l.specification || 'Standard commercial grade',
          category: l.category?.name || 'General',
          subcategory: (l as any).subcategoryId || '',
          uom: l.uom?.code || l.uomRaw || 'NOS',
          quantity: l.quantity,
          benchmarkRate: (l as any).benchmarkRate || 100,
          benchmarkAmount: (l.quantity || 0) * ((l as any).benchmarkRate || 100),
        })),
      };
    });

    return apiSuccess({ approvedBoqs: formatted, total: formatted.length });
  } catch (error: any) {
    console.error('Error fetching approved BOQs for sourcing:', error);
    return apiError(error.message || 'Failed to fetch approved BOQs', 500);
  }
}
