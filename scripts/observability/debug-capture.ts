import fs from 'node:fs/promises';
import path from 'node:path';
import { purgeExpiredArtifacts, writeDebugSnapshot } from '../../src/lib/observability/server-logger';
import { safeRequestPath } from '../../src/lib/observability/shared';

type ScreenshotOptions = { path?: string; fullPage?: boolean; [key: string]: unknown };

type BrowserPageLike = {
  on(event: string, handler: (...args: unknown[]) => void): void;
  url(): string;
  title(): Promise<string>;
  screenshot(options?: ScreenshotOptions): Promise<unknown>;
  viewportSize?(): { width: number; height: number } | null;
};

function localCaptureEnabled(): boolean {
  return process.env.APP_CAPTURE_SCREENSHOTS === 'true'
    || (process.env.NODE_ENV !== 'production' && process.env.APP_CAPTURE_SCREENSHOTS !== 'false');
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'checkpoint';
}

export async function captureDebugCheckpoint(
  page: BrowserPageLike,
  checkpoint: string,
  context: Record<string, unknown> = {},
): Promise<string | null> {
  if (!localCaptureEnabled()) return null;
  const logDirectory = path.resolve(process.env.APP_LOG_DIR || path.join(process.cwd(), 'logs'));
  await purgeExpiredArtifacts({ directory: logDirectory });
  const screenshotDirectory = path.join(logDirectory, 'screenshots');
  await fs.mkdir(screenshotDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = `${timestamp}-${slug(checkpoint)}`;
  const screenshotPath = path.join(screenshotDirectory, `${baseName}.png`);
  const viewport = page.viewportSize?.() || undefined;
  const title = await page.title().catch(() => '');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await writeDebugSnapshot(`playwright-${checkpoint}`, {
    checkpoint: slug(checkpoint),
    page: safeRequestPath(page.url()),
    title,
    viewport,
    screenshot: path.relative(logDirectory, screenshotPath),
    context,
  });
  return screenshotPath;
}

export function attachPlaywrightDebugCapture(pageValue: unknown, scenario: string): void {
  if (!localCaptureEnabled()) return;
  const page = pageValue as BrowserPageLike;
  const originalScreenshot = page.screenshot.bind(page);
  let capturingFailure = false;
  page.screenshot = async (options = {}) => {
    const result = await originalScreenshot(options);
    if (!capturingFailure && options.path) {
      await writeDebugSnapshot('playwright-screenshot', {
        scenario,
        page: safeRequestPath(page.url()),
        screenshot: path.relative(process.env.APP_LOG_DIR || path.join(process.cwd(), 'logs'), options.path),
      });
    }
    return result;
  };
  const capture = (checkpoint: string, context: Record<string, unknown>) => {
    capturingFailure = true;
    void captureDebugCheckpoint(page, `${scenario}-${checkpoint}`, context).catch((error: unknown) => {
      process.stderr.write(`debug_capture_failed ${String(error)}\n`);
    }).finally(() => { capturingFailure = false; });
  };

  page.on('console', (...args: unknown[]) => {
    const message = args[0] as { type?: () => string; text?: () => string } | undefined;
    if (message?.type?.() === 'error') capture('console-error', { message: message.text?.() });
  });
  page.on('pageerror', (...args: unknown[]) => capture('page-error', { error: args[0] }));
  page.on('requestfailed', (...args: unknown[]) => {
    const request = args[0] as { url?: () => string; failure?: () => { errorText?: string } | null } | undefined;
    capture('request-failed', {
      requestPath: request?.url ? safeRequestPath(request.url()) : undefined,
      failure: request?.failure?.()?.errorText,
    });
  });
  page.on('response', (...args: unknown[]) => {
    const response = args[0] as { status?: () => number; url?: () => string } | undefined;
    if ((response?.status?.() || 0) >= 500) {
      capture('server-response', {
        status: response?.status?.(),
        requestPath: response?.url ? safeRequestPath(response.url()) : undefined,
      });
    }
  });
}
