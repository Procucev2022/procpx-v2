/* Shared declarations for lib/observability/query-logging.ts. */

// The parts of a Prisma $allOperations callback that query logging reads.
export interface QueryOperationParams {
  model?: string;
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
}
