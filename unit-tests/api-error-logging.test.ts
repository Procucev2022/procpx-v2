import { apiError } from '../src/lib/api-utils';
import { logEvent } from '../src/lib/observability/server-logger';
import { UI_STRINGS } from '../src/lib/ui-strings.constants';

jest.mock('../src/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ logEvent: jest.fn() }));

const logEventMock = logEvent as jest.Mock;

describe('apiError logging', () => {
  beforeEach(() => jest.clearAllMocks());

  it('logs server failures with the caught exception and route context but returns only a public message', async () => {
    const error = new Error('D1 unavailable');
    const response = apiError('Failed to load PRs', 500, { route: '/api/pr', method: 'GET', error });
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: UI_STRINGS.common.userMessages.anUnexpectedErrorOccurred });
    expect(logEventMock).toHaveBeenCalledWith('error', 'http.api_error_response', {
      operation: 'api_error_response',
      status: 500,
      publicError: UI_STRINGS.common.userMessages.anUnexpectedErrorOccurred,
      route: '/api/pr',
      method: 'GET',
      error,
    });
  });

  it('logs rejected requests as warnings and accepts a custom event name', () => {
    apiError('Project not found', 404);
    expect(logEventMock).toHaveBeenCalledWith('warn', 'api.request_rejected', {
      operation: 'api_error_response', status: 404, publicError: 'Project not found',
    });

    apiError('Duplicate PR number', 409, { event: 'purchase_request.create_conflict', route: '/api/pr' });
    expect(logEventMock).toHaveBeenLastCalledWith('warn', 'purchase_request.create_conflict', {
      operation: 'api_error_response', status: 409, publicError: 'Duplicate PR number', route: '/api/pr',
    });
  });

  it('does not log unauthenticated responses', () => {
    apiError('Unauthenticated', 401);
    expect(logEventMock).not.toHaveBeenCalled();
  });
});
