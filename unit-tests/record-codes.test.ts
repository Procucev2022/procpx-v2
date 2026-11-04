import { formatNextCode, nextRecordCode } from '../src/lib/record-codes';

describe('record codes', () => {
  it('continues from the highest numeric suffix, ignoring other formats', () => {
    expect(formatNextCode('PR-2026-', 6, [])).toBe('PR-2026-000001');
    expect(formatNextCode('PR-2026-', 6, ['PR-2026-000004', 'PR-2026-92569', null, undefined, 'PR-2025-999999', 'PR-2026-DRAFT']))
      .toBe('PR-2026-092570');
    expect(formatNextCode('BTX-', 6, ['BTX-REV-00007', 'BTX-000002'])).toBe('BTX-000003');
  });

  it('does not reuse a number after a deletion leaves a gap', () => {
    // Two rows remain after PR-2026-000002 was deleted; counting rows would reissue 000003.
    expect(formatNextCode('PR-2026-', 6, ['PR-2026-000001', 'PR-2026-000003'])).toBe('PR-2026-000004');
  });

  it('reads only the tenant codes with the prefix', async () => {
    const findMany = jest.fn().mockResolvedValue([{ boqCode: 'BOQ-P1-007' }, { boqCode: 'BOQ-P1-002' }]);
    await expect(nextRecordCode({ findMany }, 'boqCode', 'tenant-1', 'BOQ-P1-', 3)).resolves.toBe('BOQ-P1-008');
    expect(findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', boqCode: { startsWith: 'BOQ-P1-' } },
      select: { boqCode: true },
    });
  });
});
