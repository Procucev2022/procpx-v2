/** @jest-environment jsdom */
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import VendorPortalDashboardPage from '../src/app/(app)/vendor-portal/dashboard/page';

jest.mock('../src/components/VendorSourcingDashboard', () => ({
  __esModule: true,
  default: (props: { vendorId: string; vendorName: string; vendorCode: string }) => (
    <div data-testid="vendor-dashboard">{`${props.vendorId}:${props.vendorName}:${props.vendorCode}`}</div>
  ),
}));

describe('vendor portal dashboard page', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('shows a loading state while the profile request is pending, then renders the vendor dashboard', async () => {
    let resolveFetch!: (value: unknown) => void;
    (global.fetch as jest.Mock).mockReturnValue(new Promise(resolve => { resolveFetch = resolve; }));
    render(<VendorPortalDashboardPage />);
    expect(screen.getByText('Loading Vendor Portal Dashboard...')).toBeInTheDocument();

    await act(async () => resolveFetch({ ok: true, json: async () => ({ vendor: { id: 'vendor-1', name: 'Acme', code: 'AC' } }) }));
    expect(screen.getByTestId('vendor-dashboard')).toHaveTextContent('vendor-1:Acme:AC');
    expect(global.fetch).toHaveBeenCalledWith('/api/vendor-portal/me');
  });

  it('shows the API error when the vendor profile request fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Vendor account is disabled' }),
    });
    render(<VendorPortalDashboardPage />);
    expect(await screen.findByText('Vendor account is disabled')).toBeInTheDocument();
    expect(screen.getByText('Vendor Access Restricted')).toBeInTheDocument();
  });

  it('uses the generic HTTP failure message if an error response has no JSON body', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, json: async () => { throw new Error('invalid JSON'); } });
    render(<VendorPortalDashboardPage />);
    expect(await screen.findByText('Failed to load vendor portal')).toBeInTheDocument();
  });

  it('shows a contact message when the API returns no active vendor', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ vendor: null }) });
    render(<VendorPortalDashboardPage />);
    expect(await screen.findByText(/No active vendor record linked/)).toBeInTheDocument();
  });

  it('displays a fetch failure message', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network unavailable'));
    render(<VendorPortalDashboardPage />);
    expect(await screen.findByText('Network unavailable')).toBeInTheDocument();
  });
});
