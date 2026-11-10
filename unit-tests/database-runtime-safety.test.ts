import { spawnSync } from 'node:child_process';
import path from 'node:path';

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
});
