'use client';
// src/app/(app)/budget/project/page.tsx - Redirect /budget/project to /budget
import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function BudgetProjectRedirectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = searchParams ? searchParams.toString() : '';
    const destination = params ? `/budget?${params}` : '/budget';
    router.replace(destination);
  }, [router, searchParams]);

  return (
    <div style={{ padding: '48px 32px', textAlign: 'center', color: '#64748b', fontSize: 14 }}>
      Loading Project Budget...
    </div>
  );
}

export default function BudgetProjectRedirect() {
  return (
    <Suspense fallback={<div style={{ padding: '48px 32px', textAlign: 'center', color: '#64748b' }}>Loading...</div>}>
      <BudgetProjectRedirectContent />
    </Suspense>
  );
}
