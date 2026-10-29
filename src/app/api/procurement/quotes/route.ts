// app/api/procurement/quotes/route.ts
// Vendor quote submission and retrieval with immutable version history
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { notifyNextResponsibleParty } from '@/lib/notifications';

export async function GET(req: NextRequest) {
  const ctx = await requireAuth('QUOTE_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const rfqId = searchParams.get('rfqId');
  const vendorId = searchParams.get('vendorId');

  try {
    const where: any = {
      tenantId: ctx.tenantId,
    };

    if (rfqId) where.rfqId = rfqId;
    if (vendorId) where.vendorId = vendorId;

    const quotes = await prisma.quote.findMany({
      where,
      include: {
        vendor: true,
        rfq: {
          select: {
            id: true,
            rfqNumber: true,
            title: true,
            status: true,
          },
        },
        lines: {
          include: {
            rfqLine: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return apiSuccess({ quotes, total: quotes.length });
  } catch (error: any) {
    console.error('Error fetching quotes:', error);
    return apiError(error.message || 'Failed to fetch quotes', 500);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('QUOTE_SUBMIT');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const {
      rfqId,
      vendorId,
      lines = [],
      commercialTerms,
      paymentTermsOffered,
      deliveryLeadTimeDays,
      validUntil,
      status = 'SUBMITTED',
    } = body;

    if (!rfqId || !vendorId || !lines.length) {
      return apiError('RFQ ID, Vendor ID, and line pricing are required', 400);
    }

    if (ctx.role === 'VENDOR') {
      if (!ctx.vendorId) {
        return apiError('Forbidden: vendor record not associated with this user account', 403);
      }
      if (vendorId !== ctx.vendorId) {
        return apiError('Forbidden: you can only submit quotes for your own vendor account', 403);
      }
    }

    // 1. Verify RFQ exists and belongs to this tenant
    const rfq = await prisma.rfq.findFirst({
      where: { id: rfqId, tenantId: ctx.tenantId },
      include: { lines: true },
    });

    if (!rfq) {
      return apiError('RFQ not found or access denied', 404);
    }

    if (ctx.role === 'VENDOR') {
      const isInvited = await prisma.rfqVendor.findFirst({
        where: { rfqId, vendorId: ctx.vendorId!, tenantId: ctx.tenantId },
      });
      if (!isInvited) {
        return apiError('Forbidden: vendor is not invited to this RFQ', 403);
      }
    }

    if (!['RELEASED', 'VENDOR_RESPONSE_OPEN', 'COMPARISON', 'NEGOTIATION'].includes(rfq.status)) {
      return apiError(`RFQ status (${rfq.status}) does not permit vendor quotation submissions`, 400);
    }

    // 2. Verify vendor exists
    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, tenantId: ctx.tenantId },
    });

    if (!vendor) {
      return apiError('Vendor not found or access denied', 404);
    }

    // 3. Check existing quotes for this RFQ & Vendor to increment version
    const existingQuotes = await prisma.quote.findMany({
      where: { rfqId, vendorId, tenantId: ctx.tenantId },
      orderBy: { quoteVersion: 'desc' },
      take: 1,
    });

    const isRevision = existingQuotes.length > 0;
    const nextVersion = isRevision ? existingQuotes[0].quoteVersion + 1 : 1;

    // 4. Calculate commercial values
    let totalBaseAmount = 0;
    let totalTaxAmount = 0;
    let totalDiscountAmount = 0;
    let grandTotalQuoteAmount = 0;

    const quoteLinesData = lines.map((l: any) => {
      const rfqLine = rfq.lines.find((rl) => rl.id === l.rfqLineId);
      const qty = rfqLine ? rfqLine.quantity : 1;
      const unitRate = Number(l.unitRate) || 0;
      const baseLine = unitRate * qty;
      const taxPercent = Number(l.taxPercent) ?? 18.0;
      const discountPercent = Number(l.discountPercent) ?? 0.0;

      const discountAmt = baseLine * (discountPercent / 100);
      const afterDiscount = baseLine - discountAmt;
      const taxAmt = afterDiscount * (taxPercent / 100);
      const lineTotal = afterDiscount + taxAmt;

      totalBaseAmount += baseLine;
      totalDiscountAmount += discountAmt;
      totalTaxAmount += taxAmt;
      grandTotalQuoteAmount += lineTotal;

      return {
        tenantId: ctx.tenantId,
        rfqLineId: l.rfqLineId,
        unitRate,
        taxPercent,
        discountPercent,
        lineTotal,
        remarks: l.remarks || null,
      };
    });

    // Generate Quote Number
    const count = await prisma.quote.count({ where: { tenantId: ctx.tenantId } });
    const quoteNumber = `QTE-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`;

    // 5. Create immutable Quote record
    const quote = await prisma.quote.create({
      data: {
        tenantId: ctx.tenantId,
        rfqId,
        vendorId,
        quoteNumber,
        quoteVersion: nextVersion,
        status,
        totalBaseAmount,
        taxAmount: totalTaxAmount,
        discountAmount: totalDiscountAmount,
        totalQuoteAmount: grandTotalQuoteAmount,
        commercialTerms,
        paymentTermsOffered,
        deliveryLeadTimeDays: Number(deliveryLeadTimeDays) || 30,
        validUntil: validUntil ? new Date(validUntil) : null,
        submittedAt: new Date(),
        submittedBy: ctx.userId,
        lines: {
          create: quoteLinesData,
        },
      },
      include: {
        vendor: true,
        lines: true,
      },
    });

    // 6. Update RFQ Vendor submission status
    await prisma.rfqVendor.upsert({
      where: {
        rfqId_vendorId: { rfqId, vendorId },
      },
      update: {
        submissionStatus: 'SUBMITTED',
        invitationStatus: 'SUBMITTED',
      },
      create: {
        tenantId: ctx.tenantId,
        rfqId,
        vendorId,
        invitationStatus: 'SUBMITTED',
        submissionStatus: 'SUBMITTED',
      },
    });

    // 7. Transition RFQ status to VENDOR_RESPONSE_OPEN or COMPARISON
    if (rfq.status === 'RELEASED') {
      await prisma.rfq.update({
        where: { id: rfqId },
        data: { status: 'VENDOR_RESPONSE_OPEN' },
      });
    }

    // 8. Audit log
    const auditAction = isRevision ? 'QUOTE_REVISED' : 'QUOTE_SUBMITTED';
    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      projectId: rfq.projectId,
      entityType: 'QUOTE',
      entityId: quote.id,
      action: auditAction,
      description: `Quote ${quoteNumber} v${nextVersion} submitted by ${vendor.name} for RFQ ${rfq.rfqNumber}: ₹ ${grandTotalQuoteAmount.toLocaleString()}`,
      newValue: {
        quoteNumber,
        version: nextVersion,
        totalQuoteAmount: grandTotalQuoteAmount,
        baseAmount: totalBaseAmount,
        taxAmount: totalTaxAmount,
      },
    });

    await notifyNextResponsibleParty({
      tenantId: ctx.tenantId,
      event: isRevision ? 'REVISED_QUOTE_RECEIVED' : 'QUOTE_SUBMITTED',
      recordNumber: rfq.rfqNumber,
      entityId: rfq.id,
      actorName: ctx.userName,
      details: {
        vendorName: vendor.name,
        amount: grandTotalQuoteAmount,
      },
    });

    return apiSuccess({ quote, message: `Quote v${nextVersion} submitted successfully` }, 201);
  } catch (error: any) {
    console.error('Error submitting quote:', error);
    return apiError(error.message || 'Failed to submit quote', 500);
  }
}
