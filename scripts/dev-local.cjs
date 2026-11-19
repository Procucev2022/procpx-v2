#!/usr/bin/env node
'use strict';

/* eslint @typescript-eslint/no-require-imports: "off" -- CommonJS bootstrap resolves Next's internal CLI binary. */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { parseEnv } = require('node:util');

// `npm run dev`        -> Wrangler local D1/R2 under ignored `.wrangler/` (default, safe).
// `npm run dev:remote` -> the same `next dev`, but the D1 and R2 bindings connect to the
//                         deployed Cloudflare resources named in wrangler.jsonc. Every write
//                         made in the browser lands in the shared server database.
const REMOTE_FLAG = '--remote';
const REMOTE_ENV_FLAG = 'PROCPX_DEV_REMOTE';
const ENV_FILES = ['.env', '.env.local', '.env.development', '.env.development.local'];
const DEFAULT_PORT = '3000';

function readEnvFiles(root) {
  const values = {};
  const found = [];
  for (const name of ENV_FILES) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    found.push(name);
    Object.assign(values, parseEnv(fs.readFileSync(file, 'utf8')));
  }
  return { values, found };
}

function readWranglerTarget(root) {
  const file = path.join(root, 'wrangler.jsonc');
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  return {
    accountId: text.match(/"account_id"\s*:\s*"([^"]+)"/)?.[1] || '',
    databaseName: text.match(/"database_name"\s*:\s*"([^"]+)"/)?.[1] || '',
    databaseId: text.match(/"database_id"\s*:\s*"([^"]+)"/)?.[1] || '',
    hasRemoteEnv: /"remote"\s*:\s*\{/.test(text),
  };
}

function readPort(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if ((arg === '--port' || arg === '-p') && args[index + 1]) return args[index + 1];
    if (arg.startsWith('--port=')) return arg.slice('--port='.length);
  }
  return DEFAULT_PORT;
}

/**
 * Detects common local-run configuration problems. Pure: takes the merged environment
 * (env files overridden by the real process environment, as Next.js does) and returns
 * messages instead of printing or exiting, so it can be unit-tested.
 */
function inspectDevEnvironment({ env, args, envFilesFound, wrangler }) {
  const errors = [];
  const warnings = [];
  const remote = args.includes(REMOTE_FLAG) || env[REMOTE_ENV_FLAG] === 'true';

  if (env.DATABASE_PROVIDER && env.DATABASE_PROVIDER !== 'd1') {
    errors.push('proCPX only supports Cloudflare D1. Local development uses Wrangler local D1; SQLite is schema-generation-only. Set DATABASE_PROVIDER="d1" in .env.');
  }
  if (envFilesFound.length === 0) {
    warnings.push('No .env file found. Copy .env.example to .env and set NEXTAUTH_SECRET.');
  }
  if (!env.NEXTAUTH_SECRET) {
    errors.push('NEXTAUTH_SECRET is missing, so sign-in cannot work. Add NEXTAUTH_SECRET="<any long random string>" to .env.');
  }
  const port = readPort(args);
  const expectedUrl = `http://localhost:${port}`;
  if (!env.NEXTAUTH_URL) {
    warnings.push(`NEXTAUTH_URL is not set. Add NEXTAUTH_URL="${expectedUrl}" to .env.`);
  } else if (env.NEXTAUTH_URL.replace(/\/+$/, '') !== expectedUrl) {
    warnings.push(`NEXTAUTH_URL is "${env.NEXTAUTH_URL}" but the app will run on ${expectedUrl}; sign-in redirects may fail. Set NEXTAUTH_URL="${expectedUrl}".`);
  }
  if (env.DATABASE_URL) {
    warnings.push('DATABASE_URL is set but unused: the app only uses Cloudflare D1. Remove it from .env.');
  }

  if (remote) {
    if (!wrangler || !wrangler.accountId || !wrangler.databaseId) {
      errors.push('Remote mode needs account_id and d1 database_id in wrangler.jsonc.');
    } else if (!wrangler.hasRemoteEnv) {
      errors.push('Remote mode needs the "remote" environment in wrangler.jsonc (bindings marked "remote": true).');
    }
    if (env.CLOUDFLARE_ACCOUNT_ID && wrangler && wrangler.accountId && env.CLOUDFLARE_ACCOUNT_ID !== wrangler.accountId) {
      warnings.push(`CLOUDFLARE_ACCOUNT_ID (${env.CLOUDFLARE_ACCOUNT_ID}) differs from wrangler.jsonc account_id (${wrangler.accountId}); remote bindings may fail with error 7403.`);
    }
    if (!env.CLOUDFLARE_API_TOKEN) {
      warnings.push('No CLOUDFLARE_API_TOKEN set; using your `npx wrangler login` session. Run `npx wrangler whoami` if remote bindings fail to connect.');
    }
  }

  return { errors, warnings, remote, port };
}

function main() {
  const root = path.resolve(__dirname, '..');
  const args = process.argv.slice(2);
  const { values, found } = readEnvFiles(root);
  const env = { ...values, ...process.env };
  const wrangler = readWranglerTarget(root);
  const result = inspectDevEnvironment({ env, args, envFilesFound: found, wrangler });

  for (const warning of result.warnings) process.stderr.write(`[dev] warning: ${warning}\n`);
  if (result.errors.length > 0) {
    for (const error of result.errors) process.stderr.write(`[dev] error: ${error}\n`);
    throw new Error(result.errors[0]);
  }

  if (result.remote) {
    process.stdout.write(
      `[dev] REMOTE MODE: D1 "${wrangler.databaseName}" (${wrangler.databaseId}) and R2 uploads in account ${wrangler.accountId}.\n`
      + '[dev] Everything you create, edit or approve is written to the shared server database.\n',
    );
  } else {
    process.stdout.write('[dev] Local mode: Wrangler local D1 under .wrangler/ (run `npm run dev:remote` to use the server database).\n');
  }

  const nextBin = require.resolve('next/dist/bin/next');
  const child = spawn(process.execPath, [nextBin, 'dev', ...args.filter((arg) => arg !== REMOTE_FLAG)], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_PROVIDER: 'd1', [REMOTE_ENV_FLAG]: result.remote ? 'true' : 'false' },
  });

  // Stop Next.js together with this launcher so a stopped terminal or task never leaves
  // an orphaned `next dev` holding the port and the project's single dev-server lock.
  const stopChild = (signal) => {
    if (child.exitCode === null && !child.killed) child.kill(signal);
  };
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) {
    process.on(signal, () => stopChild(signal));
  }
  process.on('exit', () => stopChild('SIGTERM'));

  child.on('error', (error) => {
    process.stderr.write(`Could not start Next.js with D1: ${error.message}\n`);
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    process.exitCode = code ?? 1;
  });
}

if (require.main === module) main();

module.exports = { inspectDevEnvironment, readPort, readWranglerTarget, REMOTE_FLAG, REMOTE_ENV_FLAG };
