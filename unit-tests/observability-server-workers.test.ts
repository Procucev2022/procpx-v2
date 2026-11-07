import {
  flushLogWrites,
  installConsoleCapture,
  logEvent,
  restoreConsoleCapture,
  writeStructuredLog,
} from '../src/lib/observability/server-logger';

describe('server logger output on Cloudflare Workers', () => {
  afterEach(() => {
    restoreConsoleCapture();
    jest.restoreAllMocks();
  });

  it('emits each level through the console methods that existed before capture', async () => {
    jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Cloudflare-Workers');
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const original = {
      log: jest.spyOn(console, 'log').mockImplementation(() => undefined),
      warn: jest.spyOn(console, 'warn').mockImplementation(() => undefined),
      error: jest.spyOn(console, 'error').mockImplementation(() => undefined),
    };

    // Without capture the console is called directly.
    await writeStructuredLog('info', 'worker.started');
    expect(original.log).toHaveBeenCalledWith(expect.stringContaining('"message":"worker.started"'));

    installConsoleCapture();
    console.warn('captured warning');
    console.error('captured failure');
    await flushLogWrites();
    expect(original.warn).toHaveBeenCalledWith(expect.stringContaining('"level":"warn"'));
    expect(original.error).toHaveBeenCalledWith(expect.stringContaining('"message":"captured failure"'));
    expect(stdout).not.toHaveBeenCalled();
  });
});

describe('logEvent', () => {
  afterEach(() => jest.restoreAllMocks());

  it('writes without being awaited and reports logger failures on stderr', async () => {
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementationOnce(() => { throw new Error('stream closed'); });

    logEvent('info', 'example.event', { recordId: 'pr-1' });
    await flushLogWrites();
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('observability.log_failed Error: stream closed'));

    stdout.mockImplementation(() => true);
    logEvent('warn', 'example.second');
    await flushLogWrites();
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"message":"example.second"'));
  });
});
