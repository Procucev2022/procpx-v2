export type D1BatchStatement = {
  bind(...values: unknown[]): D1BatchStatement;
};

export type D1BatchInputStatement = {
  sql: string;
  values: unknown[];
};

export type D1BatchResult = {
  success?: boolean;
  meta?: { changes?: number };
  results?: Array<Record<string, unknown>>;
};

export type D1BatchDatabase = {
  prepare(sql: string): D1BatchStatement;
  batch(statements: D1BatchStatement[]): Promise<D1BatchResult[]>;
};
