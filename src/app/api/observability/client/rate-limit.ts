import type { ClientLogRateLimitBucket } from '@app-types/app/api/observability/client/rate-limit.types';
import { RATE_LIMIT_PER_MINUTE } from './route.constants';

const rateLimitBuckets = new Map<string, ClientLogRateLimitBucket>();

export function isClientLogRateLimited(key: string, now = Date.now()): boolean {
  let bucket = rateLimitBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= 60_000) {
    bucket = { startedAt: now, count: 0 };
    rateLimitBuckets.set(key, bucket);
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_PER_MINUTE;
}

export function resetClientLogRateLimits(): void {
  rateLimitBuckets.clear();
}
