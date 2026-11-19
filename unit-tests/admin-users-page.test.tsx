/** @jest-environment jsdom */
import { interpolateUiString, uiStringPattern } from '@/lib/i18n';

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import UsersPage from '../src/app/(app)/admin/users/page';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


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
const HOSPITALITY = { id: 'tenant-2', name: 'Procucev Hospitality Demo' };
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
  fireEvent.change(modal.querySelector('select')!, { target: { value: 'FINANCE_USER' } });
  fireEvent.change(modal.querySelector('input[type="password"]')!, { target: { value: 'temporary-password' } });
}

describe('admin users page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    directoryResult = Promise.resolve(response(CLIENT_DIRECTORY));
    listQueue = [];
    writeQueue = [];
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/admin/businesses') return directoryResult;
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
    const modal = await openInvite();
    const company = modal.querySelector<HTMLInputElement>('#invite-company')!;
    await waitFor(() => expect(company.value).toBe('Procucev Retail Demo'));
    expect(company.readOnly).toBe(true);
    expect(screen.getByText(UI_STRINGS.appAppAdminUsersPage.companyHelpLocked)).toBeInTheDocument();
    expect(modal.querySelector('datalist')).toBeNull();

    fillInvite(modal);
    writeQueue.push(response({ error: 'Email already exists' }, false));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminUsersPage.createUser) }));
    expect(await screen.findByText('Email already exists')).toBeInTheDocument();
    expect(JSON.parse(writeCalls()[0][1].body)).toEqual({
      email: 'casey@example.test', name: 'Casey Creator', role: 'FINANCE_USER', password: 'temporary-password', companyName: 'Procucev Retail Demo',
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

  it('lets a Super Admin pick an existing business or name a new one', async () => {
    directoryResult = Promise.resolve(response(SUPER_DIRECTORY));
    render(<UsersPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/businesses'));
    const modal = await openInvite();
    const company = modal.querySelector<HTMLInputElement>('#invite-company')!;
    await waitFor(() => expect(company.value).toBe('Procucev Retail Demo'));
    expect(company.readOnly).toBe(false);
    expect(Array.from(modal.querySelectorAll('datalist option')).map((o) => o.getAttribute('value'))).toEqual([
      'Procucev Hospitality Demo', 'Procucev Retail Demo',
    ]);
    expect(screen.getByText(UI_STRINGS.appAppAdminUsersPage.companyHelpSuperAdmin)).toBeInTheDocument();

    fireEvent.change(company, { target: { value: ' procucev hospitality DEMO ' } });
    expect(screen.getByTestId('invite-company-outcome')).toHaveTextContent(
      interpolateUiString(UI_STRINGS.appAppAdminUsersPage.existingBusinessWillBeUsed, { name: 'Procucev Hospitality Demo' }),
    );
    fireEvent.change(company, { target: { value: '  Acme   Interiors ' } });
    expect(screen.getByTestId('invite-company-outcome')).toHaveTextContent(
      interpolateUiString(UI_STRINGS.appAppAdminUsersPage.newBusinessWillBeCreated, { name: 'Acme Interiors' }),
    );
    fireEvent.change(company, { target: { value: '   ' } });
    expect(screen.queryByTestId('invite-company-outcome')).not.toBeInTheDocument();
    fireEvent.change(company, { target: { value: 'Acme Interiors' } });

    fillInvite(modal);
    writeQueue.push(response({ email: 'casey@example.test', tenant: { id: 'tenant-3', name: 'Acme Interiors' } }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminUsersPage.createUser) }));
    expect(await screen.findByText(interpolateUiString(UI_STRINGS.appAppAdminUsersPage.userEmailCreatedInCompany, {
      email: 'casey@example.test', company: 'Acme Interiors',
    }))).toBeInTheDocument();
    expect(JSON.parse(writeCalls()[0][1].body)).toEqual(expect.objectContaining({ companyName: 'Acme Interiors' }));

    // The newly created business is offered immediately for the next invite.
    const next = await openInvite();
    expect(Array.from(next.querySelectorAll('datalist option')).map((o) => o.getAttribute('value'))).toContain('Acme Interiors');

    // Linking to an already-listed business does not duplicate it.
    fireEvent.change(next.querySelector('#invite-company')!, { target: { value: 'Procucev Hospitality Demo' } });
    fillInvite(next);
    writeQueue.push(response({ email: 'casey@example.test', tenant: HOSPITALITY }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminUsersPage.createUser) }));
    expect(await screen.findByText(interpolateUiString(UI_STRINGS.appAppAdminUsersPage.userEmailCreatedInCompany, {
      email: 'casey@example.test', company: 'Procucev Hospitality Demo',
    }))).toBeInTheDocument();
    const last = await openInvite();
    expect(last.querySelectorAll('datalist option')).toHaveLength(3);
  });

  it('still invites users when the business directory cannot be loaded', async () => {
    directoryResult = Promise.resolve(response({}, false));
    render(<UsersPage />);
    let modal = await openInvite();
    expect(modal.querySelector<HTMLInputElement>('#invite-company')!.value).toBe('');
    fillInvite(modal);
    writeQueue.push(response({ email: 'casey@example.test' }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminUsersPage.createUser) }));
    expect(await screen.findByText(interpolateUiString(UI_STRINGS.appAppAdminUsersPage.userEmailCreatedSuccessfully, {
      email: 'casey@example.test',
    }))).toBeInTheDocument();
    expect(JSON.parse(writeCalls()[0][1].body)).toEqual(expect.objectContaining({ companyName: '' }));

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
