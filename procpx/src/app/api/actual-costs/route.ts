// src/app/api/actual-costs/route.ts
// Handles Actual Cost listing and creation (GRN, Invoice, Manual adjustment, ERP actual)

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const ctx = await requireAuth('ACTUAL_COST_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const costCentreId = searchParams.get('costCentreId');
  const boqLineId = searchParams.get('boqLineId');
  const ppoId = searchParams.get('ppoId');
  const source = searchParams.get('source');
  const status = searchParams.get('status');

  const where: any = {
    tenantId: ctx.tenantId,
  };

  if (projectId) where.projectId = projectId;
  if (costCentreId) where.costCentreId = costCentreId;
  if (boqLineId) where.boqLineId = boqLineId;
  if (ppoId) where.ppoId = ppoId;
  if (source) where.source = source;
  if (status) where.status = status;

  const transactions = await prisma.actualCostTransaction.findMany({
    where,
    orderBy: { actualDate: 'desc' },
    include: {
      project: { select: { id: true, name: true, projectCode: true } },
      costCentre: { select: { id: true, code: true, name: true } },
      boqLine: { select: { id: true, lineNumber: true, originalDescription: true, uomRaw: true } },
      prLine: { select: { id: true, lineNumber: true, itemDescription: true } },
      rfqLine: { select: { id: true, lineNumber: true, description: true } },
      ppo: { select: { id: true, ppoNumber: true, title: true } },
      ppoLine: { select: { id: true, lineNumber: true, itemDescription: true, orderedQuantity: true, orderedUnitRate: true } },
      vendor: { select: { id: true, name: true, code: true } },
    },
  });

  return apiSuccess(transactions);
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('ACTUAL_COST_CREATE');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const {
      projectId,
      costCentreId,
      category,
      subcategory,
      boqId,
      boqRevisionId,
      boqLineId,
      prId,
      prLineId,
      rfqId,
      rfqLineId,
      ppoId,
      ppoLineId,
      vendorId,
      actualQuantity,
      actualUnitRate,
      actualAmount,
      taxAmount = 0,
      actualDate = new Date().toISOString(),
      source = 'MANUAL_ADJUSTMENT',
      status = 'APPROVED',
      completionReference,
      externalReference,
      erpDocumentNumber,
      erpDate,
      remarks,
      documents,
    } = body;

    if (!projectId || !category || actualQuantity === undefined || actualUnitRate === undefined) {
      return apiError('Project, category, actualQuantity, and actualUnitRate are required', 400);
    }

    const calculatedAmount = actualAmount !== undefined ? Number(actualAmount) : Number(actualQuantity) * Number(actualUnitRate);
    const totalActualAmount = calculatedAmount + Number(taxAmount);

    const txCount = await prisma.actualCostTransaction.count({ where: { tenantId: ctx.tenantId } });
    const transactionCode = `ACT-${new Date().getFullYear()}-${String(txCount + 1).padStart(6, '0')}`;

    const actualTx = await prisma.actualCostTransaction.create({
      data: {
        tenantId: ctx.tenantId,
        transactionCode,
        projectId,
        costCentreId: costCentreId || null,
        category,
        subcategory: subcategory || null,
        boqId: boqId || null,
        boqRevisionId: boqRevisionId || null,
        boqLineId: boqLineId || null,
        prId: prId || null,
        prLineId: prLineId || null,
        rfqId: rfqId || null,
        rfqLineId: rfqLineId || null,
        ppoId: ppoId || null,
        ppoLineId: ppoLineId || null,
        vendorId: vendorId || null,
        actualQuantity: Number(actualQuantity),
        actualUnitRate: Number(actualUnitRate),
        actualAmount: calculatedAmount,
        taxAmount: Number(taxAmount),
        totalActualAmount,
        actualDate: new Date(actualDate),
        source,
        status,
        completionReference: completionReference || null,
        externalReference: externalReference || null,
        erpDocumentNumber: erpDocumentNumber || null,
        erpDate: erpDate ? new Date(erpDate) : null,
        documents: documents ? (typeof documents === 'string' ? documents : JSON.stringify(documents)) : null,
        remarks: remarks || null,
        createdById: ctx.userId,
        createdBy: ctx.userName || 'System User',
      },
    });

    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      projectId,
      entityType: 'ACTUAL_COST',
      entityId: actualTx.id,
      action: 'ACTUAL_COST_RECORDED',
      description: `Actual cost transaction ${transactionCode} recorded for ${category} (Amount: ₹${calculatedAmount.toLocaleString()}) via ${source}`,
      newValue: {
        transactionCode,
        category,
        actualAmount: calculatedAmount,
        source,
      },
    });

    return apiSuccess(actualTx, 201);
  } catch (err: any) {
    console.error('Error creating actual cost transaction:', err);
    return apiError(err.message || 'Failed to create actual cost transaction', 500);
  }
}
