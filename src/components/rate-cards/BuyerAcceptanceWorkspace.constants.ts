/**
 * The sample agreement button attaches a placeholder file name and size, with no document behind it. It exists only
 * for development and test builds, so production users cannot submit a placeholder agreement.
 */
export const SHOW_SAMPLE_AGREEMENT_ATTACHMENT = process.env.NODE_ENV !== 'production';
