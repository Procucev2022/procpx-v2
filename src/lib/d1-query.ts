import type { D1FilterChunkReader, D1FilterCountReader } from '@app-types/lib/d1-query.types';
import {
  D1_QUERY_INVALID_CHUNK_SIZE,
  MAX_D1_QUERY_FILTER_VALUES,
} from './d1-query.constants';

export async function readByD1FilterChunks<T>(
  values: readonly string[],
  readChunk: D1FilterChunkReader<T>,
  chunkSize = MAX_D1_QUERY_FILTER_VALUES,
): Promise<T[]> {
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1 || chunkSize > MAX_D1_QUERY_FILTER_VALUES) {
    throw new RangeError(D1_QUERY_INVALID_CHUNK_SIZE);
  }

  const uniqueValues = Array.from(new Set(values));
  const results: T[] = [];
  for (let offset = 0; offset < uniqueValues.length; offset += chunkSize) {
    results.push(...await readChunk(uniqueValues.slice(offset, offset + chunkSize)));
  }
  return results;
}

export async function countByD1FilterChunks(
  values: readonly string[],
  countChunk: D1FilterCountReader,
  chunkSize = MAX_D1_QUERY_FILTER_VALUES,
): Promise<number> {
  const counts = await readByD1FilterChunks(values, async (chunk) => [await countChunk(chunk)], chunkSize);
  return counts.reduce((total, count) => total + count, 0);
}
