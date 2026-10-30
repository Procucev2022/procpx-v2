// app/api/boq/import/route.ts - Import BOQ lines from uploaded file using column mapping
import { NextRequest } from 'next/server';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import { standardiseUom } from '@/lib/uom-standardise';
import { validateBoqLine, computeQualityScore } from '@/lib/boq-validate';
import { readFile } from 'fs/promises';
import type { ColumnMapping } from "@app-types/app/api/boq/import/route.types";


export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BOQ_UPLOAD');
  if (!isApiContext(ctx)) return ctx;

  const body = await req.json();
  const { revisionId, sheetName, columnMapping }: { revisionId: string; sheetName?: string; columnMapping: ColumnMapping } = body;

  if (!revisionId) return apiError('Revision ID is required.');
  if (!columnMapping?.description) return apiError('Column mapping is incomplete. Please map Description, UOM and Quantity.');
  if (!columnMapping?.uom) return apiError('Column mapping is incomplete. Please map UOM.');
  if (!columnMapping?.quantity) return apiError('Column mapping is incomplete. Please map Quantity.');

  const revision = await prisma.boqRevision.findFirst({
    where: { id: revisionId, tenantId: ctx.tenantId },
  });
  if (!revision) return apiError('BOQ Revision not found.', 404);
  if (revision.status !== 'DRAFT') return apiError('Only DRAFT revisions can be imported.');
  if (!revision.originalFilePath) return apiError('No uploaded file found for this revision.');

  // Read file
  const buffer = await readFile(revision.originalFilePath);
  const XLSX = (await import('xlsx')).default;
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = sheetName
    ? workbook.Sheets[sheetName]
    : workbook.Sheets[workbook.SheetNames[0]];

  if (!sheet) return apiError('Sheet not found in uploaded file.');

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, string>[];

  // Delete existing lines (re-import)
  await prisma.boqLine.deleteMany({ where: { boqRevisionId: revisionId } });

  // Get UOM masters for lookup
  const uomMasters = await prisma.uomMaster.findMany({ where: { tenantId: ctx.tenantId, isActive: true } });

  const lines = [];
  let lineCounter = 1;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const desc = row[columnMapping.description]?.toString().trim();
    if (!desc) continue; // Skip empty rows

    const rawUom = columnMapping.uom ? row[columnMapping.uom]?.toString().trim() : '';
    const rawQty = columnMapping.quantity ? row[columnMapping.quantity]?.toString().trim() : '';
    const qty = rawQty ? parseFloat(rawQty) : null;

    // Standardise UOM
    const { code: stdUomCode } = standardiseUom(rawUom);
    const matchedUom = uomMasters.find(u => u.code === stdUomCode);

    const lineData = {
      tenantId: ctx.tenantId,
      boqRevisionId: revisionId,
      lineNumber: columnMapping.lineNumber ? (row[columnMapping.lineNumber]?.toString() || String(lineCounter)) : String(lineCounter),
      originalDescription: desc,
      standardDescription: desc,
      specification: columnMapping.specification ? row[columnMapping.specification]?.toString().trim() : undefined,
      uomRaw: rawUom,
      uomId: matchedUom?.id ?? undefined,
      quantity: qty,
      location: columnMapping.location ? row[columnMapping.location]?.toString().trim() : undefined,
      drawingReference: columnMapping.drawingReference ? row[columnMapping.drawingReference]?.toString().trim() : undefined,
      brand: columnMapping.brand ? row[columnMapping.brand]?.toString().trim() : undefined,
      model: columnMapping.model ? row[columnMapping.model]?.toString().trim() : undefined,
      material: columnMapping.material ? row[columnMapping.material]?.toString().trim() : undefined,
      grade: columnMapping.grade ? row[columnMapping.grade]?.toString().trim() : undefined,
      remarks: columnMapping.remarks ? row[columnMapping.remarks]?.toString().trim() : undefined,
      sourceSheet: sheetName || workbook.SheetNames[0],
      sourceRow: i + 2, // +2 = header + 1-indexed
      confidenceScore: matchedUom ? 1.0 : 0.5,
    };

    // Validate
    const validation = validateBoqLine({
      originalDescription: lineData.originalDescription,
      standardDescription: lineData.standardDescription,
      uomRaw: lineData.uomRaw,
      uomId: lineData.uomId,
      quantity: lineData.quantity,
    });

    lines.push({
      ...lineData,
      validationStatus: validation.status,
      validationMessages: JSON.stringify(validation.messages),
    });

    lineCounter++;
  }

  // Bulk insert
  await prisma.boqLine.createMany({ data: lines });

  // Compute stats
  const validCount = lines.filter(l => l.validationStatus === 'VALID').length;
  const errorCount = lines.filter(l => l.validationStatus === 'ERROR').length;
  const warnCount = lines.filter(l => l.validationStatus === 'WARNING').length;
  const qualityScore = computeQualityScore(lines.map(l => ({
    originalDescription: l.originalDescription,
    standardDescription: l.standardDescription,
    uomRaw: l.uomRaw,
    uomId: l.uomId,
    quantity: l.quantity,
    categoryId: l.uomId, // placeholder
  })));

  await prisma.boqRevision.update({
    where: { id: revisionId },
    data: {
      columnMapping: JSON.stringify(columnMapping),
      totalLines: lines.length,
      validLines: validCount,
      errorLines: errorCount,
      warningLines: warnCount,
      qualityScore,
    },
  });

  await createAuditLog({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    entityType: 'BOQ_REVISION',
    entityId: revisionId,
    action: 'IMPORT',
    description: `BOQ imported: ${lines.length} lines (${validCount} valid, ${warnCount} warnings, ${errorCount} errors)`,
    newValue: { totalLines: lines.length, validCount, errorCount, warnCount, qualityScore },
  });

  return apiSuccess({ imported: lines.length, valid: validCount, warnings: warnCount, errors: errorCount, qualityScore });
}
