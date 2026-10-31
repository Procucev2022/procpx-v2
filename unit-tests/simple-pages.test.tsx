/** @jest-environment jsdom */
import { uiStringPattern } from '@/lib/i18n';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { auth } from '../src/lib/auth';
import { redirect, useRouter, useSearchParams } from 'next/navigation';
import RootLayout, { metadata } from '../src/app/layout';
import RootPage from '../src/app/page';
import ProcurementPage from '../src/app/(app)/procurement/page';
import VendorPortalIndexPage from '../src/app/(app)/vendor-portal/page';
import StandardLibraryRedirectPage from '../src/app/(app)/boq/standard-library/page';
import CostCentreBudgetsRedirect from '../src/app/(app)/budget/cost-centres/page';
import BudgetProjectRedirect from '../src/app/(app)/budget/project/page';
import BudgetStatusRedirect from '../src/app/(app)/budget/status/page';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { I18N_CONFIG } from '@/lib/i18n.constants';


jest.mock('../src/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

const authMock = auth as jest.Mock;
const redirectMock = redirect as unknown as jest.Mock;
const useRouterMock = useRouter as jest.Mock;
const useSearchParamsMock = useSearchParams as jest.Mock;
const router = { replace: jest.fn() };

describe('simple app and redirect pages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authMock.mockResolvedValue(null);
    useRouterMock.mockReturnValue(router);
    useSearchParamsMock.mockReturnValue(new URLSearchParams());
  });

  it('redirects the root page based on session and redirects its legacy indexes', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'user-1' } });
    await RootPage();
    expect(redirectMock).toHaveBeenLastCalledWith('/dashboard');

    authMock.mockResolvedValueOnce(null);
    await RootPage();
    expect(redirectMock).toHaveBeenLastCalledWith(UI_STRINGS.libAuth.login);

    ProcurementPage();
    expect(redirectMock).toHaveBeenLastCalledWith('/dashboard');
    VendorPortalIndexPage();
    expect(redirectMock).toHaveBeenLastCalledWith('/vendor-portal/dashboard');
  });

  it('returns the root document structure and metadata', () => {
    expect(metadata).toMatchObject({
      title: UI_STRINGS.appLayoutConstants.proCPXProcurementEnterpriseCapexProcurementPlatform,
      robots: 'noindex, nofollow',
    });
    const layout = RootLayout({ children: <span>App content</span> });
    expect(layout.type).toBe('html');
    expect(layout.props.lang).toBe(I18N_CONFIG.defaultLocale);
    expect(layout.props.children.type).toBe('body');
    expect(layout.props.children.props.children.props.children).toBe('App content');
  });

  it('redirects the standard BOQ library to its canonical route', async () => {
    render(<StandardLibraryRedirectPage />);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStandardLibraryPage.redirectingToStandardBOQMaster))).toBeInTheDocument();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/masters/standard-boq'));
  });

  it.each([
    ['cost-centres', CostCentreBudgetsRedirect, 'Redirecting to Project Budget...'],
    ['project', BudgetProjectRedirect, 'Loading Project Budget...'],
    ['status', BudgetStatusRedirect, 'Redirecting to Project Budget...'],
  ])('preserves query parameters on the %s budget redirect', async (_name, Page, label) => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams('projectId=project-7&site=North%20Wing'));
    render(<Page />);
    expect(screen.getByText(label)).toBeInTheDocument();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/budget?projectId=project-7&site=North+Wing'));
  });

  it.each([
    ['cost-centres', CostCentreBudgetsRedirect],
    ['project', BudgetProjectRedirect],
    ['status', BudgetStatusRedirect],
  ])('falls back to the base budget route when %s has no query parameters', async (_name, Page) => {
    useSearchParamsMock.mockReturnValueOnce(new URLSearchParams());
    render(<Page />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/budget'));
  });

  it.each([
    ['cost-centres', CostCentreBudgetsRedirect],
    ['project', BudgetProjectRedirect],
    ['status', BudgetStatusRedirect],
  ])('handles unavailable search parameters in the %s alias', async (_name, Page) => {
    useSearchParamsMock.mockReturnValueOnce(null);
    render(<Page />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/budget'));
  });
});
