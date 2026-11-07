/* Application constants for lib/password.ts. */

// bcryptjs runs in plain JavaScript on Cloudflare Workers, where every extra round
// doubles the CPU time of a login. Cost 10 keeps one hash or compare well inside
// the Workers CPU budget while remaining the bcrypt default work factor.
export const PASSWORD_HASH_ROUNDS = 10;
