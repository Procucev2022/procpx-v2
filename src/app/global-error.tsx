'use client'; // Error boundaries must be Client Components
// app/global-error.tsx - Replaces the root layout when it fails, so it renders its own html/body
import './globals.css';
import ErrorFallback from '@/components/observability/ErrorFallback';
import ClientObservability from '@/components/observability/ClientObservability';
import { I18N_CONFIG } from '@/lib/i18n.constants';
import type { ErrorBoundaryProps } from '@app-types/components/observability/ErrorFallback.types';

export default function GlobalError({ error, retry }: ErrorBoundaryProps) {
  return (
    <html lang={I18N_CONFIG.defaultLocale}>
      <body>
        <ClientObservability />
        <ErrorFallback error={error} retry={retry} boundary="global" />
      </body>
    </html>
  );
}
