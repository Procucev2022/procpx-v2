/* eslint @typescript-eslint/no-require-imports: "off" -- This script is intentionally CommonJS. */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const dryRun = process.argv.includes('--dry-run');
const codeExtensions = new Set(['.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx']);
const typeScriptExtensions = new Set(['.ts', '.tsx', '.mts', '.cts']);
const testFilePattern = /(^|\/)(unit-tests|__tests__)\/.*\.(test|spec)\.(cjs|js|jsx|mjs|ts|tsx)$/i;
const failures = [];

function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw result.error || new Error((result.stderr || `git ${args.join(' ')} failed`).trim());
  }
  return result.stdout || '';
}

function projectFor(file) {
  let directory = path.dirname(path.resolve(root, file));
  while (directory.startsWith(root)) {
    if (fs.existsSync(path.join(directory, 'package.json'))) return directory;
    if (directory === root) break;
    directory = path.dirname(directory);
  }
  return root;
}

function npmRun(project, script, args = []) {
  const relative = path.relative(root, project) || '.';
  const manifest = JSON.parse(fs.readFileSync(path.join(project, 'package.json'), 'utf8'));
  if (!manifest.scripts?.[script]) {
    process.stdout.write(`SKIP ${script} in ${relative}: package script is not configured.\n`);
    return true;
  }
  const command = ['run', script, ...(args.length ? ['--', ...args] : [])];
  process.stdout.write(`${dryRun ? '[dry-run] ' : ''}npm ${command.join(' ')} (${relative})\n`);
  if (dryRun) return true;
  const result = spawnSync(npmCommand, command, {
    cwd: project,
    env: process.env,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });
  if (result.error || result.status !== 0) {
    failures.push(`${script} failed in ${relative}${result.error ? `: ${result.error.message}` : ''}`);
    return false;
  }
  return true;
}

try {
  const tracked = git(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD', '--']);
  const untracked = git(['ls-files', '--others', '--exclude-standard']);
  const changedFiles = [...new Set(`${tracked}\n${untracked}`
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter(Boolean)
    .map((file) => file.split(path.sep).join('/')))]
    .sort();

  if (changedFiles.length === 0) {
    process.stdout.write('No changed or untracked files found.\n');
    process.exit(0);
  }

  const projects = new Map();
  for (const file of changedFiles) {
    const project = projectFor(file);
    if (!projects.has(project)) projects.set(project, []);
    projects.get(project).push(file);
  }

  const whitespace = spawnSync('git', ['diff', '--check', 'HEAD', '--'], {
    cwd: root,
    stdio: dryRun ? 'ignore' : 'inherit',
  });
  if (!dryRun && (whitespace.error || whitespace.status !== 0)) failures.push('git diff --check found whitespace errors');

  for (const [project, files] of projects) {
    const relativeFiles = files.map((file) => path.relative(project, path.resolve(root, file)));
    const lintFiles = relativeFiles.filter((file) => codeExtensions.has(path.extname(file).toLowerCase()));
    const typeScriptFiles = relativeFiles.filter((file) => typeScriptExtensions.has(path.extname(file).toLowerCase()));
    const testFiles = relativeFiles.filter((file) => testFilePattern.test(file.split(path.sep).join('/')));
    const sourceFiles = relativeFiles.filter((file) => /^src[\\/]/.test(file)
      && codeExtensions.has(path.extname(file).toLowerCase())
      && !testFilePattern.test(file.split(path.sep).join('/')));

    if (lintFiles.length) npmRun(project, 'lint', lintFiles);
    if (typeScriptFiles.length) npmRun(project, 'typecheck');
    if (sourceFiles.length || testFiles.length) npmRun(project, 'check:i18n');
    if (testFiles.length) npmRun(project, 'test', ['--runInBand', '--detectOpenHandles', '--runTestsByPath', ...testFiles]);
    if (sourceFiles.length) npmRun(project, 'test', ['--runInBand', '--detectOpenHandles', '--findRelatedTests', ...sourceFiles, '--passWithNoTests']);
  }

  process.stdout.write(`\nFast changed-file plan: ${changedFiles.length} changed paths across ${projects.size} npm project(s).\n`);
  process.stdout.write('Run npm run check:quality before handoff; this fast command does not run the full build or coverage gate.\n');
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  failures.push('Could not complete changed-file checks');
}

if (failures.length) {
  for (const failure of failures) process.stderr.write(`FAIL: ${failure}\n`);
  process.exitCode = 1;
}
