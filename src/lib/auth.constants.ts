/** Bounds non-production fallback matching for vendor test logins. */
export const AUTH_VENDOR_USERNAME_FALLBACK_CANDIDATE_LIMIT = 250;

/** Signing key used only for local development and tests. It is public, so production must never fall back to it. */
export const AUTH_DEVELOPMENT_SECRET = 'procpx-local-development-only-secret-do-not-deploy';

/** Thrown when a production runtime starts without NEXTAUTH_SECRET or AUTH_SECRET. */
export const AUTH_SECRET_REQUIRED_MESSAGE = 'NEXTAUTH_SECRET (or AUTH_SECRET) must be configured for production sessions.';

/** Next.js sets this phase while `next build` collects pages, where the secret is not needed yet. */
export const NEXT_PRODUCTION_BUILD_PHASE = 'phase-production-build';
