// lib/auth.ts - NextAuth configuration
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { hashPassword, passwordNeedsRehash, verifyPassword } from './password';
import { AUTH_VENDOR_USERNAME_FALLBACK_CANDIDATE_LIMIT } from './auth.constants';
import { resolveAuthSecret } from './auth-secret';
import { logEvent } from './observability/server-logger';
import { prisma } from './prisma';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


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

        if (!user) return null;

        const password = credentials.password as string;
        const isValid = await verifyPassword(password, user.passwordHash);
        if (!isValid) return null;

        // Update last login. Hashes created with a higher bcrypt cost are replaced
        // once so later logins stay within the Cloudflare Workers CPU budget.
        const loginUpdate: { lastLoginAt: Date; passwordHash?: string } = { lastLoginAt: new Date() };
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
      }
      return token;
    },
    async session({ session, token }) {
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
  },
  pages: {
    signIn: '/login',
    error: UI_STRINGS.libAuth.login,
  },
  session: { strategy: 'jwt' },
  secret: resolveAuthSecret(),
});
