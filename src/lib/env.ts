// lib/env.ts - Required application settings with no built-in fallbacks.
import type { EnvSource, RequiredEnvName } from '@app-types/lib/env.types';
import { NEXT_BUILD_PHASE, REQUIRED_ENV_VARS } from './env.constants';
import { interpolateUiString } from './i18n';
import { UI_STRINGS } from './ui-strings.constants';

export type { EnvSource, RequiredEnvName };

function isSet(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function missingEnvError(names: readonly string[]): Error {
  return new Error(interpolateUiString(UI_STRINGS.libEnv.missingRequiredSettings, { names: names.join(', ') }));
}

/** Names of required settings that are absent or blank. */
export function getMissingRequiredEnv(env: EnvSource = process.env): RequiredEnvName[] {
  return REQUIRED_ENV_VARS.filter((name) => !isSet(env[name]));
}

/** Stops startup when any required setting is missing. Skipped while `next build` runs. */
export function assertRequiredEnv(env: EnvSource = process.env): void {
  if (env.NEXT_PHASE === NEXT_BUILD_PHASE) return;
  const missing = getMissingRequiredEnv(env);
  if (missing.length > 0) throw missingEnvError(missing);
}

/** Reads one required setting, failing instead of substituting a default. */
export function getRequiredEnv(name: RequiredEnvName, env: EnvSource = process.env): string {
  const value = env[name];
  if (!isSet(value)) throw missingEnvError([name]);
  return value;
}
