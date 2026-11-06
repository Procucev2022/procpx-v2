import { runD1BatchAtomically } from '../src/lib/d1-batch';
import { transitionScheduledAuctions } from '../src/lib/auction-lifecycle';
import { AUCTION_ACTIVATE_SCHEDULED_SQL, AUCTION_CLOSE_EXPIRED_SQL } from '../src/lib/auction-lifecycle.constants';
import type { NotificationOutboxDatabase } from '../types/lib/notification-outbox.types';

jest.mock('../src/lib/d1-batch', () => ({ runD1BatchAtomically: jest.fn() }));

const runBatch = runD1BatchAtomically as jest.Mock;
const database = {} as NotificationOutboxDatabase;

describe('scheduled auction lifecycle', () => {
  beforeEach(() => jest.clearAllMocks());

  it('activates and closes time-based auctions in one atomic tenant-wide D1 batch', async () => {
    const now = new Date('2026-11-05T10:00:00.000Z');
    runBatch.mockResolvedValue([{ meta: { changes: 2 } }, { meta: { changes: 3 } }]);

    await expect(transitionScheduledAuctions(database, now)).resolves.toEqual({ started: 2, closed: 3 });
    expect(runBatch).toHaveBeenCalledWith(database, [
      { sql: AUCTION_ACTIVATE_SCHEDULED_SQL, values: [now, now, now] },
      { sql: AUCTION_CLOSE_EXPIRED_SQL, values: [now, now] },
    ]);
    expect(AUCTION_ACTIVATE_SCHEDULED_SQL).toContain('"startTime" <= ? AND "endTime" > ?');
    expect(AUCTION_CLOSE_EXPIRED_SQL).toContain("'LIVE', 'EXTENDED', 'SCHEDULED'");
  });

  it('returns zero transitions when D1 reports no changed rows', async () => {
    runBatch.mockResolvedValue([{}, { meta: { changes: 0 } }]);
    await expect(transitionScheduledAuctions(database, new Date())).resolves.toEqual({ started: 0, closed: 0 });
  });

  it('propagates failed batches so the scheduled worker can record and retry the error', async () => {
    const failure = new Error('D1 unavailable');
    runBatch.mockRejectedValue(failure);
    await expect(transitionScheduledAuctions(database, new Date())).rejects.toBe(failure);
  });
});
