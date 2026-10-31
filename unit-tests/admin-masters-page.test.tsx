/** @jest-environment jsdom */
import { uiStringPattern } from '@/lib/i18n';

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import MastersPage from '../src/app/(app)/admin/masters/page';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


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
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppAdminMastersPage.loadingMasters))).toBeInTheDocument();

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

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.categories) }));
    expect(screen.getByText('Cables')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.noSubcategories))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminMastersPage.uOMMaster) }));
    expect(screen.getByText('Metre')).toBeInTheDocument();
  });

  it('validates and creates UOMs, resets the form, reloads data, and dismisses feedback', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ json: async () => [] })
      .mockResolvedValueOnce({ json: async () => [] });
    render(<MastersPage />);
    await waitFor(() => expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppAdminMastersPage.loadingMasters))).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminMastersPage.addUOM2) }));

    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'SQM' } });
    fireEvent.change(inputs[1], { target: { value: 'Square metre' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'AREA' } });
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'UOM code already exists' }) });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminMastersPage.create) }));
    expect(await screen.findByText('UOM code already exists')).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.appAppAdminMastersPage.addUOM2))).toHaveLength(2);

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'uom-new' }) })
      .mockResolvedValueOnce({ json: async () => [{ id: 'uom-new', code: 'SQM', name: 'Square metre', category: 'AREA', aliases: null }] })
      .mockResolvedValueOnce({ json: async () => [] });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminMastersPage.create) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppAdminMastersPage.uOMCreatedSuccessfully))).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Square metre')).toBeInTheDocument());
    const message = screen.getByText(uiStringPattern(UI_STRINGS.appAppAdminMastersPage.uOMCreatedSuccessfully));
    const dismiss = message.closest('div')?.parentElement?.querySelector('button');
    expect(dismiss).not.toBeNull();
    fireEvent.click(dismiss!);
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppAdminMastersPage.uOMCreatedSuccessfully))).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminMastersPage.addUOM2) }));
    expect((screen.getAllByRole('textbox')[0] as HTMLInputElement).value).toBe('');
    expect((screen.getAllByRole('textbox')[1] as HTMLInputElement).value).toBe('');
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('COUNT');
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminMastersPage.addUOM2) }));
    fireEvent.click(document.querySelector('.modal-overlay')!);
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppAdminMastersPage.create))).not.toBeInTheDocument();
  });

  it('creates categories with optional parent and code and shows failed/success feedback', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ json: async () => [] })
      .mockResolvedValueOnce({ json: async () => [{ id: 'cat-parent', name: 'Electrical', children: [] }] });
    render(<MastersPage />);
    await waitFor(() => expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppAdminMastersPage.loadingMasters))).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.categories) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminMastersPage.addCategory) }));

    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'Lighting' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'cat-parent' } });
    fireEvent.change(inputs[1], { target: { value: 'LIGHT' } });
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Category code is in use' }) });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminMastersPage.create) }));
    expect(await screen.findByText('Category code is in use')).toBeInTheDocument();

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'category-new' }) })
      .mockResolvedValueOnce({ json: async () => [] })
      .mockResolvedValueOnce({ json: async () => [{ id: 'cat-parent', name: 'Electrical', children: [{ id: 'category-new', name: 'Lighting' }] }] });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminMastersPage.create) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppAdminMastersPage.categoryCreatedSuccessfully))).toBeInTheDocument();
    expect(global.fetch).toHaveBeenLastCalledWith('/api/masters/categories');
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminMastersPage.addCategory) }));
    expect((screen.getAllByRole('textbox')[0] as HTMLInputElement).value).toBe('');
    expect((screen.getAllByRole('textbox')[1] as HTMLInputElement).value).toBe('');
    fireEvent.click(document.querySelector('.modal-header button')!);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminMastersPage.addCategory) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }));
  });
});
