/* Shared declarations for lib/record-codes.ts. */

// Any Prisma model delegate whose findMany can return the code column.
export interface CodeLookupDelegate {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts every model's findMany signature.
  findMany(args: any): Promise<Array<Record<string, unknown>>>;
}
