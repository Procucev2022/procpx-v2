// lib/runtime.ts - Detect where the app is running and which database it uses

export function isCloudflareWorker(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';
}

/** True on Workers, or locally when DATABASE_PROVIDER=d1 enables Wrangler's local D1 binding. */
export function usesD1Database(): boolean {
  return isCloudflareWorker() || process.env.DATABASE_PROVIDER === 'd1';
}
