/* eslint @typescript-eslint/no-require-imports: "off" -- This script is intentionally CommonJS. */
const fs = require('node:fs');
const path = require('node:path');

const RETENTION_DAYS = Number(process.env.APP_LOG_RETENTION_DAYS) >= 1
  ? Math.floor(Number(process.env.APP_LOG_RETENTION_DAYS))
  : 30;
const ALLOWED_EXTENSIONS = new Set(['.jsonl', '.json', '.png', '.jpg', '.jpeg', '.webp']);
const logDirectory = path.resolve(process.env.APP_LOG_DIR || path.join(process.cwd(), 'logs'));

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(entryPath);
    return entry.isFile() && ALLOWED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
      ? [entryPath]
      : [];
  });
}

function purge({ all = false } = {}) {
  if (!fs.existsSync(logDirectory)) {
    process.stdout.write(`No log directory exists at ${logDirectory}.\n`);
    return 0;
  }
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1_000;
  let removed = 0;
  for (const filePath of listFiles(logDirectory)) {
    if (all || fs.statSync(filePath).mtimeMs < cutoff) {
      fs.unlinkSync(filePath);
      removed += 1;
    }
  }
  process.stdout.write(`Purged ${removed} ${all ? 'log/debug' : `expired (>${RETENTION_DAYS} day)`} artifact(s).\n`);
  return removed;
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--term') options.term = args[++index] || '';
    else if (flag === '--level') options.level = args[++index] || '';
    else if (flag === '--since') options.since = args[++index] || '';
  }
  return options;
}

function sinceTimestamp(value) {
  const match = /^([0-9]+)(m|h|d)$/.exec(value || '');
  if (!match) return 0;
  const multiplier = { m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]];
  return Date.now() - Number(match[1]) * multiplier;
}

function search(options) {
  const term = String(options.term || '').toLowerCase();
  const level = String(options.level || '').toLowerCase();
  const since = sinceTimestamp(options.since);
  let matched = 0;
  for (const filePath of listFiles(logDirectory).filter((file) => file.endsWith('.jsonl'))) {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      if (!line) continue;
      try {
        const record = JSON.parse(line);
        if (level && record.level !== level) continue;
        if (since && Date.parse(record.timestamp) < since) continue;
        if (term && !line.toLowerCase().includes(term)) continue;
        process.stdout.write(`${JSON.stringify(record)}\n`);
        matched += 1;
      } catch {
        process.stderr.write(`Skipped malformed log record in ${path.relative(logDirectory, filePath)}.\n`);
      }
    }
  }
  process.stderr.write(`Matched ${matched} log record(s).\n`);
}

const [command = 'search', ...args] = process.argv.slice(2);
if (command === 'purge') {
  purge({ all: args.includes('--all') });
} else if (command === 'search') {
  search(parseOptions(args));
} else {
  process.stderr.write('Usage: node scripts/manage-logs.cjs <search|purge> [--term TEXT] [--level debug|info|warn|error] [--since 1h|1d|30d]\n');
  process.exitCode = 2;
}
