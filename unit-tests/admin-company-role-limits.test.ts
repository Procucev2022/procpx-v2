import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { isApiContext, requireAuth } from '../src/lib/api-utils';
import { POST as createCompany } from '../src/app/api/admin/businesses/route';
import { GET as readLimits, PUT as saveLimits } from '../src/app/api/admin/businesses/[id]/role-limits/route';
import { industryLabel, parseCompanyProfile, parseRoleLimits } from '../src/lib/company-profile';
import { checkRoleCapacity, loadRoleLimitUsage } from '../src/lib/tenant-role-limits';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { AUDIT_LOG_INSERT_AFTER_CHANGE_SQL } from '../src/lib/d1-batch.constants';
import {
  BUSINESS_INSERT_IF_AVAILABLE_SQL,
  BUSINESS_TOUCH_SQL,
  INDUSTRY_OPTIONS,
  ROLE_LIMIT_DELETE_SQL,
  ROLE_LIMIT_MAX,
  ROLE_LIMIT_UPSERT_SQL,
} from '../src/lib/business-directory.constants';
import { ASSIGNABLE_USER_ROLES } from '../src/app/api/admin/users/route.constants';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    tenant: { findMany: jest.fn(), findFirst: jest.fn() },
    tenantRoleLimit: { findMany: jest.fn(), findFirst: jest.fn() },
    user: { groupBy: jest.fn(), count: jest.fn() },
  },
}));
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));

const db = prisma as unknown as {
  tenant: { findMany: jest.Mock; findFirst: jest.Mock };
  tenantRoleLimit: { findMany: jest.Mock; findFirst: jest.Mock };
  user: { groupBy: jest.Mock; count: jest.Mock };
};
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const batch = writeD1BatchAtomically as jest.Mock;
const logger = writeStructuredLog as jest.Mock;
const MESSAGES = UI_STRINGS.appApiAdminBusinessesRoute;

const SUPER = { tenantId: 'tenant-1', userId: 'root-1', role: 'SUPER_ADMIN' };
const CLIENT = { tenantId: 'tenant-1', userId: 'admin-1', role: 'CLIENT_ADMIN' };
const ACME = { id: 'tenant-9', name: 'Acme Interiors' };
const GSTIN = '29ABCDE1234F1Z5';
const PROFILE = {
  name: '  Acme   Interiors ', gstNumber: ' 29abcde1234f1z5 ', address: ' 12 MG Road, Bengaluru ',
  pincode: '560 001', panNumber: 'abcde1234f', industry: 'RETAIL', contactPersonName: ' Asha  Rao ', contactPhone: '+91 98450-12345',
};
const changed = (changes: number) => ({ success: true, meta: { changes } });
const post = (body: unknown, raw?: string) => createCompany(new NextRequest('http://localhost/api/admin/businesses', {
  method: 'POST', body: raw ?? JSON.stringify(body),
}));
const limitsUrl = 'http://localhost/api/admin/businesses/tenant-9/role-limits';
const params = (id = 'tenant-9') => ({ params: Promise.resolve({ id }) });
const put = (body: unknown, id?: string) => saveLimits(new NextRequest(limitsUrl, { method: 'PUT', body: JSON.stringify(body) }), params(id));
const get = (id?: string) => readLimits(new NextRequest(limitsUrl), params(id));

describe('company profile validation', () => {
  it('normalizes a complete profile and keeps optional fields nullable', () => {
    expect(parseCompanyProfile(PROFILE)).toEqual({
      ok: true,
      value: {
        name: 'Acme Interiors', gstNumber: GSTIN, address: '12 MG Road, Bengaluru', pincode: '560001',
        panNumber: 'ABCDE1234F', industry: 'RETAIL', contactPersonName: 'Asha Rao', contactPhone: '+919845012345',
      },
    });
    expect(parseCompanyProfile({ name: 'Acme', gstNumber: GSTIN, address: 'Road', pincode: 5 })).toEqual({
      ok: true,
      value: {
        name: 'Acme', gstNumber: GSTIN, address: 'Road', pincode: null, panNumber: null,
        industry: null, contactPersonName: null, contactPhone: null,
      },
    });
  });

  it.each([
    [{ ...PROFILE, name: ' ' }, MESSAGES.companyNameIsRequired],
    [{ ...PROFILE, name: 'x'.repeat(121) }, interpolateUiString(MESSAGES.companyNameMustBeAtMostMaxCharacters, { max: 120 })],
    [{ ...PROFILE, gstNumber: '' }, MESSAGES.gstNumberIsRequired],
    [{ ...PROFILE, gstNumber: '29ABCDE1234F1Y5' }, MESSAGES.gstNumberIsInvalid],
    [{ ...PROFILE, address: undefined }, MESSAGES.addressIsRequired],
    [{ ...PROFILE, address: 'a'.repeat(501) }, interpolateUiString(MESSAGES.addressMustBeAtMostMaxCharacters, { max: 500 })],
    [{ ...PROFILE, pincode: '012345' }, MESSAGES.pincodeIsInvalid],
    [{ ...PROFILE, panNumber: 'ABCDE12345' }, MESSAGES.panNumberIsInvalid],
    [{ ...PROFILE, industry: 'SPACE' }, MESSAGES.industryIsInvalid],
    [{ ...PROFILE, contactPersonName: 'n'.repeat(121) }, interpolateUiString(MESSAGES.contactPersonNameMustBeAtMostMaxCharacters, { max: 120 })],
    [{ ...PROFILE, contactPhone: '12-34' }, MESSAGES.contactPhoneIsInvalid],
  ])('rejects invalid input %#', (input, error) => {
    expect(parseCompanyProfile(input as Record<string, unknown>)).toEqual({ ok: false, error });
  });

  it('parses role limits, treating blanks as no limit and rejecting anything else', () => {
    const invalid = { ok: false, error: interpolateUiString(MESSAGES.roleLimitIsInvalid, { max: ROLE_LIMIT_MAX }) };
    expect(parseRoleLimits(undefined)).toEqual({ ok: true, value: {} });
    expect(parseRoleLimits({ PROJECT_USER: ' 5 ', VIEWER: '', FINANCE_USER: null, CLIENT_ADMIN: 0 })).toEqual({
      ok: true, value: { PROJECT_USER: 5, VIEWER: null, FINANCE_USER: null, CLIENT_ADMIN: 0 },
    });
    for (const bad of ['5', [], { SUPER_ADMIN: 1 }, { VIEWER: -1 }, { VIEWER: 1.5 }, { VIEWER: 'ten' }, { VIEWER: ROLE_LIMIT_MAX + 1 }, { VIEWER: true }]) {
      expect(parseRoleLimits(bad)).toEqual(invalid);
    }
  });

  it('labels industry codes from the catalog', () => {
    expect(industryLabel('RETAIL')).toBe(INDUSTRY_OPTIONS[0].label);
    expect(industryLabel('LEGACY')).toBe('LEGACY');
    expect(industryLabel(null)).toBe('');
  });
});

describe('role limit usage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reports the limit and active users for every assignable role', async () => {
    db.tenantRoleLimit.findMany.mockResolvedValue([{ role: 'VIEWER', maxUsers: 3 }]);
    db.user.groupBy.mockResolvedValue([{ role: 'VIEWER', _count: { _all: 2 } }, { role: 'PROJECT_USER', _count: { _all: 4 } }]);
    const usage = await loadRoleLimitUsage('tenant-9');
    expect(usage).toHaveLength(ASSIGNABLE_USER_ROLES.length);
    expect(usage).toEqual(expect.arrayContaining([
      { role: 'VIEWER', maxUsers: 3, activeUsers: 2 },
      { role: 'PROJECT_USER', maxUsers: null, activeUsers: 4 },
      { role: 'FINANCE_USER', maxUsers: null, activeUsers: 0 },
    ]));
    expect(db.user.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-9', status: 'ACTIVE' } }));
  });

  it('checks capacity against active users, excluding a user being re-assigned', async () => {
    db.tenantRoleLimit.findFirst.mockResolvedValueOnce(null);
    db.user.count.mockResolvedValueOnce(7);
    await expect(checkRoleCapacity('tenant-9', 'VIEWER')).resolves.toEqual({ allowed: true, maxUsers: null, activeUsers: 7 });
    expect(db.user.count).toHaveBeenLastCalledWith({ where: { tenantId: 'tenant-9', role: 'VIEWER', status: 'ACTIVE' } });

    db.tenantRoleLimit.findFirst.mockResolvedValueOnce({ maxUsers: 2 });
    db.user.count.mockResolvedValueOnce(2);
    await expect(checkRoleCapacity('tenant-9', 'VIEWER', 'user-1')).resolves.toEqual({ allowed: false, maxUsers: 2, activeUsers: 2 });
    expect(db.user.count).toHaveBeenLastCalledWith({ where: { tenantId: 'tenant-9', role: 'VIEWER', status: 'ACTIVE', id: { not: 'user-1' } } });

    db.tenantRoleLimit.findFirst.mockResolvedValueOnce({ maxUsers: 2 });
    db.user.count.mockResolvedValueOnce(1);
    await expect(checkRoleCapacity('tenant-9', 'VIEWER')).resolves.toEqual({ allowed: true, maxUsers: 2, activeUsers: 1 });
  });
});

describe('POST /api/admin/businesses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isContext.mockReturnValue(true);
    auth.mockResolvedValue(SUPER);
    db.tenant.findMany.mockResolvedValue([{ name: 'Procucev Retail Demo', gstNumber: null }]);
    batch.mockResolvedValue([changed(1), changed(1), changed(1)]);
  });

  it('requires an authenticated Super Admin', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(post(PROFILE)).resolves.toBe(denied);
    expect(auth).toHaveBeenCalledWith('USER_CREATE');

    auth.mockResolvedValueOnce(CLIENT);
    await expect(post(PROFILE)).resolves.toEqual({ ok: false, error: MESSAGES.onlyASuperAdminCanCreateCompanies, status: 403 });
    expect(batch).not.toHaveBeenCalled();
  });

  it('validates the request body, profile and role limits', async () => {
    await expect(post(null, 'not-json')).resolves.toEqual({ ok: false, error: MESSAGES.invalidCompanyRequest, status: 400 });
    await expect(post([])).resolves.toEqual({ ok: false, error: MESSAGES.invalidCompanyRequest, status: 400 });
    await expect(post({ ...PROFILE, gstNumber: '' })).resolves.toEqual({ ok: false, error: MESSAGES.gstNumberIsRequired, status: 400 });
    await expect(post({ ...PROFILE, roleLimits: { VIEWER: -2 } })).resolves.toEqual(expect.objectContaining({ status: 400 }));
    expect(batch).not.toHaveBeenCalled();
  });

  it('rejects a duplicate company name or GST number', async () => {
    db.tenant.findMany.mockResolvedValueOnce([{ name: ' ACME interiors', gstNumber: null }]);
    await expect(post(PROFILE)).resolves.toEqual({ ok: false, error: MESSAGES.aCompanyWithThisNameAlreadyExists, status: 409 });
    db.tenant.findMany.mockResolvedValueOnce([{ name: 'Other', gstNumber: '29abcde1234f1z5' }]);
    await expect(post(PROFILE)).resolves.toEqual({ ok: false, error: MESSAGES.aCompanyWithThisGstNumberAlreadyExists, status: 409 });
    expect(batch).not.toHaveBeenCalled();
  });

  it('creates the company, its audit row and its role limits in one batch', async () => {
    const response = await post({ ...PROFILE, roleLimits: { CLIENT_ADMIN: '1', VIEWER: '' } });
    const [statements] = batch.mock.calls[0];
    expect(statements.map((statement: { sql: string }) => statement.sql)).toEqual([
      BUSINESS_INSERT_IF_AVAILABLE_SQL, AUDIT_LOG_INSERT_AFTER_CHANGE_SQL, ROLE_LIMIT_UPSERT_SQL,
    ]);
    const id = statements[0].values[0];
    expect(statements[0].values).toEqual([
      id, 'Acme Interiors', expect.stringMatching(/^acme-interiors-[a-z0-9]{8}$/), 'ACTIVE', GSTIN, '12 MG Road, Bengaluru',
      '560001', 'ABCDE1234F', 'RETAIL', 'Asha Rao', '+919845012345', expect.any(Date), expect.any(Date),
      'Acme Interiors', statements[0].values[2], GSTIN,
    ]);
    expect(statements[1].values).toEqual(expect.arrayContaining([id, 'TENANT', 'CREATE',
      interpolateUiString(MESSAGES.companyCompanyCreated, { company: 'Acme Interiors' })]));
    expect(statements[2].values).toEqual([expect.any(String), id, 'CLIENT_ADMIN', 1, expect.any(Date), expect.any(Date), 'root-1', id]);
    expect(response).toEqual({ ok: true, status: 201, data: expect.objectContaining({ id, name: 'Acme Interiors', gstNumber: GSTIN }) });
    expect(logger).toHaveBeenCalledWith('info', 'admin.business_created', expect.objectContaining({ businessId: id, roleLimitCount: 1 }));
  });

  it('reports a concurrent duplicate and logs sanitized write failures', async () => {
    batch.mockResolvedValueOnce([changed(0), changed(0)]);
    await expect(post(PROFILE)).resolves.toEqual({ ok: false, error: MESSAGES.companyWasJustTakenPleaseRefreshAndTryAgain, status: 409 });
    batch.mockResolvedValueOnce([{}]);
    await expect(post(PROFILE)).resolves.toEqual(expect.objectContaining({ status: 409 }));

    batch.mockRejectedValueOnce(new Error('D1 down'));
    await expect(post(PROFILE)).resolves.toEqual({ ok: false, error: MESSAGES.failedToCreateCompany, status: 500 });
    expect(logger).toHaveBeenLastCalledWith('error', 'admin.business_create_failed', expect.objectContaining({ error: { name: 'Error', message: 'D1 down' } }));
    batch.mockRejectedValueOnce(7);
    await post(PROFILE);
    expect(logger).toHaveBeenLastCalledWith('error', 'admin.business_create_failed', expect.objectContaining({ error: { type: 'number' } }));
  });
});

describe('/api/admin/businesses/[id]/role-limits', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isContext.mockReturnValue(true);
    auth.mockResolvedValue(SUPER);
    db.tenant.findFirst.mockResolvedValue(ACME);
    db.tenantRoleLimit.findMany.mockResolvedValue([{ role: 'VIEWER', maxUsers: 2 }]);
    db.user.groupBy.mockResolvedValue([]);
    batch.mockResolvedValue([]);
  });

  it('returns usage to a Super Admin and to the company\'s own administrators only', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(get()).resolves.toBe(denied);

    const result = await get();
    expect(result).toEqual({ ok: true, status: 200, data: expect.objectContaining({ businessId: 'tenant-9', businessName: ACME.name }) });
    expect((result as unknown as { data: { roles: unknown[] } }).data.roles).toContainEqual({ role: 'VIEWER', maxUsers: 2, activeUsers: 0 });

    auth.mockResolvedValue(CLIENT);
    await expect(get('tenant-9')).resolves.toEqual({ ok: false, error: MESSAGES.companyNotFound, status: 404 });
    db.tenant.findFirst.mockResolvedValueOnce({ id: 'tenant-1', name: 'Own' });
    await expect(get('tenant-1')).resolves.toEqual(expect.objectContaining({ ok: true }));

    db.tenant.findFirst.mockResolvedValueOnce(null);
    await expect(get('tenant-1')).resolves.toEqual({ ok: false, error: MESSAGES.companyNotFound, status: 404 });
  });

  it('logs read failures', async () => {
    db.tenant.findFirst.mockRejectedValueOnce(new Error('D1 down'));
    await expect(get()).resolves.toEqual({ ok: false, error: MESSAGES.failedToFetchRoleLimits, status: 500 });
    db.tenant.findFirst.mockRejectedValueOnce(null);
    await get();
    expect(logger).toHaveBeenLastCalledWith('error', 'admin.business_role_limits_read_failed', expect.objectContaining({ error: { type: 'object' } }));
  });

  it('lets only a Super Admin save valid limits for an existing company', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(put({ limits: {} })).resolves.toBe(denied);

    auth.mockResolvedValueOnce(CLIENT);
    await expect(put({ limits: {} })).resolves.toEqual({ ok: false, error: MESSAGES.onlyASuperAdminCanChangeRoleLimits, status: 403 });
    await expect(put({ limits: { VIEWER: 'x' } })).resolves.toEqual(expect.objectContaining({ status: 400 }));
    await expect(put('bad')).resolves.toEqual(expect.objectContaining({ status: 400 }));
    db.tenant.findFirst.mockResolvedValueOnce(null);
    await expect(put({ limits: {} })).resolves.toEqual({ ok: false, error: MESSAGES.companyNotFound, status: 404 });
    expect(batch).not.toHaveBeenCalled();
  });

  it('upserts set limits, removes cleared ones and audits the change', async () => {
    const result = await put({ limits: { VIEWER: '4', FINANCE_USER: '' } });
    const [statements] = batch.mock.calls[0];
    expect(statements.map((statement: { sql: string }) => statement.sql)).toEqual([
      ROLE_LIMIT_UPSERT_SQL, ROLE_LIMIT_DELETE_SQL, BUSINESS_TOUCH_SQL, AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
    ]);
    expect(statements[0].values).toEqual([expect.any(String), 'tenant-9', 'VIEWER', 4, expect.any(Date), expect.any(Date), 'root-1', 'tenant-9']);
    expect(statements[1].values).toEqual(['tenant-9', 'FINANCE_USER']);
    expect(statements[3].values).toEqual(expect.arrayContaining(['TENANT', 'UPDATE',
      interpolateUiString(MESSAGES.roleLimitsUpdatedForCompany, { company: ACME.name })]));
    expect(result).toEqual({ ok: true, status: 200, data: expect.objectContaining({ businessName: ACME.name }) });
    expect(logger).toHaveBeenCalledWith('info', 'admin.business_role_limits_updated', expect.objectContaining({ changedRoleCount: 2 }));
  });

  it('logs sanitized save failures', async () => {
    batch.mockRejectedValueOnce(new Error('D1 down'));
    await expect(put({ limits: { VIEWER: 1 } })).resolves.toEqual({ ok: false, error: MESSAGES.failedToSaveRoleLimits, status: 500 });
    expect(logger).toHaveBeenLastCalledWith('error', 'admin.business_role_limits_update_failed', expect.objectContaining({
      error: { name: 'Error', message: 'D1 down' },
    }));
  });
});
