// src/app/api/boq/standard/upload-validate/route.ts - Validates uploaded completed Standard BOQ Excel
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import * as XLSX from 'xlsx';
import type { ValidationIssue } from "@app-types/app/api/boq/standard/upload-validate/route.types";
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { MAX_BOQ_IMPORT_COLUMNS, MAX_BOQ_IMPORT_SHEET_ROWS, MAX_BOQ_UPLOAD_BYTES } from '@/lib/boq-upload.constants';
import { MAX_BOQ_BATCH_LINES } from '@/lib/d1-batch.constants';

export type { ValidationIssue };


export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BOQ_EDIT');
  if (!isApiContext(ctx)) return ctx;

  try {
    const contentLength = Number(req.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_BOQ_UPLOAD_BYTES + 64 * 1024) {
      return apiError(interpolateUiString(UI_STRINGS.appApiBoqUploadRoute.boqUploadFileMustBeBetweenOneByteAndMaxBytes, { maxBytes: MAX_BOQ_UPLOAD_BYTES }), 413);
    }
    const formData = await req.formData();
    const file = formData.get('file');
    const projectId = (formData.get('projectId') as string) || '';
    const costCentreId = (formData.get('costCentreId') as string) || '';

    if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
      return apiError(UI_STRINGS.appApiBoqStandardUploadValidateRoute.pleaseSelectOrUploadACompletedStandardBOQExcelFile, 400);
    }
    if (file.size <= 0 || file.size > MAX_BOQ_UPLOAD_BYTES) {
      return apiError(interpolateUiString(UI_STRINGS.appApiBoqUploadRoute.boqUploadFileMustBeBetweenOneByteAndMaxBytes, { maxBytes: MAX_BOQ_UPLOAD_BYTES }), 413);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer', sheetRows: MAX_BOQ_IMPORT_SHEET_ROWS });

    // Look for Sheet 'BOQ' or sheet containing 'boq', 'data', 'sheet', or fallback to first sheet
    let sheetName = workbook.SheetNames.find(s => s.toLowerCase() === 'boq') ||
                    workbook.SheetNames.find(s => s.toLowerCase().includes('boq')) ||
                    workbook.SheetNames.find(s => s.toLowerCase().includes('data')) ||
                    workbook.SheetNames[0];

    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      return apiError(UI_STRINGS.appApiBoqStandardUploadValidateRoute.invalidSpreadsheetCouldNotFindDataSheetInWorkbook, 400);
    }

    // Read as 2D array to intelligently identify header row (handles title rows or subtitles)
    const rawMatrix: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', blankrows: false });
    if (!rawMatrix || rawMatrix.length === 0) {
      return apiError(UI_STRINGS.appApiBoqStandardUploadValidateRoute.theUploadedFileDoesNotContainAnyDataRows, 400);
    }

    // Find the header row index
    let headerRowIdx = 0;
    for (let i = 0; i < Math.min(rawMatrix.length, 10); i++) {
      const rowStrings = rawMatrix[i].map(c => String(c).toLowerCase().trim());
      const matchCount = rowStrings.filter(c =>
        c.includes('item') ||
        c.includes('desc') ||
        c.includes('qty') ||
        c.includes('quantity') ||
        c.includes('uom') ||
        c.includes('unit') ||
        c.includes('spec') ||
        c.includes('s.no') ||
        c.includes('category')
      ).length;
      if (matchCount >= 2) {
        headerRowIdx = i;
        break;
      }
    }

    const headerRow = rawMatrix[headerRowIdx].map(h => String(h).trim());
    if (headerRow.length > MAX_BOQ_IMPORT_COLUMNS) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const rows: any[] = [];
    for (let i = headerRowIdx + 1; i < rawMatrix.length; i++) {
      const rowArr = rawMatrix[i];
      if (!rowArr || rowArr.every(cell => String(cell).trim() === '')) continue;
      const rowObj: any = {};
      headerRow.forEach((h, hIdx) => {
        if (h) rowObj[h] = rowArr[hIdx] !== undefined ? rowArr[hIdx] : '';
      });
      rows.push(rowObj);
    }

    if (rows.length === 0) {
      return apiError(UI_STRINGS.appApiBoqStandardUploadValidateRoute.noDataRowsFoundBelowHeadersInTheSpreadsheet, 400);
    }
    if (rows.length > MAX_BOQ_BATCH_LINES) return apiError(UI_STRINGS.common.boqLineBatchLimitExceeded, 400);

    // Load reference taxonomy from DB
    const uoms = await prisma.uomMaster.findMany({
      where: { tenantId: ctx.tenantId },
      select: { code: true, aliases: true },
    });
    const validUomSet = new Set(uoms.map(u => u.code.toUpperCase()));
    uoms.forEach(u => {
      try {
        const aliases: string[] = JSON.parse(u.aliases || '[]');
        aliases.forEach(a => validUomSet.add(a.toUpperCase()));
      } catch (_) {}
    });

    const issues: ValidationIssue[] = [];
    const parsedValidLines: any[] = [];
    const seenItemCodes = new Set<string>();

    let validCount = 0;
    let warningCount = 0;
    let errorCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + headerRowIdx + 2;

      // Helper to match column aliases case-insensitively
      const getField = (aliases: string[]): string => {
        for (const alias of aliases) {
          for (const key of Object.keys(r)) {
            const cleanKey = key.trim().toLowerCase().replace(/[*_#:]/g, '');
            const normalizedAlias = alias.toLowerCase();
            const matchesAlias = normalizedAlias === 'item'
              ? cleanKey === normalizedAlias
              : cleanKey === normalizedAlias || cleanKey.includes(normalizedAlias);
            if (matchesAlias) {
              const val = r[key];
              if (val !== undefined && val !== null && String(val).trim() !== '') {
                return String(val).trim();
              }
            }
          }
        }
        return '';
      };

      const sno = getField(['s.no.', 's.no', 'sno', 'sl no', 'sl.no', 'sl. no.', 'serial no', 'line number', 'line no']);
      const itemCode = getField(['item code', 'itemcode', 'material code', 'item id', 'catalog code', 'code']);
      const description = getField(['item description', 'description', 'particulars', 'item', 'item name', 'scope of work', 'scope']);
      const category = getField(['category', 'trade', 'discipline', 'cost centre category']);
      const subcategory = getField(['sub-category', 'subcategory']);
      const uomRaw = getField(['uom', 'unit', 'unit of measure', 'units']).toUpperCase();
      const spec = getField(['boq description', 'detailed specification', 'specification', 'spec', 'specs', 'specification / scope']) || description;
      const rawQty = getField(['quantity', 'qty', 'quantities', 'quantity (nos)', 'estimated qty', 'total qty', 'nos']);
      const wastage = parseFloat(getField(['wastage %', 'wastage']) || '0') || 0;
      const drawingRef = getField(['drawing reference', 'drawing ref']);
      const areaZone = getField(['area / zone', 'location / area', 'location', 'area', 'zone']);
      const brand = getField(['brand / make', 'brand', 'make']);
      const model = getField(['model / reference', 'model']);
      const remarks = getField(['remarks', 'remark', 'notes']);
      const benchmarkRate = parseFloat(getField(['benchmark rate (ref)', 'benchmark rate', 'rate', 'unit rate']) || '0') || null;

      // If entire row has neither description nor itemCode, skip empty line
      if (!description && !itemCode) {
        continue;
      }

      let rowHasError = false;
      const finalDesc = description || itemCode;

      // 1. UOM check with safe fallback
      let finalUom = uomRaw;
      if (!finalUom) {
        finalUom = 'NOS';
        issues.push({
          rowNumber: rowNum,
          itemCode: itemCode || `ROW-${rowNum}`,
          description: finalDesc,
          issue: 'UOM missing; defaulted to NOS',
          action: 'Verify UOM in BOQ Workspace',
          severity: 'WARNING',
        });
        warningCount++;
      } else if (!validUomSet.has(finalUom)) {
        issues.push({
          rowNumber: rowNum,
          itemCode: itemCode || `ROW-${rowNum}`,
          description: finalDesc,
          issue: `Non-standard UOM "${finalUom}"`,
          action: 'Recognized as raw UOM',
          severity: 'WARNING',
        });
        warningCount++;
      }

      // 3. Duplicate Item Code check
      if (itemCode && seenItemCodes.has(itemCode)) {
        issues.push({
          rowNumber: rowNum,
          itemCode,
          description: finalDesc,
          issue: `Duplicate Item Code "${itemCode}"`,
          action: 'Review in BOQ Workspace',
          severity: 'WARNING',
        });
        warningCount++;
      } else if (itemCode) {
        seenItemCodes.add(itemCode);
      }

      // 4. Quantity evaluation - PROCPX COMMERCIAL BOQ WORKFLOW:
      // A blank quantity means "user has not entered quantity yet". NEVER default to 1!
      const rawQtyStr = rawQty.trim();
      const qtyClean = rawQtyStr.replace(/,/g, '').trim();
      let finalQty: number | null = null;
      let lineStatus = 'VALID';

      if (qtyClean === '') {
        // Blank quantity: import line, leave quantity null, flag as QUANTITY_REQUIRED
        finalQty = null;
        lineStatus = 'QUANTITY_REQUIRED';
        issues.push({
          rowNumber: rowNum,
          itemCode: itemCode || `ROW-${rowNum}`,
          description: finalDesc,
          issue: 'Quantity required',
          action: 'Enter quantity in BOQ Workspace',
          severity: 'WARNING',
        });
        warningCount++;
      } else {
        const parsedQty = parseFloat(qtyClean);
        if (isNaN(parsedQty)) {
          // Non-numeric string like "Qty" -> Validation error!
          issues.push({
            rowNumber: rowNum,
            itemCode: itemCode || `ROW-${rowNum}`,
            description: finalDesc,
            issue: `Quantity "${rawQtyStr}" must be numeric.`,
            action: 'Enter a valid numeric quantity',
            severity: 'ERROR',
          });
          rowHasError = true;
          errorCount++;
        } else if (parsedQty === 0) {
          finalQty = 0;
          lineStatus = 'WARNING';
          issues.push({
            rowNumber: rowNum,
            itemCode: itemCode || `ROW-${rowNum}`,
            description: finalDesc,
            issue: 'Quantity must be greater than zero.',
            action: 'Review quantity in BOQ Workspace',
            severity: 'WARNING',
          });
          warningCount++;
        } else if (parsedQty < 0) {
          issues.push({
            rowNumber: rowNum,
            itemCode: itemCode || `ROW-${rowNum}`,
            description: finalDesc,
            issue: 'Quantity cannot be negative.',
            action: 'Enter a positive quantity',
            severity: 'ERROR',
          });
          rowHasError = true;
          errorCount++;
        } else {
          finalQty = parsedQty;
          lineStatus = 'VALID';
        }
      }

      if (rowHasError) {
        // Row has validation error (missing description or invalid non-numeric quantity)
        // Handled in issues, errorCount incremented
      } else {
        validCount++;
        parsedValidLines.push({
          lineNumber: sno || String(validCount),
          itemCode: itemCode || `STD-L${validCount}`,
          description: finalDesc,
          category: category || 'Civil & Interior',
          subcategory: subcategory || null,
          specification: spec || 'Commercial grade',
          uom: finalUom,
          quantity: finalQty,
          validationStatus: lineStatus,
          wastagePercent: wastage,
          drawingReference: drawingRef || null,
          areaZone: areaZone || null,
          brand: brand || null,
          model: model || null,
          remarks: remarks || null,
          benchmarkRate,
          projectId: r['_ProjectID'] || projectId,
          costCentreId: r['_CostCentreID'] || costCentreId,
        });
      }
    }

    const pendingQuantityCount = parsedValidLines.filter(l => l.quantity === null).length;
    const validQuantityCount = parsedValidLines.filter(l => l.quantity !== null && l.quantity > 0).length;

    return apiSuccess({
      fileName: file.name,
      fileSize: file.size,
      totalRows: rows.length,
      validRows: validCount,
      warningRows: warningCount,
      errorRows: errorCount,
      pendingQuantityCount,
      validQuantityCount,
      issues,
      validLines: parsedValidLines,
      canGenerate: parsedValidLines.length > 0,
      metadata: {
        sector: rows[0]?.['_Sector'] || 'RETAIL',
        projectType: rows[0]?.['_ProjectType'] || 'Retail Store Fitout',
        templateVersion: rows[0]?.['_TemplateVersion'] || 'PROCPX-STD-BOQ-v2.0',
        projectId: rows[0]?.['_ProjectID'] || projectId,
        costCentreId: rows[0]?.['_CostCentreID'] || costCentreId,
      },
    });
  } catch (err: any) {
    console.error('Validation error on uploaded Standard BOQ:', err);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.failedToValidateUploadedStandardBoqExcel }), 500);
  }
}
