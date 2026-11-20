import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { isApiContext, requireAuth } from '../src/lib/api-utils';
import { GET as listBusinesses } from '../src/app/api/admin/businesses/route';
import { loadBusinessDirectory } from '../src/lib/business-directory';
import {
  businessNameKey,
  canChooseAnyBusiness,
  findBusinessByName,
  normalizeCompanyName,
  toBusinessSlug,
} from '../src/lib/business-name';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { BUSINESS_SUMMARY_SELECT } from '@/lib/business-directory.constants';

jest.mock('../src/lib/prisma', () => ({ prisma: { tenant: { findMany: jest.fn() } } }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));

const tenantDb = prisma.tenant as unknown as { findMany: jest.Mock };
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const logger = writeStructuredLog as jest.Mock;
const RETAIL = { id: 'tenant-1', name: 'Procucev Retail Demo' };
const HOSPITALITY = { id: 'tenant-2', name: 'Procucev Hospitality Demo' };
const request = () => new NextRequest('http://localhost/api/admin/businesses');

describe('business name helpers', () => {
  it('normalizes company names and comparison keys', () => {
    expect(normalizeCompanyName('  Acme   Interiors \n')).toBe('Acme Interiors');
    expect(normalizeCompanyName(42)).toBe('');
    expect(normalizeCompanyName(undefined)).toBe('');
    expect(businessNameKey('  ACME  Interiors ')).toBe('acme interiors');
  });

  it('builds unique URL-safe slugs and falls back for symbol-only names', () => {
    expect(toBusinessSlug('Acme & Sons (India) Pvt. Ltd.', 'AB12-cd34-ef56')).toBe('acme-sons-india-pvt-ltd-ab12cd34');
    expect(toBusinessSlug('!!!', 'f00d')).toBe('business-f00d');
    const long = toBusinessSlug(`${'a'.repeat(59)} b`, 'id');
    expect(long).toBe(`${'a'.repeat(59)}-id`);
  });

  it('only lets a Super Admin choose any business', () => {
    expect(canChooseAnyBusiness('SUPER_ADMIN')).toBe(true);
    expect(canChooseAnyBusiness('CLIENT_ADMIN')).toBe(false);
  });

  it('finds a business by its normalized name and ignores blank names', () => {
    expect(findBusinessByName([RETAIL, HOSPITALITY], ' procucev  hospitality DEMO ')).toEqual(HOSPITALITY);
    expect(findBusinessByName([RETAIL], 'Unknown')).toBeNull();
    expect(findBusinessByName([RETAIL], '   ')).toBeNull();
  });
});

describe('business directory', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns every business to a Super Admin', async () => {
    tenantDb.findMany.mockResolvedValue([HOSPITALITY, RETAIL]);
    await expect(loadBusinessDirectory({ tenantId: 'tenant-1', role: 'SUPER_ADMIN' })).resolves.toEqual({
      canChooseBusiness: true, currentBusiness: RETAIL, businesses: [HOSPITALITY, RETAIL],
    });
    expect(tenantDb.findMany).toHaveBeenCalledWith({
      where: {}, select: BUSINESS_SUMMARY_SELECT, orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  });

  it('returns only the own business to other administrators', async () => {
    tenantDb.findMany.mockResolvedValue([RETAIL]);
    await expect(loadBusinessDirectory({ tenantId: 'tenant-1', role: 'CLIENT_ADMIN' })).resolves.toEqual({
      canChooseBusiness: false, currentBusiness: RETAIL, businesses: [RETAIL],
    });
    expect(tenantDb.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'tenant-1' } }));

    tenantDb.findMany.mockResolvedValue([]);
    await expect(loadBusinessDirectory({ tenantId: 'missing', role: 'CLIENT_ADMIN' })).resolves.toEqual(
      expect.objectContaining({ currentBusiness: null, businesses: [] }),
    );
  });
});

describe('GET /api/admin/businesses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isContext.mockReturnValue(true);
    auth.mockResolvedValue({ tenantId: 'tenant-1', userId: 'admin-1', role: 'CLIENT_ADMIN' });
  });

  it('requires the user-create permission', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(listBusinesses(request())).resolves.toBe(denied);
    expect(auth).toHaveBeenCalledWith('USER_CREATE');
  });

  it('returns the caller\'s business directory', async () => {
    tenantDb.findMany.mockResolvedValue([RETAIL]);
    await expect(listBusinesses(request())).resolves.toEqual({
      ok: true, status: 200, data: { canChooseBusiness: false, currentBusiness: RETAIL, businesses: [RETAIL] },
    });
  });

  it('logs sanitized failures', async () => {
    tenantDb.findMany.mockRejectedValueOnce(new Error('D1 down'));
    await expect(listBusinesses(request())).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiAdminBusinessesRoute.failedToFetchBusinesses, status: 500,
    });
    expect(logger).toHaveBeenCalledWith('error', 'admin.business_directory_read_failed', expect.objectContaining({
      tenantId: 'tenant-1', error: { name: 'Error', message: 'D1 down' },
    }));

    tenantDb.findMany.mockRejectedValueOnce('opaque');
    await listBusinesses(request());
    expect(logger).toHaveBeenLastCalledWith('error', 'admin.business_directory_read_failed', expect.objectContaining({ error: { type: 'string' } }));
  });
});
