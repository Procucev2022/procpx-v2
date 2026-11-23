// Settings the application refuses to run without. Locally they come from `.env`;
// on Cloudflare they come from wrangler.jsonc vars and `wrangler secret put` secrets.
export const REQUIRED_ENV_VARS = [
  'NEXTAUTH_SECRET',
  'NEXTAUTH_URL',
  'DATABASE_PROVIDER',
  'UPLOAD_DIR',
  'GEMINI_API_KEY',
] as const;

// `next build` sets NEXT_PHASE to this value; runtime secrets are not present while building.
export const NEXT_BUILD_PHASE = 'phase-production-build';
