/* Shared declarations for components/observability/ErrorFallback.tsx. */
export interface ErrorFallbackProps {
  error: Error & { digest?: string };
  retry: () => void;
  boundary: 'root' | 'app' | 'global';
}
// Props Next.js passes to error.tsx and global-error.tsx. Next names the recovery callback `reset`.
export interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}
