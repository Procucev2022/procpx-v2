/* eslint @typescript-eslint/no-require-imports: "off" -- This script is intentionally CommonJS. */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ESLint } = require('eslint');

const root = path.resolve(__dirname, '..');
const baselinePath = path.join(__dirname, 'eslint-baseline.json');

function relativePath(filename) {
  return path.relative(root, filename).split(path.sep).join('/');
}

function collectDiagnostics(results) {
  const diagnostics = {};
  let errors = 0;
  let warnings = 0;

  for (const result of results) {
    const filename = relativePath(result.filePath);
    for (const message of result.messages) {
      const severity = message.severity === 2 ? 'errors' : 'warnings';
      const rule = message.ruleId || 'fatal';
      const key = `${filename}::${rule}::${severity}`;
      diagnostics[key] = (diagnostics[key] || 0) + 1;
      if (severity === 'errors') errors += 1;
      else warnings += 1;
    }
  }

  return { diagnostics, errors, warnings };
}

async function main() {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const eslint = new ESLint({ cwd: root });
  const requestedFiles = process.argv.slice(2).filter((filename) => !filename.startsWith('--'));
  const repositoryFiles = requestedFiles.length > 0
    ? requestedFiles
    : execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { cwd: root, encoding: 'utf8' },
    ).split('\0').filter((filename) => /\.(?:[cm]?[jt]sx?)$/i.test(filename));
  const existingRepositoryFiles = repositoryFiles.filter((filename) => fs.existsSync(path.resolve(root, filename)));
  const results = await eslint.lintFiles(existingRepositoryFiles.length > 0 ? existingRepositoryFiles : ['.']);
  const current = collectDiagnostics(results);
  const regressions = Object.entries(current.diagnostics)
    .filter(([key, count]) => count > (baseline.diagnostics[key] || 0))
    .map(([key, count]) => ({ key, allowed: baseline.diagnostics[key] || 0, current: count }));

  if (regressions.length > 0) {
    process.stderr.write('ESLint found diagnostics above the checked-in per-file baseline:\n');
    for (const regression of regressions) {
      process.stderr.write(`  ${regression.key}: ${regression.current} (baseline ${regression.allowed})\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `ESLint no-regression check passed: ${current.errors} existing errors and `
    + `${current.warnings} existing warnings across ${results.length} files; no per-file rule count increased.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`ESLint baseline check failed: ${error.stack || error.message}\n`);
  process.exitCode = 1;
});
