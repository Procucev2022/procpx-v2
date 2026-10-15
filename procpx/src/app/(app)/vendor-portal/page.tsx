// src/app/(app)/vendor-portal/page.tsx
import { redirect } from 'next/navigation';

export default function VendorPortalIndexPage() {
  redirect('/vendor-portal/dashboard');
}
