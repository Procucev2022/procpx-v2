import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- the dev launcher is a CommonJS script. */
const devLocal = require('../scripts/dev-local.cjs') as {
  inspectDevEnvironment: (input: {
    env: Record<string, string | undefined>;
    args: string[];
    envFilesFound: string[];
    wrangler: { accountId: string; databaseName: string; databaseId: string; hasRemoteEnv: boolean } | null;
  }) => { errors: string[]; warnings: string[]; remote: boolean; port: string };
  readPort: (args: string[]) => string;
  readWranglerTarget: (root: string) => { accountId: string; databaseName: string; databaseId: string; hasRemoteEnv: boolean } | null;
};
/* eslint-enable @typescript-eslint/no-require-imports */

const WRANGLER = { accountId: 'acct-1', databaseName: 'procpx-dev', databaseId: 'db-1', hasRemoteEnv: true };
const GOOD_ENV = {
  NEXTAUTH_SECRET: 'secret',
  NEXTAUTH_URL: 'http://localhost:3000',
  DATABASE_PROVIDER: 'd1',
  UPLOAD_DIR: './uploads',
  GEMINI_API_KEY: 'test-gemini-key',
};

function inspect(env: Record<string, string | undefined>, args: string[] = [], wrangler: typeof WRANGLER | null = WRANGLER, envFilesFound = ['.env']) {
  return devLocal.inspectDevEnvironment({ env, args, envFilesFound, wrangler });
}

describe('database runtime safety', () => {
  it('refuses to start the app with SQLite selected', () => {
    const result = spawnSync(process.execPath, [path.join(process.cwd(), 'scripts', 'dev-local.cjs')], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, DATABASE_PROVIDER: 'sqlite' },
    });
    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain('only supports Cloudflare D1');
  });

  it('accepts a complete local configuration without messages', () => {
    expect(inspect(GOOD_ENV)).toEqual({ errors: [], warnings: [], remote: false, port: '3000' });
  });

  it('refuses to start without a .env file or any required setting', () => {
    const result = inspect({}, [], WRANGLER, []);
    expect(result.errors).toEqual([
      expect.stringContaining('No .env file found'),
      'Missing required settings: NEXTAUTH_SECRET, NEXTAUTH_URL, DATABASE_PROVIDER, UPLOAD_DIR, GEMINI_API_KEY. Add them to .env.',
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('treats blank required settings as missing', () => {
    const result = inspect({ ...GOOD_ENV, GEMINI_API_KEY: '  ', UPLOAD_DIR: '' });
    expect(result.errors).toEqual(['Missing required settings: UPLOAD_DIR, GEMINI_API_KEY. Add them to .env.']);
  });

  it('warns about a port mismatch and a leftover DATABASE_URL', () => {
    const result = inspect({ ...GOOD_ENV, DATABASE_URL: 'file:./dev.db' }, ['--port', '4000']);
    expect(result.port).toBe('4000');
    expect(result.warnings).toEqual([
      expect.stringContaining('will run on http://localhost:4000'),
      expect.stringContaining('DATABASE_URL is set but unused'),
    ]);
  });

  it('accepts a trailing slash on NEXTAUTH_URL', () => {
    expect(inspect({ ...GOOD_ENV, NEXTAUTH_URL: 'http://localhost:3000/' }).warnings).toEqual([]);
  });

  it('reads the port from every supported flag form', () => {
    expect(devLocal.readPort(['--port=3100'])).toBe('3100');
    expect(devLocal.readPort(['-p', '3200'])).toBe('3200');
    expect(devLocal.readPort(['--port'])).toBe('3000');
    expect(devLocal.readPort([])).toBe('3000');
  });

  it('enables remote mode from the flag or the environment and checks credentials', () => {
    const viaFlag = inspect(GOOD_ENV, ['--remote']);
    expect(viaFlag.remote).toBe(true);
    expect(viaFlag.errors).toEqual([]);
    expect(viaFlag.warnings).toEqual([expect.stringContaining('No CLOUDFLARE_API_TOKEN set')]);

    const viaEnv = inspect({ ...GOOD_ENV, PROCPX_DEV_REMOTE: 'true', CLOUDFLARE_API_TOKEN: 'token', CLOUDFLARE_ACCOUNT_ID: 'other' });
    expect(viaEnv.remote).toBe(true);
    expect(viaEnv.warnings).toEqual([expect.stringContaining('differs from wrangler.jsonc account_id')]);
  });

  it('blocks remote mode when wrangler.jsonc cannot reach the server resources', () => {
    expect(inspect(GOOD_ENV, ['--remote'], null).errors).toEqual([expect.stringContaining('needs account_id')]);
    expect(inspect(GOOD_ENV, ['--remote'], { ...WRANGLER, databaseId: '' }).errors).toEqual([expect.stringContaining('needs account_id')]);
    expect(inspect(GOOD_ENV, ['--remote'], { ...WRANGLER, hasRemoteEnv: false }).errors).toEqual([expect.stringContaining('"remote" environment')]);
  });

  it('reads the tracked wrangler target, including the remote environment', () => {
    const target = devLocal.readWranglerTarget(process.cwd());
    expect(target).toEqual(expect.objectContaining({ databaseName: 'procpx-dev', hasRemoteEnv: true }));
    expect(target?.accountId).toMatch(/^[0-9a-f]{32}$/);
    expect(target?.databaseId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns null when a directory has no wrangler.jsonc and empty fields for an incomplete one', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'procpx-dev-'));
    try {
      expect(devLocal.readWranglerTarget(dir)).toBeNull();
      fs.writeFileSync(path.join(dir, 'wrangler.jsonc'), '{ "name": "x" }');
      expect(devLocal.readWranglerTarget(dir)).toEqual({ accountId: '', databaseName: '', databaseId: '', hasRemoteEnv: false });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
