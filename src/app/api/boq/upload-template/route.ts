// src/app/api/boq/upload-template/route.ts - Method 1: Fixed Format Upload
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createNextBoqRevision } from '@/lib/boq-revision-utils';
import * as XLSX from 'xlsx';
import { saveUpload } from '@/lib/storage';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BOQ_UPLOAD');
  if (!isApiContext(ctx)) return ctx;

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const projectId = formData.get('projectId') as string;
    const costCentreId = formData.get('costCentreId') as string | null;
    const boqId = formData.get('boqId') as string | null;
    const title = formData.get('title') as string | null;
    const description = formData.get('description') as string | null;
    const purpose = formData.get('purpose') as string | null;
    const categoryParam = formData.get('category') as string | null;

    if (!file || !projectId) {
      return apiError(UI_STRINGS.appApiBoqUploadTemplateRoute.spreadsheetFileAndProjectIDAreRequired, 400);
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId: ctx.tenantId },
    });
    if (!project) return apiError(UI_STRINGS.common.projectNotFound2, 404);

    // Read buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save original uploaded file
    const savedFilePath = await saveUpload([ctx.tenantId, projectId], `${Date.now()}_${file.name}`, buffer);

    // Parse XLSX
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames.find(s => s.toLowerCase().includes('data') || s.toLowerCase().includes('boq')) || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rows || rows.length === 0) {
      return apiError(UI_STRINGS.appApiBoqUploadTemplateRoute.uploadedSpreadsheetIsEmptyOrHasNoRecognizableRows, 400);
    }

    // Check cost centres & categories for tenant
    const [allCostCentres, allCategories, allUoms] = await Promise.all([
      prisma.costCentre.findMany({ where: { projectId, tenantId: ctx.tenantId } }),
      prisma.category.findMany({ where: { tenantId: ctx.tenantId } }),
      prisma.uomMaster.findMany({ where: { tenantId: ctx.tenantId } }),
    ]);

    const ccMapByCode = new Map(allCostCentres.map(c => [c.code.toUpperCase(), c]));
    const catMapByName = new Map(allCategories.map(c => [c.name.toLowerCase(), c]));
    const uomMapByCode = new Map(allUoms.map(u => [u.code.toUpperCase(), u]));

    // Determine target Cost Centre
    let targetCostCentreId = costCentreId;
    if (!targetCostCentreId && allCostCentres.length > 0) {
      const firstRowCcCode = (rows[0]['Cost Centre Code *'] || rows[0]['Cost Centre Code'] || rows[0]['Cost Centre'] || '').trim().toUpperCase();
      if (firstRowCcCode && ccMapByCode.has(firstRowCcCode)) {
        targetCostCentreId = ccMapByCode.get(firstRowCcCode)!.id;
      } else {
        targetCostCentreId = allCostCentres[0].id;
      }
    }

    let boq: any = null;
    let boqRevision: any = null;

    if (boqId) {
      boq = await prisma.boq.findFirst({
        where: { id: boqId, tenantId: ctx.tenantId },
        include: { revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 } },
      });
      if (boq && boq.revisions.length > 0) {
        const latest = boq.revisions[0];
        if (latest.status === 'DRAFT') {
          boqRevision = latest;
          // Clear any existing lines in this draft revision so re-uploading replaces them cleanly
          await prisma.boqLine.deleteMany({ where: { boqRevisionId: boqRevision.id } });
        }
      }
    }

    if (!boq) {
      const count = await prisma.boq.count({ where: { tenantId: ctx.tenantId } });
      const boqCode = `BOQ-${String(count + 1).padStart(6, '0')}`;
      const defaultTitle = categoryParam ? `${categoryParam} — ${project.name}` : `${project.name} BOQ`;
      boq = await prisma.boq.create({
        data: {
          tenantId: ctx.tenantId,
          projectId,
          costCentreId: targetCostCentreId || null,
          boqCode,
          title: title?.trim() || defaultTitle,
          description: description?.trim() || null,
          category: categoryParam || null,
          purpose: purpose || 'BUDGET',
          status: 'DRAFT',
          createdBy: ctx.userId,
        },
      });
    } else {
      boq = await prisma.boq.update({
        where: { id: boq.id },
        data: {
          ...(title?.trim() ? { title: title.trim() } : {}),
          ...(description !== null && description !== undefined ? { description: description.trim() || null } : {}),
          ...(purpose ? { purpose } : {}),
          ...(categoryParam ? { category: categoryParam } : {}),
        },
      });
    }

    if (!boqRevision) {
      boqRevision = await createNextBoqRevision({
        tenantId: ctx.tenantId,
        boqId: boq.id,
        costCentreId: targetCostCentreId || null,
        status: 'DRAFT',
        preparationStatus: 'DRAFT',
        budgetStatus: 'NOT_ADDED_TO_BUDGET',
        prStatus: 'PR_NOT_CREATED',
        sourceType: 'FIXED_TEMPLATE',
        sourceFile: file.name,
        sourceReference: sheetName,
        originalFileName: file.name,
        originalFilePath: savedFilePath,
        originalFileSize: file.size,
        notes: `Imported via Standard proCPX Template (${file.name})`,
        createdById: ctx.userId,
        uploadedAt: new Date(),
      });
    }

    const parsedLines: any[] = [];
    const exceptions: any[] = [];
    let validCount = 0;
    let errorCount = 0;
    let warningCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const lineNum = String(row['Line No'] || row['Line Number'] || row['S.No.'] || row['S.No'] || row['SNo'] || row['Sl No'] || row['#'] || i + 1);
      const desc = String(
        row['Item Description *'] ||
        row['Item Description'] ||
        row['Description'] ||
        row['Item'] ||
        ''
      ).trim();
      const spec = String(row['BOQ Description'] || row['Detailed Specification'] || row['Specification'] || row['Specification / Scope'] || row['Scope'] || '').trim();
      const catName = String(row['Category *'] || row['Category'] || '').trim();
      const subName = String(row['Sub-category'] || row['Subcategory'] || '').trim();
      const uomRaw = String(row['UOM *'] || row['UOM'] || row['Unit'] || '').trim();
      const rawQty = row['Quantity *'] !== undefined ? row['Quantity *'] : (row['Quantity'] !== undefined ? row['Quantity'] : (row['Qty'] !== undefined ? row['Qty'] : ''));
      const cleanQtyStr = String(rawQty).replace(/,/g, '').trim();
      const parsedQty = parseFloat(cleanQtyStr);
      const brand = String(row['Brand / Make'] || row['Brand'] || row['Make'] || '').trim();
      const location = String(row['Location / Area'] || row['Location'] || row['Area'] || '').trim();
      const remarks = String(row['Remarks'] || row['Remark'] || '').trim();
      const drawingRef = String(row['Drawing Reference'] || row['Drawing Ref'] || '').trim();
      const itemCode = String(row['Item Code'] || '').trim();

      const validationMessages: any[] = [];
      let status = 'VALID';

      if (!desc) {
        validationMessages.push({ level: 'ERROR', code: 'DESC_MISSING', message: UI_STRINGS.appApiBoqUploadTemplateRoute.itemDescriptionIsRequired });
        status = 'ERROR';
      }

      let qty: number | null = null;
      if (cleanQtyStr === '') {
        // Section 13: If quantity is genuinely absent: Import the line as Quantity = NULL, Status = QUANTITY_REQUIRED
        qty = null;
        status = 'QUANTITY_REQUIRED';
        validationMessages.push({ level: 'WARNING', code: 'QUANTITY_REQUIRED', message: UI_STRINGS.common.quantityIsRequiredBeforeBudgetingOrPR });
      } else if (isNaN(parsedQty)) {
        validationMessages.push({ level: 'ERROR', code: 'QTY_INVALID', message: interpolateUiString(UI_STRINGS.appApiBoqUploadTemplateRoute.quantityCleanQtyStrMustBeNumeric, { "cleanQtyStr": cleanQtyStr }) });
        status = 'ERROR';
      } else if (parsedQty === 0) {
        qty = 0;
        validationMessages.push({ level: 'WARNING', code: 'QTY_ZERO', message: UI_STRINGS.common.quantityMustBeGreaterThanZero });
        if (status !== 'ERROR') status = 'WARNING';
      } else if (parsedQty < 0) {
        validationMessages.push({ level: 'ERROR', code: 'QTY_NEGATIVE', message: UI_STRINGS.common.quantityCannotBeNegative });
        status = 'ERROR';
      } else {
        qty = parsedQty;
      }

      // Check category match
      const matchedCategory = catMapByName.get(catName.toLowerCase());
      if (catName && !matchedCategory) {
        validationMessages.push({ level: 'WARNING', code: 'CAT_UNRECOGNIZED', message: interpolateUiString(UI_STRINGS.appApiBoqUploadTemplateRoute.categoryCatNameNotInStandardTaxonomy, { "catName": catName }) });
        if (status !== 'ERROR') status = 'WARNING';
      }

      // Check UOM match
      const matchedUom = uomMapByCode.get(uomRaw.toUpperCase());
      if (uomRaw && !matchedUom) {
        validationMessages.push({ level: 'WARNING', code: 'UOM_NON_STANDARD', message: interpolateUiString(UI_STRINGS.appApiBoqUploadTemplateRoute.uOMUomRawMappedToRawText, { "uomRaw": uomRaw }) });
        if (status !== 'ERROR') status = 'WARNING';
      }

      if (status === 'VALID') validCount++;
      else if (status === 'ERROR') {
        errorCount++;
        exceptions.push({ line: lineNum, description: interpolateUiString(UI_STRINGS.common.value1, { "value1": desc || '(blank)' }), errors: validationMessages });
      } else {
        warningCount++;
      }

      const createdLine = await prisma.boqLine.create({
        data: {
          tenantId: ctx.tenantId,
          boqRevisionId: boqRevision.id,
          lineNumber: lineNum,
          itemCode: itemCode || null,
          originalDescription: desc || 'Untitled Item',
          standardDescription: desc || 'Untitled Item',
          specification: spec || null,
          categoryId: matchedCategory?.id || null,
          uomId: matchedUom?.id || null,
          uomRaw: uomRaw || 'NOS',
          quantity: qty,
          brand: brand || null,
          location: location || null,
          remarks: remarks || null,
          drawingReference: drawingRef || null,
          validationStatus: status,
          validationMessages: JSON.stringify(validationMessages),
          benchmarkEligible: true,
        },
      });

      parsedLines.push(createdLine);
    }

    // Update revision statistics
    const qualityScore = Math.max(0, Math.round(((validCount + warningCount * 0.5) / rows.length) * 100));
    await prisma.boqRevision.update({
      where: { id: boqRevision.id },
      data: {
        totalLines: rows.length,
        validLines: validCount,
        warningLines: warningCount,
        errorLines: errorCount,
        qualityScore,
        preparationStatus: errorCount > 0 ? 'VALIDATION_REQUIRED' : 'DRAFT',
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        projectId,
        entityType: 'BOQ',
        entityId: boq.id,
        action: 'BOQ_UPLOADED',
        description: interpolateUiString(UI_STRINGS.appApiBoqUploadTemplateRoute.templateBOQUploadedNameWithLengthLinesQualityScoreQualityScore, { "name": file.name, "length": rows.length, "qualityScore": qualityScore }),
      },
    });

    return apiSuccess({
      boqId: boq.id,
      revisionId: boqRevision.id,
      boqCode: boq.boqCode,
      revisionCode: boqRevision.revisionCode,
      totalLines: rows.length,
      validLines: validCount,
      warningLines: warningCount,
      errorLines: errorCount,
      qualityScore,
      exceptions,
    }, 201);
  } catch (err: any) {
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.templateUploadFailed }), 500);
  }
}
