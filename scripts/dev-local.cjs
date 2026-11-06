#!/usr/bin/env node
'use strict';

/* eslint @typescript-eslint/no-require-imports: "off" -- CommonJS bootstrap resolves Next's internal CLI binary. */
const { spawn } = require('node:child_process');

if (process.env.DATABASE_PROVIDER && process.env.DATABASE_PROVIDER !== 'd1') {
  throw new Error('proCPX only supports Cloudflare D1. Local development uses Wrangler local D1; SQLite is schema-generation-only.');
}

const nextBin = require.resolve('next/dist/bin/next');
const child = spawn(process.execPath, [nextBin, 'dev', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_PROVIDER: 'd1' },
});

child.on('error', (error) => {
  process.stderr.write(`Could not start Next.js with local D1: ${error.message}\n`);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
