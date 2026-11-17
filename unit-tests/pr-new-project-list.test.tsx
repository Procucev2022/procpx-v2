/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import CreatePrPage from '../src/app/(app)/pr/new/page';
import { UI_STRINGS } from '@/lib/ui-strings.constants';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe('PR creation project selector', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('shows the loading label and disables the selector while projects are pending', () => {
    global.fetch = jest.fn(() => new Promise(() => undefined)) as unknown as typeof fetch;

    render(<CreatePrPage />);

    const loadingOption = screen.getByRole('option', { name: UI_STRINGS.appAppPrNewPage.loadingProjects });
    expect(loadingOption.closest('select')).toBeDisabled();
  });

  it('shows a visible failure in the selector instead of an empty list when projects cannot be loaded', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }) as unknown as typeof fetch;

    render(<CreatePrPage />);

    expect(await screen.findByRole('option', { name: UI_STRINGS.appAppPrNewPage.failedToLoadProjects })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: UI_STRINGS.appAppPrNewPage.selectProject })).not.toBeInTheDocument();
  });
});
