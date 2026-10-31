// src/app/api/auth/me/route.ts
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


export async function GET(req: NextRequest) {
  // Support testing header fallback
  const testUserId = req.headers.get('x-test-user-id');
  if (testUserId) {
    const user = await prisma.user.findUnique({
      where: { id: testUserId },
      include: { tenant: true },
    });
    if (user) {
      return apiSuccess({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
          tenantName: user.tenant?.name,
        },
      });
    }
  }

  const session = await auth();
  if (!session?.user) {
    return apiError(UI_STRINGS.appApiAuthMeRoute.unauthorized, 401);
  }

  return apiSuccess({
    user: session.user,
  });
}
