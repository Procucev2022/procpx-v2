/** @jest-environment jsdom */
import { uiStringPattern } from '@/lib/i18n';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import NewProjectPage from '../src/app/(app)/projects/new/page';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));
jest.mock('next/link', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
      React.createElement('a', { href, ...props }, children),
  };
});

const router = useRouter as jest.MockedFunction<typeof useRouter>;
const originalFetch = global.fetch;
const push = jest.fn();
const mockFetch = jest.fn();

function fillRequiredFields() {
  fireEvent.change(getControl(/Project Name/), { target: { value: '  Store refresh  ' } });
  fireEvent.change(getControl(/Sector/), { target: { value: 'RETAIL' } });
  fireEvent.change(getControl(/Project Type/), { target: { value: 'RENOVATION' } });
}

function getControl(label: RegExp) {
  const fieldLabel = screen.getByText(label, { selector: 'label' });
  return fieldLabel.parentElement?.querySelector('input,select,textarea') as HTMLElement;
}

function submitForm() {
  fireEvent.submit(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProjectsNewPage.createProject) }).closest('form')!);
}

describe('new project page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    push.mockReset();
    router.mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/auth/me') {
        return Promise.resolve({ json: async () => ({ data: { user: { role: 'PROJECT_USER' } } }) });
      }
      return Promise.resolve({ ok: true, status: 201, json: async () => ({ id: 'project-1' }) });
    });
    global.fetch = mockFetch as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('renders all project fields and supports edits across the four sections', async () => {
    render(<NewProjectPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.basicInformation))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProjectsNewPage.locationSiteAddress))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProjectsNewPage.commercialTechnicalSpecifications))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProjectsNewPage.projectTimeline))).toBeInTheDocument();
    expect(getControl(/Country/)).toHaveValue(UI_STRINGS.common.india);
    expect(getControl(/Currency/)).toHaveValue(UI_STRINGS.common.iNR);

    const edits: Array<[RegExp, string]> = [
      [/Project Description/, 'Refresh and expand the store'],
      [/City/, 'Bengaluru'],
      [/State \/ Region/, 'Karnataka'],
      [/Country/, 'India'],
      [/Location \/ Commercial Area/, 'Koramangala'],
      [/Full Site Address/, '12 Main Road'],
      [/Area \(Sq Ft\)/, '25000'],
      [/Cost Centre Code/, 'RET-BLR-001'],
      [/Project Owner/, 'A. Owner'],
      [/Budget \(Est\.\)/, '450000'],
      [/Business Unit/, 'Retail Operations'],
      [/Number of Floors/, '3'],
      [/Number of Units \/ Outlets/, '2'],
      [/Project Start Date/, '2026-11-01'],
      [/Target Completion Date/, '2027-04-01'],
    ];
    for (const [label, value] of edits) {
      fireEvent.change(getControl(label), { target: { value } });
    }
    fireEvent.change(getControl(/Currency/), { target: { value: 'USD' } });
    expect(getControl(/Currency/)).toHaveValue('USD');
    expect(getControl(/Project Description/)).toHaveValue('Refresh and expand the store');
    expect(getControl(/Target Completion Date/)).toHaveValue('2027-04-01');
  });

  it('validates required fields and restricts read-only roles', async () => {
    const { unmount: unmountValidation } = render(<NewProjectPage />);
    await screen.findByText(uiStringPattern(UI_STRINGS.common.basicInformation));

    submitForm();
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.projectNameIsRequired))).toBeInTheDocument();

    fireEvent.change(getControl(/Project Name/), { target: { value: 'Project' } });
    submitForm();
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.sectorIsRequired))).toBeInTheDocument();

    fireEvent.change(getControl(/Sector/), { target: { value: 'RETAIL' } });
    submitForm();
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.projectTypeIsRequired))).toBeInTheDocument();
    unmountValidation();

    mockFetch.mockImplementation((url: string) => url === '/api/auth/me'
      ? Promise.resolve({ json: async () => ({ data: { user: { role: 'FINANCE_USER' } } }) })
      : Promise.resolve({ ok: true, status: 201, json: async () => ({ id: 'unused' }) }));
    const { unmount } = render(<NewProjectPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppProjectsNewPage.readOnlyNotice))).toBeInTheDocument();
    fillRequiredFields();
    submitForm();
    expect(await screen.findByText(/Forbidden: Your role/)).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalledWith('/api/projects', expect.anything());
    unmount();
  });

  it('submits form values and routes to the created project or register', async () => {
    const { unmount: unmountCreated } = render(<NewProjectPage />);
    await screen.findByText(uiStringPattern(UI_STRINGS.common.basicInformation));
    fillRequiredFields();
    fireEvent.change(getControl(/City/), { target: { value: 'Bengaluru' } });
    submitForm();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/projects/project-1'));
    const createCall = mockFetch.mock.calls.find(([url]) => url === '/api/projects');
    expect(JSON.parse(createCall![1].body)).toMatchObject({ name: '  Store refresh  ', sector: 'RETAIL', projectType: 'RENOVATION', city: 'Bengaluru' });
    unmountCreated();

    push.mockClear();
    mockFetch.mockImplementation((url: string) => url === '/api/auth/me'
      ? Promise.resolve({ json: async () => ({ user: { role: 'CLIENT_ADMIN' } }) })
      : Promise.resolve({ ok: true, status: 201, json: async () => ({}) }));
    const { unmount } = render(<NewProjectPage />);
    await screen.findByText(uiStringPattern(UI_STRINGS.common.basicInformation));
    fillRequiredFields();
    submitForm();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/projects'));
    unmount();
  });

  it('shows API errors, handles non-JSON success and error responses, and clears loading state', async () => {
    render(<NewProjectPage />);
    await screen.findByText(uiStringPattern(UI_STRINGS.common.basicInformation));
    fillRequiredFields();
    mockFetch.mockImplementation((url: string) => url === '/api/auth/me'
      ? Promise.resolve({ json: async () => ({}) })
      : Promise.resolve({ ok: false, status: 409, json: async () => ({ error: 'Project code already exists' }) }));
    submitForm();
    expect(await screen.findByText('Project code already exists')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProjectsNewPage.createProject) })).toBeEnabled();

    mockFetch.mockImplementation((url: string) => url === '/api/auth/me'
      ? Promise.resolve({ json: async () => ({}) })
      : Promise.resolve({ ok: false, status: 503, json: async () => { throw new Error('invalid json'); } }));
    submitForm();
    expect(await screen.findByText(/Failed to create project \(HTTP 503\)/)).toBeInTheDocument();

    mockFetch.mockImplementation((url: string) => url === '/api/auth/me'
      ? Promise.resolve({ json: async () => ({}) })
      : Promise.resolve({ ok: true, status: 200, json: async () => { throw new Error('empty body'); } }));
    submitForm();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/projects'));
  });

  it('reports network failures and ignores a failed current-user request', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockFetch.mockImplementation((url: string) => url === '/api/auth/me'
      ? Promise.reject(new Error('auth offline'))
      : Promise.reject(new Error('project service offline')));
    render(<NewProjectPage />);
    await screen.findByText(uiStringPattern(UI_STRINGS.common.basicInformation));
    fillRequiredFields();
    submitForm();
    expect(await screen.findByText('project service offline')).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith('[Create Project Network Error]:', expect.any(Error));
    consoleError.mockRestore();
  });
});
