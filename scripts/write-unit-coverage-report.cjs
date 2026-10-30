const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const summaryPath = path.join(root, 'coverage', 'unit', 'coverage-summary.json');
const reportPath = path.join(root, 'unit-test-coverage-report.md');

if (!fs.existsSync(summaryPath)) {
  throw new Error('Coverage summary not found. Run `npm run test:coverage` first.');
}

const coverage = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const dimensions = ['statements', 'branches', 'functions', 'lines'];
const files = Object.entries(coverage)
  .filter(([file]) => file !== 'total')
  .map(([file, metrics]) => ({
    file: path.relative(root, file).split(path.sep).join('/'),
    metrics,
    passed: dimensions.every((dimension) => metrics[dimension].pct >= 90),
  }))
  .sort((left, right) => left.file.localeCompare(right.file));
const passingFiles = files.filter((file) => file.passed).length;
const total = coverage.total;
const format = (number) => `${number.pct.toFixed(2)}% (${number.covered}/${number.total})`;

const lines = [
  '# Unit test coverage report',
  '',
  'Generated from `coverage/unit/coverage-summary.json` by `npm run coverage:report`.',
  '',
  `Files included: **${files.length}**. Files meeting all four 90% thresholds: **${passingFiles}/${files.length}**.`,
  '',
  '| Overall | Coverage |',
  '| --- | ---: |',
  ...dimensions.map((dimension) => `| ${dimension} | ${format(total[dimension])} |`),
  '',
  '| File | Statements | Branches | Functions | Lines | Gate |',
  '| --- | ---: | ---: | ---: | ---: | :---: |',
  ...files.map(({ file, metrics, passed }) =>
    `| \`${file}\` | ${metrics.statements.pct.toFixed(2)}% | ${metrics.branches.pct.toFixed(2)}% | ${metrics.functions.pct.toFixed(2)}% | ${metrics.lines.pct.toFixed(2)}% | ${passed ? 'PASS' : 'BELOW 90%'} |`
  ),
  '',
];

fs.writeFileSync(reportPath, lines.join('\n'));
process.stdout.write(`${lines.join('\n')}\n`);
process.stdout.write(`Wrote ${path.relative(root, reportPath)} (${files.length} source files; ${passingFiles} pass all thresholds).\n`);
