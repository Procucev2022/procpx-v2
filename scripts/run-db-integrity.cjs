/* eslint @typescript-eslint/no-require-imports: "off" -- This script is intentionally CommonJS. */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(npxCommand, ['tsx', 'scripts/db-integrity-check.ts'], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL || 'file:./dev.db' },
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

if (result.error) {
  process.stderr.write(`Could not start the data-integrity check: ${result.error.message}\n`);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
