/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import LoginPage from '../src/app/login/page';

jest.mock('next-auth/react', () => ({ signIn: jest.fn() }));
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));

const signInMock = signIn as jest.Mock;
const router = { push: jest.fn(), refresh: jest.fn() };

describe('login page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(router);
    signInMock.mockResolvedValue({});
    global.fetch = jest.fn().mockResolvedValue({ json: async () => ({ user: { role: 'BUYER' } }) }) as jest.Mock;
  });

  it('renders the authentication experience and exercises input, hover, and quick persona behavior', () => {
    const { container } = render(<LoginPage />);
    expect(screen.getByText('Welcome back')).toBeInTheDocument();
    expect(screen.getByText('Immutable Baseline Governance')).toBeInTheDocument();
    expect(screen.getByText('Secure Enterprise Procurement Platform')).toBeInTheDocument();

    const email = screen.getByLabelText('Work Email or Test Vendor Username');
    const password = screen.getByLabelText('Password');
    fireEvent.change(email, { target: { value: 'stale@example.com' } });
    fireEvent.change(password, { target: { value: 'secret' } });
    fireEvent.focus(email);
    expect((email as HTMLInputElement).style.borderColor).toBe('rgb(30, 64, 175)');
    fireEvent.blur(email);
    expect((email as HTMLInputElement).style.borderColor).toBe('rgb(203, 213, 225)');
    fireEvent.focus(password);
    fireEvent.blur(password);

    const submit = screen.getByRole('button', { name: 'Sign In' });
    fireEvent.mouseOver(submit);
    fireEvent.mouseOut(submit);
    expect((submit as HTMLButtonElement).style.background).toBe('rgb(30, 64, 175)');

    fireEvent.click(screen.getByRole('button', { name: 'Category Manager' }));
    expect(email).toHaveValue('category.manager@procucev-demo.local');
    expect(password).toHaveValue('Demo@1234');
    expect(container.textContent).toContain('Selected: Category Manager');
    fireEvent.change(email, { target: { value: 'changed@example.com' } });
    expect(container.textContent).not.toContain('Selected: Category Manager');

    fireEvent.click(screen.getByRole('button', { name: 'Procurement User' }));
    expect(email).toHaveValue('procurement.user@procucev-demo.local');
    fireEvent.click(screen.getByRole('button', { name: 'Vendor: Apex Infra' }));
    expect(email).toHaveValue('vendor.apex@apex-infra.com');

    fireEvent.click(screen.getByRole('button', { name: 'Vendor: BluePeak' }));
    expect(email).toHaveValue('bluepeak.engineering@vendor.procpx.local');
    expect(password).toHaveValue('welcome');
    expect(container.textContent).toContain('Selected: Vendor: BluePeak');

    const forgot = screen.getByRole('button', { name: 'Forgot password?' });
    fireEvent.mouseOver(forgot);
    expect((forgot as HTMLButtonElement).style.textDecoration).toBe('underline');
    fireEvent.mouseOut(forgot);
    expect((forgot as HTMLButtonElement).style.textDecoration).toBe('none');
  });

  it('selects buyer, vendor, and tenant personas from the full demo account dialog', () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: /All Accounts/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Tenant A: Enterprise Buyer Personas')).toBeInTheDocument();
    expect(within(dialog).getByText('Registered Vendor Partners (Vendor Portal)')).toBeInTheDocument();
    expect(within(dialog).getByText('Tenant B: Hospitality Project (Multi-Tenant Isolation)')).toBeInTheDocument();

    const buyer = within(dialog).getAllByRole('button', { name: /Project Approver/ })[0];
    fireEvent.mouseOver(buyer);
    fireEvent.mouseOut(buyer);
    fireEvent.click(buyer);
    expect(screen.getByLabelText('Work Email or Test Vendor Username')).toHaveValue('project.approver@procucev-demo.local');
    expect(screen.getByLabelText('Password')).toHaveValue('Demo@1234');

    fireEvent.click(screen.getByRole('button', { name: /All Accounts/ }));
    const vendor = within(screen.getByRole('dialog')).getByRole('button', { name: /Apex Infrastructure/ });
    fireEvent.mouseOver(vendor);
    fireEvent.mouseOut(vendor);
    fireEvent.click(vendor);
    expect(screen.getByLabelText('Work Email or Test Vendor Username')).toHaveValue('vendor.apex@apex-infra.com');
    expect(screen.getByLabelText('Password')).toHaveValue('Demo@1234');

    const explore = screen.getByRole('button', { name: /Explore All/ });
    fireEvent.mouseOver(explore);
    fireEvent.mouseOut(explore);
    fireEvent.click(explore);
    const tenant = within(screen.getByRole('dialog')).getByRole('button', { name: /Hospitality Admin/ });
    fireEvent.mouseOver(tenant);
    fireEvent.mouseOut(tenant);
    fireEvent.click(tenant);
    expect(screen.getByLabelText('Work Email or Test Vendor Username')).toHaveValue('hospitality.admin@procucev-demo.local');
  });

  it('supports password assistance dialog close, cancel, and backdrop behavior', () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Password Assistance')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByText(/self-service password resets are restricted/));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close dialog' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    fireEvent.click(screen.getByRole('button', { name: /^Close$/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    fireEvent.click(screen.getByRole('dialog'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('signs in buyers and vendors, handling rejected credentials and unexpected errors', async () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Work Email or Test Vendor Username'), { target: { value: ' buyer@example.com ' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } });
    signInMock.mockResolvedValueOnce({ error: 'CredentialsSignin' });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    await waitFor(() => expect(screen.getByText('Invalid work email or password. Please verify your credentials.')).toBeInTheDocument());
    expect(signInMock).toHaveBeenLastCalledWith('credentials', { email: 'buyer@example.com', password: 'pw', redirect: false });

    signInMock.mockResolvedValueOnce({});
    (global.fetch as jest.Mock).mockResolvedValueOnce({ json: async () => ({ user: { role: 'VENDOR' } }) });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/vendor-portal/dashboard'));
    expect(router.refresh).toHaveBeenCalled();

    signInMock.mockResolvedValueOnce({});
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('session unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/dashboard'));

    signInMock.mockRejectedValueOnce(new Error('network failure'));
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    await waitFor(() => expect(screen.getByText('An unexpected error occurred. Please try again.')).toBeInTheDocument());
  });

  it('shows the loading state while credentials are being checked', async () => {
    let completeSignIn!: (value: {}) => void;
    signInMock.mockReturnValueOnce(new Promise((resolve) => { completeSignIn = resolve; }));
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    const submit = screen.getByRole('button', { name: 'Signing in...' });
    expect(submit).toBeDisabled();
    const initialBackground = (submit as HTMLButtonElement).style.background;
    fireEvent.mouseOver(submit);
    fireEvent.mouseOut(submit);
    expect((submit as HTMLButtonElement).style.background).toBe(initialBackground);
    completeSignIn({});
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign In' })).toBeEnabled());
  });

  it('closes the demo dialog from its close control and backdrop', () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: /All Accounts/ }));
    let dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close dialog' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /All Accounts/ }));
    dialog = screen.getByRole('dialog');
    fireEvent.click(dialog);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
