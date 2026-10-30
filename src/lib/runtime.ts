// lib/runtime.ts - Detect whether the app is running inside a Cloudflare Worker

export function isCloudflareWorker(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';
}
