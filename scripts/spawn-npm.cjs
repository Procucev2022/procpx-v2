/* eslint @typescript-eslint/no-require-imports: "off" -- This script is intentionally CommonJS. */
const { spawnSync } = require('node:child_process');

// Runs an npm command without a shell when possible. `npm run` exposes its CLI script in
// npm_execpath, so it is executed with the current Node binary and arguments are passed verbatim.
// Outside npm, Windows needs a shell for npm.cmd; pass one quoted command string so Node does not
// concatenate an argument array (DEP0190).
function spawnNpm(args, options) {
  const npmCli = process.env.npm_execpath;
  if (npmCli && /\.c?js$/i.test(npmCli)) {
    return spawnSync(process.execPath, [npmCli, ...args], options);
  }
  if (process.platform !== 'win32') return spawnSync('npm', args, options);

  const quote = (value) => (/^[\w@%+=:,./\\-]+$/.test(value) ? value : `"${String(value).replace(/"/g, '\\"')}"`);
  return spawnSync(['npm.cmd', ...args].map(quote).join(' '), { ...options, shell: true });
}

module.exports = { spawnNpm };
