// lib/business-directory.ts - loads the businesses (tenants) an administrator may link users to.
import { prisma } from '@/lib/prisma';
import { canChooseAnyBusiness } from '@/lib/business-name';
import { BUSINESS_SUMMARY_SELECT } from '@/lib/business-directory.constants';
import type { BusinessDirectory, BusinessSummary } from '@app-types/app/api/admin/users/route.types';

/**
 * Businesses the caller may link users to. A Super Admin sees every business; any other
 * administrator only ever receives their own business, so other companies stay invisible.
 */
export async function loadBusinessDirectory(ctx: { tenantId: string; role: string }): Promise<BusinessDirectory> {
  const canChooseBusiness = canChooseAnyBusiness(ctx.role);
  const businesses: BusinessSummary[] = await prisma.tenant.findMany({
    where: canChooseBusiness ? {} : { id: ctx.tenantId },
    select: BUSINESS_SUMMARY_SELECT,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
  return {
    canChooseBusiness,
    currentBusiness: businesses.find((business) => business.id === ctx.tenantId) ?? null,
    businesses,
  };
}
