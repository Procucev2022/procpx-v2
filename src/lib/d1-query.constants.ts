import { MAX_D1_STATEMENT_BINDINGS } from './d1-batch.constants';

export const D1_QUERY_RESERVED_BINDINGS = 10;
export const MAX_D1_QUERY_FILTER_VALUES = MAX_D1_STATEMENT_BINDINGS - D1_QUERY_RESERVED_BINDINGS;
export const MAX_D1_QUERY_DUPLICATED_FILTER_VALUES = Math.floor(MAX_D1_QUERY_FILTER_VALUES / 2);
export const D1_QUERY_INVALID_CHUNK_SIZE = 'D1 query filter chunk size is outside the safe bound';
