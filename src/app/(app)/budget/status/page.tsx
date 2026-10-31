'use client';
// src/app/(app)/budget/status/page.tsx - Redirect duplicate budget status route to Project Budget
import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


function BudgetStatusRedirectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = searchParams ? searchParams.toString() : '';
    const destination = params ? `/budget?${params}` : '/budget';
    router.replace(destination);
  }, [router, searchParams]);

  return (
    <div style={{ padding: '48px 32px', textAlign: 'center', color: '#64748b', fontSize: 14 }}>{UI_STRINGS.common.redirectingToProjectBudget}</div>
  );
}

export default function BudgetStatusRedirect() {
  return (
    <Suspense fallback={<div style={{ padding: '48px 32px', textAlign: 'center', color: '#64748b' }}>{UI_STRINGS.common.loading}</div>}>
      <BudgetStatusRedirectContent />
    </Suspense>
  );
}
