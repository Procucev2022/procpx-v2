import {
  initializeLogging,
  installConsoleCapture,
  restoreConsoleCapture,
  writeStructuredLog,
} from '../src/lib/observability/edge-logger';

describe('Edge structured logging', () => {
  afterEach(() => {
    restoreConsoleCapture();
    jest.restoreAllMocks();
  });

  it('uses the Worker console and creates sanitized structured records', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const record = await writeStructuredLog('info', 'worker started', { apiKey: 'secret-value' }, 'next');

    expect(record).toMatchObject({
      level: 'info',
      message: 'worker started',
      service: 'procpx',
      source: 'next',
      context: { apiKey: '[REDACTED]' },
    });
    expect(log).toHaveBeenCalledWith(JSON.stringify(record));
    await expect(initializeLogging()).resolves.toBeUndefined();
  });

  it('captures console levels as structured records and restores native methods', () => {
    const debug = jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    installConsoleCapture();
    installConsoleCapture();
    console.debug('debug message');
    console.info('info message');
    console.log('log message');
    console.warn('warn message');
    console.error('error message');

    expect(debug).toHaveBeenCalledWith(expect.stringContaining('"level":"debug"'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"level":"info"'));
    expect(log.mock.calls.filter(([line]) => String(line).includes('"level":"info"'))).toHaveLength(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"level":"warn"'));
    expect(error).toHaveBeenCalledWith(expect.stringContaining('"level":"error"'));

    restoreConsoleCapture();
    console.info('native console restored');
    expect(info).toHaveBeenLastCalledWith('native console restored');
  });
});
