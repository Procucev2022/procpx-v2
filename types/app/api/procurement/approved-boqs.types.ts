export type ApprovedBoqRouteQuery = {
  page: number;
  pageSize: number;
  skip: number;
  projectId: string | null;
  revisionId: string | null;
  search: string;
};

export type ApprovedBoqLine = {
  id: string;
  lineNumber: string;
  description: string;
  specification: string;
  category: string;
  subcategory: string;
  uom: string;
  quantity: number | null;
  benchmarkRate: number;
  benchmarkAmount: number;
};

export type ApprovedBoqCategorySummary = {
  category: string;
  lineCount: number;
  totalQty: number;
  estimatedValue: number;
};

export type ApprovedBoqSummary = {
  id: string;
  boqId: string;
  boqCode: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  location: string;
  approvedRevisionCode: string;
  approvedAt: Date | string | null;
  approvedBy: string;
  costCentre?: string;
  totalLines: number;
  estimatedBenchmarkValue: number;
  categories: ApprovedBoqCategorySummary[];
  rfqCount: number;
  lines?: ApprovedBoqLine[];
};

export type ApprovedBoqDetail = ApprovedBoqSummary & { lines: ApprovedBoqLine[] };

export type ApprovedBoqListResponse = {
  approvedBoqs?: ApprovedBoqSummary[];
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  hasMore?: boolean;
};
