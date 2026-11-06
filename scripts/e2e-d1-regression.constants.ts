import { LOCAL_E2E_D1_PERSIST_PATH } from './database.constants.cjs';

export const LOCAL_D1_EXECUTE_ARGS = [
  'd1', 'execute', 'DB', '--local', '--json', '--persist-to', LOCAL_E2E_D1_PERSIST_PATH,
] as const;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

export function requireLocalE2EBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('D1 end-to-end regression only accepts an HTTP(S) localhost URL.');
  }

  if (!['http:', 'https:'].includes(url.protocol) || !LOCAL_HOSTS.has(url.hostname) || url.username || url.password) {
    throw new Error('D1 end-to-end regression only accepts an HTTP(S) localhost URL.');
  }

  return url.toString().replace(/\/$/, '');
}
