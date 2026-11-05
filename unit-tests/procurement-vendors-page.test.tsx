/** @jest-environment jsdom */
import { interpolateUiString, uiStringPattern } from '@/lib/i18n';

import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import VendorManagementPage from '../src/app/(app)/procurement/vendors/page';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


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
let nextPageVendors: Array<Record<string, unknown>>;
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
    const page = Number(new URL(String(url), 'http://localhost').searchParams.get('page') || '1');
    const pageVendors = page === 1 ? vendors : nextPageVendors;
    return Promise.resolve(reply({
      vendors: pageVendors,
      counts,
      pagination: {
        page,
        pageSize: 50,
        hasMore: page === 1 && nextPageVendors.length > 0,
        total: vendors.length + nextPageVendors.length,
      },
    }));
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
    nextPageVendors = [];
    vendorListUnavailable = false;
    omitVendorList = false;
    createVendorOk = true;
    configureFetch();
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => { global.fetch = originalFetch; });

  it('loads the directory and applies server filters for classification, status, category, and search', async () => {
    renderVendors();
    expect(await screen.findByRole('heading', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.vendorManagement) })).toBeInTheDocument();
    expect(await screen.findByText('Alpha Infra')).toBeInTheDocument();
    expect(screen.getByText('Qualified (88%)')).toBeInTheDocument();
    expect(screen.getByText('Conditional (72%)')).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.notEvaluated)).length).toBeGreaterThan(0);
    expect(screen.getByText('4.5')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: uiStringPattern(UI_STRINGS.common.open) })[0]).toHaveAttribute('href', '/procurement/vendors/v1');

    fireEvent.click(screen.getByRole('button', { name: 'Client Vendors (2)' }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/procurement/vendors?vendorType=CLIENT_VENDOR'));
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'QUALIFIED' } });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/procurement/vendors?vendorType=CLIENT_VENDOR&qualificationStatus=QUALIFIED'));
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'Electrical' } });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/procurement/vendors?vendorType=CLIENT_VENDOR&qualificationStatus=QUALIFIED&category=Electrical'));
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.searchNameCodeCityGSTIN)), { target: { value: '  alpha  ' } });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/procurement/vendors?vendorType=CLIENT_VENDOR&qualificationStatus=QUALIFIED&category=Electrical&search=alpha'));
    fireEvent.click(screen.getByRole('button', { name: 'Procucev Network Vendors (1)' }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('vendorType=PROCUCEV_VENDOR')));
  });

  it('loads the next bounded directory page and avoids appending duplicate vendors', async () => {
    nextPageVendors = [
      vendorRows()[1],
      { ...vendorRows()[0], id: 'v4', code: 'VND-4', name: 'Delta Systems' },
    ];
    renderVendors();
    expect(await screen.findByText('Alpha Infra')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(interpolateUiString(UI_STRINGS.appAppProcurementVendorsPage.loadedVendorCountOfTotal, {
      loaded: 3,
      total: 5,
    })))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.loadMoreVendors) }));
    expect(await screen.findByText('Delta Systems')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Beta Network' })).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith('/api/procurement/vendors?page=2');
  });

  it('validates both onboarding steps, saves a draft, and completes vendor registration', async () => {
    renderVendors();
    await screen.findByRole('heading', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.vendorManagement) });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.addVendor) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.step1BasicVendorContactInformation))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.continueToStep2BusinessProfile) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appApiProcurementVendorsRoute.vendorLegalBusinessNameIsRequired))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.contactMethodEmailOrMobileIsRequired))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.saveAsDraft) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.vendorLegalNameIsRequiredEvenForDraftSaving))).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.common.eGApexInfrastructureContractingPvtLtd)), { target: { value: 'New Vendor' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.common.eGRajeshSharma)), { target: { value: 'Jordan Contact' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.eGSalesApexinfraCom)), { target: { value: 'jordan@example.test' } });
    fireEvent.change(screen.getAllByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.eG9876543210))[0], { target: { value: '+91 80000 11111' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.common.eGHyderabadTelangana)), { target: { value: 'Hyderabad' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.saveAsDraft) }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/procurement/vendors', expect.objectContaining({ method: 'POST' })));
    const draftPayload = JSON.parse(mockFetch.mock.calls.find(([, init]) => init?.method === 'POST')![1].body as string);
    expect(draftPayload).toMatchObject({ name: 'New Vendor', isDraft: true, email: 'jordan@example.test' });
    expect(await screen.findByText(uiStringPattern(interpolateUiString(UI_STRINGS.appAppProcurementVendorsPage.draftSavedSuccessfullyForNameCode, {
      name: 'New Vendor',
      code: 'VN-NEW',
    })))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.continueToStep2BusinessProfile) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.step2BusinessProfileStatutoryDetails))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.completeOnboardingRegister) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.registeredBusinessAddressIsRequired))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.productScopeCapabilitiesIsRequired))).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.completeRegisteredOfficeAddressWithPINCode)), { target: { value: '12 Market Road, Hyderabad' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.eGCivilWorksInteriorFitOutsMEPFurnitureEtc)), { target: { value: 'HVAC installation and servicing' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.completeOnboardingRegister) }));
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith(UI_STRINGS.common.userMessages.vendorOnboardingCompletedSuccessfully, 'VN-NEW', UI_STRINGS.common.userMessages.onboarded));
    const completed = mockFetch.mock.calls.filter(([, init]) => init?.method === 'POST').map(([, init]) => JSON.parse((init as RequestInit).body as string));
    expect(completed.at(-1)).toMatchObject({ name: 'New Vendor', isDraft: false, id: 'vendor-new', phone: '+91 80000 11111', address: '12 Market Road, Hyderabad', capabilities: 'HVAC installation and servicing' });
  });

  it('captures the complete vendor contact and business profile and returns between onboarding steps', async () => {
    renderVendors();
    await screen.findByRole('heading', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.vendorManagement) });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.addVendor) }));
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.common.eGApexInfrastructureContractingPvtLtd)), { target: { value: 'Full Profile Vendor' } });
    fireEvent.change(document.getElementById('vendor-classification-type')!, { target: { value: 'PROCUCEV_VENDOR' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.common.eGRajeshSharma)), { target: { value: 'Riley Contact' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.eGSalesApexinfraCom)), { target: { value: 'riley@example.test' } });
    fireEvent.change(document.getElementById('vendor-phone-cc')!, { target: { value: '+44' } });
    fireEvent.change(screen.getAllByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.eG9876543210))[0], { target: { value: '7700900111' } });
    fireEvent.change(document.getElementById('vendor-alt-phone-cc')!, { target: { value: '+1' } });
    fireEvent.change(screen.getAllByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.eG9876543210))[1], { target: { value: '+1 202 555 0100' } });
    fireEvent.change(document.getElementById('vendor-category-domain')!, { target: { value: 'Electrical & Automation' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.common.eGHyderabadTelangana)), { target: { value: 'Pune, Maharashtra' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.common.eGHyderabadTelangana)), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.continueToStep2BusinessProfile) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.operatingLocationCityRegionIsRequired))).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.common.eGHyderabadTelangana)), { target: { value: 'Pune, Maharashtra' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.continueToStep2BusinessProfile) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.step2BusinessProfileStatutoryDetails))).toBeInTheDocument();

    fireEvent.change(document.getElementById('vendor-legal-structure')!, { target: { value: 'LLP' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.common.eG36AABCA1234F1Z5)), { target: { value: '27abcd1234f1z5' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.common.eGAABCA1234F)), { target: { value: 'abcde1234f' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.common.httpsCompanyCom)), { target: { value: 'https://full-profile.example.test' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.eG5)), { target: { value: '8' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.common.eG255)), { target: { value: '12.5' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.completeRegisteredOfficeAddressWithPINCode)), { target: { value: '10 Market Lane, Pune' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.eGCivilWorksInteriorFitOutsMEPFurnitureEtc)), { target: { value: 'Automation and switchgear' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.eGTataRelianceDMartAndProjectValues)), { target: { value: 'North Plant, 2025' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.eGISO9001MSMEEtc)), { target: { value: 'ISO 9001' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.anyAdditionalInformationAboutThisVendor)), { target: { value: 'Verified references' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.backToStep1) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.step1BasicVendorContactInformation))).toBeInTheDocument();
    fireEvent.click(screen.getByText(uiStringPattern(UI_STRINGS.common.basicInformation)));
    fireEvent.click(screen.getByText(uiStringPattern(UI_STRINGS.common.businessProfile, '', true)));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.step2BusinessProfileStatutoryDetails))).toBeInTheDocument();
    fireEvent.change(document.getElementById('vendor-legal-structure')!, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.completeOnboardingRegister) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.userMessages.legalStructureIsRequired))).toBeInTheDocument();
    fireEvent.change(document.getElementById('vendor-legal-structure')!, { target: { value: 'LLP' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.saveAsDraft) }));
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith(UI_STRINGS.common.userMessages.vendorProfileSavedAsDraft, 'VN-NEW', UI_STRINGS.common.draft));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.completeOnboardingRegister) }));

    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith(UI_STRINGS.common.userMessages.vendorOnboardingCompletedSuccessfully, 'VN-NEW', UI_STRINGS.common.userMessages.onboarded));
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
    await screen.findByRole('heading', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.vendorManagement) });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.evaluationHubSelection) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.evaluationPipelineReviewQueue))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Procucev Network Vendors (1)' }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.showing, '', false))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'All Vendors (3)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Client Vendors (2)' }));
    fireEvent.click(screen.getByRole('button', { name: 'All Vendors (3)' }));
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'Electrical' } });
    fireEvent.change(selects[1], { target: { value: 'Bangalore' } });
    fireEvent.change(selects[2], { target: { value: 'QUALIFIED' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.eGVND0001Apex)), { target: { value: 'VND-1' } });
    fireEvent.keyDown(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.eGVND0001Apex)), { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.applyFilters) }));
    await waitFor(() => expect(screen.getByText(uiStringPattern(UI_STRINGS.common.showing, '', false))).toBeInTheDocument());
    expect(await screen.findByText('Alpha Infra')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.clearFilters) }));

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.selectVendorsForEvaluation) }));
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.searchVendorsInThisListByCodeOrName)), { target: { value: 'Beta' } });
    expect(screen.getAllByText('Beta Network')).toHaveLength(2);
    fireEvent.click(screen.getAllByText('Beta Network')[1]);
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.searchVendorsInThisListByCodeOrName)), { target: { value: '' } });
    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.selectAllVisibleVendors)));
    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.selectAllVisibleVendors)));
    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.selectAllVisibleVendors)));
    fireEvent.click(screen.getAllByRole('button', { name: 'Evaluate Selected Vendors (3)' })[0]);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.confirmBulkAIVendorEvaluation))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start Evaluation (3)' }));
    expect(await screen.findByText(/Score: 88% \(QUALIFIED\)/)).toBeInTheDocument();
    expect(screen.getByText('Evidence is incomplete')).toBeInTheDocument();
    expect(screen.getByText('AI service offline')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.doneViewResults) }));
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.bulkEvaluationCompleted))).not.toBeInTheDocument();
  });

  it('supports dropdown, table, outside-click selection, and return navigation', async () => {
    renderVendors();
    await screen.findByRole('heading', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.vendorManagement) });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.evaluationHubSelection) }));

    const selectionButton = () => screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.selectVendorsForEvaluation) });
    fireEvent.click(selectionButton());
    expect(document.getElementById('select-vendors-dropdown-menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(document.getElementById('select-vendors-dropdown-menu')).not.toBeInTheDocument());

    fireEvent.click(selectionButton());
    const dropdown = document.getElementById('select-vendors-dropdown-menu')!;
    fireEvent.click(within(dropdown).getAllByRole('checkbox')[0]);
    expect(screen.getByText('1 vendor selected')).toBeInTheDocument();
    fireEvent.click(within(dropdown).getByRole('button', { name: 'Select All (3)' }));
    fireEvent.click(within(dropdown).getByRole('button', { name: uiStringPattern(UI_STRINGS.common.clearSelection) }));
    fireEvent.click(within(dropdown).getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.done2) }));

    const alphaRow = screen.getByText('VND-1').closest('tr')!;
    fireEvent.click(within(alphaRow).getByRole('checkbox'));
    expect(screen.getByText('1 vendor selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.clearSelection) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.vendorDirectory) }));
    fireEvent.click(screen.getByRole('button', { name: 'All Vendors (3)' }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.addVendor) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.backToVendorManagement) }));
    expect(screen.getByRole('heading', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.vendorManagement) })).toBeInTheDocument();
  });

  it('handles empty and failed directory loads, onboarding submission errors, and vendor status badges', async () => {
    omitVendorList = true;
    const empty = renderVendors();
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.noVendorsFound))).toBeInTheDocument();
    empty.unmount();

    omitVendorList = false;
    vendorListUnavailable = true;
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const failed = renderVendors();
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.noVendorsFound))).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith('Failed to load vendors', expect.any(Error));
    failed.unmount();
    consoleError.mockRestore();

    vendorListUnavailable = false;
    createVendorOk = false;
    configureFetch();
    const rejected = renderVendors();
    await screen.findByRole('heading', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.vendorManagement) });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.addVendor) }));
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.common.eGApexInfrastructureContractingPvtLtd)), { target: { value: 'Rejected Intake Vendor' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.saveAsDraft) }));
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
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.pendingReview)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.notQualified2)).length).toBeGreaterThan(0);
    expect(screen.getByText('Unreviewed Vendor')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.evaluationHubSelection) }));
    const evaluationFilters = screen.getAllByRole('combobox');
    fireEvent.change(evaluationFilters[1], { target: { value: 'Delhi NCR' } });
    fireEvent.change(evaluationFilters[2], { target: { value: 'NOT_EVALUATED' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.eGVND0001Apex)), { target: { value: 'VND-U' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.applyFilters) }));
    expect(await screen.findByText('Unreviewed Vendor')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.eGVND0001Apex)), { target: { value: 'no match' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.applyFilters) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.noVendorsMatchFilterCriteria))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.selectVendorsForEvaluation, '', false) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.noVendorsMatch, '', false))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.done2) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.immediateOnboarding) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.backToVendorManagement) }));
  });
});
