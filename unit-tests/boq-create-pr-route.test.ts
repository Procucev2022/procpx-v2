import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/boq/create-pr/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '../src/lib/api-utils';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { isUserAuthorizedForProject } from '../src/lib/project-auth';
import { readSelectedPrBoqLines } from '../src/lib/pr-line-selection';
import { interpolateUiString } from '../src/lib/i18n';
import {
  PROCUREMENT_REQUEST_AUDIT_INSERT_AFTER_BOQ_UPDATE_SQL,
  PROCUREMENT_REQUEST_BOQ_UPDATE_AFTER_REVISION_SQL,
  PROCUREMENT_REQUEST_INSERT_IF_VALID_SQL,
  PROCUREMENT_REQUEST_LINE_INSERT_AFTER_PARENT_SQL,
  PROCUREMENT_REQUEST_REVISION_UPDATE_AFTER_LINES_SQL,
  MAX_PR_BATCH_LINES,
} from '../src/lib/d1-batch.constants';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { MAX_D1_QUERY_FILTER_VALUES } from '../src/lib/d1-query.constants';


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    boqRevision: { findFirst: jest.fn(), update: jest.fn() },
    boq: { findFirst: jest.fn(), update: jest.fn() },
    costCentre: { findFirst: jest.fn() },
    procurementRequest: { findFirst: jest.fn() },
  },
}));
jest.mock('../src/lib/project-auth', () => ({ isUserAuthorizedForProject: jest.fn() }));
jest.mock('../src/lib/pr-line-selection', () => ({ readSelectedPrBoqLines: jest.fn() }));
jest.mock('../src/lib/d1-batch', () => ({ isD1BatchWithinLimits: (input: Array<{ values: unknown[] }>) => input.reduce((total, item) => total + item.values.length, 0) <= 4500 && input.every((item) => item.values.length <= 100), writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const errorResponse = apiError as jest.Mock;
const successResponse = apiSuccess as jest.Mock;
const writeBatch = writeD1BatchAtomically as jest.Mock;
const structuredLog = writeStructuredLog as jest.Mock;
const projectAuthorized = isUserAuthorizedForProject as jest.Mock;
const readSelectedLines = readSelectedPrBoqLines as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'buyer-1', role: 'BUYER' };
const request = (body: unknown) => new NextRequest('http://localhost/api/boq/create-pr', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

function validRevision(overrides: Record<string, unknown> = {}) {
  return {
    id: 'revision-1', revisionCode: 'R2', revisionNumber: 2, boqId: 'boq-1', costCentreId: 'cc-1',
    boq: { id: 'boq-1', projectId: 'project-1', costCentreId: null, title: 'Electrical BOQ', boqCode: 'BOQ-000001' },
    lines: [
      { id: 'line-1', lineNumber: 'L-1', quantity: 2, aiUnitCost: 10, aiTotalCost: 20, standardDescription: 'Cable', specification: 'Copper', category: { name: 'Electrical' }, subcategory: { name: 'Wire' }, uom: { code: 'MTR' }, drawingReference: 'D-1' },
      { id: 'line-2', lineNumber: null, quantity: 3, aiUnitCost: null, benchmarkRate: 4, aiTotalCost: null, originalDescription: 'Panel', category: null, subcategory: null, uom: null, uomRaw: '', drawingReference: '' },
    ],
    ...overrides,
  };
}

describe('create PR from BOQ route', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    errorResponse.mockImplementation((error: string, status = 400) => ({ ok: false, error, status }));
    successResponse.mockImplementation((data: unknown, status = 200) => ({ ok: true, data, status }));
    db.boqRevision.findFirst.mockResolvedValue(validRevision());
    db.boq.findFirst.mockResolvedValue(null);
    db.costCentre.findFirst.mockResolvedValue({ id: 'cc-1', code: 'CC01', name: 'North Wing' });
    db.procurementRequest.findFirst.mockResolvedValue(null);
    projectAuthorized.mockResolvedValue(true);
    readSelectedLines.mockResolvedValue([]);
    writeBatch.mockResolvedValue([
      { results: [{ id: 'pr-1', prNumber: 'PR-2026-000009' }] },
      ...Array.from({ length: 6 }, () => ({ meta: { changes: 1 } })),
    ]);
    structuredLog.mockResolvedValue(undefined);
  });

  it('requires PR creation permission and at least one BOQ identifier', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(request({}))).resolves.toBe(denied);
    await expect(POST(request({}))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.bOQRevisionIDOrBOQIDIsRequired, status: 400 });
    expect(db.boqRevision.findFirst).not.toHaveBeenCalled();
  });

  it('resolves revision IDs or latest BOQ revisions and rejects absent revisions or cost centres', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    db.boq.findFirst.mockResolvedValueOnce({ id: 'boq-1', revisions: [{ id: 'revision-latest', boqId: 'boq-1', lines: [] }] });
    db.costCentre.findFirst.mockResolvedValueOnce(null);
    await expect(POST(request({ boqId: 'boq-1', costCentreId: 'wrong-cc' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.costCentreNotFoundForThisProject, status: 404,
    });
    expect(db.boq.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'boq-1', tenantId: 'tenant-1' } }));

    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    db.boq.findFirst.mockResolvedValueOnce({ id: 'boq-empty', revisions: [] });
    await expect(POST(request({ boqId: 'boq-empty', costCentreId: 'cc-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.bOQRevisionNotFound, status: 404 });
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    db.boq.findFirst.mockResolvedValueOnce(null);
    await expect(POST(request({ boqId: 'missing', costCentreId: 'cc-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.bOQRevisionNotFound, status: 404 });
  });

  it('requires a target cost centre, checks project scope, and rejects empty selected lines', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce(validRevision({
      costCentreId: null,
      boq: { id: 'boq-1', projectId: 'project-1', costCentreId: null, title: 'Electrical BOQ', boqCode: 'BOQ-000001' },
    }));
    await expect(POST(request({ boqRevisionId: 'revision-1' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBoqCreatePrRoute.aValidCostCentreIsRequiredToCreateAPR, status: 400,
    });
    db.costCentre.findFirst.mockResolvedValueOnce(null);
    await expect(POST(request({ boqRevisionId: 'revision-1', costCentreId: 'wrong-cc', projectId: 'project-1' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.costCentreNotFoundForThisProject, status: 404,
    });
    db.boqRevision.findFirst.mockResolvedValueOnce(validRevision({ lines: [] }));
    await expect(POST(request({ boqRevisionId: 'revision-1', costCentreId: 'cc-1', selectedLineIds: ['missing'] }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.noValidBOQLinesAvailableToGeneratePR, status: 400,
    });
  });

  it('enforces project authorization before creating a procurement request', async () => {
    projectAuthorized.mockResolvedValueOnce(false);

    await expect(POST(request({ boqRevisionId: 'revision-1', costCentreId: 'cc-1' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.forbiddenInsufficientPermissions, status: 403,
    });

    expect(projectAuthorized).toHaveBeenCalledWith('buyer-1', 'BUYER', 'project-1', 'tenant-1');
    expect(writeBatch).not.toHaveBeenCalled();
  });

  it('blocks blank or non-positive quantities with singular and plural messages', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce(validRevision({ lines: [{ id: 'blank', quantity: null }] }));
    await expect(POST(request({ boqRevisionId: 'revision-1', costCentreId: 'cc-1' }))).resolves.toEqual({
      ok: false, error: 'Quantity required for 1 item before creating PR.', status: 400,
    });
    db.boqRevision.findFirst.mockResolvedValueOnce(validRevision({ lines: [
      { id: 'zero', quantity: 0 }, { id: 'negative', quantity: -1 },
    ] }));
    await expect(POST(request({ boqRevisionId: 'revision-1', costCentreId: 'cc-1' }))).resolves.toEqual({
      ok: false, error: 'Quantity required for 2 items before creating PR.', status: 400,
    });
  });

  it('prevents duplicate active PRs while allowing rejected or cancelled PRs to be retried', async () => {
    db.procurementRequest.findFirst.mockResolvedValueOnce({ prNumber: 'PR-OLD' });
    await expect(POST(request({ boqRevisionId: 'revision-1', costCentreId: 'cc-1' }))).resolves.toEqual({
      ok: false,
      error: 'An active Procurement Request (PR-OLD) already exists for this BOQ Revision. Duplicate PR creation is prevented.',
      status: 409,
    });
    expect(db.procurementRequest.findFirst).toHaveBeenCalledWith({ where: {
      tenantId: 'tenant-1', boqRevisionId: 'revision-1', status: { notIn: ['PR_REJECTED', 'CANCELLED'] },
    } });
  });

  it('creates an auto-submitted PR with calculated values and linked line items', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce(validRevision({ lines: [
      ...validRevision().lines,
      { id: 'line-3', lineNumber: null, quantity: 1, aiUnitCost: null, benchmarkRate: null, aiTotalCost: null, standardDescription: null, originalDescription: null, specification: '', category: null, subcategory: null, uom: null, uomRaw: null, drawingReference: null },
    ] }));
    await expect(POST(request({
      boqRevisionId: 'revision-1', projectId: 'project-1', costCentreId: 'cc-1',
      title: 'Urgent package', requiredDate: '2026-12-20', selectedLineIds: ['line-1', 'line-2', 'line-3'], autoSubmit: true,
    }))).resolves.toMatchObject({ ok: true, status: 201, data: {
      success: true, prId: 'pr-1', totalLines: 3, totalValue: 132, status: 'PR_PENDING_PROJECT_APPROVAL',
    } });
    expect(db.costCentre.findFirst).toHaveBeenCalledWith({ where: { id: 'cc-1', projectId: 'project-1', tenantId: 'tenant-1' } });
    expect(db.boqRevision.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        lines: expect.objectContaining({
          where: { isDeleted: false, id: { in: ['line-1', 'line-2', 'line-3'] } },
          orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
          take: MAX_PR_BATCH_LINES + 1,
        }),
      }),
    }));
    expect(projectAuthorized).toHaveBeenCalledWith('buyer-1', 'BUYER', 'project-1', 'tenant-1');
    expect(writeBatch).toHaveBeenCalledTimes(1);
    const statements = writeBatch.mock.calls[0][0];
    expect(statements).toHaveLength(7);
    expect(statements.map((statement: { sql: string }) => statement.sql)).toEqual([
      PROCUREMENT_REQUEST_INSERT_IF_VALID_SQL,
      PROCUREMENT_REQUEST_LINE_INSERT_AFTER_PARENT_SQL,
      PROCUREMENT_REQUEST_LINE_INSERT_AFTER_PARENT_SQL,
      PROCUREMENT_REQUEST_LINE_INSERT_AFTER_PARENT_SQL,
      PROCUREMENT_REQUEST_REVISION_UPDATE_AFTER_LINES_SQL,
      PROCUREMENT_REQUEST_BOQ_UPDATE_AFTER_REVISION_SQL,
      PROCUREMENT_REQUEST_AUDIT_INSERT_AFTER_BOQ_UPDATE_SQL,
    ]);
    for (const statement of statements) {
      expect(statement.values).toHaveLength((statement.sql.match(/\?/g) || []).length);
    }
    expect(statements[0].values).toEqual(expect.arrayContaining([
      'tenant-1', 'project-1', 'cc-1', 'boq-1', 'revision-1', 'Urgent package', 132, 3,
    ]));
    expect(statements[1].values).toEqual(expect.arrayContaining([
      'line-1', 'L-1', 'Cable', 'Copper', 'Electrical', 'Wire', 'MTR', 2, 10, 20, 'D-1', 'CC01',
    ]));
    expect(statements[2].values).toEqual(expect.arrayContaining([
      'line-2', '2', 'Panel', 'General', 'NOS', 3, 4, 12,
    ]));
    expect(statements[3].values).toEqual(expect.arrayContaining([
      'line-3', '3', 'Line Item', 'General', 'NOS', 1, 100, 100,
    ]));
  });

  it('uses a draft status and generated title/date when optional PR fields are missing', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce(validRevision({ boq: {
      id: 'boq-1', projectId: 'project-1', costCentreId: null, title: '', boqCode: 'BOQ-000001',
    }, costCentreId: 'cc-1' }));
    await expect(POST(request({ boqId: 'unused-fallback', boqRevisionId: 'revision-1', costCentreId: 'cc-1' }))).resolves.toMatchObject({
      ok: true, data: { status: 'PR_DRAFT', totalValue: 32, message: expect.stringContaining('created with 2 items') },
    });
    expect(writeBatch).toHaveBeenCalledTimes(1);
    expect(writeBatch.mock.calls[0][0][0].values).toEqual(expect.arrayContaining([
      'BOQ-000001 - Procurement Package', 'PR_DRAFT',
    ]));
  });

  it('returns safe validation errors and logs detailed persistence failures', async () => {
    const malformed = { json: jest.fn().mockRejectedValue(new Error('invalid body')) } as unknown as NextRequest;
    await expect(POST(malformed)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
    const generic = { json: jest.fn().mockRejectedValue({}) } as unknown as NextRequest;
    await expect(POST(generic)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
    writeBatch.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(POST(request({ boqRevisionId: 'revision-1', costCentreId: 'cc-1' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToCreateProcurementRequestFromBoq, status: 500,
    });
    expect(structuredLog).toHaveBeenCalledWith('error', 'purchase_request.creation_failed', expect.objectContaining({
      operation: 'create_from_boq', route: '/api/boq/create-pr', tenantId: 'tenant-1', userId: 'buyer-1',
      boqRevisionId: 'revision-1', durationMs: expect.any(Number), error: expect.any(Error),
    }), 'application');
  });

  it('rejects project mismatches and unsafe atomic batch sizes before writing', async () => {
    await expect(POST(request({ boqRevisionId: 'revision-1', projectId: 'other-project', costCentreId: 'cc-1' })))
      .resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqCreatePrRoute.projectMustMatchTheProjectLinkedToThisBOQ, status: 400 });
    expect(writeBatch).not.toHaveBeenCalled();

    db.boqRevision.findFirst.mockResolvedValueOnce(validRevision({
      lines: Array.from({ length: 497 }, (_, index) => ({
        id: `line-${index}`, lineNumber: String(index + 1), quantity: 1, aiUnitCost: 1, aiTotalCost: 1,
      })),
    }));
    await expect(POST(request({ boqRevisionId: 'revision-1', costCentreId: 'cc-1' })))
      .resolves.toMatchObject({ ok: false, status: 400, error: expect.stringContaining('200') });
    expect(writeBatch).not.toHaveBeenCalled();
  });

  it('rejects oversized selected-line input before loading revision details', async () => {
    const selectedLineIds = Array.from({ length: MAX_PR_BATCH_LINES + 1 }, (_, index) => `line-${index}`);

    await expect(POST(request({ boqRevisionId: 'revision-1', costCentreId: 'cc-1', selectedLineIds })))
      .resolves.toMatchObject({ ok: false, status: 400, error: expect.stringContaining('200') });

    expect(db.boqRevision.findFirst).not.toHaveBeenCalled();
    expect(writeBatch).not.toHaveBeenCalled();
  });

  it('uses D1-safe line reads when the selected IDs exceed the per-query filter ceiling', async () => {
    const selectedLineIds = Array.from({ length: MAX_D1_QUERY_FILTER_VALUES + 1 }, (_, index) => `line-${index}`);
    const selectedLines = selectedLineIds.map((id, index) => ({
      id, lineNumber: String(index + 1).padStart(3, '0'), quantity: 1,
      aiUnitCost: 1, aiTotalCost: 1, originalDescription: 'Selected line',
    }));
    readSelectedLines.mockResolvedValueOnce(selectedLines);

    await expect(POST(request({ boqRevisionId: 'revision-1', costCentreId: 'cc-1', selectedLineIds })))
      .resolves.toMatchObject({ ok: true, status: 201, data: { totalLines: selectedLineIds.length } });

    expect(readSelectedLines).toHaveBeenCalledWith('tenant-1', 'revision-1', selectedLineIds);
    expect(db.boqRevision.findFirst.mock.calls[0][0].include.lines).toBeUndefined();
  });

  it('returns conflict when a concurrent PR creation wins the active revision guard', async () => {
    writeBatch.mockResolvedValueOnce([{ results: [] }]);
    db.procurementRequest.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ prNumber: 'PR-2026-000010' });
    await expect(POST(request({ boqRevisionId: 'revision-1', costCentreId: 'cc-1' }))).resolves.toEqual({
      ok: false,
      error: interpolateUiString(UI_STRINGS.appApiBoqCreatePrRoute.anActiveProcurementRequestPrNumberAlreadyExistsForThisBOQRevisionDuplicatePRCreationIsPrevented, {
        prNumber: 'PR-2026-000010',
      }),
      status: 409,
    });
  });
});
