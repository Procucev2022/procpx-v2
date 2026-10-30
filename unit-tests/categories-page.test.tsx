/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CategoryCreationPage from '../src/app/(app)/masters/categories/page';

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
  fireEvent.submit(screen.getByRole('button', { name: 'Save Category' }).closest('form')!);
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
    expect(screen.getByText('No subcategories defined')).toBeInTheDocument();
    expect(await screen.findByText('(SUB01)')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();

    const search = screen.getByPlaceholderText('Search category name, code, or subcategory...');
    fireEvent.change(search, { target: { value: 'electrical' } });
    expect(screen.getByText('Electrical')).toBeInTheDocument();
    expect(screen.queryByText('Civil')).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'civ' } });
    expect(screen.getByText('Civil')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'paint' } });
    expect(screen.getByText('Civil')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'sub' } });
    expect(screen.getByText('Civil')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'absent' } });
    expect(screen.getByText('No categories found matching your search.')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: '' } });
    mockFetch.mockImplementation((url: string) => url === '/api/auth/me'
      ? Promise.resolve(response({ user: { role: 'CATEGORY_MANAGER' } }))
      : Promise.resolve(response(categories)));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/masters/categories'));
    expect(await screen.findByText('(SUB01)')).toBeInTheDocument();
  });

  it('validates top-level names and codes before saving, then notifies on success', async () => {
    render(<CategoryCreationPage />);
    await screen.findByText('Civil');
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }));
    expect(screen.getByText('Add Top-Level Category')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Subcategory' }));
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('cat-civil');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'cat-electric' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Top-Level Category' }));
    submitModal();
    expect(await screen.findByText('Category name is required.')).toBeInTheDocument();

    const name = screen.getByPlaceholderText('e.g. Civil & Interior, HVAC, Signage');
    const code = screen.getByPlaceholderText(/Auto-generated on creation/);
    fireEvent.change(name, { target: { value: 'cIvIl' } });
    submitModal();
    expect(await screen.findByText('Top-level category "cIvIl" already exists.')).toBeInTheDocument();

    fireEvent.change(name, { target: { value: 'Plumbing' } });
    fireEvent.change(code, { target: { value: 'sub01' } });
    submitModal();
    expect(await screen.findByText('Category code "SUB01" is already in use.')).toBeInTheDocument();

    fireEvent.change(code, { target: { value: ' plm01 ' } });
    mockFetch.mockImplementation((url: string, init?: RequestInit) => url === '/api/auth/me'
      ? Promise.resolve(response({ user: { role: 'CATEGORY_MANAGER' } }))
      : url === '/api/masters/categories' && init?.method === 'POST'
        ? Promise.resolve(response({ id: 'cat-plumbing' }))
        : Promise.resolve(response({ data: categories })));
    submitModal();
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/masters/categories', expect.objectContaining({ method: 'POST' })));
    const create = mockFetch.mock.calls.filter(([, init]) => init?.method === 'POST').pop();
    expect(JSON.parse(create![1].body)).toEqual({ name: 'Plumbing', code: 'PLM01', parentId: null });
    expect(await screen.findByText(/Category "Plumbing" created successfully/)).toBeInTheDocument();

    const notification = screen.getByText(/created successfully/).parentElement?.parentElement;
    fireEvent.click(within(notification as HTMLElement).getByRole('button'));
    expect(screen.queryByText(/created successfully/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Add Top-Level Category')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }));
    const modal = screen.getByText('Add Top-Level Category').closest('.card') as HTMLElement;
    fireEvent.click(within(modal).getAllByRole('button')[0]);
    expect(screen.queryByText('Add Top-Level Category')).not.toBeInTheDocument();
  });

  it('validates and creates subcategories under their parent, including API errors', async () => {
    render(<CategoryCreationPage />);
    await screen.findByText('Civil');
    const civilRow = screen.getByText('Civil').closest('tr')!;
    fireEvent.click(within(civilRow).getByRole('button', { name: '+ Subcategory' }));
    expect(screen.getByText('Add Subcategory')).toBeInTheDocument();
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('cat-civil');

    const name = screen.getByPlaceholderText('e.g. Civil & Interior, HVAC, Signage');
    const code = screen.getByPlaceholderText(/Auto-generated on creation/);
    fireEvent.change(name, { target: { value: 'painting' } });
    submitModal();
    expect(await screen.findByText('Subcategory "painting" already exists under "Civil".')).toBeInTheDocument();

    fireEvent.change(name, { target: { value: 'Wiring' } });
    fireEvent.change(code, { target: { value: 'civ' } });
    submitModal();
    expect(await screen.findByText('Category code "CIV" is already in use.')).toBeInTheDocument();

    fireEvent.change(code, { target: { value: '' } });
    mockFetch.mockImplementation((url: string, init?: RequestInit) => url === '/api/auth/me'
      ? Promise.resolve(response({ data: { user: { role: 'CATEGORY_MANAGER' } } }))
      : url === '/api/masters/categories' && init?.method === 'POST'
        ? Promise.resolve(response({}, false))
        : Promise.resolve(response({ data: categories })));
    submitModal();
    expect(await screen.findByText('Failed to create category.')).toBeInTheDocument();

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

    fireEvent.click(within(screen.getByText('Civil').closest('tr')!).getByRole('button', { name: '+ Subcategory' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Civil & Interior, HVAC, Signage'), { target: { value: 'Network Test' } });
    mockFetch.mockImplementation((url: string, init?: RequestInit) => url === '/api/auth/me'
      ? Promise.resolve(response({ user: { role: 'CATEGORY_MANAGER' } }))
      : init?.method === 'POST'
        ? Promise.reject(new Error())
        : Promise.resolve(response({ data: categories })));
    submitModal();
    expect(await screen.findByText('Network error creating category.')).toBeInTheDocument();
  });

  it('shows read-only mode and handles empty lists, load errors and missing subcategory parents', async () => {
    mockFetch.mockImplementation((url: string) => url === '/api/auth/me'
      ? Promise.resolve(response({ user: { role: 'FINANCE_USER' } }))
      : Promise.resolve(response({ data: [] })));
    render(<CategoryCreationPage />);
    expect(await screen.findByText('No categories found matching your search.')).toBeInTheDocument();
    expect(screen.getByText('Read-Only Master View:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Category (Admin Only)' })).toBeDisabled();

    mockFetch.mockImplementation((url: string) => url === '/api/auth/me'
      ? Promise.resolve(response({ user: { role: 'CATEGORY_MANAGER' } }))
      : Promise.resolve(response({ data: [] })));
    const { unmount } = render(<CategoryCreationPage />);
    await screen.findByRole('button', { name: 'Add Category' });
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }));
    fireEvent.click(screen.getByLabelText('Subcategory'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Civil & Interior, HVAC, Signage'), { target: { value: 'Utilities' } });
    submitModal();
    expect(await screen.findByText('Please select a parent category for the subcategory.')).toBeInTheDocument();
    unmount();

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockFetch.mockRejectedValue(new Error('categories offline'));
    render(<CategoryCreationPage />);
    expect(await screen.findByText('Failed to load categories.')).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('handles unsuccessful auth and category responses without enabling edits', async () => {
    mockFetch.mockImplementation((url: string) => url === '/api/auth/me'
      ? Promise.resolve(response({}, false))
      : Promise.resolve(response({ error: 'unavailable' }, false)));
    render(<CategoryCreationPage />);
    expect(await screen.findByText('No categories found matching your search.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Category (Admin Only)' })).toBeDisabled();
    expect(screen.getByText('Read-Only Master View:')).toBeInTheDocument();
  });
});
