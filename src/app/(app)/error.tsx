'use client'; // Error boundaries must be Client Components
// app/(app)/error.tsx - Error boundary for authenticated pages
import ErrorFallback from '@/components/observability/ErrorFallback';
import type { ErrorBoundaryProps } from '@app-types/components/observability/ErrorFallback.types';
export default function AppError({ error, reset }: ErrorBoundaryProps) {
  return <ErrorFallback error={error} retry={reset} boundary="app" />;
}
