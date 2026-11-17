import { MAX_BOQ_BATCH_LINES } from './d1-batch.constants';

export const MAX_BOQ_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_BOQ_IMPORT_SHEET_ROWS = MAX_BOQ_BATCH_LINES + 12;
export const MAX_BOQ_IMPORT_COLUMNS = 100;
export const BOQ_UPLOAD_PREVIEW_ROWS = 6;

/** Extensions a BOQ template upload may use. The stored object name is random, so the client file name never becomes a storage path. */
export const BOQ_TEMPLATE_UPLOAD_EXTENSIONS: readonly string[] = ['.xlsx', '.xls', '.csv'];
