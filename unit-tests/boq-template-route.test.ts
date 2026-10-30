import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { GET } from '../src/app/api/boq/template/route';

jest.mock('../src/lib/api-utils', () => ({ requireAuth: jest.fn(), isApiContext: jest.fn() }));

const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const request = () => new NextRequest('http://localhost/api/boq/template');

describe('standard BOQ spreadsheet template route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue({ tenantId: 'tenant-1', userId: 'user-1', role: 'CLIENT_ADMIN' });
    isContext.mockReturnValue(true);
  });

  it('requires BOQ view permission before producing a workbook', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(request())).resolves.toBe(denied);
    expect(auth).toHaveBeenCalledWith('BOQ_VIEW');
  });

  it('returns the instructions, sample BOQ rows, and category/UOM reference sheets', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="proCPX_Standard_BOQ_Template_v2.xlsx"');

    const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: 'buffer' });
    expect(workbook.SheetNames).toEqual(['Instructions', 'BOQ_Data', 'Reference_Taxonomy']);
    const instructions = XLSX.utils.sheet_to_json(workbook.Sheets.Instructions, { header: 1 }) as unknown[][];
    expect(instructions[0]).toEqual(['proCPX Enterprise BOQ Standard Import Template', 'Version 2.0 (Dual-Workflow Ready)']);
    expect(instructions.some((row) => String(row[0]).includes('Mandatory columns'))).toBe(true);

    const boqRows = XLSX.utils.sheet_to_json(workbook.Sheets.BOQ_Data) as Record<string, unknown>[];
    expect(boqRows).toHaveLength(3);
    expect(boqRows[0]).toEqual(expect.objectContaining({ 'Project ID *': 'CPX-P-000001', 'Cost Centre Code *': 'CC-001', 'Category *': 'Civil & Interior', 'UOM *': 'SQFT', 'Quantity *': 20000 }));
    expect(boqRows[2]).toEqual(expect.objectContaining({ 'Category *': 'HVAC', 'Item Code': 'HVA-AC-001', 'Quantity *': 20 }));

    const referenceRows = XLSX.utils.sheet_to_json(workbook.Sheets.Reference_Taxonomy, { header: 1 }) as unknown[][];
    expect(referenceRows[0]).toEqual(['Category', 'Standard Sub-categories']);
    expect(referenceRows).toHaveLength(15);
    expect(referenceRows[1][0]).toBe('Civil & Interior');
  });
});
