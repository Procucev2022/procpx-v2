export interface RfqLineWrite {
  tenantId: string;
  projectId: string;
  costCentreId: string | null;
  boqId: string | null;
  boqRevisionId: string;
  boqLineId: string | null;
  prLineId: string | null;
  lineNumber: string;
  description: string;
  specification: string | null;
  category: string;
  subcategory: string | null;
  uom: string;
  quantity: number;
  benchmarkRate: number;
  benchmarkAmount: number;
}
