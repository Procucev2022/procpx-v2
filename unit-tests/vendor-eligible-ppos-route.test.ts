import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/procurement/vendors/[id]/eligible-ppos/route';
import { prisma } from '../src/lib/prisma';
import { isApiContext, requireAuth } from '../src/lib/api-utils';
import { getUserProjectAccessFilter } from '../src/lib/project-auth';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { UI_STRINGS } from '@/lib/ui-strings.constants';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    vendor: { findFirst: jest.fn() },
    ppo: { findMany: jest.fn(), count: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  getListPageWindow: jest.fn((params: URLSearchParams) => {
    const page = Math.max(1, Number(params.get('page')) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.get('pageSize')) || 50));
    return { page, pageSize, skip: (page - 1) * pageSize };
  }),
}));
jest.mock('../src/lib/project-auth', () => ({ getUserProjectAccessFilter: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn().mockResolvedValue(undefined) }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const projectAccessFilter = getUserProjectAccessFilter as jest.Mock;
const writeLog = writeStructuredLog as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1', role: 'PROJECT_APPROVER' };
const params = (id = 'vendor-1') => ({ params: Promise.resolve({ id }) });
const request = (query = '') => new NextRequest(`http://localhost/api/procurement/vendors/vendor-1/eligible-ppos${query}`);
const ppoRow = (id: string) => ({ id, ppoNumber: `PPO-${id}`, title: `Order ${id}`, totalValue: 1000, status: 'COMPLETED' });

describe('eligible vendor PPOs API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.vendor.findFirst.mockResolvedValue({ id: 'vendor-1' });
    db.ppo.findMany.mockResolvedValue([]);
    db.ppo.count.mockResolvedValue(0);
    projectAccessFilter.mockResolvedValue({ OR: [{ projectOwner: 'user-1' }] });
    writeLog.mockResolvedValue(undefined);
  });

  it('requires a valid context and a visible vendor', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(request(), params())).resolves.toBe(denied);

    db.vendor.findFirst.mockResolvedValueOnce(null);
    await expect(GET(request(), params())).resolves.toEqual({
      ok: false,
      error: UI_STRINGS.common.vendorNotFoundOrAccessDenied2,
      status: 404,
    });
    expect(db.ppo.findMany).not.toHaveBeenCalled();
  });

  it('returns a stable bounded page scoped to tenant, vendor, and authorized projects', async () => {
    db.ppo.findMany.mockResolvedValue([ppoRow('1'), ppoRow('2'), ppoRow('3'), ppoRow('4')]);
    db.ppo.count.mockResolvedValue(8);

    await expect(GET(request('?page=2&pageSize=3'), params())).resolves.toMatchObject({
      ok: true,
      data: {
        eligiblePpos: [ppoRow('1'), ppoRow('2'), ppoRow('3')],
        pagination: { page: 2, pageSize: 3, total: 8, hasMore: true },
      },
    });

    const where = expect.objectContaining({
      tenantId: 'tenant-1',
      vendorId: 'vendor-1',
      status: { notIn: ['DRAFT', 'CANCELLED'] },
      project: { is: { OR: [{ projectOwner: 'user-1' }] } },
      OR: [
        { vendorRating: { is: null } },
        { vendorRating: { is: { status: { notIn: ['APPROVED', 'SUBMITTED'] } } } },
      ],
    });
    expect(db.ppo.findMany).toHaveBeenCalledWith({
      where,
      skip: 3,
      take: 4,
      select: { id: true, ppoNumber: true, title: true, totalValue: true, status: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(db.ppo.count).toHaveBeenCalledWith({ where });
    expect(projectAccessFilter).toHaveBeenCalledWith('user-1', 'PROJECT_APPROVER', 'tenant-1');
  });

  it('does not expose rating candidates to procurement users', async () => {
    auth.mockResolvedValueOnce({ ...context, role: 'PROCUREMENT_USER' });
    await expect(GET(request(), params())).resolves.toMatchObject({
      ok: true,
      data: { eligiblePpos: [], pagination: { total: 0, hasMore: false } },
    });
    expect(projectAccessFilter).not.toHaveBeenCalled();
    expect(db.ppo.findMany).not.toHaveBeenCalled();
  });

  it('logs query failures and returns a stable generic error', async () => {
    db.ppo.count.mockRejectedValueOnce(new Error('query details'));
    await expect(GET(request(), params())).resolves.toEqual({
      ok: false,
      error: UI_STRINGS.common.userMessages.failedToFetchEligiblePpos,
      status: 500,
    });
    expect(writeLog).toHaveBeenCalledWith('error', 'vendor.eligible_ppos_read_failed', expect.objectContaining({
      operation: 'list_eligible_ppos',
      tenantId: 'tenant-1',
      vendorId: 'vendor-1',
      error: { name: 'Error', message: 'query details' },
    }));
  });
});
