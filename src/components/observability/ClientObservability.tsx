'use client';
// components/observability/ClientObservability.tsx - Installs browser error reporting for the app
import { useEffect } from 'react';
import { installClientErrorReporting } from '@/lib/observability/client-reporter';

export default function ClientObservability() {
  useEffect(() => installClientErrorReporting(), []);
  return null;
}
