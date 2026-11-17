'use client'; // Error boundaries must be Client Components
// app/error.tsx - Catches render errors on public routes (home redirect, login) that have no (app) layout
import ErrorFallback from '@/components/observability/ErrorFallback';
import type { ErrorBoundaryProps } from '@app-types/components/observability/ErrorFallback.types';

export default function RootError({ error, reset }: ErrorBoundaryProps) {
  return <ErrorFallback error={error} retry={reset} boundary="root" />;
}
