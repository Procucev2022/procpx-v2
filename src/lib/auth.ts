// lib/auth.ts - NextAuth configuration
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { hashPassword, passwordNeedsRehash, verifyPassword } from './password';
import {
  AUTH_ACCOUNT_RECHECK_INTERVAL_MS,
  AUTH_LOCKOUT_DURATION_MS,
  AUTH_MAX_FAILED_LOGIN_ATTEMPTS,
  AUTH_SESSION_MAX_AGE_SECONDS,
  AUTH_TIMING_DUMMY_HASH,
  AUTH_VENDOR_USERNAME_FALLBACK_CANDIDATE_LIMIT,
} from './auth.constants';
import { resolveAuthSecret } from './auth-secret';
import { logEvent } from './observability/server-logger';
import { prisma } from './prisma';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


/**
 * Counts a failed password and locks the account once the threshold is reached. A failed write is logged,
 * but the caller still rejects the login.
 */
async function recordFailedLogin(userId: string, tenantId: string, previousFailures: number): Promise<void> {
  const failures = previousFailures + 1;
  const lockedUntil = failures >= AUTH_MAX_FAILED_LOGIN_ATTEMPTS ? new Date(Date.now() + AUTH_LOCKOUT_DURATION_MS) : null;
  try {
    await prisma.user.update({ where: { id: userId }, data: { failedLoginCount: failures, lockedUntil } });
  } catch (error) {
    logEvent('error', 'auth.failed_login_record_failed', { operation: 'record_failed_login', userId, tenantId, error });
    return;
  }
  logEvent('warn', 'auth.login_failed', { operation: 'authorize_credentials', userId, tenantId, failures, locked: lockedUntil !== null });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: UI_STRINGS.common.email, type: 'email' },
        password: { label: UI_STRINGS.common.password, type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }
        const rawInput = (credentials.email as string).trim();
        const cleanEmail = rawInput.toLowerCase();

        // 1. Standard email lookup
        const emailMatches = await prisma.user.findMany({
          where: {
            email: cleanEmail,
            status: 'ACTIVE',
          },
          include: { tenant: true },
          take: 2,
        });
        const emailIsAmbiguous = emailMatches.length > 1;
        let user = emailMatches.length === 1 ? emailMatches[0] : null;

        // 2. Development & Test Environment Guard (Requirement 7):
        // Support simplified test vendor username convention (normalised vendor name)
        // In production, reject username-based matching and enforce standard email credentials
        // Never let a username fallback choose an account when the email itself maps to
        // multiple tenants; the login form has no tenant selector to disambiguate it.
        if (!user && !emailIsAmbiguous && process.env.NODE_ENV !== 'production') {
          const normalisedInput = rawInput.replace(/\s+/g, ' ').toLowerCase();

          // Fetch active VENDOR users with linked vendor records
          const candidateUsers = await prisma.user.findMany({
            where: {
              role: 'VENDOR',
              status: 'ACTIVE',
              vendorId: { not: null },
            },
            include: { tenant: true, vendor: { select: { name: true, code: true } } },
            take: AUTH_VENDOR_USERNAME_FALLBACK_CANDIDATE_LIMIT + 1,
          });
          if (candidateUsers.length > AUTH_VENDOR_USERNAME_FALLBACK_CANDIDATE_LIMIT) {
            logEvent('warn', 'auth.vendor_username_fallback_candidates_exceeded', {
              operation: 'authorize_vendor_username_fallback',
              candidateLimit: AUTH_VENDOR_USERNAME_FALLBACK_CANDIDATE_LIMIT,
              candidateCount: candidateUsers.length,
            });
            return null;
          }

          // Match by normalised vendor name or normalised user name
          const matched = candidateUsers.filter((u) => {
            if (!u.vendor) return false;
            const normVendorName = u.vendor.name.trim().replace(/\s+/g, ' ').toLowerCase();
            const normUserName = u.name.trim().replace(/\s+/g, ' ').toLowerCase();
            return normVendorName === normalisedInput || normUserName === normalisedInput;
          });

          if (matched.length === 1) {
            user = matched[0];
          } else if (matched.length > 1) {
            // Requirement 3: Ambiguity prevention for vendors with identical names
            const disambiguated = matched.find((u) => {
              const code = u.vendor?.code?.toLowerCase();
              return code && normalisedInput.includes(code);
            });
            if (disambiguated) {
              user = disambiguated;
            }
          }
        }

        const password = credentials.password as string;
        if (!user) {
          // Spend comparable bcrypt time for unknown emails so response timing does not reveal which accounts exist.
          await verifyPassword(password, AUTH_TIMING_DUMMY_HASH);
          return null;
        }
        if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
          logEvent('warn', 'auth.account_locked', { operation: 'authorize_credentials', userId: user.id, tenantId: user.tenantId });
          return null;
        }
        const isValid = await verifyPassword(password, user.passwordHash);
        if (!isValid) {
          await recordFailedLogin(user.id, user.tenantId, user.failedLoginCount ?? 0);
          return null;
        }

        // Update last login. Hashes created with a higher bcrypt cost are replaced
        // once so later logins stay within the Cloudflare Workers CPU budget.
        const loginUpdate: { lastLoginAt: Date; passwordHash?: string; failedLoginCount?: number; lockedUntil?: null } = { lastLoginAt: new Date() };
        if ((user.failedLoginCount ?? 0) > 0 || user.lockedUntil) {
          loginUpdate.failedLoginCount = 0;
          loginUpdate.lockedUntil = null;
        }
        if (passwordNeedsRehash(user.passwordHash)) {
          loginUpdate.passwordHash = await hashPassword(password);
        }
        await prisma.user.update({
          where: { id: user.id },
          data: loginUpdate,
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId,
          tenantName: user.tenant.name,
          tenantSlug: user.tenant.slug,
          vendorId: user.vendorId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.tenantId = (user as any).tenantId;
        token.tenantName = (user as any).tenantName;
        token.tenantSlug = (user as any).tenantSlug;
        token.vendorId = (user as any).vendorId;
        token.checkedAt = Date.now();
        return token;
      }
      if (token.revoked || typeof token.id !== 'string') return token;
      const lastChecked = typeof token.checkedAt === 'number' ? token.checkedAt : 0;
      if (Date.now() - lastChecked < AUTH_ACCOUNT_RECHECK_INTERVAL_MS) return token;

      // Re-read the account so a deactivated user or a changed role takes effect within the recheck interval.
      const account = await prisma.user.findUnique({
        where: { id: token.id },
        select: { role: true, status: true, tenantId: true, vendorId: true, tenant: { select: { name: true, slug: true } } },
      });
      if (!account || account.status !== 'ACTIVE') {
        token.revoked = true;
        logEvent('warn', 'auth.session_revoked', { operation: 'recheck_session_account', userId: token.id });
        return token;
      }
      token.role = account.role;
      token.tenantId = account.tenantId;
      token.vendorId = account.vendorId;
      token.tenantName = account.tenant.name;
      token.tenantSlug = account.tenant.slug;
      token.checkedAt = Date.now();
      return token;
    },
    async session({ session, token }) {
      if (token?.revoked) {
        // Without a user, auth() reports no session, so API routes return 401 and the app layout redirects to sign-in.
        return { expires: session.expires } as typeof session;
      }
      if (token) {
        session.user.id = token.id as string;
        (session.user as any).role = token.role;
        (session.user as any).tenantId = token.tenantId;
        (session.user as any).tenantName = token.tenantName;
        (session.user as any).tenantSlug = token.tenantSlug;
        (session.user as any).vendorId = token.vendorId;
      }
      return session;
    },
  },  pages: {
    signIn: '/login',
    error: UI_STRINGS.libAuth.login,
  },
  session: { strategy: 'jwt', maxAge: AUTH_SESSION_MAX_AGE_SECONDS },
  secret: resolveAuthSecret(),
});
