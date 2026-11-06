import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { POST } from '../src/app/api/boq/standard/upload-validate/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({ prisma: { uomMaster: { findMany: jest.fn() } } }));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
}));
jest.mock('xlsx', () => {
  const actual = jest.requireActual('xlsx');
  return { ...actual, read: jest.fn(actual.read), utils: actual.utils };
});

const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const findUoms = prisma.uomMaster.findMany as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1' };

function request(values: Record<string, unknown> = {}) {
  return {
    headers: { get: jest.fn(() => null) },
    formData: jest.fn().mockResolvedValue({ get: (name: string) => values[name] ?? null }),
  } as unknown as NextRequest;
}

function uploadFile(sheets: Array<{ name: string; rows: unknown[][] }>, name = 'standard.xlsx') {
  const workbook = XLSX.utils.book_new();
  sheets.forEach(({ name: sheetName, rows }) => XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheetName));
  const bytes = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  return {
    name,
    size: bytes.length,
    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
  };
}

function sheetRequest(sheetName = 'BOQ', rows: unknown[][] = [['Description', 'Quantity'], ['Cable', 2]]) {
  return request({ file: uploadFile([{ name: sheetName, rows }]), projectId: 'project-form', costCentreId: 'cc-form' });
}

describe('standard BOQ upload validation API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    findUoms.mockResolvedValue([
      { code: 'NOS', aliases: 'invalid json' },
      { code: 'KG', aliases: '["kilo"]' },
      { code: 'BAG', aliases: '["bag"]' },
      { code: 'EA', aliases: '["each"]' },
      { code: 'M', aliases: null },
    ]);
  });

  afterEach(() => jest.restoreAllMocks());

  it('checks the authorization context and requires a file', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(request())).resolves.toBe(denied);
    await expect(POST(request())).resolves.toEqual({
      ok: false,
      error: UI_STRINGS.appApiBoqStandardUploadValidateRoute.pleaseSelectOrUploadACompletedStandardBOQExcelFile,
      status: 400,
    });
    expect(auth).toHaveBeenCalledWith('BOQ_EDIT');
    expect(findUoms).not.toHaveBeenCalled();
  });

  it.each([
    ['exact BOQ name', ['Inventory', 'BOQ', 'Project Data'], 1],
    ['BOQ substring', ['Inventory', 'Standard BOQ'], 1],
    ['data substring', ['Inventory', 'Project Data'], 1],
    ['first sheet fallback', ['Inventory'], 0],
  ])('selects the %s workbook sheet', async (_label, names, selectedIndex) => {
    const file = uploadFile(names.map((name, index) => ({
      name,
      rows: index === selectedIndex ? [['Description', 'Quantity'], ['Selected sheet', 1]] : [['Description', 'Quantity'], [`Other ${index}`, 2]],
    })));
    const result = await POST(request({ file })) as any;
    expect(result.ok).toBe(true);
    expect(result.data.validLines[0].description).toBe('Selected sheet');
  });

  it('accepts a plain Item header as the description', async () => {
    const result = await POST(sheetRequest('BOQ', [['Item', 'Quantity'], ['Manual task', 1]])) as any;
    expect(result.data.validLines[0]).toMatchObject({ description: 'Manual task', itemCode: 'STD-L1' });
  });

  it('rejects workbooks with no selected sheet, empty matrices, or only headers', async () => {
    const noSheet = { SheetNames: ['Inventory'], Sheets: {} };
    jest.spyOn(XLSX, 'read').mockReturnValueOnce(noSheet as any);
    await expect(POST(request({ file: { name: 'empty.xlsx', size: 1, arrayBuffer: async () => new ArrayBuffer(0) } }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBoqStandardUploadValidateRoute.invalidSpreadsheetCouldNotFindDataSheetInWorkbook, status: 400,
    });

    jest.spyOn(XLSX.utils, 'sheet_to_json').mockReturnValueOnce([] as any);
    await expect(POST(sheetRequest())).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBoqStandardUploadValidateRoute.theUploadedFileDoesNotContainAnyDataRows, status: 400,
    });
    jest.restoreAllMocks();

    await expect(POST(sheetRequest('BOQ', [['Description', 'Quantity'], ['', '  ']]))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBoqStandardUploadValidateRoute.noDataRowsFoundBelowHeadersInTheSpreadsheet, status: 400,
    });
    expect(findUoms).not.toHaveBeenCalled();
  });

  it('validates row aliases, quantities, duplicates, UOMs, optional metadata, and defaults', async () => {
    const rows = [
      ['STANDARD BOQ TEMPLATE'],
      ['S.No', 'Item Code', 'Item Description', 'Category', 'Subcategory', 'UOM', 'Quantity', 'Specification', 'Wastage %', 'Drawing Reference', 'Area', 'Brand', 'Model', 'Remarks', 'Benchmark Rate', '_ProjectID', '_CostCentreID', '_Sector', '_ProjectType', '_TemplateVersion'],
      [1, 'IT-1', 'Concrete', 'Civil', 'Concrete', 'bag', '2,000', 'M25', 5, 'D-1', 'Zone A', 'Acme', 'M1', 'For slab', 12.5, 'project-row', 'cc-row', 'INDUSTRIAL', 'Warehouse', 'v3'],
      [2, 'IT-1', 'Cable', '', '', 'KG', 0, '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['', '', 'Pending item', '', '', '', '', '', '', '', '', '', '', '', 'bad rate', '', '', '', '', ''],
      [4, 'IT-ERR', 'Bad quantity', '', '', 'NOS', 'several', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      [5, 'IT-NEG', 'Negative quantity', '', '', 'NOS', -3, '', '', '', '', '', '', '', '', '', '', '', '', ''],
      [6, '', 'Nonstandard unit', '', '', 'carton', 1, '', '', '', '', '', '', '', '', '', '', '', '', ''],
      [7, '', 'Alias unit', '', '', 'each', 3, '', '', '', '', '', '', '', '', '', '', '', '', ''],
      [8, 'CODE-ONLY', '', '', '', 'NOS', 1],
      [9, '', 'Bad quantity without code', '', '', 'NOS', 'oops'],
      [10, '', 'Zero quantity without code', '', '', 'NOS', 0],
      [11, '', 'Negative quantity without code', '', '', 'NOS', -1],
      ['', '', '', 'Electrical'],
      ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ];
    const result = await POST(request({ file: uploadFile([{ name: 'BOQ', rows }]), projectId: 'project-form', costCentreId: 'cc-form' })) as any;

    expect(result).toMatchObject({ ok: true, status: 200 });
    expect(findUoms).toHaveBeenCalledWith({ where: { tenantId: context.tenantId }, select: { code: true, aliases: true } });
    expect(result.data).toMatchObject({
      fileName: 'standard.xlsx', totalRows: 12, validRows: 7, warningRows: 6, errorRows: 4,
      pendingQuantityCount: 1, validQuantityCount: 4, canGenerate: true,
      metadata: { sector: 'INDUSTRIAL', projectType: 'Warehouse', templateVersion: 'v3', projectId: 'project-row', costCentreId: 'cc-row' },
    });
    expect(result.data.issues.map((issue: any) => issue.issue)).toEqual(expect.arrayContaining([
      'Duplicate Item Code "IT-1"', UI_STRINGS.common.quantityMustBeGreaterThanZero, 'UOM missing; defaulted to NOS',
      UI_STRINGS.appAppBoqStudioPage.quantityRequired, 'Quantity "several" must be numeric.', UI_STRINGS.common.quantityCannotBeNegative,
      'Non-standard UOM "CARTON"', 'Quantity "oops" must be numeric.',
    ]));
    expect(result.data.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemCode: 'ROW-11', description: 'Bad quantity without code' }),
      expect.objectContaining({ itemCode: 'ROW-13', description: 'Negative quantity without code' }),
    ]));
    expect(result.data.validLines[0]).toMatchObject({
      lineNumber: '1', itemCode: 'IT-1', description: 'Concrete', category: 'Civil', subcategory: 'Concrete',
      specification: 'M25', uom: 'BAG', quantity: 2000, validationStatus: 'VALID', wastagePercent: 5,
      drawingReference: 'D-1', areaZone: 'Zone A', brand: 'Acme', model: 'M1', remarks: 'For slab',
      benchmarkRate: 12.5, projectId: 'project-row', costCentreId: 'cc-row',
    });
    expect(result.data.validLines[1]).toMatchObject({ itemCode: 'IT-1', quantity: 0, validationStatus: 'WARNING', category: 'Civil & Interior', specification: 'Cable' });
    expect(result.data.validLines[2]).toMatchObject({ lineNumber: '3', itemCode: 'STD-L3', quantity: null, validationStatus: 'QUANTITY_REQUIRED', uom: 'NOS', projectId: 'project-form', costCentreId: 'cc-form', benchmarkRate: null });
    expect(result.data.validLines[3]).toMatchObject({ itemCode: 'STD-L4', uom: 'CARTON', quantity: 1 });
    expect(result.data.validLines[4]).toMatchObject({ itemCode: 'STD-L5', uom: 'EACH', quantity: 3 });
    expect(result.data.validLines[5]).toMatchObject({ itemCode: 'CODE-ONLY', description: 'CODE-ONLY', specification: 'Commercial grade', quantity: 1 });
    expect(result.data.validLines[6]).toMatchObject({ itemCode: 'STD-L7', description: 'Zero quantity without code', quantity: 0 });
  });

  it('returns spreadsheet parser errors with the original message or a safe fallback', async () => {
    jest.spyOn(XLSX, 'read').mockImplementationOnce(() => { throw new Error('invalid archive'); });
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(POST(sheetRequest())).resolves.toEqual({ ok: false, error: 'invalid archive', status: 500 });
    jest.spyOn(XLSX, 'read').mockImplementationOnce(() => { throw {}; });
    await expect(POST(sheetRequest())).resolves.toEqual({ ok: false, error: 'Failed to validate uploaded Standard BOQ Excel.', status: 500 });
    expect(log).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });
});
