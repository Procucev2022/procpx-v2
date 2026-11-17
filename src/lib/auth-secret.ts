import {
  AUTH_DEVELOPMENT_SECRET,
  AUTH_SECRET_REQUIRED_MESSAGE,
  NEXT_PRODUCTION_BUILD_PHASE,
} from './auth.constants';

type AuthSecretEnvironment = Partial<Record<'NEXTAUTH_SECRET' | 'AUTH_SECRET' | 'NODE_ENV' | 'NEXT_PHASE', string | undefined>>;

/**
 * Returns the session signing secret. Production runtimes must configure one
 * explicitly; a missing value fails closed instead of signing sessions with a
 * key that is published in the repository.
 */
export function resolveAuthSecret(environment: AuthSecretEnvironment = process.env): string {
  const configured = environment.NEXTAUTH_SECRET || environment.AUTH_SECRET;
  if (configured) return configured;

  const isProductionRuntime = environment.NODE_ENV === 'production'
    && environment.NEXT_PHASE !== NEXT_PRODUCTION_BUILD_PHASE;
  if (isProductionRuntime) throw new Error(AUTH_SECRET_REQUIRED_MESSAGE);
  return AUTH_DEVELOPMENT_SECRET;
}
