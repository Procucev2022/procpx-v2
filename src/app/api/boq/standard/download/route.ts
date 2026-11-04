// src/app/api/boq/standard/download/route.ts - Dynamic Category-Specific Standard BOQ Excel Generator
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError } from '@/lib/api-utils';
import * as XLSX from 'xlsx';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function GET(req: NextRequest) {
  const ctx = await requireAuth('BOQ_VIEW');
  if (!isApiContext(ctx)) return ctx;

  try {
    const { searchParams } = new URL(req.url);
    const sector = (searchParams.get('sector') || 'RETAIL').toUpperCase();
    const projectType = searchParams.get('projectType') || 'Retail Store Fitout';
    const projectId = searchParams.get('projectId') || '';
    const costCentreId = searchParams.get('costCentreId') || '';
    const categoriesParam = searchParams.get('categories') || '';
    const selectedCategories = categoriesParam ? categoriesParam.split(',').map(c => c.trim()).filter(Boolean) : [];

    // Fetch Project and Cost Centre details for metadata
    let project = null;
    let costCentre = null;
    if (projectId) {
      project = await prisma.project.findFirst({
        where: { id: projectId, tenantId: ctx.tenantId },
      });
    }
    if (costCentreId) {
      costCentre = await prisma.costCentre.findFirst({
        where: { id: costCentreId, tenantId: ctx.tenantId },
      });
    }

    // Query standard items from database for this sector & categories
    const whereClause: any = {
      tenantId: ctx.tenantId,
      isActive: true,
    };

    if (sector && sector !== 'ALL') {
      whereClause.sector = sector;
    }

    if (selectedCategories.length > 0) {
      whereClause.category = { in: selectedCategories };
    }

    let standardItems = await prisma.standardBoqItem.findMany({
      where: whereClause,
      orderBy: [{ category: 'asc' }, { subcategory: 'asc' }, { itemCode: 'asc' }],
    });

    // Fallback: If sector specific query yields few items, pull items matching the categories across tenant
    if (standardItems.length === 0 && selectedCategories.length > 0) {
      standardItems = await prisma.standardBoqItem.findMany({
        where: {
          tenantId: ctx.tenantId,
          isActive: true,
          category: { in: selectedCategories },
        },
        orderBy: [{ category: 'asc' }, { itemCode: 'asc' }],
      });
    }

    // If still empty, pull general standard items
    if (standardItems.length === 0) {
      standardItems = await prisma.standardBoqItem.findMany({
        where: { tenantId: ctx.tenantId, isActive: true },
        take: 30,
        orderBy: [{ category: 'asc' }, { itemCode: 'asc' }],
      });
    }

    // Fetch Master UOMs and Categories for Excel Data & Reference Sheets
    const uoms = await prisma.uomMaster.findMany({
      where: { tenantId: ctx.tenantId, isActive: true },
      select: { code: true, name: true, category: true },
      orderBy: { code: 'asc' },
    });

    const categories = await prisma.category.findMany({
      where: { tenantId: ctx.tenantId, isActive: true, level: 1 },
      include: { children: true },
      orderBy: { sortOrder: 'asc' },
    });

    const workbook = XLSX.utils.book_new();

    // =========================================================================
    // SHEET 1: BOQ (Standard Line Items with blank Quantity for user entry)
    // =========================================================================
    const boqRows = standardItems.map((item, idx) => ({
      'S.No.': idx + 1,
      'Item Code': item.itemCode,
      'Item Description': item.standardDescription,
      'BOQ Description': item.detailedSpecification,
      'UOM': item.uom,
      'Quantity': '', // Mandatory blank column for user to fill!
      'Category': item.category,
      'Sub-category': item.subcategory || '',
      'Wastage %': 0,
      'Drawing Reference': '',
      'Area / Zone': costCentre?.floorZone || costCentre?.name || '',
      'Brand / Make': item.brandMake || '',
      'Model / Reference': '',
      'Remarks': '',
      'Benchmark Rate (Ref)': item.benchmarkRate || '',
      // Metadata (Preserved across download -> fill -> upload)
      '_ProjectID': project?.id || projectId || '',
      '_ProjectCode': project?.projectCode || '',
      '_CostCentreID': costCentre?.id || costCentreId || '',
      '_CostCentreCode': costCentre?.code || '',
      '_Sector': sector,
      '_ProjectType': projectType,
      '_TemplateVersion': 'PROCPX-STD-BOQ-v2.0',
    }));

    const wsBoq = XLSX.utils.json_to_sheet(boqRows);

    // Set column widths for comfortable editing in Excel
    wsBoq['!cols'] = [
      { wch: 8 },  // S.No.
      { wch: 16 }, // Item Code
      { wch: 45 }, // Item Description
      { wch: 55 }, // BOQ Description
      { wch: 10 }, // UOM
      { wch: 14 }, // Quantity (User Fill)
      { wch: 22 }, // Category
      { wch: 22 }, // Sub-category
      { wch: 12 }, // Wastage %
      { wch: 18 }, // Drawing Reference
      { wch: 20 }, // Area / Zone
      { wch: 25 }, // Brand / Make
      { wch: 20 }, // Model / Reference
      { wch: 30 }, // Remarks
      { wch: 20 }, // Benchmark Rate (Ref)
      { wch: 0 },  // _ProjectID (hidden metadata)
      { wch: 0 },  // _ProjectCode
      { wch: 0 },  // _CostCentreID
      { wch: 0 },  // _CostCentreCode
      { wch: 0 },  // _Sector
      { wch: 0 },  // _ProjectType
      { wch: 0 },  // _TemplateVersion
    ];

    XLSX.utils.book_append_sheet(workbook, wsBoq, 'BOQ');

    // =========================================================================
    // SHEET 2: INSTRUCTIONS (Clear Guidelines for Project Users)
    // =========================================================================
    const instructionsData = [
      ['proCPX ENTERPRISE CAPEX PROCUREMENT PLATFORM'],
      ['STANDARD CATEGORY-SPECIFIC BOQ — DOWNLOAD & FILL INSTRUCTIONS'],
      ['Version: 2.0 | Sector: ' + sector + ' | Project Type: ' + projectType],
      [''],
      ['INSTRUCTIONS FOR FILLING THIS SPREADSHEET:'],
      ['1. DO NOT CHANGE ITEM CODE', 'The Item Code links directly to standardized catalogue specifications and market benchmarks.'],
      ['2. DO NOT CHANGE CATEGORY', 'Keep categories aligned with proCPX taxomony for automated cost centre allocation.'],
      ['3. ENTER QUANTITY FOR REQUIRED ITEMS', 'Fill in the "Quantity" column with positive numeric quantities. Leave blank or 0 for items not required.'],
      ['4. PRESERVE APPROVED UOMS', 'Use approved UOMs listed in the MASTER_DATA sheet (e.g., NOS, SQFT, SQM, RMT, MTR, KG, TON, POINT).'],
      ['5. PROJECT-SPECIFIC MODIFICATIONS', 'You may edit Drawing Reference, Area / Zone, Brand / Make, Model / Reference, and Remarks.'],
      ['6. ADDING NEW PROJECT-SPECIFIC ITEMS', 'You can append custom project items at the end of the BOQ table with a valid Category and UOM.'],
      ['7. PRESERVE SYSTEM IDENTIFIERS', 'Do not alter the metadata columns or sheet names.'],
      ['8. SAVE FORMAT', 'Save this file in Excel format (.xlsx).'],
      ['9. UPLOAD TO proCPX', 'Return to proCPX BOQ Studio → "2. Download Standard BOQ" → Click "Upload Completed BOQ" to validate.'],
      [''],
      ['TARGET PROJECT INFORMATION:'],
      ['Project Name:', project?.name || 'Current Project'],
      ['Project Code:', project?.projectCode || 'N/A'],
      ['Cost Centre:', (costCentre?.code ? `${costCentre.code} — ${costCentre.name}` : 'Not Specified')],
      ['Area / Sqft:', (costCentre?.areaSqFt ? `${costCentre.areaSqFt} Sqft` : 'N/A')],
      ['Sector:', sector],
      ['Project Type:', projectType],
      ['Export Timestamp:', new Date().toISOString()],
    ];

    const wsInstructions = XLSX.utils.aoa_to_sheet(instructionsData);
    wsInstructions['!cols'] = [{ wch: 35 }, { wch: 75 }];
    XLSX.utils.book_append_sheet(workbook, wsInstructions, 'INSTRUCTIONS');

    // =========================================================================
    // SHEET 3: MASTER_DATA (Supporting Taxonomy & Approved Values)
    // =========================================================================
    const masterDataRows: any[] = [];
    const maxLen = Math.max(uoms.length, categories.length, 10);
    for (let i = 0; i < maxLen; i++) {
      masterDataRows.push({
        'Approved UOM Code': uoms[i]?.code || '',
        'UOM Description': uoms[i]?.name || '',
        'UOM Category': uoms[i]?.category || '',
        'Standard Category': categories[i]?.name || '',
        'Sub-categories': categories[i]?.children?.map((c: any) => c.name).join(', ') || '',
      });
    }

    const wsMaster = XLSX.utils.json_to_sheet(masterDataRows);
    wsMaster['!cols'] = [{ wch: 18 }, { wch: 22 }, { wch: 16 }, { wch: 25 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(workbook, wsMaster, 'MASTER_DATA');

    // Generate Excel Buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const filename = `Standard_BOQ_${sector}_${projectType.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err: any) {
    console.error('Error downloading standard BOQ:', err);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.failedToGenerateStandardBoqDownload }), 500, { route: '/api/boq/standard/download', method: 'GET', error: err });
  }
}
