/* Shared declarations for components/observability/ErrorFallback.tsx. */

export interface ErrorFallbackProps {
  error: Error & { digest?: string };
  retry: () => void;
  boundary: 'app' | 'global';
}

// Props Next.js passes to error.tsx and global-error.tsx.
export type ErrorBoundaryProps = Omit<ErrorFallbackProps, 'boundary'>;
