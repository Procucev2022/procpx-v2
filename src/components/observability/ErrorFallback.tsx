'use client';
// components/observability/ErrorFallback.tsx - Reports a render error and offers a retry
import { useEffect } from 'react';
import { describeError, reportClientEvent } from '@/lib/observability/client-reporter';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import type { ErrorFallbackProps } from '@app-types/components/observability/ErrorFallback.types';

export default function ErrorFallback({ error, retry, boundary }: ErrorFallbackProps) {
  useEffect(() => {
    // The digest links this report to the matching server-side http.request_failed event.
    reportClientEvent('error', 'browser.render_failed', { boundary, digest: error.digest, error: describeError(error) });
  }, [error, boundary]);

  return (
    <div role="alert" className="card" style={{ maxWidth: 560, margin: '48px auto', padding: 24 }}>
      <h2>{UI_STRINGS.appErrorBoundary.title}</h2>
      <p>{UI_STRINGS.appErrorBoundary.description}</p>
      {error.digest && <p><small>{interpolateUiString(UI_STRINGS.appErrorBoundary.reference, { digest: error.digest })}</small></p>}
      <button type="button" className="btn btn-primary" onClick={() => retry()}>
        {UI_STRINGS.appErrorBoundary.retry}
      </button>
    </div>
  );
}
