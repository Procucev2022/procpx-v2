/** @jest-environment jsdom */
import { interpolateUiString, uiStringPattern } from '@/lib/i18n';

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import UsersPage from '../src/app/(app)/admin/users/page';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


// The company and role-limit dialogs have their own tests; here they only report back.
jest.mock('../src/components/admin/CreateCompanyModal', () => ({
  __esModule: true,
  default: ({ onClose, onCreated }: { onClose: () => void; onCreated: (b: { id: string; name: string }) => void }) => (
    <div data-testid="create-company-modal">
      <button type="button" onClick={() => onCreated({ id: 'tenant-0', name: 'Acme Interiors' })}>mock-create</button>
      <button type="button" onClick={onClose}>mock-close</button>
    </div>
  ),
}));
jest.mock('../src/components/admin/RoleLimitsModal', () => ({
  __esModule: true,
  default: ({ business, onClose, onSaved }: { business: { id: string; name: string }; onClose: () => void; onSaved: (r: unknown) => void }) => (
    <div data-testid="role-limits-modal" data-business={business.id}>
      <button type="button" onClick={() => onSaved({ businessId: business.id, businessName: business.name, roles: [] })}>mock-save</button>
      <button type="button" onClick={onClose}>mock-close</button>
    </div>
  ),
}));

jest.mock('../src/components/ui/PageHeader', () => ({
  __esModule: true,
  default: ({ title, subtitle, actions }: { title: string; subtitle: string; actions?: React.ReactNode }) => (
    <header><h1>{title}</h1><p>{subtitle}</p>{actions}</header>
  ),
}));

type MockResponse = { ok: boolean; json: jest.Mock };
const fetchMock = jest.fn();
const originalFetch = global.fetch;
const originalConfirm = window.confirm;
const response = (body: unknown, ok = true): MockResponse => ({ ok, json: jest.fn().mockResolvedValue(body) });
const RETAIL = { id: 'tenant-1', name: 'Procucev Retail Demo' };
const HOSPITALITY = {
  id: 'tenant-2', name: 'Procucev Hospitality Demo', gstNumber: '29ABCDE1234F1Z5', industry: 'HOSPITALITY',
  contactPersonName: 'Asha Rao', contactPhone: '+919845012345',
};
const CLIENT_DIRECTORY = { canChooseBusiness: false, currentBusiness: RETAIL, businesses: [RETAIL] };
const SUPER_DIRECTORY = { canChooseBusiness: true, currentBusiness: RETAIL, businesses: [HOSPITALITY, RETAIL] };
const users = [
  { id: 'user-1', name: 'Alice Admin', email: 'alice@example.test', role: 'PROJECT_APPROVER', status: 'ACTIVE', lastLoginAt: '2026-10-01T10:00:00.000Z', createdAt: '2026-01-01T10:00:00.000Z', tenant: RETAIL },
  { id: 'user-2', name: 'Bob Buyer', email: 'bob@example.test', role: 'FINANCE_USER', status: 'INACTIVE', lastLoginAt: null, createdAt: '2026-02-01T10:00:00.000Z' },
];

// Routes mocked fetches by URL so the users list, the business directory and writes can
// each be scripted independently of request order.
let directoryResult: Promise<MockResponse>;
let listQueue: Array<MockResponse | Promise<MockResponse>>;
let writeQueue: MockResponse[];
let limitsResult: () => Promise<MockResponse>;
const limitCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).includes('/role-limits'));
const usage = (role: string, maxUsers: number | null, activeUsers: number) => ({ role, maxUsers, activeUsers });
const listCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/admin/users?'));
const writeCalls = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST' || init?.method === 'PUT');

async function openInvite() {
  fireEvent.click(await screen.findByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminUsersPage.inviteUser) }));
  return screen.getByText(uiStringPattern(UI_STRINGS.appAppAdminUsersPage.inviteNewUser)).closest('.modal') as HTMLElement;
}

function fillInvite(modal: HTMLElement) {
  const inputs = modal.querySelectorAll<HTMLInputElement>('input');
  fireEvent.change(inputs[0], { target: { value: 'Casey Creator' } });
  fireEvent.change(inputs[1], { target: { value: 'casey@example.test' } });
  fireEvent.change(modal.querySelector('#invite-role')!, { target: { value: 'FINANCE_USER' } });
  fireEvent.change(modal.querySelector('input[type="password"]')!, { target: { value: 'temporary-password' } });
}

describe('admin users page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    directoryResult = Promise.resolve(response(CLIENT_DIRECTORY));
    listQueue = [];
    writeQueue = [];
    limitsResult = () => Promise.resolve(response({ roles: [] }));
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/admin/businesses') return directoryResult;
      if (url.includes('/role-limits')) return limitsResult();
      if (init?.method === 'POST' || init?.method === 'PUT') return Promise.resolve(writeQueue.shift() ?? response({}));
      return Promise.resolve(listQueue.shift() ?? response({ data: [], total: 0 }));
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    window.confirm = jest.fn().mockReturnValue(true);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    window.confirm = originalConfirm;
  });

  it('shows loading, empty results, and the complete permission matrix tab', async () => {
    listQueue.push(new Promise(() => undefined) as unknown as MockResponse);
    const view = render(<UsersPage />);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppAdminUsersPage.loadingUsers))).toBeInTheDocument();
    view.unmount();

    render(<UsersPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppAdminUsersPage.noUsersFound))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminUsersPage.rolePermissionMatrix) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppAdminUsersPage.rBACPermissionMappingMatrix))).toBeInTheDocument();
    expect(screen.getByText('PROJECT_VIEW')).toBeInTheDocument();
    expect(screen.getByText('AUDIT_VIEW')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminUsersPage.inviteUser) })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminUsersPage.tenantUsers, '', false) }));
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminUsersPage.inviteUser) })).toBeInTheDocument();
  });

  it('renders company, status and dates, paginates, and filters by encoded search text', async () => {
    listQueue.push(response({ data: users, total: 45 }));
    render(<UsersPage />);
    expect(await screen.findByText('Alice Admin')).toBeInTheDocument();
    expect(screen.getByText(UI_STRINGS.appAppAdminUsersPage.company)).toBeInTheDocument();
    expect(screen.getByText('Procucev Retail Demo')).toBeInTheDocument();
    expect(screen.getByText(UI_STRINGS.common.copy4s9bsz)).toBeInTheDocument();
    expect(screen.getByText('PROJECT APPROVER')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppAdminUsersPage.never))).toBeInTheDocument();
    expect(screen.getByText(interpolateUiString(UI_STRINGS.common.pageValue1OfValue2, { value1: 1, value2: 3 }))).toBeInTheDocument();

    const pageButtons = document.querySelectorAll<HTMLButtonElement>('.page-btn');
    expect(pageButtons[0].disabled).toBe(true);
    listQueue.push(response({ data: users, total: 45 }));
    fireEvent.click(pageButtons[1]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('page=2')));
    expect(await screen.findByText(interpolateUiString(UI_STRINGS.common.pageValue1OfValue2, { value1: 2, value2: 3 }))).toBeInTheDocument();

    const search = screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppAdminUsersPage.searchByNameOrEmail));
    fireEvent.change(search, { target: { value: 'alice & bob' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('search=alice%20%26%20bob')));
  });

  it('locks a Client Admin\'s invites to their own business and sends it with the user', async () => {
    render(<UsersPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/businesses'));
    expect(screen.queryByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminUsersPage.createCompany) })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminUsersPage.companies) })).not.toBeInTheDocument();
    const modal = await openInvite();
    const company = modal.querySelector<HTMLInputElement>('#invite-company')!;
    expect(company.value).toBe('Procucev Retail Demo');
    expect(company.readOnly).toBe(true);
    expect(screen.getByText(UI_STRINGS.appAppAdminUsersPage.companyHelpLocked)).toBeInTheDocument();
    await waitFor(() => expect(limitCalls()[0][0]).toBe('/api/admin/businesses/tenant-1/role-limits'));

    fillInvite(modal);
    writeQueue.push(response({ error: 'Email already exists' }, false));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminUsersPage.createUser) }));
    expect(await screen.findByText('Email already exists')).toBeInTheDocument();
    expect(JSON.parse(writeCalls()[0][1].body)).toEqual({
      email: 'casey@example.test', name: 'Casey Creator', role: 'FINANCE_USER', password: 'temporary-password', businessId: 'tenant-1',
    });

    writeQueue.push(response({ email: 'casey@example.test', tenant: RETAIL }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminUsersPage.createUser) }));
    expect(await screen.findByText(interpolateUiString(UI_STRINGS.appAppAdminUsersPage.userEmailCreatedInCompany, {
      email: 'casey@example.test', company: 'Procucev Retail Demo',
    }))).toBeInTheDocument();
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppAdminUsersPage.inviteNewUser))).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/admin/users?page=1&pageSize=20&search=');

    const success = screen.getByText(uiStringPattern(UI_STRINGS.appAppAdminUsersPage.userEmailCreatedInCompany));
    fireEvent.click(success.parentElement!.querySelector('button')!);
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppAdminUsersPage.userEmailCreatedInCompany))).not.toBeInTheDocument();
  });

  it('shows role seat usage and disables roles whose limit is reached', async () => {
    limitsResult = () => Promise.resolve(response({ roles: [usage('PROJECT_USER', 5, 2), usage('VIEWER', 1, 1), usage('FINANCE_USER', null, 3)] }));
    render(<UsersPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/businesses'));
    const modal = await openInvite();
    expect(await screen.findByTestId('invite-role-usage')).toHaveTextContent(
      interpolateUiString(UI_STRINGS.appAppAdminUsersPage.roleLimitUsage, { active: 2, max: 5 }),
    );
    const viewer = modal.querySelector<HTMLOptionElement>('#invite-role option[value="VIEWER"]')!;
    expect(viewer.disabled).toBe(true);
    expect(viewer).toHaveTextContent(interpolateUiString(UI_STRINGS.appAppAdminUsersPage.roleOptionFull, { role: 'VIEWER' }));
    fireEvent.change(modal.querySelector('#invite-role')!, { target: { value: 'FINANCE_USER' } });
    expect(screen.getByTestId('invite-role-usage')).toHaveTextContent(
      interpolateUiString(UI_STRINGS.appAppAdminUsersPage.roleLimitUsageUnlimited, { active: 3 }),
    );
    fireEvent.change(modal.querySelector('#invite-role')!, { target: { value: 'CLIENT_ADMIN' } });
    expect(screen.queryByTestId('invite-role-usage')).not.toBeInTheDocument();
  });

  it('treats unavailable role usage as unknown and ignores late usage responses', async () => {
    limitsResult = () => Promise.resolve(response({}, false));
    render(<UsersPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/businesses'));
    let modal = await openInvite();
    await waitFor(() => expect(limitCalls()).toHaveLength(1));
    expect(screen.queryByTestId('invite-role-usage')).not.toBeInTheDocument();
    fireEvent.click(modal.querySelector('.modal-header button')!);

    limitsResult = () => Promise.reject(new Error('offline'));
    modal = await openInvite();
    await waitFor(() => expect(limitCalls()).toHaveLength(2));
    expect(screen.queryByTestId('invite-role-usage')).not.toBeInTheDocument();
    fireEvent.click(modal.querySelector('.modal-header button')!);

    let resolveLate: (value: MockResponse) => void = () => undefined;
    limitsResult = () => new Promise((resolve) => { resolveLate = resolve; });
    modal = await openInvite();
    await waitFor(() => expect(limitCalls()).toHaveLength(3));
    fireEvent.click(modal.querySelector('.modal-header button')!);
    resolveLate(response({ roles: [usage('PROJECT_USER', 1, 0)] }));

    let rejectLate: (reason: unknown) => void = () => undefined;
    limitsResult = () => new Promise((_, reject) => { rejectLate = reject; });
    modal = await openInvite();
    await waitFor(() => expect(limitCalls()).toHaveLength(4));
    fireEvent.click(modal.querySelector('.modal-header button')!);
    rejectLate(new Error('late'));
    await Promise.resolve();
    expect(screen.queryByTestId('invite-role-usage')).not.toBeInTheDocument();
  });

  it('lets a Super Admin choose the company from a dropdown of existing companies', async () => {
    directoryResult = Promise.resolve(response(SUPER_DIRECTORY));
    render(<UsersPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/businesses'));
    const modal = await openInvite();
    const company = modal.querySelector<HTMLSelectElement>('#invite-company')!;
    expect(company.tagName).toBe('SELECT');
    expect(company.value).toBe('');
    expect(Array.from(company.options).map((o) => o.textContent)).toEqual([
      UI_STRINGS.appAppAdminUsersPage.selectCompany, 'Procucev Hospitality Demo', 'Procucev Retail Demo',
    ]);
    expect(screen.getByText(UI_STRINGS.appAppAdminUsersPage.companyHelpSuperAdmin)).toBeInTheDocument();
    expect(limitCalls()).toHaveLength(0);

    fireEvent.change(company, { target: { value: 'tenant-2' } });
    await waitFor(() => expect(limitCalls()[0][0]).toBe('/api/admin/businesses/tenant-2/role-limits'));
    fillInvite(modal);
    writeQueue.push(response({ email: 'casey@example.test', tenant: HOSPITALITY }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminUsersPage.createUser) }));
    expect(await screen.findByText(interpolateUiString(UI_STRINGS.appAppAdminUsersPage.userEmailCreatedInCompany, {
      email: 'casey@example.test', company: 'Procucev Hospitality Demo',
    }))).toBeInTheDocument();
    expect(JSON.parse(writeCalls()[0][1].body)).toEqual(expect.objectContaining({ businessId: 'tenant-2' }));
  });

  it('lets a Super Admin create a company and offers it in the invite dropdown', async () => {
    directoryResult = Promise.resolve(response(SUPER_DIRECTORY));
    render(<UsersPage />);
    fireEvent.click(await screen.findByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminUsersPage.createCompany) }));
    fireEvent.click(screen.getByText('mock-close'));
    expect(screen.queryByTestId('create-company-modal')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminUsersPage.createCompany) }));
    fireEvent.click(screen.getByText('mock-create'));
    expect(screen.queryByTestId('create-company-modal')).not.toBeInTheDocument();
    expect(screen.getByText(interpolateUiString(UI_STRINGS.appAppAdminUsersPage.companyCreated, { company: 'Acme Interiors' }))).toBeInTheDocument();
    const modal = await openInvite();
    expect(Array.from(modal.querySelectorAll<HTMLOptionElement>('#invite-company option')).map((o) => o.value)).toEqual([
      '', 'tenant-0', 'tenant-2', 'tenant-1',
    ]);
  });

  it('lists companies for a Super Admin and opens their role limits', async () => {
    directoryResult = Promise.resolve(response(SUPER_DIRECTORY));
    render(<UsersPage />);
    fireEvent.click(await screen.findByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminUsersPage.companies) }));
    expect(screen.getByText('29ABCDE1234F1Z5')).toBeInTheDocument();
    expect(screen.getByText(UI_STRINGS.companyIndustries.hospitality)).toBeInTheDocument();
    expect(screen.getByText('Asha Rao')).toBeInTheDocument();
    expect(screen.getByText('+919845012345')).toBeInTheDocument();
    expect(screen.getAllByText(UI_STRINGS.common.copy4s9bsz).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminUsersPage.createCompany) })).toBeInTheDocument();

    const limitButtons = screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminUsersPage.roleLimits) });
    fireEvent.click(limitButtons[0]);
    expect(screen.getByTestId('role-limits-modal')).toHaveAttribute('data-business', 'tenant-2');
    fireEvent.click(screen.getByText('mock-close'));
    expect(screen.queryByTestId('role-limits-modal')).not.toBeInTheDocument();

    fireEvent.click(limitButtons[1]);
    fireEvent.click(screen.getByText('mock-save'));
    expect(screen.getByText(interpolateUiString(UI_STRINGS.appAppAdminUsersPage.roleLimitsSavedForCompany, { company: 'Procucev Retail Demo' }))).toBeInTheDocument();
    expect(screen.queryByTestId('role-limits-modal')).not.toBeInTheDocument();
  });

  it('shows an empty companies tab when no company is listed', async () => {
    directoryResult = Promise.resolve(response({ canChooseBusiness: true, currentBusiness: null, businesses: [] }));
    render(<UsersPage />);
    fireEvent.click(await screen.findByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminUsersPage.companies) }));
    expect(screen.getByText(UI_STRINGS.appAppAdminUsersPage.noCompaniesFound)).toBeInTheDocument();
  });

  it('still invites users when the business directory cannot be loaded', async () => {
    directoryResult = Promise.resolve(response({}, false));
    render(<UsersPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/businesses'));
    let modal = await openInvite();
    expect(modal.querySelector<HTMLInputElement>('#invite-company')!.value).toBe('');
    fillInvite(modal);
    writeQueue.push(response({ email: 'casey@example.test' }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminUsersPage.createUser) }));
    expect(await screen.findByText(interpolateUiString(UI_STRINGS.appAppAdminUsersPage.userEmailCreatedSuccessfully, {
      email: 'casey@example.test',
    }))).toBeInTheDocument();
    expect(JSON.parse(writeCalls()[0][1].body)).toEqual(expect.objectContaining({ businessId: '' }));
    expect(limitCalls()).toHaveLength(0);

    directoryResult = Promise.reject(new Error('offline'));
    const view = render(<UsersPage />);
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url === '/api/admin/businesses')).toHaveLength(2));
    view.unmount();
    modal = await openInvite();
    expect(modal).toBeInTheDocument();
  });

  it('ignores a business directory that arrives after the page unmounts', async () => {
    let resolveDirectory: (value: MockResponse) => void = () => undefined;
    directoryResult = new Promise((resolve) => { resolveDirectory = resolve; });
    const view = render(<UsersPage />);
    view.unmount();
    resolveDirectory(response(SUPER_DIRECTORY));
    await Promise.resolve();

    let rejectDirectory: (reason: unknown) => void = () => undefined;
    directoryResult = new Promise((_, reject) => { rejectDirectory = reject; });
    const second = render(<UsersPage />);
    second.unmount();
    rejectDirectory(new Error('late'));
    await Promise.resolve();
    expect(listCalls().length).toBeGreaterThan(0);
  });

  it('closes invite dialogs from the close button, cancel button, and backdrop only', async () => {
    const { container } = render(<UsersPage />);
    fireEvent.click(await screen.findByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminUsersPage.inviteUser) }));
    const overlay = container.querySelector('.modal-overlay')!;
    fireEvent.click(screen.getByText(uiStringPattern(UI_STRINGS.appAppAdminUsersPage.inviteNewUser)));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppAdminUsersPage.inviteNewUser))).toBeInTheDocument();
    fireEvent.click(overlay.querySelector('.modal-header button')!);
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppAdminUsersPage.inviteNewUser))).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminUsersPage.inviteUser) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }));
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppAdminUsersPage.inviteNewUser))).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminUsersPage.inviteUser) }));
    fireEvent.click(container.querySelector('.modal-overlay')!);
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppAdminUsersPage.inviteNewUser))).not.toBeInTheDocument();
  });

  it('honors status-change confirmation and reloads after successful updates', async () => {
    listQueue.push(response({ data: users, total: 2 }));
    render(<UsersPage />);
    expect(await screen.findByText('Alice Admin')).toBeInTheDocument();
    const confirmMock = window.confirm as jest.Mock;

    confirmMock.mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminUsersPage.disable) }));
    expect(writeCalls()).toHaveLength(0);

    writeQueue.push(response({}, false));
    confirmMock.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminUsersPage.disable) }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/users/user-1', expect.objectContaining({ method: 'PUT' })));

    writeQueue.push(response({}, true));
    listQueue.push(response({ data: users, total: 2 }));
    confirmMock.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminUsersPage.activate) }));
    await waitFor(() => expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppAdminUsersPage.userEmailIsNowNewStatus))).toBeInTheDocument());
    expect(fetchMock).toHaveBeenLastCalledWith('/api/admin/users?page=1&pageSize=20&search=');
  });
});
