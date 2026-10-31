/** @jest-environment jsdom */
import { uiStringPattern } from '@/lib/i18n';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import VendorProfileSelfServicePage from '../src/app/(app)/vendor-portal/profile/page';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


const mockSuccess = jest.fn();
jest.mock('../src/components/ui/Toast', () => ({ useToast: () => ({ success: mockSuccess }) }));

const originalFetch = global.fetch;
const mockFetch = jest.fn();

function vendor(overrides: Record<string, unknown> = {}) {
  return {
    id: 'vendor-1',
    name: 'Acme Build Co',
    code: 'ACME',
    onboardingStatus: 'VERIFIED',
    tenant: { name: 'Northwind' },
    categories: 'Civil, Electrical',
    email: 'vendor@example.test',
    contactPerson: 'Ada Vendor',
    phone: '+91 98765 43210',
    website: 'https://acme.example.test',
    address: '12 Main Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    country: 'India',
    operatingLocation: 'South India',
    capabilities: 'Fitout and civil works',
    serviceCoverage: 'South region',
    clientReferences: 'Northwind stores',
    certifications: 'ISO 9001',
    documents: 'certificates.pdf',
    legalStructure: 'Private Limited Company',
    gstin: '29AAACA1234A1Z5',
    pan: 'AAACA1234A',
    experienceYears: 12,
    turnoverCrores: 45.5,
    ...overrides,
  };
}

function response(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

function form() {
  return document.querySelector('form')!;
}

describe('vendor portal profile page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue(response({ vendor: vendor() }));
    global.fetch = mockFetch as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('shows the loading state, loads profile details, and displays editable fields', async () => {
    let resolveRequest!: (value: ReturnType<typeof response>) => void;
    mockFetch.mockReturnValueOnce(new Promise((resolve) => { resolveRequest = resolve; }));
    render(<VendorProfileSelfServicePage />);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppVendorPortalProfilePage.loadingCompanyProfile))).toBeInTheDocument();

    await act(async () => resolveRequest(response({ vendor: vendor() })));
    expect(await screen.findByRole('heading', { name: 'Acme Build Co' })).toBeInTheDocument();
    expect(screen.getByText('ACME')).toBeInTheDocument();
    expect(screen.getByText('VERIFIED')).toBeInTheDocument();
    expect(screen.getByText('Northwind')).toBeInTheDocument();
    expect((document.querySelector('[name="legalStructure"]') as HTMLSelectElement).value).toBe(UI_STRINGS.appAppVendorPortalProfilePage.privateLimitedCompany);
    expect((document.querySelector('[name="experienceYears"]') as HTMLInputElement).value).toBe('12');
    expect((document.querySelector('[name="turnoverCrores"]') as HTMLInputElement).value).toBe('45.5');

    const values: Record<string, string> = {
      legalStructure: 'Partnership Firm', gstin: '27TEST1234A1Z5', pan: 'TESTA1234A', website: 'https://new.example.test',
      contactPerson: 'Grace Vendor', phone: '+91 99999 88888', address: '99 Park Street', city: 'Pune', state: 'Maharashtra',
      operatingLocation: 'West region', experienceYears: '18', turnoverCrores: '70.25', capabilities: 'Electrical and HVAC',
      clientReferences: 'Three retail chains', certifications: 'ISO 14001',
    };
    for (const [name, value] of Object.entries(values)) {
      fireEvent.change(document.querySelector(`[name="${name}"]`)!, { target: { value } });
    }
    expect((document.querySelector('[name="contactPerson"]') as HTMLInputElement).value).toBe('Grace Vendor');
    expect((document.querySelector('[name="certifications"]') as HTMLTextAreaElement).value).toBe('ISO 14001');
    expect((screen.getByDisplayValue('vendor@example.test') as HTMLInputElement).disabled).toBe(true);
  });

  it('uses defaults for missing profile values and falls back when loading fails', async () => {
    mockFetch.mockResolvedValueOnce(response({ vendor: vendor({
      code: null, onboardingStatus: null, tenant: null, categories: null, email: null,
      contactPerson: null, phone: '', website: null, address: null, city: null, state: null, country: '',
      operatingLocation: null, capabilities: null, serviceCoverage: null, clientReferences: null,
      certifications: null, documents: null, legalStructure: null, gstin: null, pan: null,
      experienceYears: null, turnoverCrores: null,
    }) }));
    const { unmount } = render(<VendorProfileSelfServicePage />);
    expect(await screen.findByRole('heading', { name: 'Acme Build Co' })).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.aCTIVE))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.enterpriseClient))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppVendorPortalProfilePage.generalContractingSourcing))).toBeInTheDocument();
    expect((document.querySelector('[name="experienceYears"]') as HTMLInputElement).value).toBe('');
    expect((document.querySelector('[name="turnoverCrores"]') as HTMLInputElement).value).toBe('');
    unmount();

    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Profile access denied' }) });
    render(<VendorProfileSelfServicePage />);
    expect(await screen.findByText('Profile access denied')).toBeInTheDocument();
  });

  it('reports fallback load errors and tolerates a failed current profile request', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => { throw new Error('not json'); } });
    const { unmount } = render(<VendorProfileSelfServicePage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.failedToLoadCompanyProfile))).toBeInTheDocument();
    unmount();

    mockFetch.mockRejectedValueOnce(new Error('profile service offline'));
    render(<VendorProfileSelfServicePage />);
    expect(await screen.findByText('profile service offline')).toBeInTheDocument();
  });

  it('saves profile edits and reports success with or without a vendor code', async () => {
    const { unmount } = render(<VendorProfileSelfServicePage />);
    await screen.findByRole('heading', { name: 'Acme Build Co' });
    fireEvent.change(document.querySelector('[name="city"]')!, { target: { value: 'Chennai' } });
    mockFetch.mockImplementation((url: string, init?: RequestInit) => init?.method === 'PATCH'
      ? Promise.resolve(response({ vendor: vendor({ code: 'ACME-UPDATED' }) }))
      : Promise.resolve(response({ vendor: vendor() })));
    fireEvent.submit(form());
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppVendorPortalProfilePage.vendorDetailsSubmittedSuccessfully))).toBeInTheDocument();
    expect(mockSuccess).toHaveBeenCalledWith(UI_STRINGS.appAppVendorPortalProfilePage.vendorDetailsSubmittedSuccessfully, 'ACME-UPDATED');
    const patch = mockFetch.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(patch![1].body)).toMatchObject({ city: 'Chennai', contactPerson: 'Ada Vendor' });
    unmount();

    mockFetch.mockImplementation((url: string, init?: RequestInit) => init?.method === 'PATCH'
      ? Promise.resolve(response({ vendor: { ...vendor(), code: undefined } }))
      : Promise.resolve(response({ vendor: vendor() })));
    render(<VendorProfileSelfServicePage />);
    await screen.findByRole('heading', { name: 'Acme Build Co' });
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.appAppVendorPortalProfilePage.saveProfileChanges) })[0]);
    await waitFor(() => expect(mockSuccess).toHaveBeenLastCalledWith(UI_STRINGS.appAppVendorPortalProfilePage.vendorDetailsSubmittedSuccessfully, undefined));
  });

  it('shows API and network errors when saving', async () => {
    render(<VendorProfileSelfServicePage />);
    await screen.findByRole('heading', { name: 'Acme Build Co' });
    mockFetch.mockImplementation((url: string, init?: RequestInit) => init?.method === 'PATCH'
      ? Promise.resolve(response({ error: 'Vendor record is locked' }, false, 409))
      : Promise.resolve(response({ vendor: vendor() })));
    fireEvent.submit(form());
    expect(await screen.findByText('Vendor record is locked')).toBeInTheDocument();

    mockFetch.mockImplementation((url: string, init?: RequestInit) => init?.method === 'PATCH'
      ? Promise.resolve({ ok: false, json: async () => { throw new Error('invalid json'); } })
      : Promise.resolve(response({ vendor: vendor() })));
    fireEvent.submit(form());
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.failedToSaveChanges))).toBeInTheDocument();

    mockFetch.mockImplementation((url: string, init?: RequestInit) => init?.method === 'PATCH'
      ? Promise.reject(new Error('save service offline'))
      : Promise.resolve(response({ vendor: vendor() })));
    fireEvent.submit(form());
    expect(await screen.findByText('save service offline')).toBeInTheDocument();
  });
});
