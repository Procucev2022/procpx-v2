// app/not-found.tsx - Shown for unknown URLs and when a page calls notFound()
import Link from 'next/link';
import { UI_STRINGS } from '@/lib/ui-strings.constants';

export default function NotFound() {
  return (
    <main className="card" role="alert" style={{ maxWidth: 560, margin: '48px auto', padding: 24 }}>
      <h2>{UI_STRINGS.appNotFound.title}</h2>
      <p>{UI_STRINGS.appNotFound.description}</p>
      <Link href="/dashboard" className="btn btn-primary">{UI_STRINGS.appNotFound.backToDashboard}</Link>
    </main>
  );
}
