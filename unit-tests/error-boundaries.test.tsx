/** @jest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AppError from '../src/app/(app)/error';
import GlobalError from '../src/app/global-error';
import { reportClientEvent } from '../src/lib/observability/client-reporter';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';

jest.mock('../src/lib/observability/client-reporter', () => ({
  describeError: jest.fn((error: Error) => ({ message: error.message })),
  reportClientEvent: jest.fn(),
}));

describe('error boundaries', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => cleanup());

  it('reports an app render error with its digest and retries on request', () => {
    const retry = jest.fn();
    const error = Object.assign(new Error('render failed'), { digest: 'abc123' });
    render(<AppError error={error} reset={retry} />);

    expect(screen.getByRole('alert')).toHaveTextContent(UI_STRINGS.appErrorBoundary.title);
    expect(screen.getByText(interpolateUiString(UI_STRINGS.appErrorBoundary.reference, { digest: 'abc123' }))).toBeInTheDocument();
    expect(reportClientEvent).toHaveBeenCalledWith('error', 'browser.render_failed', {
      boundary: 'app', digest: 'abc123', error: { message: 'render failed' },
    });
    fireEvent.click(screen.getByRole('button', { name: UI_STRINGS.appErrorBoundary.retry }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('renders the global boundary without a digest', () => {
    // global-error renders its own <html>; mounting it inside the test container is enough to exercise it.
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<GlobalError error={new Error('layout failed')} reset={jest.fn()} />);
    consoleError.mockRestore();

    expect(screen.getByText(UI_STRINGS.appErrorBoundary.description)).toBeInTheDocument();
    expect(screen.queryByText(/abc123/)).not.toBeInTheDocument();
    expect(reportClientEvent).toHaveBeenCalledWith('error', 'browser.render_failed', expect.objectContaining({ boundary: 'global', digest: undefined }));
  });
});
