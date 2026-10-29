// app/api/boq/[revisionId]/validate/route.ts
// Re-validate all lines in revision and produce comprehensive quality score breakdown
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { validateBoqLine, summarizeIssues } from '@/lib/boq-validate';
import { createAuditLog } from '@/lib/audit';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ revisionId: string }> }) {
  const ctx = await requireAuth('BOQ_VALIDATE');
  if (!isApiContext(ctx)) return ctx;
  const { revisionId } = await params;

  const revision = await prisma.boqRevision.findFirst({
    where: { id: revisionId, tenantId: ctx.tenantId },
    include: {
      lines: { where: { isDeleted: false } },
      boq: true,
    },
  });

  if (!revision) return apiError('Revision not found', 404);

  // Check duplicate line numbers
  const lineNumCounts: Record<string, number> = {};
  for (const line of revision.lines) {
    if (line.lineNumber) {
      lineNumCounts[line.lineNumber] = (lineNumCounts[line.lineNumber] || 0) + 1;
    }
  }

  // Known UOMs for tenant
  const validUoms = await prisma.uomMaster.findMany({
    where: { tenantId: ctx.tenantId, isActive: true },
    select: { id: true, code: true },
  });
  const validUomIds = new Set(validUoms.map(u => u.id));

  // Run validation per line
  for (const line of revision.lines) {
    const isDuplicate = (lineNumCounts[line.lineNumber] || 0) > 1;
    const isInvalidUom = !!line.uomId && !validUomIds.has(line.uomId);

    const validation = validateBoqLine({
      originalDescription: line.originalDescription,
      standardDescription: line.standardDescription ?? undefined,
      uomRaw: line.uomRaw ?? undefined,
      uomId: line.uomId ?? undefined,
      quantity: line.quantity,
      categoryId: line.categoryId ?? undefined,
      lineNumber: line.lineNumber,
      isDuplicate,
      isInvalidUom,
    });

    await prisma.boqLine.update({
      where: { id: line.id },
      data: {
        validationStatus: validation.status,
        validationMessages: JSON.stringify(validation.messages),
      },
    });
  }

  // Reload lines and compute summary
  const refreshedLines = await prisma.boqLine.findMany({
    where: { boqRevisionId: revisionId, isDeleted: false },
  });

  const issueSummary = summarizeIssues(refreshedLines.map(l => ({
    originalDescription: l.originalDescription,
    standardDescription: l.standardDescription ?? undefined,
    uomRaw: l.uomRaw ?? undefined,
    uomId: l.uomId ?? undefined,
    quantity: l.quantity,
    categoryId: l.categoryId ?? undefined,
    lineNumber: l.lineNumber,
    isDuplicate: (lineNumCounts[l.lineNumber] || 0) > 1,
    isInvalidUom: !!l.uomId && !validUomIds.has(l.uomId),
  })));

  const validCount = refreshedLines.filter(l => l.validationStatus === 'VALID').length;
  const errorCount = refreshedLines.filter(l => l.validationStatus === 'ERROR').length;
  const warnCount = refreshedLines.filter(l => l.validationStatus === 'WARNING').length;

  await prisma.boqRevision.update({
    where: { id: revisionId },
    data: {
      totalLines: refreshedLines.length,
      validLines: validCount,
      errorLines: errorCount,
      warningLines: warnCount,
      qualityScore: issueSummary.qualityScore,
    },
  });

  await createAuditLog({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    projectId: revision.boq.projectId,
    entityType: 'BOQ_REVISION',
    entityId: revisionId,
    action: 'VALIDATE',
    description: `BOQ Revision ${revision.revisionCode} validated: Score ${issueSummary.qualityScore}%, ${errorCount} errors, ${warnCount} warnings`,
    newValue: { qualityScore: issueSummary.qualityScore, validCount, errorCount, warnCount, issues: issueSummary },
  });

  return apiSuccess({
    qualityScore: issueSummary.qualityScore,
    totalLines: refreshedLines.length,
    validLines: validCount,
    errorLines: errorCount,
    warningLines: warnCount,
    issues: issueSummary,
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ revisionId: string }> }) {
  const ctx = await requireAuth('BOQ_VIEW');
  if (!isApiContext(ctx)) return ctx;
  const { revisionId } = await params;

  let revision = await prisma.boqRevision.findFirst({
    where: { id: revisionId, tenantId: ctx.tenantId },
    include: {
      lines: {
        where: { isDeleted: false },
        include: { category: true, subcategory: true, uom: true },
        orderBy: [{ lineNumber: 'asc' }],
      },
      boq: { include: { project: true, costCentre: true } },
    },
  });

  if (!revision) {
    const boqRecord = await prisma.boq.findFirst({
      where: { id: revisionId, tenantId: ctx.tenantId },
      include: {
        project: true,
        costCentre: true,
        revisions: {
          orderBy: { revisionNumber: 'desc' },
          take: 1,
          include: {
            lines: {
              where: { isDeleted: false },
              include: { category: true, subcategory: true, uom: true },
              orderBy: [{ lineNumber: 'asc' }],
            },
          },
        },
      },
    });
    if (boqRecord && boqRecord.revisions.length > 0) {
      revision = {
        ...boqRecord.revisions[0],
        boq: boqRecord,
      };
    }
  }

  if (!revision) return apiError('Revision not found', 404);

  return apiSuccess({
    revision,
    lines: revision.lines,
    qualityScore: revision.qualityScore,
    totalLines: revision.totalLines || revision.lines.length,
    validLines: revision.validLines,
    warningLines: revision.warningLines,
    errorLines: revision.errorLines,
  });
}
