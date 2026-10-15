'use client';
// src/app/(app)/vendor-portal/dashboard/page.tsx
// Dedicated Vendor Portal Dashboard
import { useState, useEffect } from 'react';
import VendorSourcingDashboard from '@/components/VendorSourcingDashboard';
import { Building2, AlertCircle, RefreshCw } from 'lucide-react';

export default function VendorPortalDashboardPage() {
  const [vendor, setVendor] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVendorProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/vendor-portal/me');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to load vendor portal');
      }
      const data = await res.json();
      setVendor(data.vendor);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendorProfile();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)' }}>
          <RefreshCw size={20} className="animate-spin" />
          <span>Loading Vendor Portal Dashboard...</span>
        </div>
      </div>
    );
  }

  if (error || !vendor) {
    return (
      <div style={{ padding: 32 }}>
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            borderRadius: 8,
            padding: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <AlertCircle size={24} />
          <div>
            <div style={{ fontWeight: 600 }}>Vendor Access Restricted</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              {error || 'No active vendor record linked to this user account. Please contact the procurement team.'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <VendorSourcingDashboard
      vendorId={vendor.id}
      vendorName={vendor.name}
      vendorCode={vendor.code}
    />
  );
}
