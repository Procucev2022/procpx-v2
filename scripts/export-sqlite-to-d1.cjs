#!/usr/bin/env node
'use strict';

console.error('Legacy SQLite export is disabled. proCPX uses Cloudflare D1 and does not import the legacy mock database.');
console.error('For isolated local regression data, run: npm run db:seed:test');
process.exitCode = 1;
