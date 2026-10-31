/* eslint @typescript-eslint/no-require-imports: "off" -- This script is intentionally CommonJS. */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { PERFORMANCE_BUDGETS } = require('./performance-budget.constants.cjs');

const root = path.resolve(__dirname, '..');

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  });
}

function gzipSize(filePath, level = PERFORMANCE_BUDGETS.gzipLevel) {
  return zlib.gzipSync(fs.readFileSync(filePath), { level }).length;
}

function parseClientReferenceManifest(contents, filename) {
  const assignmentPattern = /^globalThis\.__RSC_MANIFEST\[(.+?)\]\s*=\s*(.+?)\s*;?\s*$/gm;
  const routes = [];
  let match;

  while ((match = assignmentPattern.exec(contents)) !== null) {
    let route;
    let manifest;
    try {
      route = JSON.parse(match[1]);
      manifest = JSON.parse(match[2]);
    } catch (error) {
      throw new Error(`Could not parse client reference data in ${filename}: ${error.message}`);
    }
    routes.push({ route, manifest });
  }

  if (routes.length === 0 && contents.includes('__RSC_MANIFEST')) {
    throw new Error(`No client reference routes were found in ${filename}.`);
  }

  return routes;
}

function toPublicRoute(route) {
  const segments = route.split('/').filter(Boolean)
    .filter((segment) => segment !== 'page' && !(segment.startsWith('(') && segment.endsWith(')')));
  return segments.length ? `/${segments.join('/')}` : '/';
}

function toStaticAssetPath(reference) {
  let normalized = reference.replaceAll('\\', '/').replace(/^\/+/, '');
  if (normalized.startsWith('_next/')) normalized = normalized.slice('_next/'.length);
  if (!normalized.startsWith('static/')) {
    throw new Error(`Unexpected client asset reference: ${reference}`);
  }
  return normalized;
}

function collectPerformanceMetrics(buildDirectory) {
  const resolvedBuildDirectory = path.resolve(buildDirectory);
  const staticDirectory = path.join(resolvedBuildDirectory, 'static');
  const appDirectory = path.join(resolvedBuildDirectory, 'server', 'app');
  if (!fs.existsSync(staticDirectory) || !fs.existsSync(appDirectory)) {
    throw new Error(`Production client assets or app manifests are missing under ${resolvedBuildDirectory}; run the production build first.`);
  }

  const javascriptAssets = new Map();
  const cssAssets = [];
  for (const filePath of listFiles(staticDirectory)) {
    const relativePath = path.relative(resolvedBuildDirectory, filePath).split(path.sep).join('/');
    if (filePath.endsWith('.js')) {
      javascriptAssets.set(relativePath, {
        rawBytes: fs.statSync(filePath).size,
        gzipBytes: gzipSize(filePath),
      });
    } else if (filePath.endsWith('.css')) {
      cssAssets.push({
        file: relativePath,
        rawBytes: fs.statSync(filePath).size,
        gzipBytes: gzipSize(filePath),
      });
    }
  }

  const manifestFiles = listFiles(appDirectory)
    .filter((filePath) => path.basename(filePath) === 'page_client-reference-manifest.js');
  const routeJavaScript = new Map();

  for (const manifestFile of manifestFiles) {
    const contents = fs.readFileSync(manifestFile, 'utf8');
    for (const { route, manifest } of parseClientReferenceManifest(contents, manifestFile)) {
      if (!route.endsWith('/page')) continue;

      const publicRoute = toPublicRoute(route);
      if (routeJavaScript.has(publicRoute)) {
        throw new Error(`Multiple App Router pages map to ${publicRoute}; route budget results would be ambiguous.`);
      }

      const buildManifestPath = path.join(path.dirname(manifestFile), 'page', 'build-manifest.json');
      if (!fs.existsSync(buildManifestPath)) {
        throw new Error(`Missing page build manifest for ${publicRoute}: ${buildManifestPath}`);
      }
      const buildManifest = JSON.parse(fs.readFileSync(buildManifestPath, 'utf8'));
      const references = new Set();
      for (const reference of [...(buildManifest.polyfillFiles || []), ...(buildManifest.rootMainFiles || [])]) {
        references.add(toStaticAssetPath(reference));
      }

      for (const routeModule of Object.values(manifest.clientModules || {})) {
        if (routeModule.async) continue;
        if (!Array.isArray(routeModule.chunks)) {
          throw new Error(`Client module in ${publicRoute} has no chunk list; the Next.js manifest format may have changed.`);
        }
        for (const reference of routeModule.chunks) {
          if (typeof reference === 'string' && reference.endsWith('.js')) {
            references.add(toStaticAssetPath(reference));
          }
        }
      }

      const files = [...references].map((reference) => {
        const sizes = javascriptAssets.get(reference);
        if (!sizes) throw new Error(`Missing initial JavaScript asset for ${publicRoute}: ${reference}`);
        return { file: reference, ...sizes };
      });
      routeJavaScript.set(publicRoute, {
        route: publicRoute,
        files,
        rawBytes: files.reduce((total, file) => total + file.rawBytes, 0),
        gzipBytes: files.reduce((total, file) => total + file.gzipBytes, 0),
      });
    }
  }

  if (routeJavaScript.size === 0) {
    throw new Error(`No App Router page client manifests were found under ${appDirectory}.`);
  }

  return {
    routes: [...routeJavaScript.values()].sort((left, right) => left.route.localeCompare(right.route)),
    cssAssets,
    cssRawBytes: cssAssets.reduce((total, file) => total + file.rawBytes, 0),
    cssGzipBytes: cssAssets.reduce((total, file) => total + file.gzipBytes, 0),
  };
}

function evaluatePerformanceBudgets(metrics, budgets = PERFORMANCE_BUDGETS) {
  const violations = [];
  for (const route of metrics.routes) {
    if (route.gzipBytes > budgets.maxInitialJavaScriptGzipBytesPerRoute) {
      violations.push({
        type: 'javascript',
        route: route.route,
        actualBytes: route.gzipBytes,
        budgetBytes: budgets.maxInitialJavaScriptGzipBytesPerRoute,
      });
    }
  }
  if (metrics.cssGzipBytes > budgets.maxEmittedCssGzipBytes) {
    violations.push({
      type: 'css',
      actualBytes: metrics.cssGzipBytes,
      budgetBytes: budgets.maxEmittedCssGzipBytes,
    });
  }
  return violations;
}

function formatKilobytes(bytes) {
  return `${(bytes / 1_000).toFixed(1)} KB`;
}

function printPerformanceReport(metrics, budgets) {
  process.stdout.write('Client performance budgets (per-asset gzip totals)\n');
  process.stdout.write(`Initial JavaScript per route: ${formatKilobytes(budgets.maxInitialJavaScriptGzipBytesPerRoute)} maximum\n`);
  process.stdout.write(`Route                                      JavaScript gzip       Result\n`);
  for (const route of metrics.routes) {
    const status = route.gzipBytes <= budgets.maxInitialJavaScriptGzipBytesPerRoute ? 'PASS' : 'FAIL';
    process.stdout.write(`${route.route.padEnd(42)} ${formatKilobytes(route.gzipBytes).padStart(12)} / ${formatKilobytes(budgets.maxInitialJavaScriptGzipBytesPerRoute).padEnd(8)} ${status}\n`);
  }

  const cssStatus = metrics.cssGzipBytes <= budgets.maxEmittedCssGzipBytes ? 'PASS' : 'FAIL';
  process.stdout.write(`Critical CSS (all emitted CSS assets): ${formatKilobytes(metrics.cssGzipBytes)} / ${formatKilobytes(budgets.maxEmittedCssGzipBytes)} ${cssStatus}\n`);
}

function runPerformanceCheck(buildDirectory = path.join(root, '.next')) {
  try {
    const metrics = collectPerformanceMetrics(buildDirectory);
    const violations = evaluatePerformanceBudgets(metrics);
    printPerformanceReport(metrics, PERFORMANCE_BUDGETS);
    if (violations.length > 0) {
      for (const violation of violations) {
        const subject = violation.type === 'javascript' ? `Initial JavaScript for ${violation.route}` : 'Critical CSS';
        process.stderr.write(`FAIL: ${subject} is ${formatKilobytes(violation.actualBytes)}; budget is ${formatKilobytes(violation.budgetBytes)}.\n`);
      }
      process.exitCode = 1;
      return;
    }
    process.stdout.write('PASS: all client performance budgets are within limits.\n');
  } catch (error) {
    process.stderr.write(`Client performance budget check failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) runPerformanceCheck();

module.exports = {
  collectPerformanceMetrics,
  evaluatePerformanceBudgets,
  parseClientReferenceManifest,
  toPublicRoute,
};
