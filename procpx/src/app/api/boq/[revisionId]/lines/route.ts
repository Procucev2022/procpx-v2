// app/api/boq/[revisionId]/lines/route.ts - BOQ lines CRUD with full auditing & validation
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { validateBoqLine } from '@/lib/boq-validate';
import { createAuditLog } from '@/lib/audit';
import { computeLineCostBreakdown } from '@/lib/boq-cost-breakdown';

async function resolveRevision(idOrBoqId: string, tenantId: string) {
  let revision = await prisma.boqRevision.findFirst({
    where: { id: idOrBoqId, tenantId },
    include: { boq: true },
  });
  if (!revision) {
    const boqRecord = await prisma.boq.findFirst({
      where: { id: idOrBoqId, tenantId },
      include: {
        revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 },
      },
    });
    if (boqRecord && boqRecord.revisions.length > 0) {
      revision = {
        ...boqRecord.revisions[0],
        boq: boqRecord,
      };
    }
  }
  return revision;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ revisionId: string }> }) {
  const ctx = await requireAuth('BOQ_VIEW');
  if (!isApiContext(ctx)) return ctx;
  const { revisionId } = await params;

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = parseInt(searchParams.get('pageSize') || '50');
  const validationStatus = searchParams.get('validationStatus') || '';
  const search = searchParams.get('search') || '';

  const revision = await resolveRevision(revisionId, ctx.tenantId);
  if (!revision) return apiError('Revision not found', 404);

  const where: any = { boqRevisionId: revision.id, tenantId: ctx.tenantId, isDeleted: false };
  if (validationStatus) where.validationStatus = validationStatus;
  if (search) {
    where.OR = [
      { originalDescription: { contains: search } },
      { standardDescription: { contains: search } },
      { lineNumber: { contains: search } },
      { itemCode: { contains: search } },
    ];
  }

  const [total, lines] = await Promise.all([
    prisma.boqLine.count({ where }),
    prisma.boqLine.findMany({
      where,
      orderBy: [{ lineNumber: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        category: { select: { id: true, name: true } },
        subcategory: { select: { id: true, name: true } },
        uom: { select: { id: true, code: true, name: true } },
      },
    }),
  ]);

  const enrichedLines = lines.map(l => {
    let costBreakdown = null;
    if (l.aiReason) {
      try {
        const parsed = JSON.parse(l.aiReason);
        if (parsed.costBreakdown) costBreakdown = parsed.costBreakdown;
      } catch {}
    }
    if (!costBreakdown && l.aiUnitCost !== null && l.aiUnitCost !== undefined && Number(l.aiUnitCost) > 0) {
      costBreakdown = computeLineCostBreakdown(
        Number(l.aiUnitCost),
        l.quantity,
        l.category?.name,
        l.standardDescription || l.originalDescription
      );
    }
    return {
      ...l,
      costBreakdown,
    };
  });

  return apiSuccess({
    data: enrichedLines,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    revision,
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ revisionId: string }> }) {
  const ctx = await requireAuth('BOQ_EDIT');
  if (!isApiContext(ctx)) return ctx;
  const { revisionId } = await params;

  const revision = await resolveRevision(revisionId, ctx.tenantId);
  if (!revision) return apiError('Revision not found', 404);
  if (revision.status === 'APPROVED') {
    return apiError('Approved BOQs cannot be edited. Create a new revision instead.');
  }

  const body = await req.json();

  // Support batch updates if body.lines is supplied
  if (body.lines && Array.isArray(body.lines)) {
    const updatedLines = [];
    for (const item of body.lines) {
      const lId = item.id || item.lineId;
      if (!lId) continue;
      const lUpdates = item.updates || item;
      const rawQty = lUpdates.quantity;
      const updatedQty = (rawQty !== undefined && rawQty !== null && rawQty !== '' && !isNaN(parseFloat(rawQty)))
        ? parseFloat(rawQty)
        : (rawQty === null || rawQty === '' ? null : undefined);

      const existingLine = await prisma.boqLine.findUnique({ where: { id: lId } });
      if (!existingLine) continue;

      const finalQty = updatedQty !== undefined ? updatedQty : existingLine.quantity;
      const unitCost = lUpdates.aiUnitCost !== undefined
        ? (lUpdates.aiUnitCost === null || lUpdates.aiUnitCost === '' ? null : parseFloat(lUpdates.aiUnitCost))
        : existingLine.aiUnitCost;

      const newTotalCost = (unitCost !== null && unitCost !== undefined && finalQty !== null && finalQty !== undefined && finalQty > 0)
        ? Math.round(unitCost * finalQty * 100) / 100
        : null;

      const lineStatus = (finalQty === null || finalQty === undefined)
        ? 'QUANTITY_REQUIRED'
        : (unitCost && newTotalCost !== null ? 'COST GENERATED' : 'VALID');

      const up = await prisma.boqLine.update({
        where: { id: lId },
        data: {
          ...(lUpdates.standardDescription !== undefined && { standardDescription: lUpdates.standardDescription }),
          ...(lUpdates.originalDescription !== undefined && { originalDescription: lUpdates.originalDescription }),
          ...(lUpdates.specification !== undefined && { specification: lUpdates.specification }),
          ...(lUpdates.uomRaw !== undefined && { uomRaw: lUpdates.uomRaw }),
          ...(updatedQty !== undefined && { quantity: updatedQty }),
          ...(lUpdates.location !== undefined && { location: lUpdates.location }),
          ...(lUpdates.brand !== undefined && { brand: lUpdates.brand }),
          ...(lUpdates.remarks !== undefined && { remarks: lUpdates.remarks }),
          ...(unitCost !== undefined && { aiUnitCost: unitCost }),
          aiTotalCost: newTotalCost,
          validationStatus: lineStatus,
          updatedAt: new Date(),
        },
      });
      updatedLines.push(up);
    }
    return apiSuccess({ count: updatedLines.length, lines: updatedLines });
  }

  const { lineId, updates } = body;
  if (!lineId) return apiError('Line ID required');

  const line = await prisma.boqLine.findFirst({
    where: { id: lineId, boqRevisionId: revision.id, tenantId: ctx.tenantId },
  });
  if (!line) return apiError('BOQ line not found', 404);

  const rawQty = updates.quantity;
  const updatedQty = rawQty !== undefined
    ? (rawQty === null || rawQty === '' ? null : parseFloat(rawQty))
    : line.quantity;
  if (updatedQty !== null && updatedQty !== undefined && updatedQty <= 0) {
    return apiError('Quantity must be greater than zero.', 400);
  }

  const updatedDesc = updates.standardDescription !== undefined ? updates.standardDescription : (updates.originalDescription ?? line.originalDescription);
  if (!updatedDesc || !updatedDesc.trim()) {
    return apiError('Description cannot be blank.', 400);
  }

  // Recalculate AI total cost if rate and positive quantity exist
  const unitCost = updates.aiUnitCost !== undefined
    ? (updates.aiUnitCost === null || updates.aiUnitCost === '' ? null : parseFloat(updates.aiUnitCost))
    : line.aiUnitCost;
  const newTotalCost = (unitCost !== null && unitCost !== undefined && updatedQty !== null && updatedQty !== undefined && updatedQty > 0)
    ? Math.round(unitCost * updatedQty * 100) / 100
    : null;

  const lineStatus = (updatedQty === null || updatedQty === undefined)
    ? 'QUANTITY_REQUIRED'
    : (unitCost && newTotalCost !== null ? 'COST GENERATED' : 'VALID');

  const updated = await prisma.boqLine.update({
    where: { id: lineId },
    data: {
      standardDescription: updates.standardDescription !== undefined ? updates.standardDescription : line.standardDescription,
      originalDescription: updates.originalDescription !== undefined ? updates.originalDescription : line.originalDescription,
      specification: updates.specification !== undefined ? updates.specification : line.specification,
      categoryId: updates.categoryId !== undefined ? updates.categoryId : line.categoryId,
      subcategoryId: updates.subcategoryId !== undefined ? updates.subcategoryId : line.subcategoryId,
      uomId: updates.uomId !== undefined ? updates.uomId : line.uomId,
      uomRaw: updates.uomRaw !== undefined ? updates.uomRaw : line.uomRaw,
      quantity: updatedQty,
      location: updates.location !== undefined ? updates.location : line.location,
      drawingReference: updates.drawingReference !== undefined ? updates.drawingReference : line.drawingReference,
      brand: updates.brand !== undefined ? updates.brand : line.brand,
      model: updates.model !== undefined ? updates.model : line.model,
      material: updates.material !== undefined ? updates.material : line.material,
      grade: updates.grade !== undefined ? updates.grade : line.grade,
      remarks: updates.remarks !== undefined ? updates.remarks : line.remarks,
      aiUnitCost: unitCost,
      aiTotalCost: newTotalCost,
      validationStatus: lineStatus,
      updatedAt: new Date(),
    },
    include: {
      category: { select: { id: true, name: true } },
      subcategory: { select: { id: true, name: true } },
      uom: { select: { id: true, code: true, name: true } },
    },
  });

  // Re-validate
  const validation = validateBoqLine({
    originalDescription: updated.originalDescription,
    standardDescription: updated.standardDescription ?? undefined,
    uomRaw: updated.uomRaw ?? undefined,
    uomId: updated.uomId ?? undefined,
    quantity: updated.quantity,
    categoryId: updated.categoryId ?? undefined,
  });

  await prisma.boqLine.update({
    where: { id: lineId },
    data: {
      validationStatus: updated.quantity === null ? 'QUANTITY_REQUIRED' : (unitCost && newTotalCost !== null ? 'COST GENERATED' : validation.status),
      validationMessages: JSON.stringify(validation.messages),
    },
  });

  await createAuditLog({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    projectId: revision.boq.projectId,
    entityType: 'BOQ_LINE',
    entityId: lineId,
    action: 'BOQ_LINE_UPDATED',
    description: `BOQ line ${line.lineNumber} updated (${updated.standardDescription || updated.originalDescription})`,
    oldValue: {
      standardDescription: line.standardDescription,
      quantity: line.quantity,
      uom: line.uomRaw,
    },
    newValue: {
      standardDescription: updated.standardDescription,
      quantity: updated.quantity,
      uom: updated.uomRaw,
    },
  });

  return apiSuccess({
    ...updated,
    validationStatus: validation.status,
    validationMessages: validation.messages,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ revisionId: string }> }) {
  const ctx = await requireAuth('BOQ_EDIT');
  if (!isApiContext(ctx)) return ctx;
  const { revisionId } = await params;

  const revision = await resolveRevision(revisionId, ctx.tenantId);
  if (!revision) return apiError('Revision not found', 404);
  if (revision.status === 'APPROVED') {
    return apiError('Approved BOQs cannot be edited. Create a new revision instead.');
  }

  const body = await req.json();
  const {
    description,
    specification,
    categoryId,
    subcategoryId,
    uomId,
    uomRaw,
    quantity,
    location,
    brand,
    model,
    material,
    remarks,
    aiUnitCost,
  } = body;

  const desc = (description || '').trim();
  if (!desc) {
    return apiError('Description is required.', 400);
  }

  const qty = parseFloat(quantity) || 1;
  if (qty <= 0) {
    return apiError('Quantity must be greater than zero.', 400);
  }

  const existingCount = await prisma.boqLine.count({
    where: { boqRevisionId: revision.id, tenantId: ctx.tenantId, isDeleted: false },
  });
  const lineNumber = String(existingCount + 1);

  const unitRate = aiUnitCost ? parseFloat(aiUnitCost) : 150.0;
  const totalCost = Math.round(unitRate * qty * 100) / 100;

  const newLine = await prisma.boqLine.create({
    data: {
      tenantId: ctx.tenantId,
      boqRevisionId: revision.id,
      lineNumber,
      itemCode: `ITEM-${lineNumber.padStart(3, '0')}`,
      originalDescription: desc,
      standardDescription: desc,
      specification: specification || null,
      categoryId: categoryId || null,
      subcategoryId: subcategoryId || null,
      uomId: uomId || null,
      uomRaw: uomRaw || 'NOS',
      quantity: qty,
      location: location || null,
      brand: brand || null,
      model: model || null,
      material: material || null,
      remarks: remarks || null,
      aiUnitCost: unitRate,
      aiTotalCost: totalCost,
      costConfidence: 0.85,
      costSource: 'Manual Entry / Benchmark',
      validationStatus: 'VALID',
      benchmarkEligible: true,
    },
    include: {
      category: { select: { id: true, name: true } },
      subcategory: { select: { id: true, name: true } },
      uom: { select: { id: true, code: true, name: true } },
    },
  });

  // Update revision line count
  await prisma.boqRevision.update({
    where: { id: revision.id },
    data: {
      totalLines: existingCount + 1,
      validLines: (revision.validLines || 0) + 1,
    },
  });

  await createAuditLog({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    projectId: revision.boq.projectId,
    entityType: 'BOQ_LINE',
    entityId: newLine.id,
    action: 'BOQ_LINE_ADDED',
    description: `BOQ line ${lineNumber} added: "${desc}" (Qty: ${qty} ${uomRaw || 'NOS'})`,
    newValue: { lineNumber, description: desc, quantity: qty, uom: uomRaw },
  });

  return apiSuccess({ line: newLine, message: 'Line item added successfully.' }, 201);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ revisionId: string }> }) {
  const ctx = await requireAuth('BOQ_EDIT');
  if (!isApiContext(ctx)) return ctx;
  const { revisionId } = await params;

  const revision = await resolveRevision(revisionId, ctx.tenantId);
  if (!revision) return apiError('Revision not found', 404);
  if (revision.status === 'APPROVED') {
    return apiError('Approved BOQs cannot be edited. Create a new revision instead.');
  }

  const { searchParams } = new URL(req.url);
  const lineId = searchParams.get('lineId');
  if (!lineId) return apiError('Line ID is required.', 400);

  const line = await prisma.boqLine.findFirst({
    where: { id: lineId, boqRevisionId: revision.id, tenantId: ctx.tenantId },
  });
  if (!line) return apiError('Line not found.', 404);

  await prisma.boqLine.update({
    where: { id: lineId },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: ctx.userId,
    },
  });

  const remainingCount = await prisma.boqLine.count({
    where: { boqRevisionId: revision.id, tenantId: ctx.tenantId, isDeleted: false },
  });

  await prisma.boqRevision.update({
    where: { id: revision.id },
    data: { totalLines: remainingCount },
  });

  await createAuditLog({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    projectId: revision.boq.projectId,
    entityType: 'BOQ_LINE',
    entityId: lineId,
    action: 'BOQ_LINE_DELETED',
    description: `BOQ line ${line.lineNumber} deleted: "${line.standardDescription || line.originalDescription}"`,
  });

  return apiSuccess({ message: `Line ${line.lineNumber} deleted successfully.` });
}
