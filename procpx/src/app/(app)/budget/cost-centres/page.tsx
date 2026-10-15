'use client';
// src/app/(app)/budget/cost-centres/page.tsx - Redirect obsolete route to Project Budget
import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function CostCentresRedirectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = searchParams ? searchParams.toString() : '';
    const destination = params ? `/budget?${params}` : '/budget';
    router.replace(destination);
  }, [router, searchParams]);

  return (
    <div style={{ padding: '48px 32px', textAlign: 'center', color: '#64748b', fontSize: 14 }}>
      Redirecting to Project Budget...
    </div>
  );
}

export default function CostCentreBudgetsRedirect() {
  return (
    <Suspense fallback={<div style={{ padding: '48px 32px', textAlign: 'center', color: '#64748b' }}>Loading...</div>}>
      <CostCentresRedirectContent />
    </Suspense>
  );
}
