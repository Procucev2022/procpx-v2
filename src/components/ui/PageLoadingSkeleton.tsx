// components/ui/PageLoadingSkeleton.tsx - Placeholder shown while a route segment streams its data
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { PAGE_SKELETON_ROW_COUNT } from './PageLoadingSkeleton.constants';

export default function PageLoadingSkeleton() {
  return (
    <div role="status" aria-live="polite" className="page-loading-skeleton" style={{ padding: '24px 32px', maxWidth: 1440, margin: '0 auto' }}>
      <span className="visually-hidden">{UI_STRINGS.common.loadingPageContent}</span>
      <div aria-hidden="true">
        <div className="skeleton-line" style={{ width: '32%', height: 26, marginBottom: 10 }} />
        <div className="skeleton-line" style={{ width: '54%', height: 14, marginBottom: 28 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16, marginBottom: 28 }}>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={`kpi-${index}`} className="skeleton-line" style={{ height: 88, borderRadius: 10 }} />
          ))}
        </div>
        {Array.from({ length: PAGE_SKELETON_ROW_COUNT }, (_, index) => (
          <div key={`row-${index}`} className="skeleton-line" style={{ height: 40, marginBottom: 10, borderRadius: 8 }} />
        ))}
      </div>
    </div>
  );
}
