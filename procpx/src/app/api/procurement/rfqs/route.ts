// app/api/procurement/rfqs/route.ts
// Handles RFQ listing and RFQ creation from Approved BOQ
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { notifyNextResponsibleParty } from '@/lib/notifications';

export async function GET(req: NextRequest) {
  const ctx = await requireAuth('RFQ_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const projectId = searchParams.get('projectId');
  const search = searchParams.get('search') || '';

  try {
    const where: any = {
      tenantId: ctx.tenantId,
    };

    if (status) {
      if (status === 'active') {
        where.status = {
          in: ['RELEASED', 'VENDOR_RESPONSE_OPEN', 'RESPONSE_CLOSED', 'COMPARISON', 'NEGOTIATION'],
        };
      } else {
        where.status = status;
      }
    }

    if (projectId) {
      where.projectId = projectId;
    }

    if (search) {
      where.OR = [
        { rfqNumber: { contains: search } },
        { title: { contains: search } },
        { packageName: { contains: search } },
        { project: { name: { contains: search } } },
        { project: { projectCode: { contains: search } } },
      ];
    }

    const rfqs = await prisma.rfq.findMany({
      where,
      include: {
        project: {
          select: {
            id: true,
            projectCode: true,
            name: true,
            location: true,
            city: true,
            state: true,
          },
        },
        boqRevision: {
          select: {
            id: true,
            revisionCode: true,
            approvedAt: true,
            boq: {
              select: {
                id: true,
                boqCode: true,
                title: true,
              },
            },
          },
        },
        pr: {
          select: {
            id: true,
            prNumber: true,
            costCentre: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
            boq: {
              select: {
                id: true,
                boqCode: true,
              },
            },
          },
        },
        invitedVendors: {
          include: {
            vendor: {
              select: {
                id: true,
                name: true,
                code: true,
                performanceScore: true,
                complianceStatus: true,
              },
            },
          },
        },
        quotes: {
          select: {
            id: true,
            quoteNumber: true,
            quoteVersion: true,
            vendorId: true,
            totalQuoteAmount: true,
            status: true,
            submittedAt: true,
          },
        },
        negotiations: {
          include: {
            rounds: {
              orderBy: { roundNumber: 'desc' },
              take: 1,
            },
          },
        },
        auctions: {
          select: {
            id: true,
            auctionNumber: true,
            auctionType: true,
            status: true,
            currentLowestBid: true,
          },
        },
        awards: {
          include: {
            recommendedVendor: { select: { id: true, name: true } },
          },
        },
        ppos: {
          select: {
            id: true,
            ppoNumber: true,
            status: true,
            totalValue: true,
          },
        },
        _count: {
          select: {
            lines: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = rfqs.map((rfq: any) => ({
      id: rfq.id,
      rfqNumber: rfq.rfqNumber,
      title: rfq.title,
      scopeOfWork: rfq.scopeOfWork,
      packageType: rfq.packageType,
      packageName: rfq.packageName,
      status: rfq.status,
      submissionDeadline: rfq.submissionDeadline,
      clarificationDeadline: rfq.clarificationDeadline,
      commercialValidityDays: rfq.commercialValidityDays,
      estimatedBenchmarkValue: rfq.estimatedBenchmarkValue,
      totalLines: rfq.totalLines || rfq._count.lines,
      project: rfq.project,
      boqRevision: rfq.boqRevision,
      boqCode: rfq.boqRevision?.boq?.boqCode || rfq.pr?.boq?.boqCode || (rfq.project?.projectCode ? `BOQ-${rfq.project.projectCode}` : 'BOQ-R1'),
      costCentre: rfq.pr?.costCentre ? `${rfq.pr.costCentre.code} - ${rfq.pr.costCentre.name}` : 'CC45 - Fitout',
      location: rfq.project?.location || rfq.project?.city || 'India',
      totalBoqValue: rfq.boqRevision?.boq?.totalBenchmarkAmount || rfq.estimatedBenchmarkValue || 0,
      invitedVendorsCount: rfq.invitedVendors.length,
      invitedVendors: rfq.invitedVendors?.map((iv: any) => ({
        id: iv.id,
        vendorId: iv.vendorId,
        vendorName: iv.vendor?.name,
        invitationStatus: iv.invitationStatus,
        submissionStatus: iv.submissionStatus,
        performanceScore: iv.vendor?.performanceScore,
      })) || [],
      quotesCount: rfq.quotes?.length || 0,
      hasQuotes: (rfq.quotes?.length || 0) > 0,
      lowestQuoteAmount: (rfq.quotes?.length || 0) > 0 ? Math.min(...rfq.quotes.map((q: any) => q.totalQuoteAmount).filter(Boolean)) : null,
      negotiations: rfq.negotiations,
      negotiation: rfq.negotiations[0] || null,
      auction: rfq.auctions[0] || null,
      awards: rfq.awards,
      award: rfq.awards[0] || null,
      ppos: rfq.ppos,
      ppo: rfq.ppos[0] || null,
      createdAt: rfq.createdAt,
      releasedAt: rfq.releasedAt,
    }));

    return apiSuccess({ rfqs: formatted, total: formatted.length });
  } catch (error: any) {
    console.error('Error fetching RFQs:', error);
    return apiError(error.message || 'Failed to fetch RFQs', 500);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('RFQ_CREATE');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const {
      projectId,
      boqRevisionId,
      prId,
      title,
      scopeOfWork,
      packageType = 'SELECTED_LINES',
      packageName,
      selectedLineIds = [],
      categoryName,
      submissionDeadline,
      clarificationDeadline,
      commercialValidityDays = 60,
      deliveryRequirement,
      paymentTerms,
      taxTerms,
      requiredDocuments = [],
      technicalRequirements,
      commercialRequirements,
      vendorIds = [],
      action = 'SAVE_DRAFT',
    } = body;

    let resolvedProjectId = projectId;
    let resolvedBoqRevisionId = boqRevisionId;
    let rfqLinesData: any[] = [];
    let totalBenchmarkValue = 0;
    let boqRevisionCode = 'R0';

    // Path A: Creating RFQ directly from an Approved PR
    if (prId) {
      const pr = await prisma.procurementRequest.findFirst({
        where: { id: prId, tenantId: ctx.tenantId },
        include: {
          project: true,
          costCentre: true,
          boqRevision: true,
          lines: {
            include: { boqLine: true },
          },
        },
      });

      if (!pr) {
        return apiError('Procurement Request not found or access denied', 404);
      }

      if (!['PR_APPROVED', 'PR_RELEASED_TO_PROCUREMENT'].includes(pr.status)) {
        return apiError(`Cannot create RFQ: PR is in '${pr.status}' status. Sourcing is only permitted for APPROVED or RELEASED PRs.`, 400);
      }

      // Check for duplicate active RFQ for this PR
      const existingRfq = await prisma.rfq.findFirst({
        where: {
          tenantId: ctx.tenantId,
          prId,
          status: { not: 'CANCELLED' },
        },
      });

      if (existingRfq) {
        return apiError(
          `An active RFQ (${existingRfq.rfqNumber}) already exists for this approved PR. Duplicate sourcing events are blocked.`,
          409
        );
      }

      resolvedProjectId = pr.projectId;
      resolvedBoqRevisionId = pr.boqRevisionId;
      boqRevisionCode = pr.boqRevision?.revisionCode || 'R0';

      // 1. Check for duplicate line IDs in selection
      if (Array.isArray(selectedLineIds)) {
        const uniqueSet = new Set(selectedLineIds);
        if (uniqueSet.size !== selectedLineIds.length) {
          return apiError('Duplicate line item IDs found in RFQ line selection.', 400);
        }
      }

      // 2. Validate all selected line IDs belong strictly to this approved PR
      const prLineIdMap = new Map(pr.lines.map((l) => [l.id, l]));
      let targetPrLines = pr.lines;

      if (selectedLineIds && selectedLineIds.length > 0) {
        const foreignLineIds = selectedLineIds.filter((id: string) => !prLineIdMap.has(id));
        if (foreignLineIds.length > 0) {
          return apiError(
            `Invalid line item selection: Line ID(s) [${foreignLineIds.join(', ')}] do not belong to the approved PR scope (${pr.prNumber}).`,
            400
          );
        }
        targetPrLines = pr.lines.filter((l) => selectedLineIds.includes(l.id));
      }

      if (targetPrLines.length === 0) {
        return apiError(`At least one approved PR line item must be selected for RFQ from ${pr.prNumber}.`, 400);
      }

      rfqLinesData = targetPrLines.map((l) => {
        const benchmarkRate = (l.estimatedRate !== null && l.estimatedRate !== undefined && l.estimatedRate > 0)
          ? l.estimatedRate
          : (l.boqLine?.aiUnitCost || 100);
        const qty = l.quantity || 1;
        const benchmarkAmount = l.estimatedValue || qty * benchmarkRate;
        totalBenchmarkValue += benchmarkAmount;

        return {
          tenantId: ctx.tenantId,
          projectId: pr.projectId,
          costCentreId: pr.costCentreId,
          boqId: pr.boqId,
          boqRevisionId: pr.boqRevisionId,
          boqLineId: l.boqLineId || null,
          prLineId: l.id,
          lineNumber: l.lineNumber || 'L-1',
          description: l.itemDescription,
          specification: l.specification || l.boqLine?.specification || 'Standard technical specification',
          category: l.category || 'General',
          subcategory: l.subcategory || null,
          uom: l.uom,
          quantity: qty,
          benchmarkRate,
          benchmarkAmount,
        };
      });
    } else {
      // Path B: Creating RFQ directly from an Approved BOQ Revision
      if (!resolvedProjectId || !resolvedBoqRevisionId || !title) {
        return apiError('Project, Approved BOQ Revision, and Title are required', 400);
      }

      const boqRevision = await prisma.boqRevision.findFirst({
        where: {
          id: resolvedBoqRevisionId,
          tenantId: ctx.tenantId,
          OR: [
            { status: 'APPROVED' },
            { prStatus: 'PR_RELEASED_TO_PROCUREMENT' },
            { prStatus: 'PR_APPROVED' },
            { prs: { some: { status: { in: ['PR_APPROVED', 'PR_RELEASED_TO_PROCUREMENT'] } } } },
          ],
        },
        include: {
          lines: {
            where: { isDeleted: false },
            include: { category: true, uom: true },
          },
        },
      });

      if (!boqRevision) {
        return apiError('Approved or Released BOQ Revision not found', 404);
      }

      boqRevisionCode = boqRevision.revisionCode;
      let targetBoqLines = boqRevision.lines;
      const boqLineIdMap = new Map(boqRevision.lines.map((l) => [l.id, l]));

      if (packageType === 'CATEGORY' && categoryName) {
        targetBoqLines = targetBoqLines.filter(
          (l) => (l.category?.name || 'General') === categoryName
        );
      } else if (selectedLineIds && selectedLineIds.length > 0) {
        if (new Set(selectedLineIds).size !== selectedLineIds.length) {
          return apiError('Duplicate line item IDs found in RFQ line selection.', 400);
        }
        const foreignBoqLineIds = selectedLineIds.filter((id: string) => !boqLineIdMap.has(id));
        if (foreignBoqLineIds.length > 0) {
          return apiError(
            `Invalid line item selection: Line ID(s) [${foreignBoqLineIds.join(', ')}] do not belong to the selected BOQ revision (${boqRevision.revisionCode}).`,
            400
          );
        }
        targetBoqLines = targetBoqLines.filter((l) => selectedLineIds.includes(l.id));
      }

      if (targetBoqLines.length === 0) {
        return apiError('At least one BOQ line must be selected for the RFQ scope', 400);
      }

      rfqLinesData = targetBoqLines.map((l) => {
        const benchmarkRate = (l as any).aiUnitCost || (l as any).benchmarkRate || 100;
        const qty = l.quantity ?? 1;
        const benchmarkAmount = qty * benchmarkRate;
        totalBenchmarkValue += benchmarkAmount;

        return {
          tenantId: ctx.tenantId,
          boqLineId: l.id,
          lineNumber: l.lineNumber || l.itemCode || 'L-1',
          description: l.standardDescription || l.originalDescription || 'Line item',
          specification: l.specification || 'Commercial standard specification',
          category: l.category?.name || 'General',
          subcategory: (l as any).subcategoryId || '',
          uom: l.uom?.code || l.uomRaw || 'NOS',
          quantity: qty,
          benchmarkRate,
          benchmarkAmount,
        };
      });
    }

    // 4. Generate next RFQ Number
    const count = await prisma.rfq.count({ where: { tenantId: ctx.tenantId } });
    const rfqNumber = `RFQ-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`;

    const isRelease = action === 'RELEASE_RFQ';
    const initialStatus = isRelease ? 'RELEASED' : 'DRAFT';

    // 5. Create RFQ and lines in database
    const rfq = await prisma.rfq.create({
      data: {
        tenantId: ctx.tenantId,
        projectId: resolvedProjectId,
        boqRevisionId: resolvedBoqRevisionId,
        prId: prId || null,
        rfqNumber,
        title,
        scopeOfWork,
        packageType,
        packageName: packageName || `${packageType} Package`,
        status: initialStatus,
        submissionDeadline: submissionDeadline ? new Date(submissionDeadline) : null,
        clarificationDeadline: clarificationDeadline ? new Date(clarificationDeadline) : null,
        commercialValidityDays: Number(commercialValidityDays) || 60,
        deliveryRequirement,
        paymentTerms,
        taxTerms,
        requiredDocuments: JSON.stringify(requiredDocuments),
        technicalRequirements,
        commercialRequirements,
        estimatedBenchmarkValue: totalBenchmarkValue,
        totalLines: rfqLinesData.length,
        createdById: ctx.userId,
        releasedAt: isRelease ? new Date() : null,
        lines: {
          create: rfqLinesData,
        },
      },
    });

    // 6. Invite selected vendors if provided
    if (vendorIds.length > 0) {
      await prisma.rfqVendor.createMany({
        data: vendorIds.map((vendorId: string) => ({
          tenantId: ctx.tenantId,
          rfqId: rfq.id,
          vendorId,
          invitationStatus: isRelease ? 'INVITED' : 'PENDING',
          submissionStatus: 'PENDING',
        })),
      });
    }

    // 7. Audit log creation
    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      projectId,
      entityType: 'RFQ',
      entityId: rfq.id,
      action: 'RFQ_CREATED',
      description: `RFQ ${rfqNumber} created with ${rfqLinesData.length} lines from approved BOQ revision ${boqRevisionCode} (Status: ${initialStatus})`,
      newValue: {
        rfqNumber,
        title,
        packageType,
        totalLines: rfqLinesData.length,
        benchmarkValue: totalBenchmarkValue,
        status: initialStatus,
      },
    });

    if (isRelease) {
      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        projectId,
        entityType: 'RFQ',
        entityId: rfq.id,
        action: 'RFQ_RELEASED',
        description: `RFQ ${rfqNumber} released to ${vendorIds.length} invited vendors`,
      });

      await notifyNextResponsibleParty({
        tenantId: ctx.tenantId,
        event: 'RFQ_RELEASED',
        recordNumber: rfqNumber,
        entityId: rfq.id,
        actorName: ctx.userName,
      });
    }

    return apiSuccess({ rfq, message: `RFQ ${rfqNumber} successfully created` }, 201);
  } catch (error: any) {
    console.error('Error creating RFQ:', error);
    return apiError(error.message || 'Failed to create RFQ', 500);
  }
}
