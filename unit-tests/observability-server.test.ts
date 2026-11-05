import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  flushLogWrites,
  getLogDirectory,
  initializeLogging,
  installConsoleCapture,
  isFileLoggingEnabled,
  purgeExpiredArtifacts,
  restoreConsoleCapture,
  writeDebugSnapshot,
  writeStructuredLog,
} from '../src/lib/observability/server-logger';

describe('server structured logging', () => {
  let temporaryDirectory: string;
  let originalEnvironment: NodeJS.ProcessEnv;

  function setNodeEnvironment(value: string): void {
    Object.defineProperty(process.env, 'NODE_ENV', { value, configurable: true, enumerable: true, writable: true });
  }

  beforeEach(async () => {
    originalEnvironment = { ...process.env };
    temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'procpx-logs-'));
    setNodeEnvironment('test');
    process.env.APP_LOG_DIR = temporaryDirectory;
    delete process.env.APP_LOG_TO_FILE;
    delete process.env.APP_LOG_PURGE_ON_STARTUP;
    restoreConsoleCapture();
  });

  afterEach(async () => {
    restoreConsoleCapture();
    await flushLogWrites();
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnvironment)) delete process.env[key];
    }
    Object.assign(process.env, originalEnvironment);
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('writes JSONL records and error snapshots with sensitive context redacted', async () => {
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await writeStructuredLog('info', 'pr.created', { prId: 'pr-1' });
      await writeStructuredLog('error', 'pr.approval_failed', { password: 'secret', error: new Error('bad') });
      await flushLogWrites();

      const files = await fs.readdir(temporaryDirectory);
      const logFile = files.find((file) => file.endsWith('.jsonl'));
      expect(logFile).toBeTruthy();
      const records = (await fs.readFile(path.join(temporaryDirectory, logFile!), 'utf8'))
        .trim().split(/\r?\n/).map((line) => JSON.parse(line));
      expect(records).toHaveLength(2);
      expect(records[0]).toMatchObject({ level: 'info', message: 'pr.created', context: { prId: 'pr-1' } });
      expect(records[1].context.password).toBe('[REDACTED]');
      expect(await fs.readdir(path.join(temporaryDirectory, 'snapshots'))).toHaveLength(1);
      expect(stdout).toHaveBeenCalled();
      expect(stderr).toHaveBeenCalled();
    } finally {
      stdout.mockRestore();
      stderr.mockRestore();
    }
  });

  it('sends structured records through the original console in Cloudflare Workers', async () => {
    const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { userAgent: 'Cloudflare-Workers' },
    });
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await writeStructuredLog('info', 'worker.fixture', { recordId: 'fx-1' }, 'application', { NODE_ENV: 'production' });
      expect(log).toHaveBeenCalledWith(expect.stringContaining('"message":"worker.fixture"'));
    } finally {
      log.mockRestore();
      if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
      else delete (globalThis as { navigator?: Navigator }).navigator;
    }
  });

  it('creates sanitized named snapshots and skips file output when disabled', async () => {
    const snapshot = await writeDebugSnapshot('../Payment Error', { token: 'hidden', checkpoint: 2 });
    expect(snapshot).toContain('payment-error.json');
    expect(JSON.parse(await fs.readFile(snapshot!, 'utf8')).context.data.token).toBe('[REDACTED]');
    const fallbackSnapshot = await writeDebugSnapshot('!!!', {});
    expect(fallbackSnapshot).toContain('-snapshot.json');

    const productionDirectory = path.join(temporaryDirectory, 'production-disabled');
    const productionEnvironment = {
      ...process.env,
      NODE_ENV: 'production',
      APP_LOG_TO_FILE: 'false',
      APP_LOG_DIR: productionDirectory,
    } as NodeJS.ProcessEnv;
    expect(isFileLoggingEnabled(productionEnvironment)).toBe(false);
    await initializeLogging(productionEnvironment);
    expect(await writeDebugSnapshot('production-event', {}, productionEnvironment)).toBeNull();
    await writeStructuredLog('info', 'production.event', {}, 'application', productionEnvironment);
    await expect(fs.access(productionDirectory)).rejects.toThrow();
    expect(getLogDirectory(productionEnvironment)).toBe(productionDirectory);
  });

  it('never writes log files on Cloudflare Workers, even when opted in', () => {
    const userAgent = jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Cloudflare-Workers');
    expect(isFileLoggingEnabled({ ...process.env, NODE_ENV: 'development', APP_LOG_TO_FILE: 'true' } as NodeJS.ProcessEnv)).toBe(false);
    userAgent.mockRestore();
  });

  it('supports production file opt-in and purges only expired supported artifacts', async () => {
    const productionEnvironment = { ...process.env, NODE_ENV: 'production', APP_LOG_TO_FILE: 'true' } as NodeJS.ProcessEnv;
    expect(isFileLoggingEnabled(productionEnvironment)).toBe(true);
    await initializeLogging(productionEnvironment);

    const stale = path.join(temporaryDirectory, 'snapshots', 'stale.json');
    const recent = path.join(temporaryDirectory, 'screenshots', 'recent.png');
    const unrelated = path.join(temporaryDirectory, 'screenshots', 'keep.txt');
    await fs.mkdir(path.dirname(stale), { recursive: true });
    await fs.mkdir(path.dirname(recent), { recursive: true });
    await fs.writeFile(stale, '{}');
    await fs.writeFile(recent, 'image');
    await fs.writeFile(unrelated, 'text');
    const oldTime = new Date(Date.now() - 31 * 24 * 60 * 60 * 1_000);
    await fs.utimes(stale, oldTime, oldTime);

    const retentionEnvironment = {
      ...process.env,
      APP_LOG_DIR: temporaryDirectory,
      APP_LOG_RETENTION_DAYS: '1',
    } as NodeJS.ProcessEnv;
    expect(await purgeExpiredArtifacts({ environment: retentionEnvironment })).toBe(1);
    await expect(fs.access(stale)).rejects.toThrow();
    await expect(fs.access(recent)).resolves.toBeUndefined();
    await expect(fs.access(unrelated)).resolves.toBeUndefined();
  });

  it('ignores a missing log directory and propagates other filesystem errors', async () => {
    const missingDirectory = Object.assign(new Error('directory removed'), { code: 'ENOENT' });
    const readdirSpy = jest.spyOn(fs, 'readdir').mockRejectedValueOnce(missingDirectory);
    try {
      expect(await purgeExpiredArtifacts({ directory: temporaryDirectory })).toBe(0);
    } finally {
      readdirSpy.mockRestore();
    }

    const deniedDirectory = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    const deniedSpy = jest.spyOn(fs, 'readdir').mockRejectedValueOnce(deniedDirectory);
    try {
      await expect(purgeExpiredArtifacts({ directory: temporaryDirectory })).rejects.toThrow('permission denied');
    } finally {
      deniedSpy.mockRestore();
    }
  });

  it('purges prior-run artifacts during startup when configured', async () => {
    const startupDirectory = path.join(temporaryDirectory, 'startup-cleanup');
    await fs.mkdir(startupDirectory, { recursive: true });
    await fs.writeFile(path.join(startupDirectory, 'old.jsonl'), '{}');
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      await initializeLogging({
        ...process.env,
        NODE_ENV: 'test',
        APP_LOG_DIR: startupDirectory,
        APP_LOG_RETENTION_DAYS: '30',
        APP_LOG_PURGE_ON_STARTUP: 'true',
      } as NodeJS.ProcessEnv);
      expect(await fs.readdir(startupDirectory)).toHaveLength(0);
      expect(stdout).toHaveBeenCalledWith(expect.stringContaining('observability.expired_artifacts_purged'));
    } finally {
      stdout.mockRestore();
    }
  });

  it('uses the default local log directory when no override is configured', () => {
    expect(getLogDirectory({ ...process.env, APP_LOG_DIR: '' })).toBe(path.join(process.cwd(), 'logs'));
  });

  it('keeps application startup alive when the log directory cannot be created', async () => {
    const blockedPath = path.join(temporaryDirectory, 'regular-file');
    await fs.writeFile(blockedPath, 'not a directory');
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await expect(initializeLogging({
        ...process.env,
        NODE_ENV: 'test',
        APP_LOG_DIR: blockedPath,
      } as NodeJS.ProcessEnv)).resolves.toBeUndefined();
      expect(stderr).toHaveBeenCalledWith(expect.stringContaining('observability.initialization_failed'));
    } finally {
      stderr.mockRestore();
    }
  });

  it('purges all supported artifacts when configured for next-start cleanup', async () => {
    const first = path.join(temporaryDirectory, 'application.jsonl');
    const second = path.join(temporaryDirectory, 'screenshot.webp');
    await fs.writeFile(first, '{}');
    await fs.writeFile(second, 'image');
    expect(await purgeExpiredArtifacts({ directory: temporaryDirectory, purgeAll: true })).toBe(2);
    expect(await fs.readdir(temporaryDirectory)).toHaveLength(0);
  });

  it('captures console methods as structured records and supports repeated installation', async () => {
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      installConsoleCapture();
      installConsoleCapture();
      console.info('category.loaded', { token: 'hidden' });
      console.error('request failed');
      await flushLogWrites();
      const logFile = (await fs.readdir(temporaryDirectory)).find((file) => file.endsWith('.jsonl'));
      const text = await fs.readFile(path.join(temporaryDirectory, logFile!), 'utf8');
      expect(text).toContain('category.loaded');
      expect(text).toContain('[REDACTED]');
      expect(text).toContain('request failed');
    } finally {
      restoreConsoleCapture();
      stdout.mockRestore();
      stderr.mockRestore();
    }
  });
});
