/** @jest-environment jsdom */
import { uiStringPattern } from '@/lib/i18n';

import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import LoginPage from '../src/app/login/page';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


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
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appLoginPage.welcomeBack))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appLoginPage.immutableBaselineGovernance))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appLoginPage.secureEnterpriseProcurementPlatform))).toBeInTheDocument();

    const email = screen.getByLabelText(uiStringPattern(UI_STRINGS.appLoginPage.workEmailOrTestVendorUsername));
    const password = screen.getByLabelText(uiStringPattern(UI_STRINGS.common.password));
    fireEvent.change(email, { target: { value: 'stale@example.com' } });
    fireEvent.change(password, { target: { value: 'secret' } });
    fireEvent.focus(email);
    expect((email as HTMLInputElement).style.borderColor).toBe('rgb(30, 64, 175)');
    fireEvent.blur(email);
    expect((email as HTMLInputElement).style.borderColor).toBe('rgb(203, 213, 225)');
    fireEvent.focus(password);
    fireEvent.blur(password);

    const submit = screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appLoginPage.signIn) });
    fireEvent.mouseOver(submit);
    fireEvent.mouseOut(submit);
    expect((submit as HTMLButtonElement).style.background).toBe('rgb(30, 64, 175)');

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.categoryManager) }));
    expect(email).toHaveValue('category.manager@test.procpx.local');
    expect(password).toHaveValue(UI_STRINGS.appLoginPage.testFixturePassword);
    expect(container.textContent).toContain('Selected: Category Manager');
    fireEvent.change(email, { target: { value: 'changed@example.com' } });
    expect(container.textContent).not.toContain('Selected: Category Manager');

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.procurementUser) }));
    expect(email).toHaveValue('procurement.user@test.procpx.local');
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appLoginPageConstants.testVendorOne) }));
    expect(email).toHaveValue('vendor.one@test.procpx.local');

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appLoginPageConstants.testVendorTwo) }));
    expect(email).toHaveValue('vendor.two@test.procpx.local');
    expect(password).toHaveValue(UI_STRINGS.appLoginPage.testFixturePassword);
    expect(container.textContent).toContain('Selected: Test Vendor Two');

    const forgot = screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appLoginPage.forgotPassword) });
    fireEvent.mouseOver(forgot);
    expect((forgot as HTMLButtonElement).style.textDecoration).toBe('underline');
    fireEvent.mouseOut(forgot);
    expect((forgot as HTMLButtonElement).style.textDecoration).toBe('none');
  });

  it('selects buyer, vendor, and tenant personas from the full demo account dialog', () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appLoginPage.allAccounts) }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(uiStringPattern(UI_STRINGS.appLoginPage.tenantAEnterpriseBuyerPersonas))).toBeInTheDocument();
    expect(within(dialog).getByText(uiStringPattern(UI_STRINGS.appLoginPage.registeredVendorPartnersVendorPortal))).toBeInTheDocument();
    expect(within(dialog).getByText(uiStringPattern(UI_STRINGS.appLoginPage.tenantBHospitalityProjectMultiTenantIsolation))).toBeInTheDocument();

    const buyer = within(dialog).getAllByRole('button', { name: uiStringPattern(UI_STRINGS.common.projectApprover) })[0];
    fireEvent.mouseOver(buyer);
    fireEvent.mouseOut(buyer);
    fireEvent.click(buyer);
    expect(screen.getByLabelText(uiStringPattern(UI_STRINGS.appLoginPage.workEmailOrTestVendorUsername))).toHaveValue('project.approver@test.procpx.local');
    expect(screen.getByLabelText(uiStringPattern(UI_STRINGS.common.password))).toHaveValue(UI_STRINGS.appLoginPage.testFixturePassword);

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appLoginPage.allAccounts) }));
    const vendor = within(screen.getByRole('dialog')).getByRole('button', { name: uiStringPattern(UI_STRINGS.appLoginPageConstants.testVendorOne) });
    fireEvent.mouseOver(vendor);
    fireEvent.mouseOut(vendor);
    fireEvent.click(vendor);
    expect(screen.getByLabelText(uiStringPattern(UI_STRINGS.appLoginPage.workEmailOrTestVendorUsername))).toHaveValue('vendor.one@test.procpx.local');
    expect(screen.getByLabelText(uiStringPattern(UI_STRINGS.common.password))).toHaveValue(UI_STRINGS.appLoginPage.testFixturePassword);

    const explore = screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appLoginPage.exploreAll) });
    fireEvent.mouseOver(explore);
    fireEvent.mouseOut(explore);
    fireEvent.click(explore);
    const tenant = within(screen.getByRole('dialog')).getByRole('button', { name: uiStringPattern(UI_STRINGS.appLoginPageConstants.hospitalityAdmin) });
    fireEvent.mouseOver(tenant);
    fireEvent.mouseOut(tenant);
    fireEvent.click(tenant);
    expect(screen.getByLabelText(uiStringPattern(UI_STRINGS.appLoginPage.workEmailOrTestVendorUsername))).toHaveValue('hospitality.admin@test.procpx.local');
  });

  it('hides local fixture account shortcuts and an open fixture dialog in production', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const { rerender } = render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appLoginPage.allAccounts) }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    try {
      Reflect.set(process.env, 'NODE_ENV', 'production');
      rerender(<LoginPage />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByText(uiStringPattern(UI_STRINGS.appLoginPage.quickTestPersonas))).not.toBeInTheDocument();
    } finally {
      if (originalNodeEnv === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
      else Reflect.set(process.env, 'NODE_ENV', originalNodeEnv);
    }
  });

  it('supports password assistance dialog close, cancel, and backdrop behavior', () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appLoginPage.forgotPassword) }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(uiStringPattern(UI_STRINGS.appLoginPage.passwordAssistance))).toBeInTheDocument();
    fireEvent.click(within(dialog).getByText(/self-service password resets are restricted/));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: uiStringPattern(UI_STRINGS.common.closeDialog) }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appLoginPage.forgotPassword) }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: uiStringPattern(UI_STRINGS.common.closeDialog) }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appLoginPage.forgotPassword) }));
    fireEvent.click(screen.getByRole('dialog'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('signs in buyers and vendors, handling rejected credentials and unexpected errors', async () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(uiStringPattern(UI_STRINGS.appLoginPage.workEmailOrTestVendorUsername)), { target: { value: ' buyer@example.com ' } });
    fireEvent.change(screen.getByLabelText(uiStringPattern(UI_STRINGS.common.password)), { target: { value: 'pw' } });
    signInMock.mockResolvedValueOnce({ error: 'CredentialsSignin' });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appLoginPage.signIn) }));
    await waitFor(() => expect(screen.getByText(uiStringPattern(UI_STRINGS.appLoginPage.invalidWorkEmailOrPasswordPleaseVerifyYourCredentials))).toBeInTheDocument());
    expect(signInMock).toHaveBeenLastCalledWith('credentials', { email: 'buyer@example.com', password: 'pw', redirect: false });

    signInMock.mockResolvedValueOnce({});
    (global.fetch as jest.Mock).mockResolvedValueOnce({ json: async () => ({ user: { role: 'VENDOR' } }) });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appLoginPage.signIn) }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/vendor-portal/dashboard'));
    expect(router.refresh).toHaveBeenCalled();

    signInMock.mockResolvedValueOnce({});
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('session unavailable'));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appLoginPage.signIn) }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/dashboard'));

    signInMock.mockRejectedValueOnce(new Error('network failure'));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appLoginPage.signIn) }));
    await waitFor(() => expect(screen.getByText(uiStringPattern(UI_STRINGS.appLoginPage.anUnexpectedErrorOccurredPleaseTryAgain))).toBeInTheDocument());
  });

  it('shows the loading state while credentials are being checked', async () => {
    let completeSignIn!: (value: {}) => void;
    signInMock.mockReturnValueOnce(new Promise((resolve) => { completeSignIn = resolve; }));
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appLoginPage.signIn) }));
    const submit = screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appLoginPage.signingIn) });
    expect(submit).toBeDisabled();
    const initialBackground = (submit as HTMLButtonElement).style.background;
    fireEvent.mouseOver(submit);
    fireEvent.mouseOut(submit);
    expect((submit as HTMLButtonElement).style.background).toBe(initialBackground);
    completeSignIn({});
    await waitFor(() => expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appLoginPage.signIn) })).toBeEnabled());
  });

  it('closes the demo dialog from its close control and backdrop', () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appLoginPage.allAccounts) }));
    let dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: uiStringPattern(UI_STRINGS.common.closeDialog) }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appLoginPage.allAccounts) }));
    dialog = screen.getByRole('dialog');
    fireEvent.click(dialog);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
