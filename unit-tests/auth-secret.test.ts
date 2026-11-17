import { resolveAuthSecret } from '../src/lib/auth-secret';
import { AUTH_DEVELOPMENT_SECRET, AUTH_SECRET_REQUIRED_MESSAGE } from '../src/lib/auth.constants';

describe('resolveAuthSecret', () => {
  it('prefers the configured NextAuth secrets over the development key', () => {
    expect(resolveAuthSecret({ NEXTAUTH_SECRET: 'primary', AUTH_SECRET: 'secondary', NODE_ENV: 'production' })).toBe('primary');
    expect(resolveAuthSecret({ AUTH_SECRET: 'secondary', NODE_ENV: 'production' })).toBe('secondary');
  });

  it('fails closed in a production runtime that has no configured secret', () => {
    expect(() => resolveAuthSecret({ NODE_ENV: 'production' })).toThrow(AUTH_SECRET_REQUIRED_MESSAGE);
    expect(() => resolveAuthSecret({ NODE_ENV: 'production', NEXT_PHASE: 'phase-server' })).toThrow(AUTH_SECRET_REQUIRED_MESSAGE);
  });

  it('allows the development key outside production and while next build collects pages', () => {
    expect(resolveAuthSecret({ NODE_ENV: 'development' })).toBe(AUTH_DEVELOPMENT_SECRET);
    expect(resolveAuthSecret({ NODE_ENV: 'test' })).toBe(AUTH_DEVELOPMENT_SECRET);
    expect(resolveAuthSecret({ NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build' })).toBe(AUTH_DEVELOPMENT_SECRET);
  });

  it('reads the process environment when no environment is passed', () => {
    const previous = process.env.NEXTAUTH_SECRET;
    process.env.NEXTAUTH_SECRET = 'from-process-environment';
    try {
      expect(resolveAuthSecret()).toBe('from-process-environment');
    } finally {
      if (previous === undefined) Reflect.deleteProperty(process.env, 'NEXTAUTH_SECRET');
      else process.env.NEXTAUTH_SECRET = previous;
    }
  });
});
