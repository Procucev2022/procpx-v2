import type { PpoLine } from '@prisma/client';

export type PreparedPpoLineCompletion = {
  line: PpoLine;
  completedQuantity: number;
  finalRate: number;
  actualAmount: number;
  taxAmount: number;
  totalActualAmount: number;
  newCompletedQuantity: number;
  newCompletedAmount: number;
  status: string;
  remarks: string | null;
};
