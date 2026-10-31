import { isCloudflareWorker, usesD1Database } from '../src/lib/runtime';

describe('runtime detection', () => {
  const originalProvider = process.env.DATABASE_PROVIDER;

  afterEach(() => {
    if (originalProvider === undefined) delete process.env.DATABASE_PROVIDER;
    else process.env.DATABASE_PROVIDER = originalProvider;
    jest.restoreAllMocks();
  });

  it('uses the local SQLite database by default outside Workers', () => {
    delete process.env.DATABASE_PROVIDER;
    expect(isCloudflareWorker()).toBe(false);
    expect(usesD1Database()).toBe(false);
  });

  it('uses D1 locally when DATABASE_PROVIDER=d1', () => {
    process.env.DATABASE_PROVIDER = 'd1';
    expect(usesD1Database()).toBe(true);
  });

  it('always uses D1 inside Cloudflare Workers', () => {
    delete process.env.DATABASE_PROVIDER;
    jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Cloudflare-Workers');
    expect(isCloudflareWorker()).toBe(true);
    expect(usesD1Database()).toBe(true);
  });
});
