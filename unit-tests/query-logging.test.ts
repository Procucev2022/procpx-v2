import { logEvent } from '../src/lib/observability/server-logger';
import { runLoggedQuery, withQueryLogging } from '../src/lib/observability/query-logging';
import { SLOW_QUERY_THRESHOLD_MS } from '../src/lib/observability/query-logging.constants';
import type { PrismaClient } from '@prisma/client';

jest.mock('../src/lib/observability/server-logger', () => ({ logEvent: jest.fn() }));

const logEventMock = logEvent as jest.Mock;

describe('Prisma query logging', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it('returns fast results without logging', async () => {
    const query = jest.fn().mockResolvedValue(['row']);
    await expect(runLoggedQuery({ model: 'Boq', operation: 'findMany', args: { take: 1 }, query })).resolves.toEqual(['row']);
    expect(query).toHaveBeenCalledWith({ take: 1 });
    expect(logEventMock).not.toHaveBeenCalled();
  });

  it('logs slow queries with model and operation', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_000 + SLOW_QUERY_THRESHOLD_MS);
    await runLoggedQuery({ model: 'Notification', operation: 'count', args: {}, query: jest.fn().mockResolvedValue(3) });
    expect(logEventMock).toHaveBeenCalledWith('warn', 'db.query_slow', {
      model: 'Notification', operation: 'count', durationMs: SLOW_QUERY_THRESHOLD_MS,
    });
    now.mockRestore();
  });

  it('logs failures with the Prisma error code and rethrows', async () => {
    const error = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    await expect(runLoggedQuery({ model: 'Ppo', operation: 'create', args: {}, query: jest.fn().mockRejectedValue(error) }))
      .rejects.toBe(error);
    expect(logEventMock).toHaveBeenCalledWith('error', 'db.query_failed', expect.objectContaining({
      model: 'Ppo', operation: 'create', prismaCode: 'P2002', error,
    }));

    await expect(runLoggedQuery({ operation: 'queryRaw', args: {}, query: jest.fn().mockRejectedValue(null) })).rejects.toBeNull();
    expect(logEventMock).toHaveBeenLastCalledWith('error', 'db.query_failed', expect.objectContaining({ prismaCode: undefined }));
  });

  it('installs an $allOperations extension that delegates to the logger', async () => {
    const extended = { extended: true };
    const $extends = jest.fn().mockReturnValue(extended);
    expect(withQueryLogging({ $extends } as unknown as PrismaClient)).toBe(extended);

    const handler = $extends.mock.calls[0][0].query.$allModels.$allOperations;
    const query = jest.fn().mockResolvedValue('ok');
    await expect(handler({ model: 'Rfq', operation: 'findFirst', args: {}, query })).resolves.toBe('ok');
  });
});
