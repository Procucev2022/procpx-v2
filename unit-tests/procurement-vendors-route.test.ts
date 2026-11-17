import { NextRequest } from 'next/server';
import { GET, POST } from '../src/app/api/procurement/vendors/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { runAuditedD1UpdateAtomically } from '../src/lib/audited-update';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { VENDOR_NORMALIZED_NAME_EXISTS_SQL } from '../src/lib/d1-batch.constants';

const mockWriteStructuredLog = jest.fn();
const mockWriteD1BatchAtomically = jest.fn();

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    vendor: {
      findMany: jest.fn(), count: jest.fn(), groupBy: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), create: jest.fn(),
    },
    ppoVendorRating: { groupBy: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  getListPageWindow: (params: URLSearchParams) => {
    const rawPage = Number.parseInt(params.get('page') || '', 10);
    const rawPageSize = Number.parseInt(params.get('pageSize') || '', 10);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.min(rawPage, 1_000_000) : 1;
    const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.min(rawPageSize, 100) : 50;
    return { page, pageSize, skip: (page - 1) * pageSize };
  },
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));
jest.mock('../src/lib/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('../src/lib/audited-update', () => ({ runAuditedD1UpdateAtomically: jest.fn() }));
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: (...args: unknown[]) => mockWriteD1BatchAtomically(...args) }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: (...args: unknown[]) => mockWriteStructuredLog(...args) }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
const auditedUpdate = runAuditedD1UpdateAtomically as jest.Mock;
const atomicBatch = mockWriteD1BatchAtomically;
const structuredLog = mockWriteStructuredLog;
const context = { tenantId: 'tenant-1', userId: 'user-1', role: 'ADMIN' };
const getRequest = (query = '') => new NextRequest(`http://localhost/api/procurement/vendors${query}`);
const postRequest = (body: unknown) => new NextRequest('http://localhost/api/procurement/vendors', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const validVendor = {
  name: 'Acme Systems', contactPerson: 'Alex Buyer', email: 'alex@example.test',
  category: 'Electrical', operatingLocation: 'Pune, Maharashtra',
};
const existingVendor = {
  id: 'vendor-1', name: 'Old Name', code: 'VND-0001', vendorType: 'CLIENT_VENDOR', contactPerson: 'Old Contact',
  email: 'old@example.test', phone: '9999999999', categories: 'Old Category', operatingLocation: 'Old Location',
  city: 'Old City', state: 'Old State', country: 'US', legalStructure: 'LLC', gstin: 'OLDGST', pan: 'OLDPAN',
  website: 'https://old.test', address: 'Old address', experienceYears: 8, turnoverCrores: 4,
  capabilities: 'old-capabilities', serviceCoverage: 'old-coverage', clientReferences: 'old-references', certifications: ['ISO'],
};

describe('procurement vendor directory API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.vendor.findMany.mockReset().mockResolvedValue([]);
    db.vendor.count.mockReset().mockResolvedValue(0);
    db.vendor.groupBy.mockReset().mockResolvedValue([]);
    db.ppoVendorRating.groupBy.mockReset().mockResolvedValue([]);
    db.vendor.findFirst.mockReset().mockResolvedValue(null);
    db.vendor.findUnique.mockReset().mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id, code: 'VND-0001', name: 'Acme Systems', vendorType: 'CLIENT_VENDOR', onboardingStatus: 'ONBOARDED',
    }));
    db.vendor.update.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'vendor-1', code: 'VND-0001', ...data }));
    db.vendor.create.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'vendor-new', ...data }));
    audit.mockReset().mockResolvedValue(undefined);
    auditedUpdate.mockReset().mockImplementation(async ({ id, data }: { id: string; data: Record<string, unknown> }) => ({
      ...existingVendor, ...data, id,
    }));
    atomicBatch.mockReset().mockImplementation(async (statements: Array<{ values: unknown[] }>) => [
      { success: true, meta: { changes: 1 }, results: [{ id: statements[0].values[1], code: 'VND-0001', name: 'Acme Systems' }] },
      { success: true, meta: { changes: 1 } },
    ]);
    structuredLog.mockReset().mockResolvedValue(undefined);
  });

  it('filters directory records, parses category formats, summarizes approved ratings, and aggregates tabs', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(getRequest())).resolves.toBe(denied);

    db.vendor.findMany.mockResolvedValueOnce([
      { id: 'array', categories: ['A', 'B'] },
      { id: 'json', categories: '["C","D"]' },
      { id: 'scalar-json', categories: '"Electrical"' },
      { id: 'csv', categories: 'Power, , Water ' },
      { id: 'empty', categories: '  ' },
    ]);
    db.vendor.count.mockResolvedValueOnce(5);
    db.vendor.groupBy.mockResolvedValueOnce([
      { vendorType: 'CLIENT_VENDOR', qualificationStatus: 'QUALIFIED', _count: { _all: 1 } },
      { vendorType: 'PROCUCEV_VENDOR', qualificationStatus: 'PENDING_REVIEW', _count: { _all: 1 } },
      { vendorType: 'CLIENT_VENDOR', qualificationStatus: 'EVALUATION_IN_PROGRESS', _count: { _all: 1 } },
      { vendorType: 'CLIENT_VENDOR', qualificationStatus: 'NOT_EVALUATED', _count: { _all: 2 } },
    ]);
    db.ppoVendorRating.groupBy.mockResolvedValueOnce([
      { vendorId: 'array', _count: { _all: 2 }, _avg: { overallScore: 3.5 } },
      { vendorId: 'json', _count: { _all: 1 }, _avg: { overallScore: 5 } },
    ]);
    const result = await GET(getRequest('?vendorType=CLIENT_VENDOR&qualificationStatus=QUALIFIED&onboardingStatus=ONBOARDED&category=Electrical&region=West&status=ACTIVE&search=%20cable%20'));
    expect(result).toMatchObject({ ok: true, data: {
      total: 5,
      vendors: [
        { id: 'array', categories: ['A', 'B'], rawCategories: ['A', 'B'], ppoRatingsCount: 2, averagePpoRating: 3.5 },
        { id: 'json', categories: ['C', 'D'], ppoRatingsCount: 1, averagePpoRating: 5 },
        { id: 'scalar-json', categories: ['"Electrical"'], averagePpoRating: null },
        { id: 'csv', categories: ['Power', 'Water'], ppoRatingsCount: 0, averagePpoRating: null },
        { id: 'empty', categories: [], averagePpoRating: null },
      ],
      counts: { total: 5, clientVendorsCount: 4, procucevVendorsCount: 1, qualifiedCount: 1, pendingReviewCount: 2, notEvaluatedCount: 2 },
      pagination: { page: 1, pageSize: 50, hasMore: false },
    } });
    expect(db.vendor.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: {
        vendorType: 'CLIENT_VENDOR', tenantId: 'tenant-1', qualificationStatus: UI_STRINGS.common.qUALIFIED,
        onboardingStatus: 'ONBOARDED', categories: { contains: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical }, status: UI_STRINGS.common.aCTIVE,
        AND: [
          { OR: [
            { operatingLocation: { contains: 'West' } }, { city: { contains: 'West' } }, { state: { contains: 'West' } },
          ] },
          { OR: [
            { name: { contains: 'cable' } }, { code: { contains: 'cable' } }, { categories: { contains: 'cable' } },
            { city: { contains: 'cable' } }, { contactPerson: { contains: 'cable' } }, { gstin: { contains: 'cable' } },
            { operatingLocation: { contains: 'cable' } },
          ] },
        ],
      },
      skip: 0,
      take: 51,
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }, { id: 'desc' }],
    }));
    expect(db.vendor.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ vendorType: 'CLIENT_VENDOR', tenantId: 'tenant-1' }),
    }));
    expect(db.vendor.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: [{ tenantId: 'tenant-1' }, { vendorType: 'PROCUCEV_VENDOR' }] },
    }));
    expect(db.ppoVendorRating.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ['vendorId'],
      where: { tenantId: 'tenant-1', status: 'APPROVED', vendorId: { in: ['array', 'json', 'scalar-json', 'csv', 'empty'] } },
    }));
  });

  it('ignores ALL and blank filters while preserving shared-network tenant visibility', async () => {
    db.vendor.findMany.mockResolvedValueOnce([{ id: 'one', categories: 'Metal, Services' }]);
    db.vendor.count.mockResolvedValueOnce(1);
    await expect(GET(getRequest('?vendorType=ALL&qualificationStatus=ALL&onboardingStatus=ALL&category=ALL&region=ALL&status=ALL&search=%20%20')))
      .resolves.toMatchObject({ ok: true, data: { vendors: [{ categories: ['Metal', 'Services'], ppoRatingsCount: 0, averagePpoRating: null }], total: 1, counts: { total: 0 } } });
    expect(db.vendor.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: {
      OR: [{ tenantId: 'tenant-1' }, { vendorType: 'PROCUCEV_VENDOR' }],
    } }));
    expect(db.ppoVendorRating.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', status: 'APPROVED', vendorId: { in: ['one'] } },
    }));
  });

  it('returns a safe GET failure while logging sanitized database details', async () => {
    db.vendor.findMany.mockRejectedValueOnce(new Error('directory unavailable'));
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: 'Failed to fetch vendors', status: 500 });
    expect(structuredLog).toHaveBeenCalledWith('error', 'vendor.directory_read_failed', expect.objectContaining({
      operation: 'list_vendors', route: '/api/procurement/vendors', tenantId: 'tenant-1', userId: 'user-1', page: 1, pageSize: 50,
      error: { name: 'Error', message: 'directory unavailable' },
    }));
    db.vendor.findMany.mockRejectedValueOnce({});
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: 'Failed to fetch vendors', status: 500 });
    expect(structuredLog).toHaveBeenLastCalledWith('error', 'vendor.directory_read_failed', expect.objectContaining({ error: { type: 'object' } }));
  });

  it('bounds vendor pages and caps long search terms', async () => {
    db.vendor.findMany.mockResolvedValueOnce([]);
    db.vendor.count.mockResolvedValueOnce(0);
    const longSearch = 'x'.repeat(300);
    await GET(getRequest(`?page=2&pageSize=500&search=${longSearch}`));
    expect(db.vendor.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 100, take: 101 }));
    expect(db.vendor.findMany.mock.calls[0][0].where.AND[0].OR[0].name.contains).toHaveLength(200);
    expect(structuredLog).not.toHaveBeenCalled();
  });

  it('chunks approved rating aggregates for a full 100-vendor directory page', async () => {
    db.vendor.findMany.mockResolvedValueOnce(Array.from({ length: 100 }, (_, index) => ({
      id: `vendor-${index + 1}`, categories: 'Electrical',
    })));
    db.vendor.count.mockResolvedValueOnce(100);

    await GET(getRequest('?pageSize=100'));

    expect(db.ppoVendorRating.groupBy).toHaveBeenCalledTimes(2);
    expect(db.ppoVendorRating.groupBy.mock.calls.map(([query]) => query.where.vendorId.in.length)).toEqual([90, 10]);
  });

  it('requires valid onboarding identity and contact fields', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(postRequest(validVendor))).resolves.toBe(denied);

    const invalidCases: Array<[Record<string, unknown>, string]> = [
      [{ name: '  ' }, 'Vendor Legal / Business Name is required.'],
      [{ vendorType: 'UNKNOWN' }, 'Vendor Type must be either Client Vendor or Procucev Vendor.'],
      [{ contactPerson: ' ' }, 'Primary Contact Name is required.'],
      [{ email: '', phone: '' }, 'Primary Mobile Number or Email is required.'],
      [{ category: ' ' }, 'Primary Product / Service Category is required.'],
      [{ operatingLocation: '', city: '' }, 'Operating Location is required.'],
    ];
    for (const [overrides, error] of invalidCases) {
      await expect(POST(postRequest({ ...validVendor, ...overrides }))).resolves.toEqual({ ok: false, error, status: 400 });
    }
    expect(db.vendor.create).not.toHaveBeenCalled();
  });

  it('updates an existing vendor, normalizes supplied values, and preserves omitted fields', async () => {
    db.vendor.findFirst.mockResolvedValueOnce(existingVendor);
    const result = await POST(postRequest({
      ...validVendor,
      id: 'vendor-1', name: '  New Name ', vendorType: 'PROCUCEV_VENDOR', contactPerson: ' Pat ', email: ' pat@example.test ',
      phone: '', category: ' New Category ', operatingLocation: '', city: 'New City', state: '', country: '', legalStructure: '',
      gstin: '', pan: '', website: '', address: '', experienceYears: '0', turnoverCrores: '',
      capabilities: ['design', 'install'], serviceCoverage: '  Remote  ', clientReferences: [{ customer: 'One' }],
      certifications: null,
    }));
    expect(result).toMatchObject({ ok: true, status: 200, data: { message: 'Vendor VND-0001 onboarding updated successfully.' } });
    expect(auditedUpdate).toHaveBeenCalledWith(expect.objectContaining({
      table: 'vendor', id: 'vendor-1', tenantId: 'tenant-1', route: '/api/procurement/vendors',
      data: {
      name: 'New Name', vendorType: 'PROCUCEV_VENDOR', contactPerson: 'Pat', email: 'pat@example.test', phone: null,
      categories: 'New Category', operatingLocation: 'Old Location', city: 'New City', state: null, country: 'US',
      legalStructure: 'LLC', gstin: null, pan: null, website: null, address: null, experienceYears: 0,
      turnoverCrores: null, capabilities: '["design","install"]', serviceCoverage: '  Remote  ',
      clientReferences: '[{"customer":"One"}]', certifications: null, onboardingStatus: 'PROFILE_INCOMPLETE',
      },
      audit: expect.objectContaining({ action: 'VENDOR_UPDATED', entityId: 'vendor-1' }),
    }));
    expect(audit).not.toHaveBeenCalled();
  });

  it('updates a partial vendor profile as onboarded and uses provided city/location values', async () => {
    db.vendor.findFirst.mockResolvedValueOnce({ ...existingVendor, country: null });
    await POST(postRequest({
      id: 'vendor-1', name: 'Changed', vendorType: 'CLIENT_VENDOR', contactPerson: 'New Contact', phone: ' 123 ',
      category: 'Safety', city: '  Surat ', gstin: ' gst-1 ', legalStructure: ' Private Ltd ', country: '',
    }));
    expect(auditedUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
      name: 'Changed', phone: '123', email: 'old@example.test', city: 'Surat', operatingLocation: 'Old Location',
      country: UI_STRINGS.common.india, legalStructure: ' Private Ltd ', gstin: 'GST-1', onboardingStatus: 'ONBOARDED',
      }),
    }));
  });

  it('normalizes full updates while retaining omitted values and serializing string or object fields', async () => {
    db.vendor.findFirst.mockResolvedValueOnce(existingVendor);
    await POST(postRequest({
      id: 'vendor-1', name: 'Updated', contactPerson: 'Contact', email: 'update@example.test', category: 'Fire Safety',
      operatingLocation: '  New Site, West  ', city: '', state: ' TX ', country: 'Canada', legalStructure: ' Inc ',
      gstin: ' gst-2 ', pan: ' pan-2 ', website: ' https://new.test ', address: ' New Office ',
      experienceYears: '', turnoverCrores: '', capabilities: 'legacy text', serviceCoverage: { zones: ['west'] },
      clientReferences: 'Reference text', certifications: [],
    }));
    expect(auditedUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
      table: 'vendor', id: 'vendor-1', tenantId: 'tenant-1', route: '/api/procurement/vendors',
      data: expect.objectContaining({
      operatingLocation: 'New Site, West', city: 'New Site', phone: '9999999999', state: 'TX', country: 'Canada',
      legalStructure: ' Inc ', gstin: 'GST-2', pan: 'PAN-2', website: 'https://new.test', address: 'New Office',
      experienceYears: null, turnoverCrores: null, capabilities: 'legacy text',
      serviceCoverage: '{"zones":["west"]}', clientReferences: 'Reference text', certifications: [],
      }),
      audit: expect.objectContaining({ action: 'VENDOR_UPDATED', entityId: 'vendor-1' }),
    }));
  });

  it('returns a conflict when onboarding updates collide on the normalized tenant vendor name', async () => {
    db.vendor.findFirst.mockResolvedValueOnce(existingVendor);
    auditedUpdate.mockRejectedValueOnce(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));

    await expect(POST(postRequest({ ...validVendor, id: 'vendor-1', name: 'Duplicate Supplier' }))).resolves.toEqual({
      ok: false,
      error: UI_STRINGS.appApiProcurementVendorsRoute.vendorNameAlreadyExistsForThisTenant,
      status: 409,
    });
    expect(structuredLog).toHaveBeenCalledWith('warn', 'vendor.duplicate_name_conflict', expect.objectContaining({
      operation: 'create_or_update_vendor', vendorId: 'vendor-1', tenantId: 'tenant-1',
    }));
  });

  it('creates vendor and audit together with a D1 allocated code and serialized structured capabilities', async () => {
    atomicBatch.mockImplementationOnce(async (statements: Array<{ values: unknown[] }>) => [
      { success: true, meta: { changes: 1 }, results: [{ id: statements[0].values[1], code: 'VND-0015', name: 'FineBuild' }] },
      { success: true, meta: { changes: 1 } },
    ]);
    db.vendor.findUnique.mockImplementationOnce(async ({ where }: { where: { id: string } }) => ({
      id: where.id, code: 'VND-0015', name: 'FineBuild', vendorType: 'PROCUCEV_VENDOR', onboardingStatus: 'ONBOARDED',
    }));
    const result = await POST(postRequest({
      ...validVendor, name: '  FineBuild ', vendorType: 'PROCUCEV_VENDOR', contactPerson: '  Sam ', email: '', phone: ' 555 ',
      operatingLocation: '', city: ' Mumbai ', state: ' Maharashtra ', country: '', legalStructure: ' LLP ', gstin: ' abc123 ',
      pan: ' xyz ', website: ' https://vendor.test ', address: ' Office ', experienceYears: '5', turnoverCrores: '2.5',
      capabilities: ['civil', 'electrical'], serviceCoverage: { states: ['MH'] }, clientReferences: 'Legacy reference', certifications: ['ISO'],
    }));
    expect(result).toMatchObject({ ok: true, status: 201, data: { message: 'Vendor VND-0015 onboarded successfully.' } });
    const statements = atomicBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(statements).toHaveLength(3);
    expect(statements[2].sql).toBe(VENDOR_NORMALIZED_NAME_EXISTS_SQL);
    expect(statements[2].values).toEqual(['tenant-1', 'FineBuild']);
    expect(statements[0].sql).toContain("MAX(CAST(SUBSTR(\"code\", 5) AS INTEGER))");
    expect(statements[0].sql).toContain('RETURNING *');
    expect(statements[0].values).toEqual(expect.arrayContaining([
      'tenant-1', 'FineBuild', 'PROCUCEV_VENDOR', 'Sam', '555', 'Electrical', 'ABC123', 'XYZ', '["civil","electrical"]',
      '{"states":["MH"]}', 'Legacy reference', '["ISO"]',
    ]));
    expect(statements[1].sql).toContain("CASE WHEN changes() = 1 AND created.\"id\" IS NOT NULL THEN ? ELSE NULL END");
    expect(statements[1].values).toEqual(expect.arrayContaining(['tenant-1', 'user-1']));
    expect(db.vendor.findMany).not.toHaveBeenCalled();
    expect(db.vendor.create).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('returns a normalized-name conflict when vendor creation finds an existing tenant vendor', async () => {
    atomicBatch.mockResolvedValueOnce([
      { success: true, meta: { changes: 0 }, results: [] },
      { success: true, meta: { changes: 0 } },
      { success: true, meta: { changes: 0 }, results: [{ id: 'existing-vendor' }] },
    ]);

    await expect(POST(postRequest(validVendor))).resolves.toEqual({
      ok: false,
      error: UI_STRINGS.appApiProcurementVendorsRoute.vendorNameAlreadyExistsForThisTenant,
      status: 409,
    });
    expect(structuredLog).toHaveBeenCalledWith('warn', 'vendor.duplicate_name_conflict', expect.objectContaining({
      operation: 'create_vendor', duplicateVendorId: 'existing-vendor', tenantId: 'tenant-1',
    }));
    expect(db.vendor.findUnique).not.toHaveBeenCalled();
  });

  it('uses the committed insert result when the typed follow-up read fails', async () => {
    db.vendor.findUnique.mockRejectedValueOnce(new Error('read replica unavailable'));
    const result = await POST(postRequest(validVendor));
    expect(result).toMatchObject({
      ok: true,
      status: 201,
      data: { vendor: { id: expect.any(String), code: 'VND-0001', name: 'Acme Systems' } },
    });
    expect(structuredLog).toHaveBeenCalledWith('warn', 'vendor.created_read_fallback', expect.objectContaining({
      operation: 'read_created_vendor', route: '/api/procurement/vendors', vendorId: expect.any(String),
      error: { name: 'Error', message: 'read replica unavailable' },
    }));

    db.vendor.findUnique.mockRejectedValueOnce(new Error('read still unavailable'));
    structuredLog.mockRejectedValueOnce(new Error('log sink unavailable'));
    await expect(POST(postRequest({ ...validVendor, name: 'Second Vendor' }))).resolves.toMatchObject({
      ok: true, status: 201, data: { vendor: { code: 'VND-0001' } },
    });
  });

  it('fails closed when the D1 batch does not return both the vendor and its audit row', async () => {
    atomicBatch.mockResolvedValueOnce([
      { success: true, meta: { changes: 1 }, results: [{ id: 'missing-id', code: 'VND-0001' }] },
      { success: true, meta: { changes: 0 } },
    ]);
    await expect(POST(postRequest(validVendor))).resolves.toEqual({
      ok: false, error: 'Failed to onboard vendor', status: 500,
    });
    expect(db.vendor.findUnique).not.toHaveBeenCalled();
    expect(structuredLog).toHaveBeenCalledWith('error', 'vendor.onboarding_failed', expect.objectContaining({
      operation: 'create_or_update_vendor', vendorId: expect.any(String),
      error: { name: 'Error', message: UI_STRINGS.appApiProcurementVendorsRoute.vendorAndAuditWriteDidNotCommitAsExpected },
    }));
  });

  it('creates a draft with safe defaults and handles POST provider failures', async () => {
    db.vendor.findUnique.mockResolvedValueOnce({ id: 'vendor-new', code: 'VND-0001', name: 'Draft Vendor' });
    await POST(postRequest({
      name: 'Draft Vendor', contactPerson: 'Contact', phone: '1', category: 'Services', city: 'Delhi', isDraft: true,
    }));
    expect(atomicBatch).toHaveBeenCalledTimes(1);
    expect(atomicBatch.mock.calls[0][0][0].values).toEqual(expect.arrayContaining([
      'tenant-1', 'Draft Vendor', 'CLIENT_VENDOR', 'Contact', null, 'Services', 'Delhi,', 'DRAFT',
    ]));

    db.vendor.findUnique.mockResolvedValueOnce({ id: 'vendor-new', code: 'VND-0002', name: 'Regional Vendor' });
    await POST(postRequest({
      name: 'Regional Vendor', contactPerson: 'Contact', email: 'regional@example.test', category: 'Services',
      operatingLocation: '  Jaipur, Rajasthan  ', capabilities: 'Consulting', serviceCoverage: 'North',
      clientReferences: { source: 'directory' },
    }));
    expect(atomicBatch).toHaveBeenCalledTimes(2);
    expect(atomicBatch.mock.calls[1][0][0].values).toEqual(expect.arrayContaining([
      'Regional Vendor', 'Consulting', 'North', '{"source":"directory"}', 'PROFILE_INCOMPLETE',
    ]));

    db.vendor.findFirst.mockRejectedValueOnce(new Error('vendor write failed'));
    await expect(POST(postRequest({ ...validVendor, id: 'vendor-1' }))).resolves.toEqual({ ok: false, error: 'Failed to onboard vendor', status: 500 });
    expect(structuredLog).toHaveBeenCalledWith('error', 'vendor.onboarding_failed', expect.objectContaining({
      operation: 'create_or_update_vendor', route: '/api/procurement/vendors', vendorId: 'vendor-1',
      error: { name: 'Error', message: 'vendor write failed' },
    }));
    atomicBatch.mockRejectedValueOnce({});
    await expect(POST(postRequest(validVendor))).resolves.toEqual({ ok: false, error: 'Failed to onboard vendor', status: 500 });
    expect(structuredLog).toHaveBeenLastCalledWith('error', 'vendor.onboarding_failed', expect.objectContaining({
      vendorId: expect.stringMatching(/^[0-9a-f-]{36}$/), error: { type: 'object' },
    }));
  });
});
