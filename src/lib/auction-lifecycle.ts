import { runD1BatchAtomically } from './d1-batch';
import type { NotificationOutboxDatabase } from '@app-types/lib/notification-outbox.types';
import { AUCTION_ACTIVATE_SCHEDULED_SQL, AUCTION_CLOSE_EXPIRED_SQL } from './auction-lifecycle.constants';

export async function transitionScheduledAuctions(database: NotificationOutboxDatabase, now: Date) {
  const results = await runD1BatchAtomically(database, [
    { sql: AUCTION_ACTIVATE_SCHEDULED_SQL, values: [now, now, now] },
    { sql: AUCTION_CLOSE_EXPIRED_SQL, values: [now, now] },
  ]);
  return {
    started: Number(results[0]?.meta?.changes || 0),
    closed: Number(results[1]?.meta?.changes || 0),
  };
}
