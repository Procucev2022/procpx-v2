import type { Prisma } from '@prisma/client';

export type SelectedPrBoqLine = Prisma.BoqLineGetPayload<{
  include: {
    category: true;
    subcategory: true;
    uom: true;
  };
}>;
