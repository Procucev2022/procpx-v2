import { spawnSync } from 'node:child_process';
import path from 'node:path';

const script = (name: string) => path.join(process.cwd(), 'scripts', name);

describe('database runtime safety', () => {
  it.each([
    ['export-sqlite-to-d1.cjs', 'scripts'],
    ['test-enhancements.js', 'scripts'],
    ['seed.ts', 'prisma'],
  ])('disables unsafe legacy runner %s', (name, folder) => {
    const target = path.join(process.cwd(), folder, name);
    const result = spawnSync(process.execPath, [target], { cwd: process.cwd(), encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain('disabled');
  });

  it('refuses to start the app with SQLite selected', () => {
    const result = spawnSync(process.execPath, [script('dev-local.cjs')], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, DATABASE_PROVIDER: 'sqlite' },
    });
    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain('only supports Cloudflare D1');
  });
});
