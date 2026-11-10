/** @jest-environment jsdom */
import { interpolateUiString, uiStringPattern } from '@/lib/i18n';

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CostCentresPage from '../src/app/(app)/cost-centres/page';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('next/link', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
      React.createElement('a', { href, ...props }, children),
  };
});

const originalFetch = global.fetch;
const mockFetch = jest.fn();
const projects = [
  { id: 'project-1', projectCode: 'PRJ-1', name: 'North Mall' },
  { id: 'project-2', projectCode: 'PRJ-2', name: 'South Hub' },
];
const centres = [
  {
    id: 'cc-1', code: 'CC-NORTH', name: 'North Electrical', description: 'Electrical works', project: projects[0],
    projectId: 'project-1', areaSqFt: 1_000, location: 'Pune', floorZone: 'Ground', approvedBudget: 500_000,
    totalBudget: 600_000, ratePerSqFt: 500, status: 'ACTIVE',
  },
  {
    id: 'cc-2', code: 'CC-STORE', name: 'Storage', description: '', project: null, projectId: 'project-2',
    areaSqFt: 0, location: null, floorZone: null, approvedBudget: 0, totalBudget: 0, ratePerSqFt: 0, status: 'DRAFT',
  },
  {
    id: 'cc-3', code: 'CC-OTHER', name: 'Other area', description: null, project: projects[1], projectId: 'project-2',
    areaSqFt: 200, location: 'Chennai', floorZone: 'Level 3', approvedBudget: 100_000, totalBudget: 150_000,
    ratePerSqFt: 500, status: 'ACTIVE',
  },
];

function apiResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

function defaultFetch(url: string, init?: RequestInit) {
  if (url === '/api/auth/me') return Promise.resolve(apiResponse({ data: { user: { role: 'PROJECT_USER' } } }));
  if (url.startsWith('/api/cost-centres') && init?.method === 'POST') return Promise.resolve(apiResponse({ id: 'cc-new' }, true, 201));
  if (url.startsWith('/api/cost-centres')) {
    const params = new URL(url, 'http://localhost').searchParams;
    const projectId = params.get('projectId');
    const search = (params.get('search') || '').toLowerCase();
    const rows = centres.filter((centre) => {
      if (projectId && centre.projectId !== projectId) return false;
      if (!search) return true;
      return [centre.code, centre.name, centre.location, centre.floorZone, centre.project?.name]
        .some((value) => String(value || '').toLowerCase().includes(search));
    });
    const summary = {
      totalAreaSqFt: rows.reduce((sum, centre) => sum + (centre.areaSqFt || 0), 0),
      totalBudget: rows.reduce((sum, centre) => sum + (centre.totalBudget || 0), 0),
      approvedBudget: rows.reduce((sum, centre) => sum + (centre.approvedBudget || 0), 0),
      pendingBudget: 0,
    };
    return Promise.resolve(apiResponse({
      costCentres: rows,
      pagination: { page: Number(params.get('page')) || 1, pageSize: 50, total: rows.length, hasMore: false },
      summary,
    }));
  }
  if (url === '/api/projects') return Promise.resolve(apiResponse({ data: projects }));
  return Promise.resolve(apiResponse({}));
}

describe('cost centres page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockImplementation(defaultFetch);
    global.fetch = mockFetch as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('loads cost centres, shows KPI totals, filters rows, and filters by project', async () => {
    let resolveCentres!: (value: ReturnType<typeof apiResponse>) => void;
    let directProjectResponse = false;
    let delayFirstRegisterRead = true;
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/auth/me') return Promise.resolve(apiResponse({ user: { role: 'CLIENT_ADMIN' } }));
      if (url.startsWith('/api/cost-centres') && delayFirstRegisterRead) {
        delayFirstRegisterRead = false;
        return new Promise((resolve) => { resolveCentres = resolve; });
      }
      if (url.startsWith('/api/cost-centres')) return defaultFetch(url, init);
      if (url === '/api/projects') return Promise.resolve(apiResponse(directProjectResponse ? projects : { data: projects }));
      return Promise.resolve(apiResponse({}));
    });

    render(<CostCentresPage />);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppCostCentresPage.loadingCostCentres))).toBeInTheDocument();
    await waitFor(() => expect(resolveCentres).toBeDefined());
    await act(async () => resolveCentres(apiResponse(centres)));
    expect(await screen.findByText('North Electrical')).toBeInTheDocument();
    expect(screen.getByText('Storage')).toBeInTheDocument();
    expect(screen.getByText(/6\.00 Lakhs/)).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.appAppCostCentresPage.ratePerSqFtSqft))).toHaveLength(2);
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppCostCentresPage.createCostCentre) })).toBeInTheDocument();

    const search = screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppCostCentresPage.searchCostCentreCodeNameZoneOrLocation));
    fireEvent.change(search, { target: { value: 'cc-north' } });
    expect(await screen.findByText('North Electrical')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Storage')).not.toBeInTheDocument());
    fireEvent.change(search, { target: { value: 'chennai' } });
    expect(await screen.findByText('Other area')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'level 3' } });
    expect(await screen.findByText('Other area')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'south hub' } });
    expect(await screen.findByText('Other area')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'missing' } });
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppCostCentresPage.noCostCentresFoundMatchingCriteria))).toBeInTheDocument();
    fireEvent.change(search, { target: { value: '' } });

    directProjectResponse = true;
    fireEvent.change(screen.getByDisplayValue(uiStringPattern(UI_STRINGS.common.allProjects)), { target: { value: 'project-1' } });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/cost-centres?page=1&pageSize=50&projectId=project-1'));
    expect(screen.getByRole('option', { name: /North Mall/ })).toBeInTheDocument();
  });

  it('loads the next stable page and appends rows without replacing the first page', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/auth/me') return Promise.resolve(apiResponse({ data: { user: { role: 'CLIENT_ADMIN' } } }));
      if (url === '/api/projects') return Promise.resolve(apiResponse({ data: projects }));
      if (url.startsWith('/api/cost-centres')) {
        const page = Number(new URL(url, 'http://localhost').searchParams.get('page')) || 1;
        return Promise.resolve(apiResponse({
          costCentres: page === 1 ? [centres[0]] : [centres[1]],
          pagination: { page, pageSize: 50, total: 2, hasMore: page === 1 },
          summary: { totalAreaSqFt: 1_000, totalBudget: 600_000, approvedBudget: 500_000, pendingBudget: 0 },
        }));
      }
      return Promise.resolve(apiResponse({}));
    });

    render(<CostCentresPage />);
    expect(await screen.findByText('North Electrical')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: uiStringPattern(UI_STRINGS.appAppCostCentresPage.loadMoreCostCentres) }));

    expect(await screen.findByText('Storage')).toBeInTheDocument();
    expect(screen.getByText('North Electrical')).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith('/api/cost-centres?page=2&pageSize=50');
  });

  it('hides create actions for read-only users and handles unavailable list endpoints', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/auth/me') return Promise.reject(new Error('auth offline'));
      if (url.startsWith('/api/cost-centres')) return Promise.resolve(apiResponse([], false));
      if (url === '/api/projects') return Promise.resolve(apiResponse({ data: projects }));
      return Promise.resolve(apiResponse({}));
    });
    render(<CostCentresPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppCostCentresPage.noCostCentresFoundMatchingCriteria))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: uiStringPattern(UI_STRINGS.appAppCostCentresPage.createCostCentre) })).not.toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.toLocaleStringSqft)).length).toBeGreaterThan(0);
    expect(screen.getByText(interpolateUiString(UI_STRINGS.common.currencyAmount, { currency: `${UI_STRINGS.common.indianRupeeSymbol} `, amount: '0.00 Lakhs' }))).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.toLocaleStringSqft)).length).toBeGreaterThan(0);

    mockFetch.mockImplementation((url: string) => url === '/api/auth/me'
      ? Promise.reject(new Error('auth offline'))
      : Promise.reject(new Error('list offline')));
    fireEvent.change(screen.getByDisplayValue(uiStringPattern(UI_STRINGS.common.allProjects)), { target: { value: 'project-2' } });
    await waitFor(() => expect(consoleError).toHaveBeenCalledWith('Failed to load cost centre register', expect.any(Error)));
    consoleError.mockRestore();
  });

  it('validates and creates a cost centre with optional numeric and text details', async () => {
    render(<CostCentresPage />);
    await screen.findByRole('button', { name: uiStringPattern(UI_STRINGS.appAppCostCentresPage.createCostCentre) });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppCostCentresPage.createCostCentre) }));
    const save = screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppCostCentresPage.saveCostCentre) });
    fireEvent.submit(save.closest('form')!);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppCostCentresPage.projectCodeAndNameAreMandatory))).toBeInTheDocument();

    const modal = screen.getByText(uiStringPattern(UI_STRINGS.appAppCostCentresPage.createNewCostCentre)).closest('.card') as HTMLElement;
    fireEvent.click(within(modal).getAllByRole('button')[0]);
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppCostCentresPage.createNewCostCentre))).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppCostCentresPage.createCostCentre) }));

    fireEvent.change(document.querySelector('.select-field')!, { target: { value: 'project-2' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppCostCentresPage.cC006)), { target: { value: 'CC-007' } });
    fireEvent.change(screen.getByPlaceholderText(/Signage/), { target: { value: 'Signage' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppCostCentresPage.eG8500)), { target: { value: '8500' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppCostCentresPage.eGGroundFloor)), { target: { value: 'West Wing' } });
    fireEvent.change(screen.getByPlaceholderText(/Zone A - Customer Retail Hall/), { target: { value: 'Level 1' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppCostCentresPage.scopeDescriptionForThisCostCentre)), { target: { value: 'Store entrance works' } });
    mockFetch.mockImplementation((url: string, init?: RequestInit) => url === '/api/auth/me'
      ? Promise.resolve(apiResponse({ data: { user: { role: 'PROJECT_USER' } } }))
      : url.startsWith('/api/cost-centres') && init?.method === 'POST'
        ? Promise.resolve(apiResponse({ error: 'Cost centre code already exists' }, false, 409))
        : url.startsWith('/api/cost-centres')
          ? Promise.resolve(apiResponse(centres))
          : Promise.resolve(apiResponse({ data: projects })));
    fireEvent.submit(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppCostCentresPage.saveCostCentre) }).closest('form')!);
    expect(await screen.findByText('Cost centre code already exists')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }));
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppCostCentresPage.createNewCostCentre))).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppCostCentresPage.createCostCentre) }));
    fireEvent.change(document.querySelector('.select-field')!, { target: { value: 'project-2' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppCostCentresPage.cC006)), { target: { value: 'CC-007' } });
    fireEvent.change(screen.getByPlaceholderText(/Signage/), { target: { value: 'Signage' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppCostCentresPage.eG8500)), { target: { value: '8500' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppCostCentresPage.eGGroundFloor)), { target: { value: 'West Wing' } });
    fireEvent.change(screen.getByPlaceholderText(/Zone A - Customer Retail Hall/), { target: { value: 'Level 1' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppCostCentresPage.scopeDescriptionForThisCostCentre)), { target: { value: 'Store entrance works' } });

    mockFetch.mockImplementation((url: string, init?: RequestInit) => url === '/api/auth/me'
      ? Promise.resolve(apiResponse({ data: { user: { role: 'PROJECT_USER' } } }))
      : url.startsWith('/api/cost-centres') && init?.method === 'POST'
        ? Promise.resolve(apiResponse({ id: 'cc-new' }, true, 201))
        : url.startsWith('/api/cost-centres')
          ? Promise.resolve(apiResponse(centres))
          : Promise.resolve(apiResponse({ data: projects })));
    fireEvent.submit(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppCostCentresPage.saveCostCentre) }).closest('form')!);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/cost-centres', expect.objectContaining({ method: 'POST' })));
    const createCall = mockFetch.mock.calls.filter(([url, init]) => url === '/api/cost-centres' && init?.method === 'POST').pop();
    expect(JSON.parse(createCall![1].body)).toMatchObject({
      projectId: 'project-2', code: 'CC-007', name: 'Signage', areaSqFt: 8_500,
      location: 'West Wing', floorZone: 'Level 1', description: 'Store entrance works',
    });
    await waitFor(() => expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppCostCentresPage.createNewCostCentre))).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppCostCentresPage.createCostCentre) }));
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppCostCentresPage.cC006)), { target: { value: 'CC-008' } });
    fireEvent.change(screen.getByPlaceholderText(/Signage/), { target: { value: 'Facade' } });
    mockFetch.mockImplementation((url: string, init?: RequestInit) => url === '/api/auth/me'
      ? Promise.resolve(apiResponse({ user: { role: 'PROJECT_USER' } }))
      : url.startsWith('/api/cost-centres') && init?.method === 'POST'
        ? Promise.resolve(apiResponse({ id: 'cc-2' }, true, 201))
        : url.startsWith('/api/cost-centres')
          ? Promise.resolve(apiResponse(centres))
          : Promise.resolve(apiResponse(projects)));
    fireEvent.submit(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppCostCentresPage.saveCostCentre) }).closest('form')!);
    const secondCreate = mockFetch.mock.calls.filter(([url, init]) => url === '/api/cost-centres' && init?.method === 'POST').pop();
    await waitFor(() => expect(secondCreate).toBeDefined());
    expect(JSON.parse(secondCreate![1].body)).toMatchObject({ code: 'CC-008', name: 'Facade', areaSqFt: null, location: '' });
  });
});
