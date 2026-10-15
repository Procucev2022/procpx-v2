// app/api/boq/upload/route.ts - BOQ file upload and column detection
import { NextRequest } from 'next/server';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { createNextBoqRevision } from '@/lib/boq-revision-utils';

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BOQ_UPLOAD');
  if (!isApiContext(ctx)) return ctx;

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const projectId = formData.get('projectId') as string;
  const boqId = formData.get('boqId') as string | null;

  if (!file) return apiError('No file provided.');
  if (!projectId) return apiError('Project ID is required.');

  // Validate project belongs to tenant
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId: ctx.tenantId } });
  if (!project) return apiError('Project not found.', 404);

  const allowedTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
  ];
  const allowedExts = ['.xlsx', '.xls', '.csv'];
  const fileExt = path.extname(file.name).toLowerCase();

  if (!allowedExts.includes(fileExt)) {
    return apiError('BOQ upload failed. Only .xlsx, .xls, and .csv files are supported.');
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');

  // Save file
  const uploadDir = path.join(process.cwd(), 'uploads', ctx.tenantId, projectId);
  await mkdir(uploadDir, { recursive: true });
  const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const filePath = path.join(uploadDir, fileName);
  await writeFile(filePath, buffer);

  // Parse file to detect columns
  let sheets: string[] = [];
  let columns: string[] = [];
  let previewRows: Record<string, string>[] = [];

  try {
    const XLSX = (await import('xlsx')).default;
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    sheets = workbook.SheetNames;

    if (sheets.length > 0) {
      const firstSheet = workbook.Sheets[sheets[0]];
      const json = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' }) as string[][];
      if (json.length > 0) {
        const headerRow = json[0];
        columns = headerRow.map((h, i) => h?.toString().trim() || `Column_${i + 1}`);
        previewRows = json.slice(1, 6).map(row =>
          columns.reduce((acc, col, i) => ({ ...acc, [col]: row[i]?.toString() || '' }), {})
        );
      }
    }
  } catch (e) {
    console.error('Excel parse error:', e);
  }

  // Create or get BOQ
  let targetBoqId = boqId;
  if (!targetBoqId) {
    let attempts = 0;
    while (!targetBoqId && attempts < 5) {
      attempts++;
      try {
        const lastBoq = await prisma.boq.findFirst({
          where: { tenantId: ctx.tenantId },
          orderBy: { createdAt: 'desc' },
          select: { boqCode: true },
        });
        const num = lastBoq ? parseInt(lastBoq.boqCode.replace(/[^0-9]/g, ''), 10) + attempts : 1;
        const boqCode = `BOQ-${String(num).padStart(6, '0')}`;
        const newBoq = await prisma.boq.create({
          data: { tenantId: ctx.tenantId, projectId, boqCode, status: 'DRAFT', createdBy: ctx.userId },
        });
        targetBoqId = newBoq.id;
      } catch (err: any) {
        if (err?.code === 'P2002' && attempts < 5) {
          await new Promise(r => setTimeout(r, Math.random() * 30 + 10));
          continue;
        }
        throw err;
      }
    }
  }

  if (!targetBoqId) return apiError('Failed to create or locate target BOQ', 500);

  // Create or update revision safely
  const latestRevision = await prisma.boqRevision.findFirst({
    where: { boqId: targetBoqId },
    orderBy: { revisionNumber: 'desc' },
  });

  let revision: any = null;

  // Handle re-uploading the same file or populating an existing empty draft shell
  const isSameFileHash = latestRevision && latestRevision.status === 'DRAFT' && latestRevision.originalFileHash === hash;
  const isEmptyDraft = latestRevision && latestRevision.status === 'DRAFT' && (latestRevision.totalLines || 0) === 0;

  if (latestRevision && (isSameFileHash || isEmptyDraft)) {
    revision = await prisma.boqRevision.update({
      where: { id: latestRevision.id },
      data: {
        originalFileName: file.name,
        originalFilePath: filePath,
        originalFileSize: file.size,
        originalFileHash: hash,
        uploadedAt: new Date(),
      },
    });
  } else {
    // Generate next revision number scoped strictly to targetBoqId with concurrency safety
    revision = await createNextBoqRevision({
      boqId: targetBoqId!,
      tenantId: ctx.tenantId,
      createdById: ctx.userId,
      originalFileName: file.name,
      originalFilePath: filePath,
      originalFileSize: file.size,
      originalFileHash: hash,
      status: 'DRAFT',
    });
  }

  const revisionCode = revision.revisionCode;

  await createAuditLog({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    projectId,
    entityType: 'BOQ_REVISION',
    entityId: revision.id,
    action: 'UPLOAD',
    description: `BOQ file uploaded: ${file.name} (Revision ${revisionCode})`,
    newValue: { fileName: file.name, fileSize: file.size, revisionCode },
  });

  // Also record in project documents repository
  await prisma.projectDocument.create({
    data: {
      tenantId: ctx.tenantId,
      projectId,
      name: file.name,
      fileType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileSize: file.size,
      filePath,
      uploadedBy: ctx.userId,
      category: 'ORIGINAL_BOQ',
    },
  });

  return apiSuccess({
    boqId: targetBoqId,
    revisionId: revision.id,
    revisionCode,
    sheets,
    columns,
    previewRows,
    fileName: file.name,
  }, 201);
}
