export type BoqRevisionLinesRouteContext = {
  params: Promise<{ revisionId: string }>;
};

export type BoqLineBatchUpdateItem = {
  id?: string;
  lineId?: string;
  updates?: Record<string, unknown>;
  [key: string]: unknown;
};
