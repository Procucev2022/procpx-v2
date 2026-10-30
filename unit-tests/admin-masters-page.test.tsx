/** @jest-environment jsdom */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import MastersPage from '../src/app/(app)/admin/masters/page';

describe('administration masters page', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [] });
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
  });

  it('loads UOMs and categories and renders aliases and subcategory states', async () => {
    let resolveUoms!: (value: unknown) => void;
    let resolveCategories!: (value: unknown) => void;
    (global.fetch as jest.Mock)
      .mockReturnValueOnce(new Promise(resolve => { resolveUoms = resolve; }))
      .mockReturnValueOnce(new Promise(resolve => { resolveCategories = resolve; }));
    render(<MastersPage />);
    expect(screen.getByText('Loading masters...')).toBeInTheDocument();

    await act(async () => {
      resolveUoms({ json: async () => [
        { id: 'uom-1', code: 'M', name: 'Metre', category: 'LENGTH', aliases: '["m","meter"]' },
        { id: 'uom-2', code: 'EA', name: 'Each', category: 'COUNT', aliases: null },
      ] });
      resolveCategories({ json: async () => [
        { id: 'category-1', name: 'Electrical', children: [{ id: 'sub-1', name: 'Cables' }] },
        { id: 'category-2', name: 'Civil', children: [] },
      ] });
    });
    expect(screen.getByText('Metre')).toBeInTheDocument();
    expect(screen.getByText('m, meter')).toBeInTheDocument();
    expect(screen.getByText('Each')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Categories/ }));
    expect(screen.getByText('Cables')).toBeInTheDocument();
    expect(screen.getByText('No subcategories')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /UOM Master/ }));
    expect(screen.getByText('Metre')).toBeInTheDocument();
  });

  it('validates and creates UOMs, resets the form, reloads data, and dismisses feedback', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ json: async () => [] })
      .mockResolvedValueOnce({ json: async () => [] });
    render(<MastersPage />);
    await waitFor(() => expect(screen.queryByText('Loading masters...')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Add UOM' }));

    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'SQM' } });
    fireEvent.change(inputs[1], { target: { value: 'Square metre' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'AREA' } });
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'UOM code already exists' }) });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('UOM code already exists')).toBeInTheDocument();
    expect(screen.getAllByText('Add UOM')).toHaveLength(2);

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'uom-new' }) })
      .mockResolvedValueOnce({ json: async () => [{ id: 'uom-new', code: 'SQM', name: 'Square metre', category: 'AREA', aliases: null }] })
      .mockResolvedValueOnce({ json: async () => [] });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('UOM created successfully.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Square metre')).toBeInTheDocument());
    const message = screen.getByText('UOM created successfully.');
    const dismiss = message.closest('div')?.parentElement?.querySelector('button');
    expect(dismiss).not.toBeNull();
    fireEvent.click(dismiss!);
    expect(screen.queryByText('UOM created successfully.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add UOM' }));
    expect((screen.getAllByRole('textbox')[0] as HTMLInputElement).value).toBe('');
    expect((screen.getAllByRole('textbox')[1] as HTMLInputElement).value).toBe('');
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('COUNT');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add UOM' }));
    fireEvent.click(document.querySelector('.modal-overlay')!);
    expect(screen.queryByText('Create')).not.toBeInTheDocument();
  });

  it('creates categories with optional parent and code and shows failed/success feedback', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ json: async () => [] })
      .mockResolvedValueOnce({ json: async () => [{ id: 'cat-parent', name: 'Electrical', children: [] }] });
    render(<MastersPage />);
    await waitFor(() => expect(screen.queryByText('Loading masters...')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Categories/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }));

    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'Lighting' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'cat-parent' } });
    fireEvent.change(inputs[1], { target: { value: 'LIGHT' } });
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Category code is in use' }) });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('Category code is in use')).toBeInTheDocument();

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'category-new' }) })
      .mockResolvedValueOnce({ json: async () => [] })
      .mockResolvedValueOnce({ json: async () => [{ id: 'cat-parent', name: 'Electrical', children: [{ id: 'category-new', name: 'Lighting' }] }] });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('Category created successfully.')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenLastCalledWith('/api/masters/categories');
    fireEvent.click(screen.getByRole('button', { name: /Add Category/ }));
    expect((screen.getAllByRole('textbox')[0] as HTMLInputElement).value).toBe('');
    expect((screen.getAllByRole('textbox')[1] as HTMLInputElement).value).toBe('');
    fireEvent.click(document.querySelector('.modal-header button')!);
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  });
});
