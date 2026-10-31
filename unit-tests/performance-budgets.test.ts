import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const loadCommonJs = createRequire(__filename);
const {
  collectPerformanceMetrics,
  evaluatePerformanceBudgets,
  toPublicRoute,
} = loadCommonJs('../scripts/check-performance-budgets.cjs');

let buildDirectory: string;

function writeBuildAsset(relativePath: string, contents: string): void {
  const filePath = path.join(buildDirectory, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function createBuildFixture(): void {
  buildDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'procpx-performance-budget-'));
  writeBuildAsset('static/chunks/runtime.js', 'runtime'.repeat(100));
  writeBuildAsset('static/chunks/page.js', 'page'.repeat(100));
  writeBuildAsset('static/chunks/lazy.js', 'lazy'.repeat(100));
  writeBuildAsset('static/chunks/styles.css', '.page{color:#000}'.repeat(100));
  writeBuildAsset(
    'server/app/(app)/dashboard/page_client-reference-manifest.js',
    [
      'globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};',
      'globalThis.__RSC_MANIFEST["/(app)/dashboard/page"] = {"clientModules":{"shell":{"chunks":["/_next/static/chunks/runtime.js","/_next/static/chunks/page.js"],"async":false},"deferred":{"chunks":["/_next/static/chunks/lazy.js"],"async":true}}};',
    ].join('\n'),
  );
  writeBuildAsset(
    'server/app/(app)/dashboard/page/build-manifest.json',
    JSON.stringify({ polyfillFiles: [], rootMainFiles: ['static/chunks/runtime.js'] }),
  );
}

beforeEach(() => createBuildFixture());
afterEach(() => {
  if (buildDirectory && fs.existsSync(buildDirectory)) fs.rmSync(buildDirectory, { recursive: true, force: true });
});

describe('client performance budgets', () => {
  it('counts unique initial route JavaScript and excludes asynchronously loaded chunks', () => {
    const metrics = collectPerformanceMetrics(buildDirectory);

    expect(metrics.routes).toHaveLength(1);
    expect(metrics.routes[0].route).toBe('/dashboard');
    expect(metrics.routes[0].files.map((file: { file: string }) => file.file).sort()).toEqual([
      'static/chunks/page.js',
      'static/chunks/runtime.js',
    ]);
    expect(metrics.cssAssets).toHaveLength(1);
  });

  it('fails the gate when any route JavaScript or emitted CSS exceeds its budget', () => {
    const metrics = collectPerformanceMetrics(buildDirectory);

    expect(evaluatePerformanceBudgets(metrics, {
      maxInitialJavaScriptGzipBytesPerRoute: 1,
      maxEmittedCssGzipBytes: 1,
    })).toHaveLength(2);
  });

  it('rejects a route that references a missing client bundle', () => {
    fs.rmSync(path.join(buildDirectory, 'static/chunks/page.js'));

    expect(() => collectPerformanceMetrics(buildDirectory)).toThrow(/Missing initial JavaScript asset/);
  });

  it('normalizes route groups out of public route names', () => {
    expect(toPublicRoute('/(app)/admin/(users)/page')).toBe('/admin');
    expect(toPublicRoute('/page')).toBe('/');
  });
});
