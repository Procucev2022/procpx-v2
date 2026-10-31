/** @jest-environment jsdom */
import { uiStringPattern } from '@/lib/i18n';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CategoryCreationPage from '../src/app/(app)/masters/categories/page';
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
const categories = [
  {
    id: 'cat-civil', name: 'Civil', code: 'CIV', parentId: null, level: 1, isActive: true, sortOrder: 1, createdAt: '2026-01-01',
    children: [{ id: 'sub-paint', name: 'Painting', code: 'SUB01', parentId: 'cat-civil', level: 2, isActive: true, sortOrder: 1, createdAt: '2026-01-01' }],
  },
  { id: 'cat-electric', name: 'Electrical', code: null, parentId: null, level: 1, isActive: true, sortOrder: 2, createdAt: '2026-01-02', children: [] },
];

function response(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

function baseFetch(url: string, init?: RequestInit) {
  if (url === '/api/auth/me') return Promise.resolve(response({ data: { user: { role: 'CATEGORY_MANAGER' } } }));
  if (url === '/api/masters/categories' && init?.method === 'POST') return Promise.resolve(response({ id: 'new-category' }));
  return Promise.resolve(response({ data: categories }));
}

function submitModal() {
  fireEvent.submit(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppMastersCategoriesPage.saveCategory) }).closest('form')!);
}

describe('category taxonomy page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockImplementation(baseFetch);
    global.fetch = mockFetch as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('renders category hierarchy, search matches and refreshes the directory', async () => {
    render(<CategoryCreationPage />);
    expect(await screen.findByText('Civil')).toBeInTheDocument();
    expect(screen.getByText('Painting')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppMastersCategoriesPage.noSubcategoriesDefined))).toBeInTheDocument();
    expect(await screen.findByText('(SUB01)')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.copyefwnq4, '', true))).toBeInTheDocument();

    const search = screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppMastersCategoriesPage.searchCategoryNameCodeOrSubcategory));
    fireEvent.change(search, { target: { value: 'electrical' } });
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical))).toBeInTheDocument();
    expect(screen.queryByText('Civil')).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'civ' } });
    expect(screen.getByText('Civil')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'paint' } });
    expect(screen.getByText('Civil')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'sub' } });
    expect(screen.getByText('Civil')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'absent' } });
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppMastersCategoriesPage.noCategoriesFoundMatchingYourSearch))).toBeInTheDocument();
    fireEvent.change(search, { target: { value: '' } });
    mockFetch.mockImplementation((url: string) => url === '/api/auth/me'
      ? Promise.resolve(response({ data: { user: { role: 'CATEGORY_MANAGER' } } }))
      : Promise.resolve(response(categories)));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.refresh2) }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/masters/categories'));
    expect(await screen.findByText('(SUB01)')).toBeInTheDocument();
  });

  it('validates top-level names and codes before saving, then notifies on success', async () => {
    render(<CategoryCreationPage />);
    await screen.findByText('Civil');
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminMastersPage.addCategory) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppMastersCategoriesPage.addTopLevelCategory))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: uiStringPattern(UI_STRINGS.common.subcategory) }));
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('cat-civil');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'cat-electric' } });
    fireEvent.click(screen.getByRole('radio', { name: uiStringPattern(UI_STRINGS.appAppMastersCategoriesPage.topLevelCategory) }));
    submitModal();
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.categoryNameIsRequired))).toBeInTheDocument();

    const name = screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppMastersCategoriesPage.eGCivilInteriorHVACSignage));
    const code = screen.getByPlaceholderText(/Auto-generated on creation/);
    fireEvent.change(name, { target: { value: 'cIvIl' } });
    submitModal();
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppMastersCategoriesPage.topLevelCategoryTrimmedNameAlreadyExists))).toBeInTheDocument();

    fireEvent.change(name, { target: { value: 'Plumbing' } });
    fireEvent.change(code, { target: { value: 'sub01' } });
    submitModal();
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppMastersCategoriesPage.categoryCodeCodeUpperIsAlreadyInUse))).toBeInTheDocument();

    fireEvent.change(code, { target: { value: ' plm01 ' } });
    mockFetch.mockImplementation((url: string, init?: RequestInit) => url === '/api/auth/me'
      ? Promise.resolve(response({ data: { user: { role: 'CATEGORY_MANAGER' } } }))
      : url === '/api/masters/categories' && init?.method === 'POST'
        ? Promise.resolve(response({ id: 'cat-plumbing' }))
        : Promise.resolve(response({ data: categories })));
    submitModal();
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/masters/categories', expect.objectContaining({ method: 'POST' })));
    const create = mockFetch.mock.calls.filter(([, init]) => init?.method === 'POST').pop();
    expect(JSON.parse(create![1].body)).toEqual({ name: 'Plumbing', code: 'PLM01', parentId: null });
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppMastersCategoriesPage.categoryTrimmedNameCreatedSuccessfullyAndSyncedToBOQStudio))).toBeInTheDocument();

    const notification = screen.getByText(uiStringPattern(UI_STRINGS.appAppMastersCategoriesPage.categoryTrimmedNameCreatedSuccessfullyAndSyncedToBOQStudio)).parentElement?.parentElement;
    fireEvent.click(within(notification as HTMLElement).getByRole('button'));
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppMastersCategoriesPage.categoryTrimmedNameCreatedSuccessfullyAndSyncedToBOQStudio))).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminMastersPage.addCategory) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }));
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppMastersCategoriesPage.addTopLevelCategory))).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminMastersPage.addCategory) }));
    const modal = screen.getByText(uiStringPattern(UI_STRINGS.appAppMastersCategoriesPage.addTopLevelCategory)).closest('.card') as HTMLElement;
    fireEvent.click(within(modal).getAllByRole('button')[0]);
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppMastersCategoriesPage.addTopLevelCategory))).not.toBeInTheDocument();
  });

  it('validates and creates subcategories under their parent, including API errors', async () => {
    render(<CategoryCreationPage />);
    await screen.findByText('Civil');
    const civilRow = screen.getByText('Civil').closest('tr')!;
    fireEvent.click(within(civilRow).getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppMastersCategoriesPage.subcategory) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppMastersCategoriesPage.addSubcategory))).toBeInTheDocument();
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('cat-civil');

    const name = screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppMastersCategoriesPage.eGCivilInteriorHVACSignage));
    const code = screen.getByPlaceholderText(/Auto-generated on creation/);
    fireEvent.change(name, { target: { value: 'painting' } });
    submitModal();
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppMastersCategoriesPage.subcategoryTrimmedNameAlreadyExistsUnderName))).toBeInTheDocument();

    fireEvent.change(name, { target: { value: 'Wiring' } });
    fireEvent.change(code, { target: { value: 'civ' } });
    submitModal();
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppMastersCategoriesPage.categoryCodeCodeUpperIsAlreadyInUse))).toBeInTheDocument();

    fireEvent.change(code, { target: { value: '' } });
    mockFetch.mockImplementation((url: string, init?: RequestInit) => url === '/api/auth/me'
      ? Promise.resolve(response({ data: { user: { role: 'CATEGORY_MANAGER' } } }))
      : url === '/api/masters/categories' && init?.method === 'POST'
        ? Promise.resolve(response({}, false))
        : Promise.resolve(response({ data: categories })));
    submitModal();
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.failedToCreateCategory))).toBeInTheDocument();

    mockFetch.mockImplementation((url: string, init?: RequestInit) => url === '/api/auth/me'
      ? Promise.resolve(response({ data: { user: { role: 'CATEGORY_MANAGER' } } }))
      : url === '/api/masters/categories' && init?.method === 'POST'
        ? Promise.resolve(response({ error: 'Category creation is temporarily disabled' }, false))
        : Promise.resolve(response({ data: categories })));
    submitModal();
    expect(await screen.findByText('Category creation is temporarily disabled')).toBeInTheDocument();

    mockFetch.mockImplementation((url: string, init?: RequestInit) => url === '/api/auth/me'
      ? Promise.resolve(response({ data: { user: { role: 'CATEGORY_MANAGER' } } }))
      : url === '/api/masters/categories' && init?.method === 'POST'
        ? Promise.resolve(response({ id: 'sub-wiring' }))
        : Promise.resolve(response({ data: categories })));
    submitModal();
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/masters/categories', expect.objectContaining({ method: 'POST' })));
    const create = mockFetch.mock.calls.filter(([, init]) => init?.method === 'POST').pop();
    expect(JSON.parse(create![1].body)).toEqual({ name: 'Wiring', code: null, parentId: 'cat-civil' });

    fireEvent.click(within(screen.getByText('Civil').closest('tr')!).getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppMastersCategoriesPage.subcategory) }));
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppMastersCategoriesPage.eGCivilInteriorHVACSignage)), { target: { value: 'Network Test' } });
    mockFetch.mockImplementation((url: string, init?: RequestInit) => url === '/api/auth/me'
      ? Promise.resolve(response({ data: { user: { role: 'CATEGORY_MANAGER' } } }))
      : init?.method === 'POST'
        ? Promise.reject(new Error())
        : Promise.resolve(response({ data: categories })));
    submitModal();
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.networkErrorCreatingCategory))).toBeInTheDocument();
  });

  it('shows read-only mode and handles empty lists, load errors and missing subcategory parents', async () => {
    mockFetch.mockImplementation((url: string) => url === '/api/auth/me'
      ? Promise.resolve(response({ user: { role: 'FINANCE_USER' } }))
      : Promise.resolve(response({ data: [] })));
    const readOnlyView = render(<CategoryCreationPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppMastersCategoriesPage.noCategoriesFoundMatchingYourSearch))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.readOnlyMasterView))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppMastersCategoriesPage.addCategoryAdminOnly) })).toBeDisabled();
    readOnlyView.unmount();

    mockFetch.mockImplementation((url: string) => url === '/api/auth/me'
      ? Promise.resolve(response({ data: { user: { role: 'CATEGORY_MANAGER' } } }))
      : Promise.resolve(response({ data: [] })));
    const { unmount } = render(<CategoryCreationPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.addCategory, '', true) })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.addCategory, '', true) }));
    fireEvent.click(screen.getByLabelText(uiStringPattern(UI_STRINGS.common.subcategory)));
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppMastersCategoriesPage.eGCivilInteriorHVACSignage)), { target: { value: 'Utilities' } });
    submitModal();
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppMastersCategoriesPage.pleaseSelectAParentCategoryForTheSubcategory))).toBeInTheDocument();
    unmount();

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockFetch.mockRejectedValue(new Error('categories offline'));
    render(<CategoryCreationPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppMastersCategoriesPage.failedToLoadCategories))).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('handles unsuccessful auth and category responses without enabling edits', async () => {
    mockFetch.mockImplementation((url: string) => url === '/api/auth/me'
      ? Promise.resolve(response({}, false))
      : Promise.resolve(response({ error: 'unavailable' }, false)));
    render(<CategoryCreationPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppMastersCategoriesPage.noCategoriesFoundMatchingYourSearch))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppMastersCategoriesPage.addCategoryAdminOnly) })).toBeDisabled();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.readOnlyMasterView))).toBeInTheDocument();
  });
});
