import { LOCAL_D1_EXECUTE_ARGS, requireLocalE2EBaseUrl } from '../scripts/e2e-d1-regression.constants';

describe('D1 end-to-end regression safety', () => {
  it('accepts localhost and normalizes its trailing slash', () => {
    expect(requireLocalE2EBaseUrl('http://localhost:3001/')).toBe('http://localhost:3001');
    expect(requireLocalE2EBaseUrl('http://127.0.0.1:3001')).toBe('http://127.0.0.1:3001');
  });

  it('rejects non-local hosts, malformed URLs, credentials, and non-HTTP protocols', () => {
    for (const value of ['https://example.com', 'http://localhost.example.com', 'not a url', 'ftp://localhost', 'http://user:pass@localhost']) {
      expect(() => requireLocalE2EBaseUrl(value)).toThrow('only accepts an HTTP(S) localhost URL');
    }
  });

  it('pins all Wrangler D1 regression queries to local state', () => {
    expect(LOCAL_D1_EXECUTE_ARGS).toContain('--local');
    expect(LOCAL_D1_EXECUTE_ARGS).not.toContain('--remote');
    expect(LOCAL_D1_EXECUTE_ARGS).toContain('--persist-to');
    expect(LOCAL_D1_EXECUTE_ARGS).toContain('.wrangler/e2e-d1');
  });
});
