import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma } from '../src/lib/prisma';
import { notifyNextResponsibleParty } from '../src/lib/notifications';
import { computeLineCostBreakdown } from '../src/lib/boq-cost-breakdown';
import { isApiContext, requireAuth } from '../src/lib/api-utils';
import { POST as makeErrorReport } from '../src/app/api/boq/standard/error-report/route';
import { GET as getBoqTemplate } from '../src/app/api/boq/simple-template/download/route';
import { GET as getApprovedPrs } from '../src/app/api/procurement/approved-prs/route';
import { POST as releasePr } from '../src/app/api/pr/[id]/release-to-procurement/route';
import { GET as getBoqLine } from '../src/app/api/boq/lines/[id]/route';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    procurementRequest: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn() },
    boqLine: { findFirst: jest.fn() },
  },
}));
jest.mock('../src/lib/notifications', () => ({ notifyNextResponsibleParty: jest.fn() }));
jest.mock('../src/lib/boq-cost-breakdown', () => ({ computeLineCostBreakdown: jest.fn() }));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));

const db = prisma as unknown as {
  procurementRequest: { findMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  auditLog: { create: jest.Mock };
  boqLine: { findFirst: jest.Mock };
};
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const notify = notifyNextResponsibleParty as jest.Mock;
const computeBreakdown = computeLineCostBreakdown as jest.Mock;
const ctx = { tenantId: 'tenant-1', userId: 'user-1', userName: 'Buyer' };

const makeRequest = (url: string, body?: unknown) => new NextRequest(new URL(url, 'http://localhost'), {
  ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
});
const routeParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe('spreadsheet and procurement API routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(ctx);
    isContext.mockReturnValue(true);
  });

  it('validates and generates a downloadable BOQ error workbook', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(makeErrorReport(makeRequest('/api/boq/standard/error-report', { issues: [] }))).resolves.toBe(denied);

    await expect(makeErrorReport(makeRequest('/api/boq/standard/error-report', {}))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBoqStandardErrorReportRoute.noIssuesToGenerateErrorReportFor, status: 400,
    });
    await expect(makeErrorReport(makeRequest('/api/boq/standard/error-report', { issues: 'invalid' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBoqStandardErrorReportRoute.noIssuesToGenerateErrorReportFor, status: 400,
    });
    await expect(makeErrorReport(makeRequest('/api/boq/standard/error-report', { issues: [] }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBoqStandardErrorReportRoute.noIssuesToGenerateErrorReportFor, status: 400,
    });

    const req = makeRequest('/api/boq/standard/error-report', {
      fileName: 'import.xlsx',
      issues: [
        { rowNumber: 8, itemCode: 'IT-8', description: 'Ceiling panel', severity: 'WARNING', issue: 'Missing UOM', action: 'Choose UOM' },
        {},
      ],
    });
    const response = await makeErrorReport(req);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="Validation_Error_Report_import.xlsx"');
    const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: 'buffer' });
    expect(workbook.SheetNames).toEqual(['Validation_Issues']);
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Validation_Issues as XLSX.WorkSheet);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ 'S.No.': 1, 'Row # in File': 8, 'Item Code': 'IT-8', Severity: 'WARNING', 'Recommended Action': 'Choose UOM' });
    expect(rows[1]).toMatchObject({ 'S.No.': 2, 'Row # in File': '-', 'Item Code': '-', Severity: 'ERROR' });

    const defaultFileName = await makeErrorReport(makeRequest('/api/boq/standard/error-report', { issues: [{}] }));
    expect(defaultFileName.headers.get('Content-Disposition')).toBe('attachment; filename="Validation_Error_Report_Standard_BOQ.xlsx"');
    const badJson = { json: jest.fn().mockRejectedValue(new Error('invalid JSON')) } as unknown as NextRequest;
    await expect(makeErrorReport(badJson)).resolves.toMatchObject({ ok: false, error: 'invalid JSON', status: 500 });
  });

  it('downloads the standard BOQ template only for an authenticated user', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(getBoqTemplate(makeRequest('/api/boq/simple-template/download'))).resolves.toBe(denied);

    const response = await getBoqTemplate(makeRequest('/api/boq/simple-template/download'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="proCPX_Simple_BOQ_Template.xlsx"');
    const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: 'buffer' });
    expect(workbook.SheetNames).toEqual([UI_STRINGS.common.bOQ]);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets.BOQ as XLSX.WorkSheet)).toHaveLength(5);
  });

  it('searches approved PRs while preserving tenant and release status filters', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(getApprovedPrs(makeRequest('/api/procurement/approved-prs'))).resolves.toBe(denied);

    db.procurementRequest.findMany.mockResolvedValueOnce([{ id: 'pr-1' }]);
    await expect(getApprovedPrs(makeRequest('/api/procurement/approved-prs'))).resolves.toEqual({ ok: true, data: [{ id: 'pr-1' }], status: 200 });
    expect(db.procurementRequest.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', status: { in: ['PR_RELEASED_TO_PROCUREMENT', 'PR_APPROVED'] } },
      orderBy: { releasedAt: 'desc' },
    }));

    await getApprovedPrs(makeRequest('/api/procurement/approved-prs?search=Central'));
    expect(db.procurementRequest.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-1',
        OR: [
          { prNumber: { contains: 'Central' } },
          { title: { contains: 'Central' } },
          { project: { name: { contains: 'Central' } } },
          { costCentre: { name: { contains: 'Central' } } },
        ],
      }),
    }));
  });

  it('releases an approved PR and rejects missing or ineligible PRs', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(releasePr(makeRequest('/api/pr/pr-1'), routeParams('pr-1'))).resolves.toBe(denied);

    db.procurementRequest.findFirst.mockResolvedValueOnce(null);
    await expect(releasePr(makeRequest('/api/pr/missing'), routeParams('missing'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.procurementRequestNotFound, status: 404,
    });
    db.procurementRequest.findFirst.mockResolvedValueOnce({ id: 'pr-2', status: 'DRAFT' });
    await expect(releasePr(makeRequest('/api/pr/pr-2'), routeParams('pr-2'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiPrIdReleaseToProcurementRoute.pRMustBeApprovedBeforeReleasingToProcurement, status: 400,
    });

    const pr = { id: 'pr-1', prNumber: 'PR-001', status: 'PR_APPROVED', projectId: 'project-1' };
    db.procurementRequest.findFirst.mockResolvedValueOnce(pr);
    db.procurementRequest.update.mockResolvedValue({ ...pr, status: 'PR_RELEASED_TO_PROCUREMENT' });
    await expect(releasePr(makeRequest('/api/pr/pr-1'), routeParams('pr-1'))).resolves.toEqual({
      ok: true, data: { pr: { ...pr, status: 'PR_RELEASED_TO_PROCUREMENT' }, status: 'PR_RELEASED_TO_PROCUREMENT' }, status: 200,
    });
    expect(db.procurementRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'pr-1' }, data: expect.objectContaining({ status: 'PR_RELEASED_TO_PROCUREMENT', releasedBy: 'user-1', releasedAt: expect.any(Date) }),
    }));
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ entityId: 'pr-1', action: 'PR_RELEASED_TO_PROCUREMENT' }) });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'PR_RELEASED', recordNumber: 'PR-001', actorName: UI_STRINGS.appLoginPageConstants.buyer }));

    db.procurementRequest.findFirst.mockResolvedValueOnce({ ...pr, status: 'PR_RELEASED_TO_PROCUREMENT' });
    await releasePr(makeRequest('/api/pr/pr-1'), routeParams('pr-1'));
    expect(db.procurementRequest.update).toHaveBeenCalledTimes(2);
  });

  it('looks up tenant BOQ lines and adds the cost breakdown', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(getBoqLine(makeRequest('/api/boq/lines/x'), routeParams('x'))).resolves.toBe(denied);
    await expect(getBoqLine(makeRequest('/api/boq/lines/'), routeParams(''))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqLinesIdRoute.lineIDIsRequired, status: 400 });
    db.boqLine.findFirst.mockResolvedValueOnce(null);
    await expect(getBoqLine(makeRequest('/api/boq/lines/missing'), routeParams('missing'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBoqLinesIdRoute.bOQLineItemNotFound, status: 404,
    });

    const line = { id: 'line-1', tenantId: 'tenant-1', quantity: 4 };
    db.boqLine.findFirst.mockResolvedValueOnce(line);
    computeBreakdown.mockReturnValue({ total: 400 });
    await expect(getBoqLine(makeRequest('/api/boq/lines/line-1'), routeParams('line-1'))).resolves.toEqual({
      ok: true, data: { line: { ...line, costBreakdown: { total: 400 } } }, status: 200,
    });
    expect(db.boqLine.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: 'line-1', tenantId: 'tenant-1', isDeleted: false },
    }));
    expect(computeBreakdown).toHaveBeenCalledWith(line);
  });
});
