/* eslint @typescript-eslint/no-require-imports: "off" -- This script is intentionally CommonJS. */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const skippedDirectories = new Set([
  '.git', '.next', '.turbo', '.cache', 'build', 'coverage', 'dist', 'node_modules', 'out',
]);
const failures = [];

function findProjects(directory) {
  const projects = [];
  const packageFile = path.join(directory, 'package.json');
  if (fs.existsSync(packageFile)) {
    try {
      projects.push({ directory, manifest: JSON.parse(fs.readFileSync(packageFile, 'utf8')) });
    } catch (error) {
      projects.push({ directory, manifest: null, error });
    }
  }

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || skippedDirectories.has(entry.name)) continue;
    projects.push(...findProjects(path.join(directory, entry.name)));
  }
  return projects;
}

function run(project, label, args) {
  const relative = path.relative(root, project.directory) || '.';
  process.stdout.write(`\n=== ${label}: ${relative} ===\n`);
  const result = spawnSync(npmCommand, args, {
    cwd: project.directory,
    env: process.env,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });
  if (result.error || result.status !== 0) {
    failures.push(`${label} failed in ${relative}${result.error ? `: ${result.error.message}` : ''}`);
  }
}

function scriptCommand(project, stage) {
  const scripts = project.manifest?.scripts || {};
  if (scripts[stage]) return ['run', stage];

  if (stage === 'typecheck' && fs.existsSync(path.join(project.directory, 'tsconfig.json'))) {
    return ['exec', '--', 'tsc', '--noEmit'];
  }
  if (stage === 'lint' && ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', '.eslintrc', '.eslintrc.json']
    .some((name) => fs.existsSync(path.join(project.directory, name)))) {
    return ['exec', '--', 'eslint', '.'];
  }
  if (stage === 'build' && ['next.config.js', 'next.config.mjs', 'next.config.ts']
    .some((name) => fs.existsSync(path.join(project.directory, name)))) {
    return ['exec', '--', 'next', 'build'];
  }
  return null;
}

const projects = findProjects(root).sort((left, right) => left.directory.localeCompare(right.directory));
if (projects.length === 0) {
  process.stderr.write(`No npm projects found under ${root}\n`);
  process.exit(1);
}

for (const project of projects) {
  if (project.error) failures.push(`Could not read ${path.relative(root, path.join(project.directory, 'package.json'))}: ${project.error.message}`);
}

const stages = [
  { name: 'build', stage: 'build' },
  { name: 'unit-test coverage', stage: 'test:coverage', requireForTestProjects: true },
  { name: 'client performance budgets', stage: 'check:performance', requireForNextProjects: true },
  { name: 'i18n string policy', stage: 'check:i18n' },
  { name: 'typecheck', stage: 'typecheck' },
  { name: 'lint', stage: 'lint' },
  { name: 'safe pending migrations', stage: 'db:migrate:safe' },
  { name: 'database integrity', stage: 'db:integrity' },
];

for (const step of stages) {
  for (const project of projects) {
    const manifest = project.manifest;
    if (!manifest) continue;
    const command = scriptCommand(project, step.stage);
    if (command) {
      run(project, step.name, command);
      continue;
    }

    const projectPath = path.relative(root, project.directory) || '.';
    const hasTestRunner = manifest.scripts?.test
      || ['jest.config.js', 'jest.config.cjs', 'jest.config.mjs', 'vitest.config.js', 'vitest.config.ts']
        .some((name) => fs.existsSync(path.join(project.directory, name)));
    if (step.requireForTestProjects && hasTestRunner) {
      failures.push(`No test:coverage script is configured in ${projectPath}`);
    }
    if (step.requireForNextProjects
      && ['next.config.js', 'next.config.mjs', 'next.config.ts']
        .some((name) => fs.existsSync(path.join(project.directory, name)))) {
      failures.push(`No ${step.stage} script is configured in Next.js project ${projectPath}`);
    }
    if ((step.stage === 'db:migrate:safe' || step.stage === 'db:integrity')
      && fs.existsSync(path.join(project.directory, 'prisma', 'schema.prisma'))
      && !manifest.scripts?.[step.stage]) {
      failures.push(`No ${step.stage} script is configured in Prisma project ${projectPath}`);
    }
  }
}

process.stdout.write('\n=== Workspace quality summary ===\n');
process.stdout.write(`Discovered npm projects: ${projects.length}\n`);
if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`FAIL: ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('PASS: all configured workspace quality checks completed.\n');
}
