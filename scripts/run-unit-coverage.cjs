const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const jestCli = require.resolve('jest/bin/jest');
const reportScript = path.join(__dirname, 'write-unit-coverage-report.cjs');
const extraArgs = process.argv.slice(2);

const testRun = spawnSync(process.execPath, [
  jestCli,
  '--runInBand',
  '--detectOpenHandles',
  '--coverage',
  ...extraArgs,
], { cwd: root, stdio: 'inherit' });

const reportRun = spawnSync(process.execPath, [reportScript], { cwd: root, stdio: 'inherit' });

if (reportRun.status !== 0) {
  process.exitCode = reportRun.status || 1;
} else {
  process.exitCode = testRun.status ?? 1;
}
