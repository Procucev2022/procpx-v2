import { uiStringPattern } from '@/lib/i18n';
import {
  createLogRecord,
  getRequestCorrelationId,
  redactText,
  safeRequestPath,
  sanitizeLogValue,
  serializeConsoleArguments,
} from '../src/lib/observability/shared';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


describe('shared observability helpers', () => {
  it('redacts credential fields, bearer tokens, inline secrets, and email addresses', () => {
    const safe = sanitizeLogValue({
      password: 'hidden',
      accessToken: 'hidden-too',
      detail: 'Bearer abc.def token=private user@example.com',
    }) as Record<string, unknown>;

    expect(safe.password).toBe('[REDACTED]');
    expect(safe.accessToken).toBe('[REDACTED]');
    expect(safe.detail).toBe('Bearer [REDACTED] token=[REDACTED] [REDACTED_EMAIL]');
    expect(redactText('api_key:shh')).toBe('api_key:[REDACTED]');
  });

  it('normalizes errors, dates, circular values, deep values, and large collections', () => {
    const circular: Record<string, unknown> = { createdAt: new Date('2026-01-01T00:00:00Z') };
    circular.self = circular;
    circular.error = new Error('failed for dev@example.com');
    circular.big = BigInt(42);
    circular.symbol = Symbol('trace');
    circular.callback = function callback() { return undefined; };
    circular.anonymous = () => undefined;
    const noStack = new Error('stackless');
    noStack.stack = undefined;
    circular.noStack = noStack;
    let deepValue: Record<string, unknown> = { value: 'too deep' };
    for (let index = 0; index < 8; index += 1) deepValue = { child: deepValue };
    circular.deep = deepValue;
    circular.items = Array.from({ length: 52 }, (_, index) => index);
    circular.entries = Object.fromEntries(Array.from({ length: 52 }, (_, index) => [`field${index}`, index]));

    const safe = sanitizeLogValue(circular) as Record<string, unknown>;
    expect(safe.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(safe.self).toBe('[Circular]');
    expect(safe.error).toMatchObject({ name: 'Error', message: 'failed for [REDACTED_EMAIL]' });
    expect(safe.big).toBe('42');
    expect(safe.symbol).toBe('Symbol(trace)');
    expect(safe.callback).toBe('[Function callback]');
    expect(safe.anonymous).toBe('[Function anonymous]');
    expect(safe.noStack).toEqual({ name: UI_STRINGS.common.error, message: 'stackless' });
    expect(JSON.stringify(safe.deep)).toContain('[MaxDepth]');
    expect((safe.items as unknown[])).toHaveLength(50);
    expect(Object.keys(safe.entries as object)).toHaveLength(50);
    expect(sanitizeLogValue(undefined)).toBeUndefined();
    expect(sanitizeLogValue(null)).toBeNull();
  });

  it('formats console arguments and creates structured records with safe context', () => {
    const args = serializeConsoleArguments(['BOQ failed', { token: 'secret', attempts: 2 }, new Error('bad'), undefined]);
    expect(args.message).toContain('BOQ failed');
    expect(args.message).toContain('[REDACTED]');
    expect(args.message).toContain('undefined');
    expect(args.context.arguments).toHaveLength(4);
    expect(serializeConsoleArguments([]).message).toBe('Console event');

    const record = createLogRecord('error', 'Payment failed for user@example.com', { userId: 'user-1' }, 'browser');
    expect(record).toMatchObject({
      level: 'error',
      message: 'Payment failed for [REDACTED_EMAIL]',
      service: 'procpx',
      source: 'browser',
      context: { userId: 'user-1' },
    });
    expect(createLogRecord('info', '', {}).message).toBe('Application event');
    expect(createLogRecord('info', 'ready').context).toBeUndefined();
    expect(createLogRecord('info', 'ready', {}, 'application', { NODE_ENV: '' } as unknown as NodeJS.ProcessEnv).environment)
      .toBe('development');
  });

  it('keeps path/query names while redacting query values', () => {
    expect(safeRequestPath('/api/pr?id=123&token=secret')).toBe('/api/pr?id=%5BREDACTED%5D&token=%5BREDACTED%5D');
    expect(safeRequestPath('/api/pr')).toBe('/api/pr');
    expect(safeRequestPath('https://example.test/login?email=a@example.test')).toBe('/login?email=%5BREDACTED%5D');
    expect(safeRequestPath('http://[invalid')).toBe('http://[invalid');
  });

  it('reads and bounds case-insensitive request correlation headers', () => {
    expect(getRequestCorrelationId({ 'X-Request-ID': ' trace-from-proxy ' })).toBe('trace-from-proxy');
    expect(getRequestCorrelationId({ 'x-request-id': ['first-id', 'second-id'] })).toBe('first-id');
    expect(getRequestCorrelationId({ 'x-request-id': 'x'.repeat(160) })).toBe('x'.repeat(128));
  });

  it('falls back to Cloudflare ray IDs and returns undefined when absent', () => {
    expect(getRequestCorrelationId({ 'x-request-id': ' ', 'CF-Ray': 'ray-123' })).toBe('ray-123');
    expect(getRequestCorrelationId({})).toBeUndefined();
  });
});
