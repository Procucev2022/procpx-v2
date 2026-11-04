import { apiError } from '../src/lib/api-utils';
import { logEvent } from '../src/lib/observability/server-logger';

jest.mock('../src/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ logEvent: jest.fn() }));

const logEventMock = logEvent as jest.Mock;

describe('apiError logging', () => {
  beforeEach(() => jest.clearAllMocks());

  it('logs server failures as errors with the caught exception and route context', async () => {
    const error = new Error('D1 unavailable');
    const response = apiError('Failed to load PRs', 500, { route: '/api/pr', method: 'GET', error });
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Failed to load PRs' });
    expect(logEventMock).toHaveBeenCalledWith('error', 'api.request_failed', {
      status: 500, responseMessage: 'Failed to load PRs', route: '/api/pr', method: 'GET', error,
    });
  });

  it('logs rejected requests as warnings and accepts a custom event name', () => {
    apiError('Project not found', 404);
    expect(logEventMock).toHaveBeenCalledWith('warn', 'api.request_rejected', { status: 404, responseMessage: 'Project not found' });

    apiError('Duplicate PR number', 409, { event: 'purchase_request.create_conflict', route: '/api/pr' });
    expect(logEventMock).toHaveBeenLastCalledWith('warn', 'purchase_request.create_conflict', {
      status: 409, responseMessage: 'Duplicate PR number', route: '/api/pr',
    });
  });

  it('does not log unauthenticated responses', () => {
    apiError('Unauthenticated', 401);
    expect(logEventMock).not.toHaveBeenCalled();
  });
});
