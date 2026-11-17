// app/(app)/loading.tsx - Shown instantly on navigation inside the authenticated shell, while the next page's data streams in
import PageLoadingSkeleton from '@/components/ui/PageLoadingSkeleton';

export default function AppLoading() {
  return <PageLoadingSkeleton />;
}
