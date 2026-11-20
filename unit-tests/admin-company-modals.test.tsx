/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CreateCompanyModal from '../src/components/admin/CreateCompanyModal';
import RoleLimitsModal from '../src/components/admin/RoleLimitsModal';
import RoleLimitFields from '../src/components/admin/RoleLimitFields';
import { ASSIGNABLE_USER_ROLES } from '../src/app/api/admin/users/route.constants';
import { INDUSTRY_OPTIONS } from '../src/lib/business-directory.constants';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString, uiStringPattern } from '@/lib/i18n';

type MockResponse = { ok: boolean; json: jest.Mock };
const fetchMock = jest.fn();
const originalFetch = global.fetch;
const response = (body: unknown, ok = true): MockResponse => ({ ok, json: jest.fn().mockResolvedValue(body) });
const STRINGS = UI_STRINGS.appAppAdminUsersPage;
const ACME = { id: 'tenant-9', name: 'Acme Interiors' };
const GSTIN = '29ABCDE1234F1Z5';
const ERROR_TEXT = 'GST already used';

const byId = (id: string) => document.getElementById(id) as HTMLInputElement;
const change = (id: string, value: string) => fireEvent.change(byId(id), { target: { value } });

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('RoleLimitFields', () => {
  it('renders one input per assignable role with optional usage text', () => {
    const onChange = jest.fn();
    render(
      <RoleLimitFields
        values={{ VIEWER: '2' }}
        usage={[{ role: 'VIEWER', maxUsers: 2, activeUsers: 1 }, { role: 'PROJECT_USER', maxUsers: null, activeUsers: 4 }]}
        onChange={onChange}
      />,
    );
    expect(screen.getAllByRole('spinbutton')).toHaveLength(ASSIGNABLE_USER_ROLES.length);
    expect(screen.getByTestId('role-limit-VIEWER')).toHaveValue(2);
    expect(screen.getByTestId('role-limit-CLIENT_ADMIN')).toHaveValue(null);
    expect(screen.getByText(interpolateUiString(STRINGS.roleLimitUsage, { active: 1, max: 2 }))).toBeInTheDocument();
    expect(screen.getByText(interpolateUiString(STRINGS.roleLimitUsageUnlimited, { active: 4 }))).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('role-limit-CLIENT_ADMIN'), { target: { value: '1' } });
    expect(onChange).toHaveBeenCalledWith('CLIENT_ADMIN', '1');
  });
});

describe('CreateCompanyModal', () => {
  function fillRequired() {
    change('company-name', 'Acme Interiors');
    change('company-gst', GSTIN);
    change('company-address', '12 MG Road');
  }

  it('posts the company profile with role limits and reports the created company', async () => {
    const onCreated = jest.fn();
    render(<CreateCompanyModal onClose={jest.fn()} onCreated={onCreated} />);
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      STRINGS.selectIndustry, ...INDUSTRY_OPTIONS.map((option) => option.label),
    ]);
    fillRequired();
    change('company-pincode', '560001');
    change('company-pan', 'ABCDE1234F');
    change('company-industry', 'RETAIL');
    change('company-contact-name', 'Asha Rao');
    change('company-contact-phone', '+91 9845012345');
    fireEvent.change(screen.getByTestId('role-limit-CLIENT_ADMIN'), { target: { value: '1' } });
    const created = { ...ACME, gstNumber: GSTIN };
    fetchMock.mockResolvedValueOnce(response(created));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(STRINGS.createCompany) }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/businesses', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      name: 'Acme Interiors', gstNumber: GSTIN, address: '12 MG Road', pincode: '560001', panNumber: 'ABCDE1234F',
      industry: 'RETAIL', contactPersonName: 'Asha Rao', contactPhone: '+91 9845012345', roleLimits: { CLIENT_ADMIN: '1' },
    });
  });

  it('shows API, fallback and network errors without closing', async () => {
    const onCreated = jest.fn();
    render(<CreateCompanyModal onClose={jest.fn()} onCreated={onCreated} />);
    fillRequired();
    const submit = screen.getByRole('button', { name: uiStringPattern(STRINGS.createCompany) });

    fetchMock.mockResolvedValueOnce(response({ error: ERROR_TEXT }, false));
    fireEvent.click(submit);
    expect(await screen.findByText(ERROR_TEXT)).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(response({}, false));
    fireEvent.click(submit);
    expect(await screen.findByText(STRINGS.requestFailed)).toBeInTheDocument();

    fetchMock.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(submit);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(await screen.findByText(STRINGS.requestFailed)).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('closes from the close button, cancel button and backdrop only', () => {
    const onClose = jest.fn();
    const { container } = render(<CreateCompanyModal onClose={onClose} onCreated={jest.fn()} />);
    fireEvent.click(screen.getByText(STRINGS.createCompanyAccount));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector('.modal-header button')!);
    fireEvent.click(container.querySelector('.modal-footer .btn-secondary')!);
    fireEvent.click(container.querySelector('.modal-overlay')!);
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});

describe('RoleLimitsModal', () => {
  const roles = [{ role: 'VIEWER', maxUsers: 2, activeUsers: 1 }, { role: 'PROJECT_USER', maxUsers: null, activeUsers: 0 }];

  it('loads current limits, saves edits and reports the result', async () => {
    const onSaved = jest.fn();
    fetchMock.mockResolvedValueOnce(response({ businessId: ACME.id, businessName: ACME.name, roles }));
    render(<RoleLimitsModal business={ACME} onClose={jest.fn()} onSaved={onSaved} />);
    expect(screen.getByText(interpolateUiString(STRINGS.roleLimitsForCompany, { company: ACME.name }))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(STRINGS.loadingRoleLimits))).toBeInTheDocument();
    expect(await screen.findByTestId('role-limit-VIEWER')).toHaveValue(2);
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/businesses/tenant-9/role-limits');

    fireEvent.change(screen.getByTestId('role-limit-PROJECT_USER'), { target: { value: '3' } });
    const saved = { businessId: ACME.id, businessName: ACME.name, roles };
    fetchMock.mockResolvedValueOnce(response(saved));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(STRINGS.saveRoleLimits) }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ limits: { VIEWER: '2', PROJECT_USER: '3' } });
    expect(fetchMock.mock.calls[1][1].method).toBe('PUT');
  });

  it('shows load and save errors', async () => {
    const onSaved = jest.fn();
    fetchMock.mockResolvedValueOnce(response({}, false));
    const first = render(<RoleLimitsModal business={ACME} onClose={jest.fn()} onSaved={onSaved} />);
    expect(await screen.findByText(STRINGS.couldNotLoadRoleLimits)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: uiStringPattern(STRINGS.saveRoleLimits) })).toBeDisabled();
    first.unmount();

    fetchMock.mockResolvedValueOnce(response({ roles }));
    render(<RoleLimitsModal business={ACME} onClose={jest.fn()} onSaved={onSaved} />);
    await screen.findByTestId('role-limit-VIEWER');
    const save = screen.getByRole('button', { name: uiStringPattern(STRINGS.saveRoleLimits) });

    fetchMock.mockResolvedValueOnce(response({ error: ERROR_TEXT }, false));
    fireEvent.click(save);
    expect(await screen.findByText(ERROR_TEXT)).toBeInTheDocument();
    fetchMock.mockResolvedValueOnce(response({}, false));
    fireEvent.click(save);
    expect(await screen.findByText(STRINGS.requestFailed)).toBeInTheDocument();
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(save);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    expect(await screen.findByText(STRINGS.requestFailed)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('ignores responses that arrive after closing and closes only from its controls', async () => {
    let resolveLate: (value: MockResponse) => void = () => undefined;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => { resolveLate = resolve; }));
    const late = render(<RoleLimitsModal business={ACME} onClose={jest.fn()} onSaved={jest.fn()} />);
    late.unmount();
    resolveLate(response({ roles }));

    let rejectLate: (reason: unknown) => void = () => undefined;
    fetchMock.mockReturnValueOnce(new Promise((_, reject) => { rejectLate = reject; }));
    const lateError = render(<RoleLimitsModal business={ACME} onClose={jest.fn()} onSaved={jest.fn()} />);
    lateError.unmount();
    rejectLate(new Error('late'));
    await Promise.resolve();

    const onClose = jest.fn();
    fetchMock.mockResolvedValueOnce(response({ roles }));
    const { container } = render(<RoleLimitsModal business={ACME} onClose={onClose} onSaved={jest.fn()} />);
    await screen.findByTestId('role-limit-VIEWER');
    fireEvent.click(screen.getByText(interpolateUiString(STRINGS.roleLimitsForCompany, { company: ACME.name })));
    fireEvent.click(container.querySelector('.modal-header button')!);
    fireEvent.click(container.querySelector('.modal-footer .btn-secondary')!);
    fireEvent.click(container.querySelector('.modal-overlay')!);
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
