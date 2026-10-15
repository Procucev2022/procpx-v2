'use client';
// src/app/(app)/procurement/vendors/page.tsx
// Corporate Vendor Management Module (Category Manager Workspace)
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Building2,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  XCircle,
  FileText,
  ShieldCheck,
  Star,
  ExternalLink,
  Users,
  Globe,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Award,
  RefreshCw,
  HelpCircle,
  Check,
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/Toast';

export default function VendorManagementPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'directory' | 'onboarding' | 'evaluation'>('directory');
  const [vendorGroup, setVendorGroup] = useState<'ALL' | 'CLIENT_VENDOR' | 'PROCUCEV_VENDOR'>('ALL');
  const [qualificationFilter, setQualificationFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');

  const [vendors, setVendors] = useState<any[]>([]);
  const [counts, setCounts] = useState<any>({
    total: 0,
    clientVendorsCount: 0,
    procucevVendorsCount: 0,
    qualifiedCount: 0,
    pendingReviewCount: 0,
    notEvaluatedCount: 0,
  });
  const [loading, setLoading] = useState(true);

  // Immediate Onboarding Form State
  const [onboardingStep, setOnboardingStep] = useState<1 | 2>(1);
  const [savedVendorId, setSavedVendorId] = useState<string | null>(null);
  const [submittingOnboard, setSubmittingOnboard] = useState(false);
  const [onboardSuccessMsg, setOnboardSuccessMsg] = useState<string>('');
  const [onboardErrorMsg, setOnboardErrorMsg] = useState<string>('');
  const [newVendor, setNewVendor] = useState({
    name: '',
    vendorType: 'CLIENT_VENDOR' as 'CLIENT_VENDOR' | 'PROCUCEV_VENDOR',
    contactPerson: '',
    email: '',
    phone: '',
    category: 'Civil & Interior',
    operatingLocation: '',
    city: '',
    state: '',
    legalStructure: 'PRIVATE_LIMITED',
    gstin: '',
    pan: '',
    website: '',
    address: '',
    experienceYears: 5,
    turnoverCrores: '',
    capabilities: '',
    serviceCoverage: 'Pan-India',
    clientReferences: '',
  });

  useEffect(() => {
    fetchVendors();
  }, [vendorGroup, qualificationFilter, categoryFilter, search]);

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (vendorGroup !== 'ALL') params.set('vendorType', vendorGroup);
      if (qualificationFilter !== 'ALL') params.set('qualificationStatus', qualificationFilter);
      if (categoryFilter !== 'ALL') params.set('category', categoryFilter);
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/procurement/vendors?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setVendors(data.vendors || []);
        if (data.counts) setCounts(data.counts);
      }
    } catch (err) {
      console.error('Failed to load vendors', err);
    } finally {
      setLoading(false);
    }
  };

  const handleImmediateOnboarding = async (isDraft: boolean) => {
    setOnboardErrorMsg('');
    setOnboardSuccessMsg('');

    // Validation
    if (!newVendor.name.trim()) {
      setOnboardErrorMsg('Vendor Legal / Business Name is required.');
      return;
    }
    if (!newVendor.contactPerson.trim()) {
      setOnboardErrorMsg('Primary Contact Name is required.');
      return;
    }
    if (!newVendor.email.trim() && !newVendor.phone.trim()) {
      setOnboardErrorMsg('Mobile number or Email is required.');
      return;
    }
    if (!newVendor.operatingLocation.trim() && !newVendor.city.trim()) {
      setOnboardErrorMsg('Operating Location is required.');
      return;
    }

    setSubmittingOnboard(true);
    try {
      const res = await fetch('/api/procurement/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newVendor,
          id: savedVendorId || undefined,
          isDraft,
          turnoverCrores: newVendor.turnoverCrores ? parseFloat(newVendor.turnoverCrores) : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to onboard vendor');
      }

      setSavedVendorId(data.vendor.id);
      fetchVendors();

      if (isDraft) {
        toast.success('Vendor details submitted successfully.', data.vendor.code, 'Draft');
        setOnboardSuccessMsg('Vendor details submitted successfully.');
      } else {
        toast.success('Vendor details submitted successfully.', data.vendor.code, 'Onboarded');
        setOnboardSuccessMsg('Vendor details submitted successfully.');

        // Reset form upon final completion
        setSavedVendorId(null);
        setNewVendor({
          name: '',
          vendorType: 'CLIENT_VENDOR',
          contactPerson: '',
          email: '',
          phone: '',
          category: 'Civil & Interior',
          operatingLocation: '',
          city: '',
          state: '',
          legalStructure: 'PRIVATE_LIMITED',
          gstin: '',
          pan: '',
          website: '',
          address: '',
          experienceYears: 5,
          turnoverCrores: '',
          capabilities: '',
          serviceCoverage: 'Pan-India',
          clientReferences: '',
        });
        setOnboardingStep(1);

        // Switch to directory after short delay
        setTimeout(() => {
          setActiveTab('directory');
        }, 1800);
      }
    } catch (err: any) {
      setOnboardErrorMsg(err.message || 'Error onboarding vendor');
    } finally {
      setSubmittingOnboard(false);
    }
  };

  return (
    <div className="page-content" style={{ paddingBottom: 60 }}>
      {/* Top Header */}
      <PageHeader
        breadcrumbs={[
          { label: 'Procurement', href: '/procurement/rfqs' },
          { label: 'Vendor Management' },
        ]}
        title="Vendor Management"
        description="Enterprise vendor governance, client vs network partner directory, evidence-based AI evaluation rubric, and PPO performance tracking."
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            {activeTab !== 'onboarding' && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setActiveTab('onboarding');
                  setOnboardingStep(1);
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
              >
                <Plus size={16} /> Add Vendor
              </button>
            )}
          </div>
        }
      />

      {/* KPI Stats Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div className="card" style={{ padding: '14px 18px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Total Registered Vendors</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
            {counts.total}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            Across all categories
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#1e40af' }}>Client Vendors</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1e40af', marginTop: 4 }}>
            {counts.clientVendorsCount}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            Client-nominated & private records
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#047857' }}>Procucev Network Vendors</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#047857', marginTop: 4 }}>
            {counts.procucevVendorsCount}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            Pre-vetted ecosystem partners
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#059669' }}>Fully Qualified</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#059669', marginTop: 4 }}>
            {counts.qualifiedCount}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            Passed 6-criteria evaluation
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#d97706' }}>Pending Evaluation / Review</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#d97706', marginTop: 4 }}>
            {counts.pendingReviewCount + counts.notEvaluatedCount}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            {counts.pendingReviewCount} in review · {counts.notEvaluatedCount} unevaluated
          </div>
        </div>
      </div>

      {/* Main Module Tabs (Directory | Onboarding | Evaluation) */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: 20, gap: 8 }}>
        <button
          type="button"
          onClick={() => setActiveTab('directory')}
          style={{
            padding: '10px 18px',
            fontSize: 13,
            fontWeight: 700,
            color: activeTab === 'directory' ? '#2563eb' : '#64748b',
            borderBottom: activeTab === 'directory' ? '2px solid #2563eb' : '2px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Building2 size={15} /> Vendor Directory
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('onboarding');
            setOnboardingStep(1);
          }}
          style={{
            padding: '10px 18px',
            fontSize: 13,
            fontWeight: 700,
            color: activeTab === 'onboarding' ? '#2563eb' : '#64748b',
            borderBottom: activeTab === 'onboarding' ? '2px solid #2563eb' : '2px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Plus size={15} /> Onboarding
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('evaluation')}
          style={{
            padding: '10px 18px',
            fontSize: 13,
            fontWeight: 700,
            color: activeTab === 'evaluation' ? '#2563eb' : '#64748b',
            borderBottom: activeTab === 'evaluation' ? '2px solid #2563eb' : '2px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Sparkles size={15} color="#6366f1" /> Evaluation
        </button>
      </div>

      {/* =========================================================================
          TAB 1: VENDOR DIRECTORY
      ========================================================================= */}
      {activeTab === 'directory' && (
        <div>
          {/* Sub-group Pill Selector (Client Vendors vs Procucev Vendors) */}
          <div
            className="card"
            style={{
              padding: '12px 16px',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              marginBottom: 16,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            {/* Vendor Group Switcher */}
            <div style={{ display: 'flex', gap: 6, background: '#f1f5f9', padding: 4, borderRadius: 6 }}>
              <button
                type="button"
                onClick={() => setVendorGroup('ALL')}
                style={{
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  background: vendorGroup === 'ALL' ? '#ffffff' : 'transparent',
                  color: vendorGroup === 'ALL' ? '#0f172a' : '#64748b',
                  boxShadow: vendorGroup === 'ALL' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                All Vendors ({counts.total})
              </button>
              <button
                type="button"
                onClick={() => setVendorGroup('CLIENT_VENDOR')}
                style={{
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  background: vendorGroup === 'CLIENT_VENDOR' ? '#ffffff' : 'transparent',
                  color: vendorGroup === 'CLIENT_VENDOR' ? '#1e40af' : '#64748b',
                  boxShadow: vendorGroup === 'CLIENT_VENDOR' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                Client Vendors ({counts.clientVendorsCount})
              </button>
              <button
                type="button"
                onClick={() => setVendorGroup('PROCUCEV_VENDOR')}
                style={{
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  background: vendorGroup === 'PROCUCEV_VENDOR' ? '#ffffff' : 'transparent',
                  color: vendorGroup === 'PROCUCEV_VENDOR' ? '#047857' : '#64748b',
                  boxShadow: vendorGroup === 'PROCUCEV_VENDOR' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                Procucev Network Vendors ({counts.procucevVendorsCount})
              </button>
            </div>

            {/* Filter Controls */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Search name, code, city, GSTIN..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input-field"
                  style={{ height: 32, fontSize: 12, width: 230, paddingLeft: 30 }}
                />
              </div>

              <select
                value={qualificationFilter}
                onChange={(e) => setQualificationFilter(e.target.value)}
                className="input-field"
                style={{ height: 32, fontSize: 12, padding: '0 8px' }}
              >
                <option value="ALL">All Qualification States</option>
                <option value="QUALIFIED">Qualified</option>
                <option value="CONDITIONALLY_QUALIFIED">Conditionally Qualified</option>
                <option value="PENDING_REVIEW">Pending Review</option>
                <option value="NOT_EVALUATED">Not Evaluated</option>
                <option value="NOT_QUALIFIED">Not Qualified</option>
              </select>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="input-field"
                style={{ height: 32, fontSize: 12, padding: '0 8px' }}
              >
                <option value="ALL">All Categories</option>
                <option value="Civil & Interior">Civil & Interior</option>
                <option value="Electrical">Electrical</option>
                <option value="HVAC">HVAC</option>
                <option value="Plumbing">Plumbing</option>
                <option value="General Contracting">General Contracting</option>
              </select>
            </div>
          </div>

          {/* Vendors Directory Table */}
          <div className="card" style={{ padding: 0, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
              <table className="table enterprise-table" style={{ width: '100%', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', height: 40, borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                    <th style={{ padding: '0 12px', width: 90 }}>Vendor Code</th>
                    <th style={{ padding: '0 12px', minWidth: 200 }}>Vendor Name</th>
                    <th style={{ padding: '0 10px', width: 140 }}>Vendor Group</th>
                    <th style={{ padding: '0 10px', minWidth: 150 }}>Primary Category</th>
                    <th style={{ padding: '0 10px', width: 130 }}>Location</th>
                    <th style={{ padding: '0 10px', width: 140, textAlign: 'center' }}>Qualification</th>
                    <th style={{ padding: '0 10px', width: 120, textAlign: 'center' }}>PPO Rating</th>
                    <th style={{ padding: '0 12px', width: 90, textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} style={{ padding: 36, textAlign: 'center', color: '#64748b' }}>
                        Loading vendors...
                      </td>
                    </tr>
                  ) : vendors.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>
                        <Building2 size={36} color="#cbd5e1" style={{ margin: '0 auto 10px' }} />
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#334155' }}>No Vendors Found</div>
                        <div style={{ fontSize: 12, marginTop: 4 }}>
                          {search ? 'Try adjusting your search query or filters.' : 'Click "Add Vendor" above to onboard your first vendor.'}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    vendors.map((v) => (
                      <tr key={v.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 700, fontFamily: 'monospace', color: '#1e40af' }}>
                          {v.code}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <Link
                            href={`/procurement/vendors/${v.id}`}
                            style={{ fontWeight: 700, color: '#0f172a', textDecoration: 'none' }}
                          >
                            {v.name}
                          </Link>
                          {v.contactPerson && (
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                              Contact: {v.contactPerson} {v.phone ? `(${v.phone})` : ''}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '10px 10px' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: 10,
                              fontWeight: 700,
                              background: v.vendorType === 'CLIENT_VENDOR' ? '#eff6ff' : '#ecfdf5',
                              color: v.vendorType === 'CLIENT_VENDOR' ? '#1e40af' : '#047857',
                              border: v.vendorType === 'CLIENT_VENDOR' ? '1px solid #bfdbfe' : '1px solid #a7f3d0',
                            }}
                          >
                            {v.vendorType === 'CLIENT_VENDOR' ? 'Client Vendor' : 'Procucev Network'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 10px', color: '#334155', fontWeight: 600 }}>
                          {v.categories || 'General Contracting'}
                        </td>
                        <td style={{ padding: '10px 10px', color: '#64748b' }}>
                          {v.operatingLocation || v.city || 'India'}
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                          {v.qualificationStatus === 'QUALIFIED' ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#ecfdf5', color: '#047857', padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: 11 }}>
                              <CheckCircle2 size={12} /> Qualified {v.qualificationScore ? `(${v.qualificationScore}%)` : ''}
                            </span>
                          ) : v.qualificationStatus === 'CONDITIONALLY_QUALIFIED' ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fffbeb', color: '#b45309', padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: 11 }}>
                              <AlertTriangle size={12} /> Conditional {v.qualificationScore ? `(${v.qualificationScore}%)` : ''}
                            </span>
                          ) : v.qualificationStatus === 'PENDING_REVIEW' ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#eff6ff', color: '#1e40af', padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: 11 }}>
                              <Clock size={12} /> Review Pending
                            </span>
                          ) : v.qualificationStatus === 'NOT_QUALIFIED' ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fef2f2', color: '#dc2626', padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: 11 }}>
                              <XCircle size={12} /> Not Qualified
                            </span>
                          ) : (
                            <span style={{ background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: 4, fontWeight: 600, fontSize: 11 }}>
                              Not Evaluated
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                          {v.averagePpoRating ? (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, color: '#0f172a' }}>
                              <Star size={13} fill="#f59e0b" color="#f59e0b" />
                              <span>{v.averagePpoRating.toFixed(1)}</span>
                              <span style={{ fontSize: 10, color: '#64748b' }}>({v.ppoRatingsCount} PPO{v.ppoRatingsCount > 1 ? 's' : ''})</span>
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: 11 }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <Link
                            href={`/procurement/vendors/${v.id}`}
                            className="btn btn-outline"
                            style={{ fontSize: 11, padding: '4px 8px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            Open <ArrowRight size={11} />
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: IMMEDIATE VENDOR ONBOARDING
      ========================================================================= */}
      {activeTab === 'onboarding' && (
        <div style={{ maxWidth: 840, margin: '0 auto' }}>
          <div className="card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 14, borderBottom: '1px solid #f1f5f9' }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Immediate Vendor Onboarding
                </h3>
                <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>
                  Register a new supplier record immediately. Step 1 collects mandatory operational contacts; Step 2 captures business and compliance details.
                </p>
              </div>

              {/* Step indicator */}
              <div style={{ display: 'flex', gap: 8 }}>
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 700,
                    background: onboardingStep === 1 ? '#2563eb' : '#f1f5f9',
                    color: onboardingStep === 1 ? '#ffffff' : '#64748b',
                  }}
                >
                  Step 1: Basic Info
                </span>
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 700,
                    background: onboardingStep === 2 ? '#2563eb' : '#f1f5f9',
                    color: onboardingStep === 2 ? '#ffffff' : '#64748b',
                  }}
                >
                  Step 2: Business Profile
                </span>
              </div>
            </div>

            {onboardSuccessMsg && (
              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', padding: '10px 14px', borderRadius: 6, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
                {onboardSuccessMsg}
              </div>
            )}

            {onboardErrorMsg && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '10px 14px', borderRadius: 6, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
                {onboardErrorMsg}
              </div>
            )}

            {/* STEP 1: Basic Information */}
            {onboardingStep === 1 && (
              <div>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 14 }}>
                  1. Basic Information (Mandatory)
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
                      Vendor Legal / Business Name <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="e.g. Apex Infrastructure & Contracting Pvt Ltd"
                      value={newVendor.name}
                      onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })}
                      style={{ width: '100%', height: 34, fontSize: 12 }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
                      Vendor Classification Type <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <select
                      className="input-field"
                      value={newVendor.vendorType}
                      onChange={(e) => setNewVendor({ ...newVendor, vendorType: e.target.value as any })}
                      style={{ width: '100%', height: 34, fontSize: 12 }}
                    >
                      <option value="CLIENT_VENDOR">Client Vendor (Nominated for this client)</option>
                      <option value="PROCUCEV_VENDOR">Procucev Vendor (Network partner ecosystem)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
                      Primary Contact Person <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="e.g. Rajesh Sharma"
                      value={newVendor.contactPerson}
                      onChange={(e) => setNewVendor({ ...newVendor, contactPerson: e.target.value })}
                      style={{ width: '100%', height: 34, fontSize: 12 }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
                      Contact Email <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      type="email"
                      className="input-field"
                      placeholder="e.g. sales@apexinfra.com"
                      value={newVendor.email}
                      onChange={(e) => setNewVendor({ ...newVendor, email: e.target.value })}
                      style={{ width: '100%', height: 34, fontSize: 12 }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
                      Mobile / Phone Number <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      type="tel"
                      className="input-field"
                      placeholder="e.g. +91 98765 43210"
                      value={newVendor.phone}
                      onChange={(e) => setNewVendor({ ...newVendor, phone: e.target.value })}
                      style={{ width: '100%', height: 34, fontSize: 12 }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 20 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
                      Primary Category Domain <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <select
                      className="input-field"
                      value={newVendor.category}
                      onChange={(e) => setNewVendor({ ...newVendor, category: e.target.value })}
                      style={{ width: '100%', height: 34, fontSize: 12 }}
                    >
                      <option value="Civil & Interior">Civil & Interior</option>
                      <option value="Electrical & Automation">Electrical & Automation</option>
                      <option value="HVAC & Ventilation">HVAC & Ventilation</option>
                      <option value="Plumbing & Sanitary">Plumbing & Sanitary</option>
                      <option value="Retail Fixtures & Joinery">Retail Fixtures & Joinery</option>
                      <option value="General Contracting">General Contracting</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
                      Operating Location (City / Region) <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="e.g. Hyderabad, Telangana"
                      value={newVendor.operatingLocation}
                      onChange={(e) => setNewVendor({ ...newVendor, operatingLocation: e.target.value, city: e.target.value.split(',')[0].trim() })}
                      style={{ width: '100%', height: 34, fontSize: 12 }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={submittingOnboard}
                    onClick={() => handleImmediateOnboarding(true)}
                    style={{ fontSize: 12 }}
                  >
                    Save as Draft Profile
                  </button>

                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setOnboardingStep(2)}
                    style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
                  >
                    Continue to Step 2 (Business Profile) →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: Business Profile */}
            {onboardingStep === 2 && (
              <div>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 14 }}>
                  2. Business Profile & Statutory Details
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
                      Legal Structure
                    </label>
                    <select
                      className="input-field"
                      value={newVendor.legalStructure}
                      onChange={(e) => setNewVendor({ ...newVendor, legalStructure: e.target.value })}
                      style={{ width: '100%', height: 34, fontSize: 12 }}
                    >
                      <option value="PRIVATE_LIMITED">Private Limited (Pvt Ltd)</option>
                      <option value="PARTNERSHIP">Partnership Firm</option>
                      <option value="LLP">Limited Liability Partnership (LLP)</option>
                      <option value="SOLE_PROPRIETORSHIP">Sole Proprietorship</option>
                      <option value="PUBLIC_LIMITED">Public Limited</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
                      GSTIN (15 Digits)
                    </label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="e.g. 36AABCA1234F1Z5"
                      maxLength={15}
                      value={newVendor.gstin}
                      onChange={(e) => setNewVendor({ ...newVendor, gstin: e.target.value.toUpperCase() })}
                      style={{ width: '100%', height: 34, fontSize: 12, fontFamily: 'monospace' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
                      PAN (10 Digits)
                    </label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="e.g. AABCA1234F"
                      maxLength={10}
                      value={newVendor.pan}
                      onChange={(e) => setNewVendor({ ...newVendor, pan: e.target.value.toUpperCase() })}
                      style={{ width: '100%', height: 34, fontSize: 12, fontFamily: 'monospace' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
                      Company Website
                    </label>
                    <input
                      type="url"
                      className="input-field"
                      placeholder="https://company.com"
                      value={newVendor.website}
                      onChange={(e) => setNewVendor({ ...newVendor, website: e.target.value })}
                      style={{ width: '100%', height: 34, fontSize: 12 }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
                      Years in Business
                    </label>
                    <input
                      type="number"
                      className="input-field"
                      min={0}
                      value={newVendor.experienceYears}
                      onChange={(e) => setNewVendor({ ...newVendor, experienceYears: parseInt(e.target.value) || 0 })}
                      style={{ width: '100%', height: 34, fontSize: 12 }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
                      Annual Turnover (₹ Crores)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      className="input-field"
                      placeholder="e.g. 25.5"
                      value={newVendor.turnoverCrores}
                      onChange={(e) => setNewVendor({ ...newVendor, turnoverCrores: e.target.value })}
                      style={{ width: '100%', height: 34, fontSize: 12 }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
                    Registered Business Address
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Complete corporate office address"
                    value={newVendor.address}
                    onChange={(e) => setNewVendor({ ...newVendor, address: e.target.value })}
                    style={{ width: '100%', height: 34, fontSize: 12 }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 20 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
                      Product / Scope Capabilities
                    </label>
                    <textarea
                      className="input-field"
                      rows={3}
                      placeholder="Specific scope capabilities, workforce strength, workshops, machinery..."
                      value={newVendor.capabilities}
                      onChange={(e) => setNewVendor({ ...newVendor, capabilities: e.target.value })}
                      style={{ width: '100%', fontSize: 12, padding: '6px 8px' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
                      Key Client References & Previous Projects
                    </label>
                    <textarea
                      className="input-field"
                      rows={3}
                      placeholder="Notable previous clients (e.g. Tata, Reliance, D-Mart) and project values"
                      value={newVendor.clientReferences}
                      onChange={(e) => setNewVendor({ ...newVendor, clientReferences: e.target.value })}
                      style={{ width: '100%', fontSize: 12, padding: '6px 8px' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setOnboardingStep(1)}
                    style={{ fontSize: 12 }}
                  >
                    ← Back to Step 1
                  </button>

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={submittingOnboard}
                      onClick={() => handleImmediateOnboarding(true)}
                      style={{ fontSize: 12 }}
                    >
                      Save as Draft
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={submittingOnboard}
                      onClick={() => handleImmediateOnboarding(false)}
                      style={{ fontSize: 12, fontWeight: 700 }}
                    >
                      {submittingOnboard ? 'Onboarding...' : 'Complete Onboarding & Register'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 3: EVALUATION HUB
      ========================================================================= */}
      {activeTab === 'evaluation' && (
        <div>
          <div
            className="card"
            style={{
              padding: '16px 20px',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              marginBottom: 20,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Structured Vendor Evaluation Rubric
                </h3>
                <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>
                  Evaluation framework based on 6 weighted categories. AI provides evidence-based analysis; Category Managers retain definitive qualification authority.
                </p>
              </div>

              <div style={{ display: 'flex', gap: 6, fontSize: 11, color: '#475569' }}>
                <span style={{ padding: '3px 8px', background: '#ecfdf5', color: '#047857', borderRadius: 4, fontWeight: 700 }}>
                  80–100%: Recommended
                </span>
                <span style={{ padding: '3px 8px', background: '#fffbeb', color: '#b45309', borderRadius: 4, fontWeight: 700 }}>
                  65–79%: Conditional
                </span>
                <span style={{ padding: '3px 8px', background: '#fef2f2', color: '#dc2626', borderRadius: 4, fontWeight: 700 }}>
                  &lt;65%: Not Recommended
                </span>
              </div>
            </div>

            {/* Rubric Weights Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginTop: 16 }}>
              {[
                { name: 'Business Profile', weight: '15%' },
                { name: 'Financial Strength', weight: '20%' },
                { name: 'Previous Clients', weight: '20%' },
                { name: 'References', weight: '15%' },
                { name: 'Technical Capability', weight: '20%' },
                { name: 'Compliance & Risk', weight: '10%' },
              ].map((c) => (
                <div key={c.name} style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 6, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>{c.name}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#1e40af', marginTop: 2 }}>{c.weight}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Vendors Awaiting / Qualified List */}
          <div className="card" style={{ padding: 0, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                Evaluation Pipeline & Review Queue ({vendors.length})
              </span>
              <span style={{ fontSize: 12, color: '#64748b' }}>
                Select any vendor to inspect evidence or run AI Evaluation
              </span>
            </div>

            <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
              <table className="table enterprise-table" style={{ width: '100%', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', height: 38, borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                    <th style={{ padding: '0 12px', width: 100 }}>Code</th>
                    <th style={{ padding: '0 12px', minWidth: 200 }}>Vendor Name</th>
                    <th style={{ padding: '0 10px', width: 130 }}>Vendor Group</th>
                    <th style={{ padding: '0 10px', width: 150 }}>Onboarding Status</th>
                    <th style={{ padding: '0 10px', width: 160, textAlign: 'center' }}>Qualification Status</th>
                    <th style={{ padding: '0 10px', width: 110, textAlign: 'center' }}>Score</th>
                    <th style={{ padding: '0 12px', width: 110, textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {vendors.map((v) => (
                    <tr key={v.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 700, fontFamily: 'monospace', color: '#1e40af' }}>
                        {v.code}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a' }}>
                        <Link href={`/procurement/vendors/${v.id}`} style={{ textDecoration: 'none', color: '#0f172a' }}>
                          {v.name}
                        </Link>
                      </td>
                      <td style={{ padding: '10px 10px' }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 3,
                            background: v.vendorType === 'CLIENT_VENDOR' ? '#eff6ff' : '#ecfdf5',
                            color: v.vendorType === 'CLIENT_VENDOR' ? '#1e40af' : '#047857',
                          }}
                        >
                          {v.vendorType === 'CLIENT_VENDOR' ? 'Client' : 'Procucev Network'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 10px', color: '#64748b' }}>
                        {v.onboardingStatus === 'ONBOARDED' ? (
                          <span style={{ color: '#047857', fontWeight: 600 }}>✓ Profile Complete</span>
                        ) : v.onboardingStatus === 'PROFILE_INCOMPLETE' ? (
                          <span style={{ color: '#b45309', fontWeight: 600 }}>⚠ Incomplete Profile</span>
                        ) : (
                          <span style={{ color: '#64748b' }}>Draft</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 700,
                            background:
                              v.qualificationStatus === 'QUALIFIED'
                                ? '#ecfdf5'
                                : v.qualificationStatus === 'CONDITIONALLY_QUALIFIED'
                                ? '#fffbeb'
                                : v.qualificationStatus === 'PENDING_REVIEW'
                                ? '#eff6ff'
                                : '#f1f5f9',
                            color:
                              v.qualificationStatus === 'QUALIFIED'
                                ? '#047857'
                                : v.qualificationStatus === 'CONDITIONALLY_QUALIFIED'
                                ? '#b45309'
                                : v.qualificationStatus === 'PENDING_REVIEW'
                                ? '#1e40af'
                                : '#64748b',
                          }}
                        >
                          {v.qualificationStatus ? v.qualificationStatus.replace(/_/g, ' ') : 'NOT EVALUATED'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 800 }}>
                        {v.qualificationScore !== null && v.qualificationScore !== undefined ? (
                          <span style={{ color: v.qualificationScore >= 80 ? '#047857' : v.qualificationScore >= 65 ? '#b45309' : '#dc2626' }}>
                            {v.qualificationScore}%
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <Link
                          href={`/procurement/vendors/${v.id}?tab=evaluation`}
                          className="btn btn-outline"
                          style={{ fontSize: 11, padding: '4px 8px', textDecoration: 'none' }}
                        >
                          Evaluate →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
