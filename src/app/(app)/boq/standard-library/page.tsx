'use client';
// src/app/(app)/boq/standard-library/page.tsx - Redirect to canonical Standard BOQ Master
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


export default function StandardLibraryRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/masters/standard-boq');
  }, [router]);

  return (
    <div style={{ padding: '60px 0', textAlign: 'center', color: '#64748b', fontSize: 14 }}>{UI_STRINGS.appAppBoqStandardLibraryPage.redirectingToStandardBOQMaster}</div>
  );
}
