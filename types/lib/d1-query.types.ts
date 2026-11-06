export type D1FilterChunkReader<T> = (values: string[]) => Promise<T[]>;
export type D1FilterCountReader = (values: string[]) => Promise<number>;
