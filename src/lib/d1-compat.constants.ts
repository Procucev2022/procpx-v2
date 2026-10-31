// Cloudflare D1 allows at most 100 bound parameters per statement. Prisma does
// not chunk nested relation loads that carry a `where` (or a select+orderBy+take),
// so a findMany over more parents than this fails. Pages stay below the limit.
export const D1_MAX_PAGE_SIZE = 90;

// Errors raised when a nested relation load exceeds the D1 parameter limit:
// D1 itself reports "too many SQL variables"; Prisma's engine reports
// "no entry found for key" for nested select + orderBy + take.
export const D1_PARAMETER_LIMIT_ERRORS = [/too many SQL variables/i, /no entry found for key/i];
