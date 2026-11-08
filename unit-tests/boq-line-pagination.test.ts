import {
  decodeBoqLineCursor,
  encodeBoqLineCursor,
  fetchBoqLineContinuationPages,
} from '../src/lib/boq-line-pagination';
import { UI_STRINGS } from '../src/lib/ui-strings.constants';

function response(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

describe('BOQ line pagination', () => {
  it('round-trips a stable line number and identifier cursor', () => {
    const cursor = encodeBoqLineCursor({ id: 'line_1-a', lineNumber: '2.1/α' });
    expect(decodeBoqLineCursor(cursor)).toEqual({ id: 'line_1-a', lineNumber: '2.1/α' });
  });

  it.each([
    '',
    'not-json',
    '%',
    encodeURIComponent('[]'),
    encodeURIComponent(JSON.stringify({ id: 'bad/id', lineNumber: '1' })),
    encodeURIComponent(JSON.stringify({ id: 'line-1', lineNumber: '' })),
    encodeURIComponent(JSON.stringify({ id: 'line-1', lineNumber: 'x'.repeat(101) })),
    encodeURIComponent(JSON.stringify({ id: 'line-1', lineNumber: 'line\u0000break' })),
  ])('rejects an invalid cursor', (cursor) => {
    expect(decodeBoqLineCursor(cursor)).toBeNull();
  });

  it('rejects an oversized cursor', () => {
    expect(decodeBoqLineCursor('x'.repeat(513))).toBeNull();
  });

  it('returns no rows when no continuation cursor is supplied', async () => {
    const fetchPage = jest.fn();
    await expect(fetchBoqLineContinuationPages('revision-1', null, fetchPage)).resolves.toEqual([]);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('loads cursor pages until the server reports the final page', async () => {
    const first = encodeBoqLineCursor({ id: 'line-100', lineNumber: '100' });
    const second = encodeBoqLineCursor({ id: 'line-200', lineNumber: '200' });
    const fetchPage = jest.fn()
      .mockResolvedValueOnce(response({ data: [{ id: 'line-101' }], nextCursor: second }))
      .mockResolvedValueOnce(response({ data: [{ id: 'line-201' }], nextCursor: null }));

    await expect(fetchBoqLineContinuationPages('revision-1', first, fetchPage)).resolves.toEqual([
      { id: 'line-101' }, { id: 'line-201' },
    ]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage.mock.calls[0][0]).toContain('pageSize=90');
    expect(fetchPage.mock.calls[1][0]).toContain('cursor=');
  });

  it('rejects server errors, malformed page bodies, invalid next cursors, and repeating cursors', async () => {
    const cursor = encodeBoqLineCursor({ id: 'line-100', lineNumber: '100' });
    const failedFetch = jest.fn().mockResolvedValueOnce(response({}, false));
    await expect(fetchBoqLineContinuationPages('revision-1', cursor, failedFetch))
      .rejects.toThrow(UI_STRINGS.common.userMessages.failedToLoadLineItemDetails);

    const malformedFetch = jest.fn().mockResolvedValueOnce(response({ data: null, nextCursor: null }));
    await expect(fetchBoqLineContinuationPages('revision-1', cursor, malformedFetch))
      .rejects.toThrow(UI_STRINGS.common.userMessages.failedToLoadLineItemDetails);

    const invalidNextFetch = jest.fn().mockResolvedValueOnce(response({ data: [], nextCursor: 'invalid' }));
    await expect(fetchBoqLineContinuationPages('revision-1', cursor, invalidNextFetch))
      .rejects.toThrow(UI_STRINGS.common.userMessages.failedToLoadLineItemDetails);

    const repeatingFetch = jest.fn().mockResolvedValueOnce(response({ data: [{ id: 'line-101' }], nextCursor: cursor }));
    await expect(fetchBoqLineContinuationPages('revision-1', cursor, repeatingFetch))
      .rejects.toThrow(UI_STRINGS.common.userMessages.failedToLoadLineItemDetails);
  });
});
