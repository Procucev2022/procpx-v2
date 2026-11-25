import type { REQUIRED_ENV_VARS } from '@/lib/env.constants';

export type RequiredEnvName = (typeof REQUIRED_ENV_VARS)[number];

export type EnvSource = Record<string, string | undefined>;
