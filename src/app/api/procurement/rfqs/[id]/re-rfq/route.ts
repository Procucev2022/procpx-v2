// app/api/procurement/rfqs/[id]/re-rfq/route.ts
// Initiates a Re-RFQ from an existing RFQ with full audit and cloned scope
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('RFQ_CREATE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  try {
    const body = await req.json();
    const { reason, vendorIds = [], submissionDeadline } = body;

    if (!reason || reason.trim() === '') {
      return apiError(UI_STRINGS.appApiProcurementRfqsIdReRfqRoute.mandatoryJustificationReasonIsRequiredForReRFQ, 400);
    }

    const originalRfq = await prisma.rfq.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        lines: true,
        invitedVendors: true,
      },
    });

    if (!originalRfq) {
      return apiError(UI_STRINGS.appApiProcurementRfqsIdReRfqRoute.originalRFQNotFoundOrAccessDenied, 404);
    }

    // Generate new RFQ Number (Re-RFQ suffix or new sequential number)
    const count = await prisma.rfq.count({ where: { tenantId: ctx.tenantId } });
    const rfqNumber = `${originalRfq.rfqNumber}-R1`;

    // Clone scope lines exactly as inherited from original RFQ
    const newLines = originalRfq.lines.map((l) => ({
      tenantId: ctx.tenantId,
      boqLineId: l.boqLineId,
      lineNumber: l.lineNumber,
      description: l.description,
      specification: l.specification,
      category: l.category,
      subcategory: l.subcategory,
      uom: l.uom,
      quantity: l.quantity,
      benchmarkRate: l.benchmarkRate,
      benchmarkAmount: l.benchmarkAmount,
    }));

    // Selected vendors: default to original invited vendors if none specified
    const targetVendors = vendorIds.length > 0 ? vendorIds : originalRfq.invitedVendors.map((iv) => iv.vendorId);

    const reRfq = await prisma.rfq.create({
      data: {
        tenantId: ctx.tenantId,
        projectId: originalRfq.projectId,
        boqRevisionId: originalRfq.boqRevisionId,
        rfqNumber,
        title: interpolateUiString(UI_STRINGS.appApiProcurementRfqsIdReRfqRoute.reRFQTitle, { "title": originalRfq.title }),
        scopeOfWork: originalRfq.scopeOfWork,
        packageType: originalRfq.packageType,
        packageName: originalRfq.packageName,
        status: 'RELEASED',
        submissionDeadline: submissionDeadline ? new Date(submissionDeadline) : null,
        commercialValidityDays: originalRfq.commercialValidityDays,
        deliveryRequirement: originalRfq.deliveryRequirement,
        paymentTerms: originalRfq.paymentTerms,
        taxTerms: originalRfq.taxTerms,
        estimatedBenchmarkValue: originalRfq.estimatedBenchmarkValue,
        totalLines: originalRfq.totalLines,
        isReRfq: true,
        reRfqReason: reason,
        originalRfqId: originalRfq.id,
        createdById: ctx.userId,
        releasedAt: new Date(),
        lines: {
          create: newLines,
        },
      },
    });

    // Invite vendors
    if (targetVendors.length > 0) {
      await prisma.rfqVendor.createMany({
        data: targetVendors.map((vendorId: string) => ({
          tenantId: ctx.tenantId,
          rfqId: reRfq.id,
          vendorId,
          invitationStatus: 'INVITED',
          submissionStatus: 'PENDING',
        })),
      });
    }

    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      projectId: originalRfq.projectId,
      entityType: 'RFQ',
      entityId: reRfq.id,
      action: 'RERFQ_CREATED',
      description: interpolateUiString(UI_STRINGS.appApiProcurementRfqsIdReRfqRoute.reRFQRfqNumberCreatedFromRfqNumber2ReasonReason, { "rfqNumber": rfqNumber, "rfqNumber2": originalRfq.rfqNumber, "reason": reason }),
      newValue: {
        originalRfqId: originalRfq.id,
        newRfqId: reRfq.id,
        reason,
        vendorCount: targetVendors.length,
      },
    });

    return apiSuccess({ reRfq, message: interpolateUiString(UI_STRINGS.appApiProcurementRfqsIdReRfqRoute.reRFQRfqNumberCreatedSuccessfully, { "rfqNumber": rfqNumber }) }, 201);
  } catch (error: any) {
    console.error('Error creating Re-RFQ:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToInitiateReRfq }), 500);
  }
}
