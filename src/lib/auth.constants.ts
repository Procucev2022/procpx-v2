/** Bounds non-production fallback matching for vendor test logins. */
export const AUTH_VENDOR_USERNAME_FALLBACK_CANDIDATE_LIMIT = 250;

/** Signing key used only for local development and tests. It is public, so production must never fall back to it. */
export const AUTH_DEVELOPMENT_SECRET = 'procpx-local-development-only-secret-do-not-deploy';

/** Thrown when a production runtime starts without NEXTAUTH_SECRET or AUTH_SECRET. */
export const AUTH_SECRET_REQUIRED_MESSAGE = 'NEXTAUTH_SECRET (or AUTH_SECRET) must be configured for production sessions.';

/** Next.js sets this phase while `next build` collects pages, where the secret is not needed yet. */
export const NEXT_PRODUCTION_BUILD_PHASE = 'phase-production-build';

/** Failed password attempts before an account is locked for a short period. */
export const AUTH_MAX_FAILED_LOGIN_ATTEMPTS = 5;

/** How long an account stays locked after too many failed password attempts. */
export const AUTH_LOCKOUT_DURATION_MS = 15 * 60 * 1000;

/** How often a live session re-reads its account, so deactivation and role changes take effect within this window. */
export const AUTH_ACCOUNT_RECHECK_INTERVAL_MS = 5 * 60 * 1000;

/** Absolute session lifetime in seconds. */
export const AUTH_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

/** Valid bcrypt hash of a placeholder that no account uses. It spends comparable time for unknown emails. */
export const AUTH_TIMING_DUMMY_HASH = '$2b$10$EXBdf0ueIqrs6mRhtapbr.3HN6mIZkK7w6DoNmj/i5no6b/gPadDy';