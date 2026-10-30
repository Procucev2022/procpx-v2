/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import VendorManagementPage from '../src/app/(app)/procurement/vendors/page';

const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn() };
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, ...props }: any) => <a {...props}>{children}</a> }));
jest.mock('../src/components/ui/PageHeader', () => ({
  __esModule: true,
  default: ({ title, description, actions }: any) => <header><h1>{title}</h1><p>{description}</p>{actions}</header>,
}));
jest.mock('../src/components/ui/Toast', () => ({ useToast: () => mockToast }));

const originalFetch = global.fetch;
const mockFetch = jest.fn();
let vendors: any[];
let vendorListUnavailable: boolean;
let omitVendorList: boolean;
let createVendorOk: boolean;
const counts = { total: 3, clientVendorsCount: 2, procucevVendorsCount: 1, qualifiedCount: 1, pendingReviewCount: 1, notEvaluatedCount: 1 };
const reply = (body: unknown, ok = true) => ({ ok, json: async () => body });

function configureFetch() {
  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === 'POST' && url === '/api/procurement/vendors') {
      return Promise.resolve(reply(
        createVendorOk ? { vendor: { id: 'vendor-new', code: 'VN-NEW', name: 'New Vendor' } } : { error: 'Vendor intake unavailable' },
        createVendorOk,
      ));
    }
    if (init?.method === 'POST' && url.includes('/evaluate-ai')) {
      if (url.endsWith('/v1/evaluate-ai')) return Promise.resolve(reply({ report: { overallWeightedScore: 88, qualificationOutcome: 'QUALIFIED' } }));
      if (url.endsWith('/v3/evaluate-ai')) return Promise.reject(new Error('AI service offline'));
      return Promise.resolve(reply({ error: 'Evidence is incomplete' }, false));
    }
    if (init?.method === 'POST') return Promise.resolve(reply({}));
    if (vendorListUnavailable) return Promise.reject(new Error('Directory unavailable'));
    if (omitVendorList) return Promise.resolve(reply({ counts }));
    return Promise.resolve(reply({ vendors, counts }));
  });
  global.fetch = mockFetch as typeof fetch;
}

const vendorRows = () => [
  {
    id: 'v1', code: 'VND-1', name: 'Alpha Infra', vendorType: 'CLIENT_VENDOR', onboardingStatus: 'ACTIVE',
    qualificationStatus: 'QUALIFIED', qualificationScore: 88, categories: ['Civil & Interior', 'Electrical'],
    city: 'Bangalore', operatingLocation: 'Bangalore & Mysore', gstin: 'GST-1', averagePpoRating: 4.5, ppoRatingsCount: 2,
  },
  {
    id: 'v2', code: 'VND-2', name: 'Beta Network', vendorType: 'PROCUCEV_VENDOR', onboardingStatus: 'DRAFT',
    qualificationStatus: 'CONDITIONALLY_QUALIFIED', qualificationScore: 72, categories: 'HVAC',
    city: 'Mumbai', operatingLocation: '', gstin: '', averagePpoRating: null, ppoRatingsCount: 0,
  },
  {
    id: 'v3', code: 'VND-3', name: 'Gamma Pending', vendorType: 'CLIENT_VENDOR', onboardingStatus: 'PENDING',
    qualificationStatus: 'NOT_EVALUATED', qualificationScore: null, categories: null,
    city: '', operatingLocation: 'Delhi NCR', averagePpoRating: null, ppoRatingsCount: 0,
  },
];

function renderVendors() {
  configureFetch();
  return render(<VendorManagementPage />);
}

describe('vendor management workspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    vendors = vendorRows();
    vendorListUnavailable = false;
    omitVendorList = false;
    createVendorOk = true;
    configureFetch();
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => { global.fetch = originalFetch; });

  it('loads the directory and applies server filters for classification, status, category, and search', async () => {
    renderVendors();
    expect(await screen.findByRole('heading', { name: 'Vendor Management' })).toBeInTheDocument();
    expect(await screen.findByText('Alpha Infra')).toBeInTheDocument();
    expect(screen.getByText('Qualified (88%)')).toBeInTheDocument();
    expect(screen.getByText('Conditional (72%)')).toBeInTheDocument();
    expect(screen.getAllByText('Not Evaluated').length).toBeGreaterThan(0);
    expect(screen.getByText('4.5')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Open' })[0]).toHaveAttribute('href', '/procurement/vendors/v1');

    fireEvent.click(screen.getByRole('button', { name: 'Client Vendors (2)' }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/procurement/vendors?vendorType=CLIENT_VENDOR'));
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'QUALIFIED' } });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/procurement/vendors?vendorType=CLIENT_VENDOR&qualificationStatus=QUALIFIED'));
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'Electrical' } });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/procurement/vendors?vendorType=CLIENT_VENDOR&qualificationStatus=QUALIFIED&category=Electrical'));
    fireEvent.change(screen.getByPlaceholderText('Search name, code, city, GSTIN...'), { target: { value: '  alpha  ' } });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/procurement/vendors?vendorType=CLIENT_VENDOR&qualificationStatus=QUALIFIED&category=Electrical&search=alpha'));
    fireEvent.click(screen.getByRole('button', { name: 'Procucev Network Vendors (1)' }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('vendorType=PROCUCEV_VENDOR')));
  });

  it('validates both onboarding steps, saves a draft, and completes vendor registration', async () => {
    renderVendors();
    await screen.findByRole('heading', { name: 'Vendor Management' });
    fireEvent.click(screen.getByRole('button', { name: 'Add Vendor' }));
    expect(screen.getByText('Step 1: Basic Vendor & Contact Information')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Continue to Step 2 (Business Profile)' }));
    expect(screen.getByText('Vendor Legal / Business Name is required.')).toBeInTheDocument();
    expect(screen.getByText('At least one contact method (Email or Mobile) is required.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save as Draft' }));
    expect(screen.getByText('Vendor Legal / Business Name is required even for draft saving.')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('e.g. Apex Infrastructure & Contracting Pvt Ltd'), { target: { value: 'New Vendor' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Rajesh Sharma'), { target: { value: 'Jordan Contact' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. sales@apexinfra.com'), { target: { value: 'jordan@example.test' } });
    fireEvent.change(screen.getAllByPlaceholderText('e.g. 98765 43210')[0], { target: { value: '+91 80000 11111' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Hyderabad, Telangana'), { target: { value: 'Hyderabad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save as Draft' }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/procurement/vendors', expect.objectContaining({ method: 'POST' })));
    const draftPayload = JSON.parse(mockFetch.mock.calls.find(([, init]) => init?.method === 'POST')![1].body as string);
    expect(draftPayload).toMatchObject({ name: 'New Vendor', isDraft: true, email: 'jordan@example.test' });
    expect(await screen.findByText(/Draft saved successfully for New Vendor/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Continue to Step 2 (Business Profile)' }));
    expect(screen.getByText('Step 2: Business Profile & Statutory Details')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Complete Onboarding & Register' }));
    expect(screen.getByText('Registered Business Address is required.')).toBeInTheDocument();
    expect(screen.getByText('Product / Scope Capabilities is required.')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Complete registered office address with PIN code'), { target: { value: '12 Market Road, Hyderabad' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Civil works, Interior fit-outs, MEP, Furniture, etc.'), { target: { value: 'HVAC installation and servicing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Complete Onboarding & Register' }));
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Vendor onboarding completed successfully.', 'VN-NEW', 'Onboarded'));
    const completed = mockFetch.mock.calls.filter(([, init]) => init?.method === 'POST').map(([, init]) => JSON.parse((init as RequestInit).body as string));
    expect(completed.at(-1)).toMatchObject({ name: 'New Vendor', isDraft: false, id: 'vendor-new', phone: '+91 80000 11111', address: '12 Market Road, Hyderabad', capabilities: 'HVAC installation and servicing' });
  });

  it('captures the complete vendor contact and business profile and returns between onboarding steps', async () => {
    renderVendors();
    await screen.findByRole('heading', { name: 'Vendor Management' });
    fireEvent.click(screen.getByRole('button', { name: 'Add Vendor' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Apex Infrastructure & Contracting Pvt Ltd'), { target: { value: 'Full Profile Vendor' } });
    fireEvent.change(document.getElementById('vendor-classification-type')!, { target: { value: 'PROCUCEV_VENDOR' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Rajesh Sharma'), { target: { value: 'Riley Contact' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. sales@apexinfra.com'), { target: { value: 'riley@example.test' } });
    fireEvent.change(document.getElementById('vendor-phone-cc')!, { target: { value: '+44' } });
    fireEvent.change(screen.getAllByPlaceholderText('e.g. 98765 43210')[0], { target: { value: '7700900111' } });
    fireEvent.change(document.getElementById('vendor-alt-phone-cc')!, { target: { value: '+1' } });
    fireEvent.change(screen.getAllByPlaceholderText('e.g. 98765 43210')[1], { target: { value: '+1 202 555 0100' } });
    fireEvent.change(document.getElementById('vendor-category-domain')!, { target: { value: 'Electrical & Automation' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Hyderabad, Telangana'), { target: { value: 'Pune, Maharashtra' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Hyderabad, Telangana'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Step 2 (Business Profile)' }));
    expect(screen.getByText('Operating Location (City / Region) is required.')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('e.g. Hyderabad, Telangana'), { target: { value: 'Pune, Maharashtra' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Step 2 (Business Profile)' }));
    expect(screen.getByText('Step 2: Business Profile & Statutory Details')).toBeInTheDocument();

    fireEvent.change(document.getElementById('vendor-legal-structure')!, { target: { value: 'LLP' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 36AABCA1234F1Z5'), { target: { value: '27abcd1234f1z5' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. AABCA1234F'), { target: { value: 'abcde1234f' } });
    fireEvent.change(screen.getByPlaceholderText('https://company.com'), { target: { value: 'https://full-profile.example.test' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 5'), { target: { value: '8' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 25.5'), { target: { value: '12.5' } });
    fireEvent.change(screen.getByPlaceholderText('Complete registered office address with PIN code'), { target: { value: '10 Market Lane, Pune' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Civil works, Interior fit-outs, MEP, Furniture, etc.'), { target: { value: 'Automation and switchgear' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Tata, Reliance, D-Mart and project values'), { target: { value: 'North Plant, 2025' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. ISO 9001, MSME, etc.'), { target: { value: 'ISO 9001' } });
    fireEvent.change(screen.getByPlaceholderText('Any additional information about this vendor'), { target: { value: 'Verified references' } });
    fireEvent.click(screen.getByRole('button', { name: 'Back to Step 1' }));
    expect(screen.getByText('Step 1: Basic Vendor & Contact Information')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Basic Information'));
    fireEvent.click(screen.getByText('Business Profile'));
    expect(screen.getByText('Step 2: Business Profile & Statutory Details')).toBeInTheDocument();
    fireEvent.change(document.getElementById('vendor-legal-structure')!, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Complete Onboarding & Register' }));
    expect(screen.getByText('Legal Structure is required.')).toBeInTheDocument();
    fireEvent.change(document.getElementById('vendor-legal-structure')!, { target: { value: 'LLP' } });
    fireEvent.click(screen.getByRole('button', { name: /Save as Draft/ }));
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Vendor profile saved as draft.', 'VN-NEW', 'Draft'));
    fireEvent.click(screen.getByRole('button', { name: 'Complete Onboarding & Register' }));

    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Vendor onboarding completed successfully.', 'VN-NEW', 'Onboarded'));
    const submitted = mockFetch.mock.calls.filter(([, init]) => init?.method === 'POST').map(([, init]) => JSON.parse((init as RequestInit).body as string)).at(-1);
    expect(submitted).toMatchObject({
      name: 'Full Profile Vendor', vendorType: 'PROCUCEV_VENDOR', contactPerson: 'Riley Contact', email: 'riley@example.test',
      phone: '+44 7700900111', alternatePhone: '+1 202 555 0100', category: 'Electrical & Automation', operatingLocation: 'Pune, Maharashtra',
      legalStructure: 'LLP', gstin: '27ABCD1234F1Z5', pan: 'ABCDE1234F', website: 'https://full-profile.example.test',
      experienceYears: 8, turnoverCrores: 12.5, address: '10 Market Lane, Pune', capabilities: 'Automation and switchgear',
      clientReferences: 'North Plant, 2025', certifications: 'ISO 9001', remarks: 'Verified references', isDraft: false,
    });
  });

  it('filters the evaluation hub, selects vendors, handles mixed AI outcomes, and clears the completed batch', async () => {
    renderVendors();
    await screen.findByRole('heading', { name: 'Vendor Management' });
    fireEvent.click(screen.getByRole('button', { name: 'Evaluation Hub & Selection' }));
    expect(screen.getByText('Evaluation Pipeline & Review Queue')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Procucev Network Vendors (1)' }));
    expect(screen.getByText('Showing 1 of 3 vendors')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'All Vendors (3)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Client Vendors (2)' }));
    fireEvent.click(screen.getByRole('button', { name: 'All Vendors (3)' }));
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'Electrical' } });
    fireEvent.change(selects[1], { target: { value: 'Bangalore' } });
    fireEvent.change(selects[2], { target: { value: 'QUALIFIED' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. VND-0001, Apex...'), { target: { value: 'VND-1' } });
    fireEvent.keyDown(screen.getByPlaceholderText('e.g. VND-0001, Apex...'), { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }));
    await waitFor(() => expect(screen.getByText('Showing 1 of 3 vendors')).toBeInTheDocument());
    expect(await screen.findByText('Alpha Infra')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }));

    fireEvent.click(screen.getByRole('button', { name: /Select Vendors for Evaluation/ }));
    fireEvent.change(screen.getByPlaceholderText('Search vendors in this list by code or name...'), { target: { value: 'Beta' } });
    expect(screen.getAllByText('Beta Network')).toHaveLength(2);
    fireEvent.click(screen.getAllByText('Beta Network')[1]);
    fireEvent.change(screen.getByPlaceholderText('Search vendors in this list by code or name...'), { target: { value: '' } });
    fireEvent.click(screen.getByTitle('Select all visible vendors'));
    fireEvent.click(screen.getByTitle('Select all visible vendors'));
    fireEvent.click(screen.getByTitle('Select all visible vendors'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Evaluate Selected Vendors (3)' })[0]);
    expect(screen.getByText('Confirm Bulk AI Vendor Evaluation')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start Evaluation (3)' }));
    expect(await screen.findByText(/Score: 88% \(QUALIFIED\)/)).toBeInTheDocument();
    expect(screen.getByText('Evidence is incomplete')).toBeInTheDocument();
    expect(screen.getByText('AI service offline')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done & View Results' }));
    expect(screen.queryByText('Bulk Evaluation Completed')).not.toBeInTheDocument();
  });

  it('supports dropdown, table, outside-click selection, and return navigation', async () => {
    renderVendors();
    await screen.findByRole('heading', { name: 'Vendor Management' });
    fireEvent.click(screen.getByRole('button', { name: 'Evaluation Hub & Selection' }));

    const selectionButton = () => screen.getByRole('button', { name: /Select Vendors for Evaluation/ });
    fireEvent.click(selectionButton());
    expect(document.getElementById('select-vendors-dropdown-menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(document.getElementById('select-vendors-dropdown-menu')).not.toBeInTheDocument());

    fireEvent.click(selectionButton());
    const dropdown = document.getElementById('select-vendors-dropdown-menu')!;
    fireEvent.click(within(dropdown).getAllByRole('checkbox')[0]);
    expect(screen.getByText('1 vendor selected')).toBeInTheDocument();
    fireEvent.click(within(dropdown).getByRole('button', { name: 'Select All (3)' }));
    fireEvent.click(within(dropdown).getByRole('button', { name: 'Clear Selection' }));
    fireEvent.click(within(dropdown).getByRole('button', { name: 'Done' }));

    const alphaRow = screen.getByText('VND-1').closest('tr')!;
    fireEvent.click(within(alphaRow).getByRole('checkbox'));
    expect(screen.getByText('1 vendor selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear Selection' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vendor Directory' }));
    fireEvent.click(screen.getByRole('button', { name: 'All Vendors (3)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Vendor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to Vendor Management' }));
    expect(screen.getByRole('heading', { name: 'Vendor Management' })).toBeInTheDocument();
  });

  it('handles empty and failed directory loads, onboarding submission errors, and vendor status badges', async () => {
    omitVendorList = true;
    const empty = renderVendors();
    expect(await screen.findByText('No Vendors Found')).toBeInTheDocument();
    empty.unmount();

    omitVendorList = false;
    vendorListUnavailable = true;
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const failed = renderVendors();
    expect(await screen.findByText('No Vendors Found')).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith('Failed to load vendors', expect.any(Error));
    failed.unmount();
    consoleError.mockRestore();

    vendorListUnavailable = false;
    createVendorOk = false;
    configureFetch();
    const rejected = renderVendors();
    await screen.findByRole('heading', { name: 'Vendor Management' });
    fireEvent.click(screen.getByRole('button', { name: 'Add Vendor' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Apex Infrastructure & Contracting Pvt Ltd'), { target: { value: 'Rejected Intake Vendor' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save as Draft' }));
    expect(await screen.findByText('Vendor intake unavailable')).toBeInTheDocument();
    rejected.unmount();

    vendors = [
      { ...vendorRows()[0], id: 'pending', code: 'VND-P', name: 'Pending Vendor', onboardingStatus: 'PROFILE_INCOMPLETE', qualificationStatus: 'PENDING_REVIEW', qualificationScore: 0, city: '', operatingLocation: '', ppoRatingsCount: 1 },
      { ...vendorRows()[1], id: 'rejected', code: 'VND-R', name: 'Rejected Vendor', onboardingStatus: 'ONBOARDED', qualificationStatus: 'NOT_QUALIFIED', qualificationScore: 0, ppoRatingsCount: 1 },
      { ...vendorRows()[2], id: 'unreviewed', code: 'VND-U', name: 'Unreviewed Vendor', onboardingStatus: 'DRAFT', qualificationStatus: 'NOT_EVALUATED', qualificationScore: null, ppoRatingsCount: 0 },
    ];
    configureFetch();
    const statusView = renderVendors();
    expect(await screen.findByText('Pending Vendor')).toBeInTheDocument();
    expect(screen.getAllByText('Pending Review').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Not Qualified').length).toBeGreaterThan(0);
    expect(screen.getByText('Unreviewed Vendor')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Evaluation Hub & Selection' }));
    const evaluationFilters = screen.getAllByRole('combobox');
    fireEvent.change(evaluationFilters[1], { target: { value: 'Delhi NCR' } });
    fireEvent.change(evaluationFilters[2], { target: { value: 'NOT_EVALUATED' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. VND-0001, Apex...'), { target: { value: 'VND-U' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }));
    expect(await screen.findByText('Unreviewed Vendor')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('e.g. VND-0001, Apex...'), { target: { value: 'no match' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }));
    expect(await screen.findByText('No Vendors Match Filter Criteria')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Select Vendors for Evaluation/ }));
    expect(screen.getByText(/No vendors match/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Immediate Onboarding' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to Vendor Management' }));
  });
});
