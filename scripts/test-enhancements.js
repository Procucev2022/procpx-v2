'use strict';

console.error('This legacy test runner is disabled because it connected directly to Cloudflare D1 and used test identity headers.');
console.error('Use the local-only HTTP and D1 regression runner: npx tsx scripts/e2e-d1-regression.ts http://localhost:3001');
process.exitCode = 1;
