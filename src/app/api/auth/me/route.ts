// src/app/api/auth/me/route.ts
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";

// Identity comes only from the signed session cookie. Request headers are never trusted here.
export async function GET(req: NextRequest) {
  void req;
  const session = await auth();
  if (!session?.user) {
    return apiError(UI_STRINGS.appApiAuthMeRoute.unauthorized, 401, { route: '/api/auth/me', method: 'GET' });
  }

  return apiSuccess({
    user: session.user,
  });
}
