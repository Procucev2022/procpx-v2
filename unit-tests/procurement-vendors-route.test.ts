import { NextRequest } from 'next/server';
import { GET, POST } from '../src/app/api/procurement/vendors/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';

jest.mock('../src/lib/prisma', () => ({
  prisma: { vendor: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), create: jest.fn() } },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));
jest.mock('../src/lib/audit', () => ({ createAuditLog: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
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
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.vendor.findMany.mockReset().mockResolvedValue([]);
    db.vendor.findFirst.mockReset().mockResolvedValue(null);
    db.vendor.update.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'vendor-1', code: 'VND-0001', ...data }));
    db.vendor.create.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'vendor-new', ...data }));
    audit.mockReset().mockResolvedValue(undefined);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('filters directory records, parses category formats, summarizes approved ratings, and aggregates tabs', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(getRequest())).resolves.toBe(denied);

    db.vendor.findMany
      .mockResolvedValueOnce([
        { id: 'array', categories: ['A', 'B'], ppoRatings: [{ overallScore: 4 }, { overallScore: 3 }] },
        { id: 'json', categories: '["C","D"]', ppoRatings: [{ overallScore: 5 }] },
        { id: 'scalar-json', categories: '"Electrical"', ppoRatings: [] },
        { id: 'csv', categories: 'Power, , Water ', ppoRatings: null },
        { id: 'empty', categories: '  ', ppoRatings: [] },
      ])
      .mockResolvedValueOnce([
        { vendorType: 'CLIENT_VENDOR', qualificationStatus: 'QUALIFIED' },
        { vendorType: 'PROCUCEV_VENDOR', qualificationStatus: 'PENDING_REVIEW' },
        { vendorType: 'CLIENT_VENDOR', qualificationStatus: 'EVALUATION_IN_PROGRESS' },
        { vendorType: 'CLIENT_VENDOR', qualificationStatus: 'NOT_EVALUATED' },
        { vendorType: 'CLIENT_VENDOR', qualificationStatus: null },
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
    } });
    expect(db.vendor.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: {
        vendorType: 'CLIENT_VENDOR', tenantId: 'tenant-1', qualificationStatus: 'QUALIFIED',
        onboardingStatus: 'ONBOARDED', categories: { contains: 'Electrical' }, status: 'ACTIVE',
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
    }));
    expect(db.vendor.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { OR: [{ tenantId: 'tenant-1' }, { vendorType: 'PROCUCEV_VENDOR' }] },
    }));
  });

  it('ignores ALL and blank filters while preserving shared-network tenant visibility', async () => {
    db.vendor.findMany.mockResolvedValueOnce([{ id: 'one', categories: 'Metal, Services', ppoRatings: undefined }]).mockResolvedValueOnce([]);
    await expect(GET(getRequest('?vendorType=ALL&qualificationStatus=ALL&onboardingStatus=ALL&category=ALL&region=ALL&status=ALL&search=%20%20')))
      .resolves.toMatchObject({ ok: true, data: { vendors: [{ categories: ['Metal', 'Services'], ppoRatingsCount: 0, averagePpoRating: null }], counts: { total: 0 } } });
    expect(db.vendor.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: {
      OR: [{ tenantId: 'tenant-1' }, { vendorType: 'PROCUCEV_VENDOR' }],
    } }));
  });

  it('returns GET database failures with the original error or a fallback', async () => {
    db.vendor.findMany.mockRejectedValueOnce(new Error('directory unavailable'));
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: 'directory unavailable', status: 500 });
    db.vendor.findMany.mockRejectedValueOnce({});
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: 'Failed to fetch vendors', status: 500 });
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
    expect(db.vendor.update).toHaveBeenCalledWith({ where: { id: 'vendor-1' }, data: {
      name: 'New Name', vendorType: 'PROCUCEV_VENDOR', contactPerson: 'Pat', email: 'pat@example.test', phone: null,
      categories: 'New Category', operatingLocation: 'Old Location', city: 'New City', state: null, country: 'US',
      legalStructure: 'LLC', gstin: null, pan: null, website: null, address: null, experienceYears: 0,
      turnoverCrores: null, capabilities: '["design","install"]', serviceCoverage: '  Remote  ',
      clientReferences: '[{"customer":"One"}]', certifications: null, onboardingStatus: 'PROFILE_INCOMPLETE',
    } });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'VENDOR_UPDATED', entityId: 'vendor-1' }));
  });

  it('updates a partial vendor profile as onboarded and uses provided city/location values', async () => {
    db.vendor.findFirst.mockResolvedValueOnce({ ...existingVendor, country: null });
    await POST(postRequest({
      id: 'vendor-1', name: 'Changed', vendorType: 'CLIENT_VENDOR', contactPerson: 'New Contact', phone: ' 123 ',
      category: 'Safety', city: '  Surat ', gstin: ' gst-1 ', legalStructure: ' Private Ltd ', country: '',
    }));
    expect(db.vendor.update).toHaveBeenCalledWith({ where: { id: 'vendor-1' }, data: expect.objectContaining({
      name: 'Changed', phone: '123', email: 'old@example.test', city: 'Surat', operatingLocation: 'Old Location',
      country: 'India', legalStructure: ' Private Ltd ', gstin: 'GST-1', onboardingStatus: 'ONBOARDED',
    }) });
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
    expect(db.vendor.update).toHaveBeenCalledWith({ where: { id: 'vendor-1' }, data: expect.objectContaining({
      operatingLocation: 'New Site, West', city: 'New Site', phone: '9999999999', state: 'TX', country: 'Canada',
      legalStructure: ' Inc ', gstin: 'GST-2', pan: 'PAN-2', website: 'https://new.test', address: 'New Office',
      experienceYears: null, turnoverCrores: null, capabilities: 'legacy text',
      serviceCoverage: '{"zones":["west"]}', clientReferences: 'Reference text', certifications: [],
    }) });
  });

  it('onboards new vendors with collision-safe codes and serializes structured capabilities', async () => {
    db.vendor.findMany.mockResolvedValueOnce([
      { code: null }, { code: 'VND-0004' }, { code: 'VND-0012' }, { code: 'VND-other' }, { code: 'VND-0009' },
    ]);
    db.vendor.findFirst.mockImplementation(async ({ where }: { where: Record<string, any> }) => {
      if (where.code === 'VND-0013' || where.code === 'VND-0014') return { id: 'occupied' };
      return null;
    });
    const result = await POST(postRequest({
      ...validVendor, name: '  FineBuild ', vendorType: 'PROCUCEV_VENDOR', contactPerson: '  Sam ', email: '', phone: ' 555 ',
      operatingLocation: '', city: ' Mumbai ', state: ' Maharashtra ', country: '', legalStructure: ' LLP ', gstin: ' abc123 ',
      pan: ' xyz ', website: ' https://vendor.test ', address: ' Office ', experienceYears: '5', turnoverCrores: '2.5',
      capabilities: ['civil', 'electrical'], serviceCoverage: { states: ['MH'] }, clientReferences: 'Legacy reference', certifications: ['ISO'],
    }));
    expect(result).toMatchObject({ ok: true, status: 201, data: { message: 'Vendor VND-0015 onboarded successfully.' } });
    expect(db.vendor.create).toHaveBeenCalledWith({ data: {
      tenantId: 'tenant-1', code: 'VND-0015', name: 'FineBuild', vendorType: 'PROCUCEV_VENDOR', contactPerson: 'Sam',
      email: 'contact@vnd-0015.in', phone: '555', categories: 'Electrical', operatingLocation: 'Mumbai ,  Maharashtra',
      city: 'Mumbai', state: 'Maharashtra', country: 'India', legalStructure: ' LLP ', gstin: 'ABC123', pan: 'XYZ',
      website: 'https://vendor.test', address: 'Office', experienceYears: 5, turnoverCrores: 2.5,
      capabilities: '["civil","electrical"]', serviceCoverage: '{"states":["MH"]}', clientReferences: 'Legacy reference',
      certifications: ['ISO'], onboardingStatus: 'ONBOARDED', qualificationStatus: 'NOT_EVALUATED',
      complianceStatus: 'COMPLIANT', empanelmentStatus: 'PENDING', status: 'ACTIVE',
    } });
    expect(db.vendor.findFirst).toHaveBeenNthCalledWith(1, { where: { tenantId: 'tenant-1', code: 'VND-0013' }, select: { id: true } });
    expect(db.vendor.findFirst).toHaveBeenNthCalledWith(3, { where: { tenantId: 'tenant-1', code: 'VND-0015' }, select: { id: true } });
    expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'VENDOR_CREATED', entityId: 'vendor-new' }));
  });

  it('creates a draft with safe defaults and handles POST provider failures', async () => {
    db.vendor.findMany.mockResolvedValueOnce([]);
    await POST(postRequest({
      name: 'Draft Vendor', contactPerson: 'Contact', phone: '1', category: 'Services', city: 'Delhi', isDraft: true,
    }));
    expect(db.vendor.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      code: 'VND-0001', email: 'contact@vnd-0001.in', operatingLocation: 'Delhi,', city: 'Delhi', state: null,
      country: 'India', legalStructure: null, gstin: null, pan: null, website: null, address: null,
      experienceYears: 3, turnoverCrores: null, capabilities: null, serviceCoverage: null, clientReferences: null,
      certifications: null, onboardingStatus: 'DRAFT',
    }) });

    db.vendor.findMany.mockResolvedValueOnce([]);
    await POST(postRequest({
      name: 'Regional Vendor', contactPerson: 'Contact', email: 'regional@example.test', category: 'Services',
      operatingLocation: '  Jaipur, Rajasthan  ', capabilities: 'Consulting', serviceCoverage: 'North',
      clientReferences: { source: 'directory' },
    }));
    expect(db.vendor.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({
      operatingLocation: 'Jaipur, Rajasthan', city: 'Jaipur', state: null, capabilities: 'Consulting',
      serviceCoverage: 'North', clientReferences: '{"source":"directory"}', onboardingStatus: 'PROFILE_INCOMPLETE',
    }) });

    db.vendor.findFirst.mockRejectedValueOnce(new Error('vendor write failed'));
    await expect(POST(postRequest({ ...validVendor, id: 'vendor-1' }))).resolves.toEqual({ ok: false, error: 'vendor write failed', status: 500 });
    db.vendor.create.mockRejectedValueOnce({});
    await expect(POST(postRequest(validVendor))).resolves.toEqual({ ok: false, error: 'Failed to onboard vendor', status: 500 });
  });
});
