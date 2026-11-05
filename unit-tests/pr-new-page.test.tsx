/** @jest-environment jsdom */
import { uiStringPattern } from '@/lib/i18n';

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CreatePrPage from '../src/app/(app)/pr/new/page';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../src/components/ui/PageHeader', () => ({
  __esModule: true,
  default: ({ title, subtitle }: { title: string; subtitle: string }) => <header><h1>{title}</h1><p>{subtitle}</p></header>,
}));
jest.mock('../src/components/ui/FormSection', () => ({
  __esModule: true,
  default: ({ title, children }: { title: string; children: React.ReactNode }) => <section><h2>{title}</h2>{children}</section>,
}));

const fetchMock = jest.fn();
const originalFetch = global.fetch;
const response = (body: unknown, ok = true) => ({ ok, json: jest.fn().mockResolvedValue(body) });
const projects = [{ id: 'project-1', projectCode: 'P-1', name: 'Main Project' }];
const costCentres = [{ id: 'cc-1', code: 'CC-1', name: 'Electrical' }];
const boqs = [{ id: 'boq-1', boqCode: 'BOQ-1', title: 'Equipment Package', status: 'APPROVED', revisions: [{ id: 'revision-1' }] }];

function configureFetch({
  projectBody = { data: projects },
  projectOk = true,
  costCentreBody = costCentres,
  costCentreOk = true,
  boqBody = { data: boqs },
  boqOk = true,
  postResponse = response({ id: 'pr-1' }),
}: {
  projectBody?: unknown;
  projectOk?: boolean;
  costCentreBody?: unknown;
  costCentreOk?: boolean;
  boqBody?: unknown;
  boqOk?: boolean;
  postResponse?: ReturnType<typeof response>;
} = {}) {
  fetchMock.mockImplementation((url: string) => {
    if (url === '/api/projects') return Promise.resolve(response(projectBody, projectOk));
    if (url.startsWith('/api/cost-centres')) return Promise.resolve(response(costCentreBody, costCentreOk));
    if (url.startsWith('/api/boq?')) return Promise.resolve(response(boqBody, boqOk));
    if (url === '/api/pr') return Promise.resolve(postResponse);
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe('new procurement request page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    configureFetch();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('loads projects, cost centres, and BOQs and submits trimmed PR details', async () => {
    render(<CreatePrPage />);
    expect(await screen.findByRole('option', { name: /P-1/ })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: /CC-1/ })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: /BOQ-1/ })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/projects');
    expect(fetchMock).toHaveBeenCalledWith('/api/cost-centres?projectId=project-1&page=1&pageSize=100');
    expect(fetchMock).toHaveBeenCalledWith('/api/boq?projectId=project-1');

    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppPrNewPage.eGElectricalCivilFitoutProcurement)), { target: { value: '  New electrical package  ' } });
    fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: '2026-12-01' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppPrNewPage.eGSiteStoreUnit402)), { target: { value: '  Unit 402  ' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppPrNewPage.createProcurementRequest) }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/pr'));
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/pr');
    expect(call?.[1]).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } });
    expect(JSON.parse(call?.[1].body)).toEqual({
      projectId: 'project-1', costCentreId: 'cc-1', boqId: 'boq-1', revisionId: 'revision-1',
      title: 'New electrical package', requiredDate: '2026-12-01', deliveryLocation: 'Unit 402',
    });
  });

  it('supports raw API arrays, fallback display names, and project changes with empty related lists', async () => {
    configureFetch({
      projectBody: [
        { id: 'project-2', projectCode: 'P-2', name: 'Second Project' },
        { id: 'project-3', projectCode: 'P-3', name: 'Third Project' },
      ],
      costCentreBody: [{ id: 'cc-2', costCentreCode: 'ALT-2', name: 'Operations' }],
      boqBody: [{ id: 'boq-2', boqCode: 'BOQ-2', title: '', status: 'DRAFT' }],
    });
    render(<CreatePrPage />);
    expect(await screen.findByRole('option', { name: /P-2/ })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: /ALT-2/ })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: uiStringPattern(UI_STRINGS.appAppPrNewPage.bOQBaseline) })).toBeInTheDocument();
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'cc-2' } });
    fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: 'boq-2' } });

    configureFetch({ costCentreBody: [], boqBody: [] });
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'project-3' } });
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppPrNewPage.noBOQsFoundForThisProject))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.appAppPrNewPage.createABOQInStudio) })).toHaveAttribute('href', '/boq/studio?projectId=project-3');
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppPrNewPage.createProcurementRequest) })).toBeDisabled();
  });

  it('pages and searches project cost centres without loading the full project collection', async () => {
    const laterCentre = { id: 'cc-2', code: 'CC-2', name: 'Operations' };
    const searchedCentre = { id: 'cc-3', code: 'CC-3', name: 'Warehouse' };
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/projects') return Promise.resolve(response({ data: projects }));
      if (url.startsWith('/api/cost-centres?')) {
        const query = new URL(`http://localhost${url}`).searchParams;
        if (query.get('search')) return Promise.resolve(response({ costCentres: [searchedCentre], pagination: { page: 1, total: 1, hasMore: false } }));
        if (query.get('page') === '2') return Promise.resolve(response({ costCentres: [laterCentre], pagination: { page: 2, total: 101, hasMore: false } }));
        return Promise.resolve(response({ costCentres: [costCentres[0]], pagination: { page: 1, total: 101, hasMore: true } }));
      }
      if (url.startsWith('/api/boq?')) return Promise.resolve(response({ data: boqs }));
      throw new Error(`Unexpected fetch: ${url}`);
    });
    render(<CreatePrPage />);
    expect(await screen.findByRole('option', { name: /CC-1/ })).toBeInTheDocument();
    expect(await screen.findByText(/Showing 1 of 101 cost centres/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppCostCentresPage.loadMoreCostCentres) }));
    expect(await screen.findByRole('option', { name: /CC-2/ })).toBeInTheDocument();

    const searchLabel = uiStringPattern(UI_STRINGS.appAppCostCentresPage.searchCostCentreCodeNameZoneOrLocation);
    fireEvent.change(screen.getByPlaceholderText(searchLabel), { target: { value: 'Warehouse' } });
    fireEvent.click(screen.getByRole('button', { name: searchLabel }));
    expect(await screen.findByRole('option', { name: /CC-3/ })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('search=Warehouse'));
  });

  it('shows an error when the form is submitted without project or BOQ selections', async () => {
    configureFetch({ projectBody: { data: [] }, costCentreBody: [], boqBody: [] });
    render(<CreatePrPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppPrNewPage.createProcurementRequest) })).toBeDisabled());
    fireEvent.submit(document.querySelector('form')!);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppPrNewPage.pleaseSelectAProjectAndSourceBOQ))).toBeInTheDocument();
  });

  it('uses the package title fallback and shows API failures after re-enabling the form', async () => {
    configureFetch({
      boqBody: { data: [{ id: 'boq-fallback', boqCode: 'BOQ-F', title: '', status: 'DRAFT' }] },
      postResponse: response({ error: 'Unable to create request' }, false),
    });
    render(<CreatePrPage />);
    expect(await screen.findByRole('option', { name: /BOQ-F/ })).toBeInTheDocument();
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: '' } });
    fireEvent.submit(document.querySelector('form')!);
    expect(await screen.findByText('Unable to create request')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppPrNewPage.createProcurementRequest) })).toBeEnabled());
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/pr');
    expect(JSON.parse(call?.[1].body)).toMatchObject({ title: 'Procurement Package PR', revisionId: null, costCentreId: null });
  });

  it('reports generic create failures and handles unavailable project data', async () => {
    configureFetch({ postResponse: { ok: false, json: jest.fn().mockRejectedValue(new Error('bad JSON')) } });
    const loadedPage = render(<CreatePrPage />);
    expect(await screen.findByRole('option', { name: /P-1/ })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: /BOQ-1/ })).toBeInTheDocument();
    fireEvent.submit(document.querySelector('form')!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/pr', expect.anything()));
    expect(await screen.findByText('bad JSON')).toBeInTheDocument();

    loadedPage.unmount();
    configureFetch({ projectOk: false });
    render(<CreatePrPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/projects'));
    expect(screen.getAllByRole('combobox')[0]).toHaveValue('');
  });

  it('handles project, cost centre, and BOQ fetch exceptions and non-success responses', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchMock.mockRejectedValue(new Error('network error'));
    render(<CreatePrPage />);
    await waitFor(() => expect(consoleError).toHaveBeenCalled());

    configureFetch({ costCentreOk: false, boqOk: false });
    render(<CreatePrPage />);
    expect(await screen.findByRole('option', { name: /P-1/ })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/boq?projectId=project-1'));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppPrNewPage.noBOQsFoundForThisProject))).toBeInTheDocument();
  });

  it('covers empty payload fallbacks and generic create errors', async () => {
    configureFetch({ projectBody: false });
    const emptyProjects = render(<CreatePrPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/projects'));
    expect(screen.getAllByRole('combobox')[0]).toHaveValue('');
    emptyProjects.unmount();

    configureFetch({ boqBody: false, postResponse: response({}, false) });
    render(<CreatePrPage />);
    expect(await screen.findByRole('option', { name: /P-1/ })).toBeInTheDocument();
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppPrNewPage.noBOQsFoundForThisProject))).toBeInTheDocument();
  });

  it('catches failures while loading cost centres and BOQs', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/projects') return Promise.resolve(response({ data: projects }));
      if (url.startsWith('/api/cost-centres')) return Promise.reject(new Error('cost centre unavailable'));
      if (url.startsWith('/api/boq?')) return Promise.reject(new Error('BOQ unavailable'));
      throw new Error(`Unexpected fetch: ${url}`);
    });
    render(<CreatePrPage />);
    await waitFor(() => expect(consoleError).toHaveBeenCalledTimes(2));
  });

  it('uses the generic API error when a rejected response has no error message', async () => {
    configureFetch({ postResponse: response({}, false) });
    render(<CreatePrPage />);
    expect(await screen.findByRole('option', { name: /BOQ-1/ })).toBeInTheDocument();
    fireEvent.submit(document.querySelector('form')!);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.failedToCreatePr))).toBeInTheDocument();
  });
});
