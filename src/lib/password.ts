// lib/password.ts - Password hashing tuned for the Cloudflare Workers CPU budget
import bcrypt from 'bcryptjs';
import { PASSWORD_HASH_ROUNDS } from './password.constants';

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

/** True when a stored hash uses more rounds than the current cost and should be replaced at the next login. */
export function passwordNeedsRehash(passwordHash: string): boolean {
  try {
    return bcrypt.getRounds(passwordHash) > PASSWORD_HASH_ROUNDS;
  } catch {
    return false;
  }
}
