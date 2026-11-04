// lib/observability/query-logging.ts - Structured logs for failed and slow Prisma queries
import type { PrismaClient } from '@prisma/client';
import { logEvent } from './server-logger';
import { SLOW_QUERY_THRESHOLD_MS } from './query-logging.constants';
import type { QueryOperationParams } from '@app-types/lib/observability/query-logging.types';

function prismaErrorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

/** Runs one Prisma operation, logging it when it fails or exceeds the slow-query threshold. */
export async function runLoggedQuery({ model, operation, args, query }: QueryOperationParams): Promise<unknown> {
  const startedAt = Date.now();
  try {
    const result = await query(args);
    const durationMs = Date.now() - startedAt;
    if (durationMs >= SLOW_QUERY_THRESHOLD_MS) {
      logEvent('warn', 'db.query_slow', { model, operation, durationMs });
    }
    return result;
  } catch (error) {
    logEvent('error', 'db.query_failed', {
      model,
      operation,
      durationMs: Date.now() - startedAt,
      prismaCode: prismaErrorCode(error),
      error,
    });
    throw error;
  }
}

/** Wraps a client so every model operation reports failures and slow queries with model/operation context. */
export function withQueryLogging(client: PrismaClient): PrismaClient {
  return client.$extends({
    query: {
      $allModels: {
        $allOperations(params) {
          return runLoggedQuery(params as unknown as QueryOperationParams);
        },
      },
    },
  }) as unknown as PrismaClient;
}
