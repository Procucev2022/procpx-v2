/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PageLoadingSkeleton from '../src/components/ui/PageLoadingSkeleton';
import AppLoading from '../src/app/(app)/loading';
import AppError from '../src/app/(app)/error';
import RootError from '../src/app/error';
import GlobalError from '../src/app/global-error';
import NotFound from '../src/app/not-found';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { reportClientEvent } from '../src/lib/observability/client-reporter';

jest.mock('../src/lib/observability/client-reporter', () => ({
  reportClientEvent: jest.fn(),
  describeError: (error: Error) => ({ name: error.name, message: error.message }),
}));

const reportMock = reportClientEvent as jest.Mock;

describe('route loading and error boundaries', () => {
  beforeEach(() => reportMock.mockClear());

  it('announces the loading placeholder to assistive technology and hides its decorative rows', () => {
    render(<PageLoadingSkeleton />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(UI_STRINGS.common.loadingPageContent);
    expect(status.querySelectorAll('[aria-hidden="true"] .skeleton-line').length).toBeGreaterThan(6);
  });

  it('renders the segment loading placeholder while authenticated pages stream', () => {
    render(<AppLoading />);
    expect(screen.getByRole('status')).toHaveTextContent(UI_STRINGS.common.loadingPageContent);
  });

  it('reports a segment render failure with its digest and retries through the reset callback', () => {
    const reset = jest.fn();
    const failure = Object.assign(new Error('render exploded'), { digest: 'digest-app-1' });
    render(<AppError error={failure} reset={reset} />);

    expect(reportMock).toHaveBeenCalledWith('error', 'browser.render_failed', expect.objectContaining({
      boundary: 'app', digest: 'digest-app-1',
    }));
    fireEvent.click(screen.getByRole('button', { name: UI_STRINGS.appErrorBoundary.retry }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('uses the root boundary label for public routes', () => {
    const reset = jest.fn();
    render(<RootError error={new Error('login failed')} reset={reset} />);
    expect(reportMock).toHaveBeenCalledWith('error', 'browser.render_failed', expect.objectContaining({ boundary: 'root' }));
    fireEvent.click(screen.getByRole('button', { name: UI_STRINGS.appErrorBoundary.retry }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('keeps the global boundary usable when the root layout itself has failed', () => {
    const reset = jest.fn();
    render(<GlobalError error={new Error('layout failed')} reset={reset} />);
    expect(reportMock).toHaveBeenCalledWith('error', 'browser.render_failed', expect.objectContaining({ boundary: 'global' }));
    fireEvent.click(screen.getByRole('button', { name: UI_STRINGS.appErrorBoundary.retry }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('offers a way back from unknown routes', () => {
    render(<NotFound />);
    expect(screen.getByRole('alert')).toHaveTextContent(UI_STRINGS.appNotFound.title);
    expect(screen.getByRole('link', { name: UI_STRINGS.appNotFound.backToDashboard })).toHaveAttribute('href', '/dashboard');
  });
});
