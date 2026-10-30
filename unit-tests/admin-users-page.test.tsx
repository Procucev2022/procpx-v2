/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import UsersPage from '../src/app/(app)/admin/users/page';

jest.mock('../src/components/ui/PageHeader', () => ({
  __esModule: true,
  default: ({ title, subtitle, actions }: { title: string; subtitle: string; actions?: React.ReactNode }) => (
    <header><h1>{title}</h1><p>{subtitle}</p>{actions}</header>
  ),
}));

const fetchMock = jest.fn();
const originalFetch = global.fetch;
const originalConfirm = window.confirm;
const response = (body: unknown, ok = true) => ({ ok, json: jest.fn().mockResolvedValue(body) });
const users = [
  { id: 'user-1', name: 'Alice Admin', email: 'alice@example.test', role: 'PROJECT_APPROVER', status: 'ACTIVE', lastLoginAt: '2026-10-01T10:00:00.000Z', createdAt: '2026-01-01T10:00:00.000Z' },
  { id: 'user-2', name: 'Bob Buyer', email: 'bob@example.test', role: 'FINANCE_USER', status: 'INACTIVE', lastLoginAt: null, createdAt: '2026-02-01T10:00:00.000Z' },
];

describe('admin users page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    window.confirm = jest.fn().mockReturnValue(true);
    fetchMock.mockResolvedValue(response({ data: [], total: 0 }));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    window.confirm = originalConfirm;
  });

  it('shows loading, empty results, and the complete permission matrix tab', async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => undefined));
    const view = render(<UsersPage />);
    expect(screen.getByText('Loading users...')).toBeInTheDocument();
    view.unmount();

    render(<UsersPage />);
    expect(await screen.findByText('No users found')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Role & Permission Matrix' }));
    expect(screen.getByText('RBAC Permission Mapping Matrix')).toBeInTheDocument();
    expect(screen.getByText('PROJECT_VIEW')).toBeInTheDocument();
    expect(screen.getByText('AUDIT_VIEW')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Invite User' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tenant Users/ }));
    expect(screen.getByRole('button', { name: 'Invite User' })).toBeInTheDocument();
  });

  it('renders user status and dates, paginates, and filters by encoded search text', async () => {
    fetchMock.mockResolvedValueOnce(response({ data: users, total: 45 }));
    render(<UsersPage />);
    expect(await screen.findByText('Alice Admin')).toBeInTheDocument();
    expect(screen.getByText('PROJECT APPROVER')).toBeInTheDocument();
    expect(screen.getByText('Never')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();

    const pageButtons = document.querySelectorAll<HTMLButtonElement>('.page-btn');
    expect(pageButtons[0].disabled).toBe(true);
    fireEvent.click(pageButtons[1]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('page=2')));
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();

    const search = screen.getByPlaceholderText('Search by name or email...');
    fireEvent.change(search, { target: { value: 'alice & bob' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('search=alice%20%26%20bob')));
  });

  it('creates users, displays API errors, resets the form, and dismisses success notices', async () => {
    render(<UsersPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Invite User' }));
    expect(screen.getByText('Invite New User')).toBeInTheDocument();

    const modal = screen.getByText('Invite New User').closest('.modal')!;
    const [fullName, email] = modal.querySelectorAll<HTMLInputElement>('input');
    fireEvent.change(fullName, { target: { value: 'Casey Creator' } });
    fireEvent.change(email, { target: { value: 'casey@example.test' } });
    fireEvent.change(modal.querySelector('select')!, { target: { value: 'FINANCE_USER' } });
    fireEvent.change(modal.querySelector('input[type="password"]')!, { target: { value: 'temporary-password' } });

    fetchMock.mockResolvedValueOnce(response({ error: 'Email already exists' }, false));
    fireEvent.click(screen.getByRole('button', { name: 'Create User' }));
    expect(await screen.findByText('Email already exists')).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(response({ email: 'casey@example.test' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create User' }));
    expect(await screen.findByText('User casey@example.test created successfully.')).toBeInTheDocument();
    expect(screen.queryByText('Invite New User')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/admin/users?page=1&pageSize=20&search=');

    const success = screen.getByText('User casey@example.test created successfully.');
    fireEvent.click(success.parentElement!.querySelector('button')!);
    expect(screen.queryByText('User casey@example.test created successfully.')).not.toBeInTheDocument();
  });

  it('closes invite dialogs from the close button, cancel button, and backdrop only', async () => {
    const { container } = render(<UsersPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Invite User' }));
    const overlay = container.querySelector('.modal-overlay')!;
    fireEvent.click(screen.getByText('Invite New User'));
    expect(screen.getByText('Invite New User')).toBeInTheDocument();
    fireEvent.click(overlay.querySelector('.modal-header button')!);
    expect(screen.queryByText('Invite New User')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Invite User' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Invite New User')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Invite User' }));
    fireEvent.click(container.querySelector('.modal-overlay')!);
    expect(screen.queryByText('Invite New User')).not.toBeInTheDocument();
  });

  it('honors status-change confirmation and reloads after successful updates', async () => {
    fetchMock.mockResolvedValueOnce(response({ data: users, total: 2 }));
    render(<UsersPage />);
    expect(await screen.findByText('Alice Admin')).toBeInTheDocument();
    const confirmMock = window.confirm as jest.Mock;

    confirmMock.mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(response({}, false));
    confirmMock.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/users/user-1', expect.objectContaining({ method: 'PUT' })));

    fetchMock.mockResolvedValueOnce(response({}, true));
    fetchMock.mockResolvedValueOnce(response({ data: users, total: 2 }));
    confirmMock.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));
    await waitFor(() => expect(screen.getByText('User bob@example.test is now ACTIVE.')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenLastCalledWith('/api/admin/users?page=1&pageSize=20&search=');
  });
});
