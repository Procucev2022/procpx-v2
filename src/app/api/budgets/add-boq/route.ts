import { NextRequest } from 'next/server';
import { POST as allocateBoqToBudget } from '@/app/api/boq/add-to-budget/route';

// Keep the historical endpoint as a thin alias so both paths share one workflow.
export async function POST(req: NextRequest) {
  return allocateBoqToBudget(req);
}
