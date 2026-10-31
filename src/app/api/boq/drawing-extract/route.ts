// src/app/api/boq/drawing-extract/route.ts - Method 3: AI Drawing to BOQ Extraction & Persistence
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { processDrawingFile, ExtractedDrawingItem } from '@/lib/drawing-parser';
import path from 'path';
import fs from 'fs';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BOQ_UPLOAD');
  if (!isApiContext(ctx)) return ctx;

  try {
    const contentType = req.headers.get('content-type') || '';

    // -------------------------------------------------------------
    // STAGE 2: GENERATE DRAFT BOQ (JSON payload with reviewed lines)
    // -------------------------------------------------------------
    if (contentType.includes('application/json')) {
      const body = await req.json();
      const {
        projectId,
        costCentreId,
        drawingNumber,
        fileName,
        savedFilePath,
        title,
        description,
        purpose,
        lines,
      } = body;

      if (!projectId) {
        return apiError(UI_STRINGS.appApiBoqDrawingExtractRoute.projectIDIsRequiredToGenerateDraftBOQ, 400);
      }
      if (!Array.isArray(lines) || lines.length === 0) {
        return apiError(UI_STRINGS.appApiBoqDrawingExtractRoute.atLeastOneBOQLineItemIsRequired, 400);
      }

      const project = await prisma.project.findFirst({
        where: { id: projectId, tenantId: ctx.tenantId },
      });
      if (!project) return apiError(UI_STRINGS.common.projectNotFound2, 404);

      // Unique BOQ Code
      const count = await prisma.boq.count({ where: { tenantId: ctx.tenantId } });
      const boqCode = `BOQ-${String(count + 1).padStart(6, '0')}`;

      // Create Draft BOQ (Principle: Drawing extraction creates Draft BOQ)
      const boq = await prisma.boq.create({
        data: {
          tenantId: ctx.tenantId,
          projectId,
          costCentreId: costCentreId || null,
          boqCode,
          title: interpolateUiString(UI_STRINGS.common.value1, { "value1": title?.trim() || `Architectural Drawing — ${project.name}` }),
          description: interpolateUiString(UI_STRINGS.common.value1, { "value1": description?.trim() || `Extracted from architectural drawing ${drawingNumber || 'DWG'}` }),
          purpose: purpose || 'BUDGET',
          status: 'DRAFT',
          createdBy: ctx.userId,
        },
      });

      const validLinesCount = lines.filter((l: any) => l.quantity !== null && Number(l.quantity) > 0).length;

      // Create Revision R0
      const boqRevision = await prisma.boqRevision.create({
        data: {
          tenantId: ctx.tenantId,
          boqId: boq.id,
          costCentreId: costCentreId || null,
          revisionNumber: 0,
          revisionCode: 'R0',
          status: 'DRAFT',
          preparationStatus: 'AI_REVIEW',
          budgetStatus: 'NOT_ADDED_TO_BUDGET',
          prStatus: 'PR_NOT_CREATED',
          sourceType: 'DRAWING_AI',
          sourceFile: fileName || `${drawingNumber || 'drawing'}.pdf`,
          sourceReference: drawingNumber || 'DWG-A-101',
          sourceConfidence: 0.90,
          originalFileName: fileName || `${drawingNumber || 'drawing'}.pdf`,
          originalFilePath: savedFilePath || null,
          originalFileSize: savedFilePath && fs.existsSync(savedFilePath) ? fs.statSync(savedFilePath).size : 0,
          notes: `Extracted via Architectural Drawing Parser from ${fileName || drawingNumber} (Ref: ${drawingNumber})`,
          totalLines: lines.length,
          validLines: validLinesCount,
          qualityScore: Math.round((validLinesCount / lines.length) * 100) || 90,
          createdById: ctx.userId,
          uploadedAt: new Date(),
        },
      });

      // Match tenant categories and UOMs
      const categories = await prisma.category.findMany({ where: { tenantId: ctx.tenantId } });
      const uoms = await prisma.uomMaster.findMany({ where: { tenantId: ctx.tenantId } });
      const catMap = new Map(categories.map(c => [c.name.toLowerCase(), c]));
      const uomMap = new Map(uoms.map(u => [u.code.toUpperCase(), u]));

      const createdLines = [];
      for (let i = 0; i < lines.length; i++) {
        const item = lines[i];
        const catName = (item.category || '').toLowerCase();
        const matchedCat = catMap.get(catName);
        const uomCode = (item.uom || 'NOS').toUpperCase();
        const matchedUom = uomMap.get(uomCode);

        const hasValidQty = item.quantity !== null && item.quantity !== undefined && !isNaN(Number(item.quantity));
        const numQty = hasValidQty ? Number(item.quantity) : 0;
        const isUncertain = item.quantityType === 'UNCERTAIN' || !hasValidQty || numQty === 0;

        const validationMessages = [];
        if (isUncertain) {
          validationMessages.push({
            level: 'WARNING',
            code: 'UNVERIFIED_QUANTITY',
            message: interpolateUiString(UI_STRINGS.common.value1, { "value1": item.uncertainReason || 'Quantity unverified in drawing schedule. Field verification required.' }),
          });
        } else {
          validationMessages.push({
            level: 'INFO',
            code: 'DRAWING_EXTRACTED',
            message: interpolateUiString(UI_STRINGS.appApiBoqDrawingExtractRoute.extractedFromDrawingValue1Value2, { "value1": drawingNumber || '', "value2": item.location ? `Location: ${item.location}` : '' }),
          });
        }

        const line = await prisma.boqLine.create({
          data: {
            tenantId: ctx.tenantId,
            boqRevisionId: boqRevision.id,
            lineNumber: String(i + 1),
            originalDescription: item.description,
            standardDescription: item.description,
            specification: item.specification || item.description,
            aiSuggestedDescription: item.description,
            aiSuggestedSpec: item.specification || item.description,
            aiConfidence: item.confidence || 0.90,
            aiReason: item.uncertainReason || `Extracted from drawing ${drawingNumber}`,
            drawingReference: drawingNumber || item.drawingReference || 'DWG-A-101',
            sourceSheet: item.sheet || 'Sheet 01',
            sourceReference: item.mark ? `${item.mark} - ${item.description}` : item.description,
            confidenceScore: item.confidence || 0.90,
            location: item.location || null,
            categoryId: matchedCat?.id || null,
            uomId: matchedUom?.id || null,
            uomRaw: item.uom || 'NOS',
            quantity: hasValidQty ? numQty : null,
            validationStatus: isUncertain ? 'WARNING' : 'VALID',
            validationMessages: JSON.stringify(validationMessages),
            benchmarkEligible: true,
          },
        });
        createdLines.push(line);
      }

      // Audit Log
      await prisma.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          projectId,
          entityType: 'BOQ',
          entityId: boq.id,
          action: 'DRAWING_BOQ_GENERATED',
          description: interpolateUiString(UI_STRINGS.appApiBoqDrawingExtractRoute.draftBOQBoqCodeGeneratedFromDrawingValue2LengthLinesCreated, { "boqCode": boq.boqCode, "value2": fileName || drawingNumber, "length": lines.length }),
        },
      });

      return apiSuccess({
        boqId: boq.id,
        revisionId: boqRevision.id,
        boqCode: boq.boqCode,
        revisionCode: boqRevision.revisionCode,
        totalLines: lines.length,
        validLines: validLinesCount,
        drawingNumber,
      }, 201);
    }

    // -------------------------------------------------------------
    // STAGE 1: UPLOAD & PROCESS DRAWING (FormData payload)
    // -------------------------------------------------------------
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const projectId = formData.get('projectId') as string;
    const drawingNumber = (formData.get('drawingNumber') as string) || 'DWG-A-101';

    if (!file || !projectId) {
      return apiError(UI_STRINGS.appApiBoqDrawingExtractRoute.drawingFileAndProjectIDAreRequired, 400);
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId: ctx.tenantId },
    });
    if (!project) return apiError(UI_STRINGS.common.projectNotFound2, 404);

    // Validate supported file extension
    const ext = file.name.split('.').pop()?.toLowerCase();
    const supportedExts = ['pdf', 'png', 'jpg', 'jpeg'];
    if (!ext || !supportedExts.includes(ext)) {
      return apiError(
        interpolateUiString(UI_STRINGS.appApiBoqDrawingExtractRoute.unsupportedDrawingFormatExtSupportedFormatsArePDFPNGJPGAndJPEG, { "ext": ext }),
        400
      );
    }

    // Save drawing file to persistent uploads directory
    const uploadsDir = path.join(process.cwd(), 'uploads', ctx.tenantId, projectId, 'drawings');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const savedFileName = `${Date.now()}_${file.name}`;
    const savedFilePath = path.join(uploadsDir, savedFileName);
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(savedFilePath, fileBuffer);

    // Register in Project Documents for traceability
    await prisma.projectDocument.create({
      data: {
        tenantId: ctx.tenantId,
        projectId,
        name: file.name,
        fileType: file.type || (ext === 'pdf' ? 'application/pdf' : `image/${ext}`),
        fileSize: file.size,
        filePath: savedFilePath,
        uploadedBy: ctx.userId,
        category: 'DRAWING',
      },
    });

    // Execute drawing parsing (Native schedule extraction or AI multimodal vision)
    const parseResult = await processDrawingFile(fileBuffer, file.name, drawingNumber);

    return apiSuccess({
      success: true,
      fileName: file.name,
      fileSize: file.size,
      savedFilePath,
      drawingNumber: parseResult.drawingReference || drawingNumber,
      parserUsed: parseResult.parserUsed,
      providerMessage: parseResult.providerMessage,
      totalDetected: parseResult.totalDetected,
      explicitCount: parseResult.explicitCount,
      uncertainCount: parseResult.uncertainCount,
      items: parseResult.items,
      warnings: parseResult.warnings,
    }, 200);

  } catch (err: any) {
    console.error('Drawing processing error:', err);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.drawingProcessingFailed }), 500);
  }
}
