/* Shared declarations for lib/observability/server-logger.ts. */

export type CleanupOptions = {
  directory?: string;
  environment?: NodeJS.ProcessEnv;
  now?: number;
  purgeAll?: boolean;
  retentionDays?: number;
};
