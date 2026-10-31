/* Application constants extracted from lib/observability/shared.ts. */

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export const sensitiveKeyPattern = /password|passwd|secret|token|authorization|cookie|session|api[-_]?key|credential|private[-_]?key/i;

export const secretTextPattern = /\b(password|passwd|secret|token|authorization|cookie|api[-_]?key)\b(\s*[:=]\s*)([^\s&,;]+)/gi;

export const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
