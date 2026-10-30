import { NextRequest } from 'next/server';
import { GET, PATCH } from '../src/app/api/boq/[revisionId]/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    boqRevision: { findFirst: jest.fn() },
    boq: { findFirst: jest.fn(), update: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1' };
const params = (revisionId = 'revision-1') => ({ params: Promise.resolve({ revisionId }) });
const getRequest = () => new NextRequest('http://localhost/api/boq/revision-1');
const patchRequest = (body: unknown) => new NextRequest('http://localhost/api/boq/revision-1', {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('BOQ revision detail API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
  });

  it('authenticates GET and PATCH requests before accessing tenant data', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(getRequest(), params())).resolves.toBe(denied);
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(PATCH(patchRequest({}), params())).resolves.toBe(denied);
    expect(db.boqRevision.findFirst).not.toHaveBeenCalled();
    expect(db.boq.findFirst).not.toHaveBeenCalled();
  });

  it('loads a revision directly and formats line costs from saved details or computed estimates', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce({
      id: 'revision-1', qualityScore: 0,
      boq: { id: 'boq-1', boqCode: 'BOQ-1', project: { id: 'project-1' }, costCentre: { id: 'cc-1' } },
      lines: [
        { id: 'line-1', aiReason: JSON.stringify({ costBreakdown: { labor: 2 } }), aiUnitCost: null, aiTotalCost: 25 },
        { id: 'line-2', aiReason: '{bad json', aiUnitCost: 12, aiTotalCost: 48, quantity: 4, category: { name: 'Electrical' }, originalDescription: 'Cable' },
        { id: 'line-3', aiReason: null, aiUnitCost: 0, aiTotalCost: null },
      ],
    });
    const result = await GET(getRequest(), params());
    expect(result).toMatchObject({ ok: true, data: {
      boq: { estimatedValue: 73 }, totalLines: 3, qualityScore: 0,
      lines: [
        { id: 'line-1', costBreakdown: { labor: 2 } },
        { id: 'line-2', costBreakdown: expect.any(Object) },
        { id: 'line-3', costBreakdown: null },
      ],
    } });
    expect(db.boq.findFirst).not.toHaveBeenCalled();
  });

  it('falls back to BOQ ID lookup, selects the latest revision, and uses the default quality score', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    db.boq.findFirst.mockResolvedValueOnce({
      id: 'boq-2', boqCode: 'BOQ-2', revisions: [
        { id: 'revision-latest', qualityScore: null, lines: [{ id: 'line-1', aiTotalCost: 10, aiUnitCost: null }] },
      ],
    });
    await expect(GET(getRequest(), params('boq-2'))).resolves.toMatchObject({
      ok: true, data: { boq: { estimatedValue: 10 }, revision: { id: 'revision-latest' }, totalLines: 1, qualityScore: 100 },
    });
    expect(db.boq.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'boq-2', tenantId: 'tenant-1' } }));
  });

  it('returns an empty BOQ payload when the BOQ has no revisions and a 404 when neither identifier exists', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    db.boq.findFirst.mockResolvedValueOnce({ id: 'boq-empty', revisions: [] });
    await expect(GET(getRequest(), params('boq-empty'))).resolves.toMatchObject({
      ok: true, data: { boq: { estimatedValue: 0 }, revision: null, lines: [], totalLines: 0, qualityScore: 100 },
    });
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    db.boq.findFirst.mockResolvedValueOnce(null);
    await expect(GET(getRequest(), params('missing'))).resolves.toEqual({ ok: false, error: 'BOQ or Revision not found.', status: 404 });
  });

  it('updates a BOQ directly with trimmed, nullable, array, and validated field values', async () => {
    db.boq.findFirst.mockResolvedValueOnce({ id: 'boq-1' });
    db.boq.update.mockResolvedValueOnce({ id: 'boq-1', title: 'New title' });
    await expect(PATCH(patchRequest({
      title: ' Title ', description: '   ', status: 'DRAFT', purpose: 'PR', category: ['Civil', 'MEP'], costCentreId: '',
    }), params('boq-1'))).resolves.toMatchObject({ ok: true, data: { success: true, boq: { title: 'New title' } } });
    expect(db.boq.update).toHaveBeenCalledWith({ where: { id: 'boq-1' }, data: {
      title: 'Title', description: null, status: 'DRAFT', purpose: 'PR', category: 'Civil, MEP', costCentreId: null,
    } });
    expect(db.boqRevision.findFirst).not.toHaveBeenCalled();
  });

  it('resolves a revision to its BOQ and omits absent or unsupported patch fields', async () => {
    db.boq.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'boq-via-revision' });
    db.boqRevision.findFirst.mockResolvedValueOnce({ id: 'revision-1', boqId: 'boq-via-revision' });
    db.boq.update.mockResolvedValueOnce({ id: 'boq-via-revision' });
    await expect(PATCH(patchRequest({ description: ' note ', purpose: 'INVALID', category: 'Electrical' }), params())).resolves.toMatchObject({ ok: true });
    expect(db.boq.update).toHaveBeenCalledWith({ where: { id: 'boq-via-revision' }, data: { description: 'note', category: 'Electrical' } });
  });

  it('returns BOQ-not-found and reports both specific and generic patch failures', async () => {
    db.boq.findFirst.mockResolvedValueOnce(null);
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    await expect(PATCH(patchRequest({}), params())).resolves.toEqual({ ok: false, error: 'BOQ not found', status: 404 });

    db.boq.findFirst.mockResolvedValueOnce({ id: 'boq-1' });
    db.boq.update.mockRejectedValueOnce(new Error('write failed'));
    await expect(PATCH(patchRequest({ title: 'Changed' }), params())).resolves.toEqual({ ok: false, error: 'write failed', status: 500 });

    const badJson = { json: jest.fn().mockRejectedValue({}) } as unknown as NextRequest;
    await expect(PATCH(badJson, params())).resolves.toEqual({ ok: false, error: 'Failed to update BOQ', status: 500 });
  });
});
