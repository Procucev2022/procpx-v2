// `.open-next/worker.js` is produced by the OpenNext build. It exists after a Cloudflare build and is
// absent on a fresh checkout, so the directive must not depend on which one happened last.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- Intentional: the module may or may not exist when typechecking.
// @ts-ignore
import { default as openNextHandler } from './.open-next/worker.js';
import { dispatchNotificationOutbox } from './src/lib/notification-outbox';
import {
  MAX_NOTIFICATION_OUTBOX_BATCH_SIZE,
  NOTIFICATION_OUTBOX_MAX_ROUNDS_PER_TICK,
} from './src/lib/notification-outbox.constants';
import { transitionScheduledAuctions } from './src/lib/auction-lifecycle';
import { writeRuntimeStructuredLog } from './src/lib/observability/runtime-logger';
import type { NotificationOutboxDatabase } from './types/lib/notification-outbox.types';

interface ScheduledEvent {
  cron: string;
  scheduledTime: number;
}

interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface WorkerEnvironment {
  DB: NotificationOutboxDatabase;
}

async function logScheduledEvent(level: 'error' | 'info', event: string, context: Record<string, unknown>): Promise<void> {
  try {
    await writeRuntimeStructuredLog(level, event, context, 'application');
  } catch {
    // A logging failure must not interrupt the other scheduled task.
  }
}

/**
 * Drains due notifications within one cron tick. A full batch means more rows are probably waiting, so the
 * dispatcher claims again, up to a fixed number of rounds. Totals are logged once per tick that did any work.
 */
async function dispatchNotificationOutboxRounds(database: NotificationOutboxDatabase, event: ScheduledEvent): Promise<void> {
  const total = { claimed: 0, delivered: 0, retried: 0, dead: 0 };
  for (let round = 0; round < NOTIFICATION_OUTBOX_MAX_ROUNDS_PER_TICK; round += 1) {
    const result = await dispatchNotificationOutbox(database);
    total.claimed += result.claimed;
    total.delivered += result.delivered;
    total.retried += result.retried;
    total.dead += result.dead;
    if (result.claimed < MAX_NOTIFICATION_OUTBOX_BATCH_SIZE) break;
  }
  if (total.claimed > 0) {
    await logScheduledEvent('info', 'notification.outbox_dispatch_summary', {
      operation: 'dispatch_notification_outbox', route: 'scheduled_worker',
      cron: event.cron, scheduledTime: event.scheduledTime, ...total,
    });
  }
}

const worker = {
  fetch: openNextHandler.fetch,
  scheduled(event: ScheduledEvent, env: WorkerEnvironment, context: WorkerExecutionContext) {
    const notificationDispatch = dispatchNotificationOutboxRounds(env.DB, event).catch((error: unknown) => logScheduledEvent(
      'error', 'notification.outbox_scheduled_dispatch_failed', {
        operation: 'scheduled_notification_dispatch', route: 'scheduled_worker',
        cron: event.cron, scheduledTime: event.scheduledTime,
        error: error instanceof Error ? { name: error.name } : { type: typeof error },
      },
    ));
    const auctionTransitions = transitionScheduledAuctions(env.DB, new Date(event.scheduledTime))
      .then(async (result) => {
        if (result.started === 0 && result.closed === 0) return;
        await logScheduledEvent('info', 'auction.lifecycle_scheduled_transitioned', {
          operation: 'transition_scheduled_auctions', route: 'scheduled_worker',
          cron: event.cron, scheduledTime: event.scheduledTime,
          started: result.started, closed: result.closed,
        });
      })
      .catch((error: unknown) => logScheduledEvent('error', 'auction.lifecycle_scheduled_transition_failed', {
        operation: 'transition_scheduled_auctions', route: 'scheduled_worker',
        cron: event.cron, scheduledTime: event.scheduledTime,
        error: error instanceof Error ? { name: error.name } : { type: typeof error },
      }));
    context.waitUntil(Promise.all([notificationDispatch, auctionTransitions]).then(() => undefined));
  },
};

export default worker;
