import { sanitizeLogValue } from '../src/lib/observability/shared';
import {
  NOTIFICATION_OUTBOX_REASON_CODE_PATTERN,
  NOTIFICATION_OUTBOX_PAYLOAD_INVALID_REASON,
} from '../src/lib/notification-outbox.constants';

describe('error serialization for logs', () => {
  it('keeps the Next.js digest, the driver code, and a nested cause so a failure correlates across logs', () => {
    const cause = new Error('connection reset by peer');
    const error = Object.assign(new Error('query failed for user@example.com'), {
      digest: 'digest-123', code: 'D1_ERROR', cause,
    });

    const safe = sanitizeLogValue(error) as Record<string, unknown>;

    expect(safe).toMatchObject({
      name: 'Error', digest: 'digest-123', code: 'D1_ERROR',
      cause: { name: 'Error', message: 'connection reset by peer' },
    });
    expect(JSON.stringify(safe)).not.toContain('user@example.com');
  });

  it('omits digest and code when the error does not carry them', () => {
    const safe = sanitizeLogValue(new Error('plain failure')) as Record<string, unknown>;
    expect(safe).not.toHaveProperty('digest');
    expect(safe).not.toHaveProperty('code');
    expect(safe).not.toHaveProperty('cause');
  });

  it('accepts only snake-case reason codes for verbatim logging', () => {
    expect(NOTIFICATION_OUTBOX_REASON_CODE_PATTERN.test(NOTIFICATION_OUTBOX_PAYLOAD_INVALID_REASON)).toBe(true);
    expect(NOTIFICATION_OUTBOX_REASON_CODE_PATTERN.test('boom')).toBe(false);
    expect(NOTIFICATION_OUTBOX_REASON_CODE_PATTERN.test('private value user@example.com')).toBe(false);
  });
});
