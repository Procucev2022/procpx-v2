'use client';
// app/login/page.tsx - Premium Split-Screen Enterprise Login
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck,
  TrendingUp,
  Gavel,
  Lock,
  ArrowRight,
  Shield,
  HelpCircle,
  X,
  KeyRound,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

interface Persona {
  role: string;
  email: string;
  password?: string;
  desc: string;
  badge?: string;
}

const BUYER_PERSONAS: Persona[] = [
  { role: 'Category Manager', email: 'category.manager@procucev-demo.local', desc: 'Taxonomy, Sourcing, RFQ Negotiations & Awards', badge: 'Buyer' },
  { role: 'Procurement User', email: 'procurement.user@procucev-demo.local', desc: 'RFQs, Sourcing & Quotations', badge: 'Buyer' },
  { role: 'Project Approver', email: 'project.approver@procucev-demo.local', desc: 'BOQ Approval & Baselines', badge: 'Approver' },
  { role: 'Project User', email: 'project.user@procucev-demo.local', desc: 'BOQ Upload, Drafting & PR Creation', badge: 'Project' },
  { role: 'Finance User', email: 'finance.user@procucev-demo.local', desc: 'Award Approvals & PPO Tracking', badge: 'Finance' },
  { role: 'Client Admin', email: 'client.admin@procucev-demo.local', desc: 'Tenant Governance, Users & Roles', badge: 'Admin' },
  { role: 'Super Admin', email: 'super.admin@procucev-demo.local', desc: 'Platform Infrastructure', badge: 'Super Admin' },
  { role: 'Viewer (Read-Only)', email: 'viewer@procucev-demo.local', desc: 'Read-Only Project & Audit View', badge: 'Auditor' },
];

const VENDOR_PERSONAS: Persona[] = [
  { role: 'Apex Infrastructure', email: 'vendor.apex@apex-infra.com', password: 'Demo@1234', desc: 'Civil & Contracting (Redirects to Vendor Portal)', badge: 'Vendor' },
  { role: 'BluePeak Engineering', email: 'bluepeak.engineering@vendor.procpx.local', password: 'welcome', desc: 'MEP Solutions (Redirects to Vendor Portal)', badge: 'Vendor' },
  { role: 'CraftLine Interior', email: 'craftline.interior@vendor.procpx.local', password: 'welcome', desc: 'Retail Fixtures (Redirects to Vendor Portal)', badge: 'Vendor' },
  { role: 'Ramakrishna Interiors', email: 'ramakrishna.interiors@vendor.procpx.local', password: 'welcome', desc: 'Commercial Fitouts (Redirects to Vendor Portal)', badge: 'Vendor' },
  { role: 'Srinidhi Interiors', email: 'srinidhi.interiors@vendor.procpx.local', password: 'welcome', desc: 'Retail Millwork (Redirects to Vendor Portal)', badge: 'Vendor' },
  { role: 'Zenith Retail Systems', email: 'zenith.retail@vendor.procpx.local', password: 'welcome', desc: 'Electrical & Display (Redirects to Vendor Portal)', badge: 'Vendor' },
];

const TENANT_B_PERSONAS: Persona[] = [
  { role: 'Hospitality Project User', email: 'hospitality.user@procucev-demo.local', password: 'Demo@1234', desc: 'Multi-Tenant Isolation Boundary', badge: 'Tenant B' },
  { role: 'Hospitality Approver', email: 'hospitality.approver@procucev-demo.local', password: 'Demo@1234', desc: 'Tenant B Project Approver', badge: 'Tenant B' },
  { role: 'Hospitality Admin', email: 'hospitality.admin@procucev-demo.local', password: 'Demo@1234', desc: 'Tenant B Organization Administrator', badge: 'Tenant B' },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [loadedPersonaName, setLoadedPersonaName] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await signIn('credentials', {
        email: email.trim(),
        password,
        redirect: false,
      });
      if (result?.error) {
        setError('Invalid work email or password. Please verify your credentials.');
      } else {
        try {
          const sessionRes = await fetch('/api/auth/session');
          const sessionData = await sessionRes.json();
          if (sessionData?.user?.role === 'VENDOR') {
            router.push('/vendor-portal/dashboard');
          } else {
            router.push('/dashboard');
          }
        } catch {
          router.push('/dashboard');
        }
        router.refresh();
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const selectPersona = (targetEmail: string, targetPassword = 'Demo@1234', roleName?: string) => {
    setEmail(targetEmail);
    setPassword(targetPassword);
    setError('');
    if (roleName) {
      setLoadedPersonaName(roleName);
    }
    setShowDemoModal(false);
  };

  return (
    <div className="login-split-page">
      {/* ── LEFT: Enterprise Brand & Value Proposition ────────── */}
      <div className="login-left-brand">
        <div>
          {/* Logo & Headline */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: 18,
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
              }}
            >
              P
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.4, lineHeight: 1.1 }}>
                proCPX
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                Enterprise Capex Procurement
              </div>
            </div>
          </div>

          <p
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              color: '#cbd5e1',
              marginTop: 24,
              maxWidth: 420,
              fontWeight: 400,
            }}
          >
            From approved BOQ to sourcing, negotiation and award — one controlled procurement workflow.
          </p>

          {/* Pillars List */}
          <div style={{ marginTop: 44, display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 440 }}>
            <div style={{ display: 'flex', gap: 14 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#60a5fa',
                  flexShrink: 0,
                }}
              >
                <ShieldCheck size={18} strokeWidth={2} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#ffffff' }}>
                  Immutable Baseline Governance
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3, lineHeight: 1.5 }}>
                  Quantities and specifications locked upon client approval. Zero line-item drift.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 14 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#34d399',
                  flexShrink: 0,
                }}
              >
                <TrendingUp size={18} strokeWidth={2} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#ffffff' }}>
                  Procurement Intelligence & Variance
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3, lineHeight: 1.5 }}>
                  Automated L1/L2 matrix comparison, benchmark variance telemetry, and real-time savings.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 14 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fbbf24',
                  flexShrink: 0,
                }}
              >
                <Gavel size={18} strokeWidth={2} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#ffffff' }}>
                  Dynamic E-Auctions & Negotiations
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3, lineHeight: 1.5 }}>
                  Multi-round counter-offers, decremental reverse auctions, and binding rate locks.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 14 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#a78bfa',
                  flexShrink: 0,
                }}
              >
                <Lock size={18} strokeWidth={2} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#ffffff' }}>
                  Enterprise Multi-Tenant Security
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3, lineHeight: 1.5 }}>
                  Strict row-level tenant isolation, RBAC separation of duties, and audit trail ledger.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Left Bottom Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#64748b', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: 20 }}>
          <span>proCPX Control Tower v2.4</span>
          <span>SOC-2 Type II Certified</span>
        </div>
      </div>

      {/* ── RIGHT: Centered Enterprise Authentication Card ────── */}
      <div className="login-right-form">
        <div style={{ width: '100%', maxWidth: 420 }}>
          {/* Mobile brand header (shown on small screens) */}
          <div style={{ textAlign: 'center', marginBottom: 24, display: 'none' }} className="mobile-only-header">
            <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>proCPX</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>Enterprise Capex Procurement</div>
          </div>

          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              boxShadow: '0 4px 6px -1px rgba(15, 23, 42, 0.05), 0 2px 4px -2px rgba(15, 23, 42, 0.04)',
              padding: '36px 36px 30px',
            }}
          >
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', letterSpacing: -0.3, margin: '0 0 4px 0' }}>
              Welcome back
            </h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 24px 0' }}>
              Sign in to your enterprise workspace
            </p>

            {error && (
              <div
                style={{
                  padding: '10px 14px',
                  fontSize: 13,
                  marginBottom: 18,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{error}</span>
              </div>
            )}

            {loadedPersonaName && !error && (
              <div
                style={{
                  padding: '10px 14px',
                  fontSize: 13,
                  marginBottom: 18,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  color: '#166534',
                }}
              >
                <CheckCircle2 size={16} style={{ flexShrink: 0, color: '#16a34a' }} />
                <span>Selected: <strong>{loadedPersonaName}</strong>. Click "Sign In" to proceed.</span>
              </div>
            )}

            <form onSubmit={handleLogin} noValidate>
              {/* Work Email */}
              <div style={{ marginBottom: 18 }}>
                <label
                  htmlFor="work-email"
                  style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}
                >
                  Work Email or Test Vendor Username
                </label>
                <input
                  id="work-email"
                  type="text"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setLoadedPersonaName(null);
                  }}
                  placeholder="name@company.com or Vendor Name"
                  autoComplete="username"
                  required
                  autoFocus
                  style={{
                    width: '100%',
                    height: 42,
                    padding: '0 14px',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    fontSize: 14,
                    color: '#0f172a',
                    backgroundColor: '#ffffff',
                    outline: 'none',
                    transition: 'all 0.15s ease-in-out',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#1e40af')}
                  onBlur={(e) => (e.target.style.borderColor = '#cbd5e1')}
                />
              </div>

              {/* Password */}
              <div style={{ marginBottom: 20 }}>
                <label
                  htmlFor="password"
                  style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="•••••••••••"
                  autoComplete="current-password"
                  required
                  style={{
                    width: '100%',
                    height: 42,
                    padding: '0 14px',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    fontSize: 14,
                    color: '#0f172a',
                    backgroundColor: '#ffffff',
                    outline: 'none',
                    transition: 'all 0.15s ease-in-out',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#1e40af')}
                  onBlur={(e) => (e.target.style.borderColor = '#cbd5e1')}
                />
              </div>

              {/* Sign In Button */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  height: 44,
                  background: '#1e40af',
                  border: '1px solid #1e3a8a',
                  borderRadius: 6,
                  color: '#ffffff',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  transition: 'background 0.15s',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                  opacity: loading ? 0.7 : 1,
                }}
                onMouseOver={(e) => {
                  if (!loading) (e.currentTarget.style.background = '#1d4ed8');
                }}
                onMouseOut={(e) => {
                  if (!loading) (e.currentTarget.style.background = '#1e40af');
                }}
              >
                {loading ? (
                  <>
                    <div
                      className="spinner"
                      style={{ width: 16, height: 16, borderTopColor: '#ffffff', borderColor: 'rgba(255,255,255,0.3)' }}
                    />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight size={16} strokeWidth={2} />
                  </>
                )}
              </button>

              {/* Quick Persona Fill Chips */}
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Quick Test Personas
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowDemoModal(true)}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#2563eb',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    All Accounts ({BUYER_PERSONAS.length + VENDOR_PERSONAS.length + TENANT_B_PERSONAS.length}) →
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => selectPersona('category.manager@procucev-demo.local', 'Demo@1234', 'Category Manager')}
                    style={{
                      padding: '5px 10px',
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 4,
                      border: '1px solid #cbd5e1',
                      background: '#f8fafc',
                      color: '#1e40af',
                      cursor: 'pointer',
                    }}
                  >
                    Category Manager
                  </button>
                  <button
                    type="button"
                    onClick={() => selectPersona('procurement.user@procucev-demo.local', 'Demo@1234', 'Procurement User')}
                    style={{
                      padding: '5px 10px',
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 4,
                      border: '1px solid #cbd5e1',
                      background: '#f8fafc',
                      color: '#334155',
                      cursor: 'pointer',
                    }}
                  >
                    Procurement User
                  </button>
                  <button
                    type="button"
                    onClick={() => selectPersona('vendor.apex@apex-infra.com', 'Demo@1234', 'Vendor: Apex Infra')}
                    style={{
                      padding: '5px 10px',
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 4,
                      border: '1px solid #cbd5e1',
                      background: '#f8fafc',
                      color: '#059669',
                      cursor: 'pointer',
                    }}
                  >
                    Vendor: Apex Infra
                  </button>
                  <button
                    type="button"
                    onClick={() => selectPersona('bluepeak.engineering@vendor.procpx.local', 'welcome', 'Vendor: BluePeak')}
                    style={{
                      padding: '5px 10px',
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 4,
                      border: '1px solid #cbd5e1',
                      background: '#f8fafc',
                      color: '#059669',
                      cursor: 'pointer',
                    }}
                  >
                    Vendor: BluePeak
                  </button>
                </div>
              </div>

              {/* Forgot password */}
              <div style={{ marginTop: 16, textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: 12,
                    fontWeight: 500,
                    color: '#64748b',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                  onMouseOut={(e) => (e.currentTarget.style.textDecoration = 'none')}
                >
                  Forgot password?
                </button>
              </div>
            </form>
          </div>

          {/* Secure Trust Message */}
          <div
            style={{
              marginTop: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              fontSize: 12,
              fontWeight: 500,
              color: '#64748b',
            }}
          >
            <Shield size={14} color="#059669" strokeWidth={2} />
            <span>Secure Enterprise Procurement Platform</span>
          </div>

          {/* Developer / Demo Access (Discreet secondary trigger) */}
          <div style={{ marginTop: 14, textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => setShowDemoModal(true)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: 12,
                color: '#64748b',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
              onMouseOver={(e) => (e.currentTarget.style.color = '#1e40af')}
              onMouseOut={(e) => (e.currentTarget.style.color = '#64748b')}
            >
              <KeyRound size={13} strokeWidth={1.8} />
              <span>Explore All {BUYER_PERSONAS.length + VENDOR_PERSONAS.length + TENANT_B_PERSONAS.length} Demo Accounts</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Modal: Forgot Password ────────────────────────────── */}
      {showForgotModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowForgotModal(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-box" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Password Assistance</h3>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setShowForgotModal(false)}
                aria-label="Close dialog"
                style={{ fontSize: 18, color: '#94a3b8' }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
              <p>
                In compliance with enterprise procurement security protocols, self-service password resets are restricted.
              </p>
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                  fontSize: 12,
                  color: '#475569',
                }}
              >
                Please contact your <strong>Organization Client Administrator</strong> or internal <strong>IT Procurement Desk</strong> to initiate an authenticated credential reset.
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowForgotModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Demo Personas Switcher (Comprehensive 3-Section Selector) ─ */}
      {showDemoModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowDemoModal(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-box" style={{ maxWidth: 640, maxHeight: '88vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Select Demo Account</h3>
                <p className="modal-subtitle">Click any persona to auto-populate credentials</p>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setShowDemoModal(false)}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              {/* Section 1: Tenant A Buyers */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Tenant A: Enterprise Buyer Personas
                </span>
                <span style={{ fontSize: 11, color: '#64748b' }}>Password: <strong>Demo@1234</strong></span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 }}>
                {BUYER_PERSONAS.map((p) => (
                  <button
                    key={p.email}
                    type="button"
                    onClick={() => selectPersona(p.email, p.password || 'Demo@1234', p.role)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      padding: '9px 12px',
                      borderRadius: 6,
                      border: '1px solid #e2e8f0',
                      background: '#f8fafc',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.1s',
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.borderColor = '#3b82f6')}
                    onMouseOut={(e) => (e.currentTarget.style.borderColor = '#e2e8f0')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <span style={{ fontWeight: 600, color: '#0f172a', fontSize: 12 }}>{p.role}</span>
                      <span className="badge badge-info" style={{ fontSize: 10, padding: '1px 6px' }}>{p.badge}</span>
                    </div>
                    <span style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>{p.desc}</span>
                  </button>
                ))}
              </div>

              {/* Section 2: Registered Vendor Partners */}
              <div style={{ paddingTop: 14, borderTop: '1px solid #e2e8f0', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Registered Vendor Partners (Vendor Portal)
                  </span>
                  <span style={{ fontSize: 11, color: '#64748b' }}>Redirects to <code>/vendor-portal</code></span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 }}>
                  {VENDOR_PERSONAS.map((p) => (
                    <button
                      key={p.email}
                      type="button"
                      onClick={() => selectPersona(p.email, p.password || 'welcome', p.role)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        padding: '9px 12px',
                        borderRadius: 6,
                        border: '1px solid #d1fae5',
                        background: '#f0fdf4',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.1s',
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.borderColor = '#10b981')}
                      onMouseOut={(e) => (e.currentTarget.style.borderColor = '#d1fae5')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <span style={{ fontWeight: 600, color: '#065f46', fontSize: 12 }}>{p.role}</span>
                        <span className="badge badge-approved" style={{ fontSize: 10, padding: '1px 6px' }}>PW: {p.password}</span>
                      </div>
                      <span style={{ color: '#047857', fontSize: 11, marginTop: 2 }}>{p.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Section 3: Tenant B Multi-Tenant Isolation */}
              <div style={{ paddingTop: 14, borderTop: '1px dashed #cbd5e1' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Tenant B: Hospitality Project (Multi-Tenant Isolation)
                  </span>
                  <span style={{ fontSize: 11, color: '#64748b' }}>Password: <strong>Demo@1234</strong></span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {TENANT_B_PERSONAS.map((p) => (
                    <button
                      key={p.email}
                      type="button"
                      onClick={() => selectPersona(p.email, p.password || 'Demo@1234', p.role)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        padding: '9px 12px',
                        borderRadius: 6,
                        border: '1px solid #ede9fe',
                        background: '#f5f3ff',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.1s',
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.borderColor = '#8b5cf6')}
                      onMouseOut={(e) => (e.currentTarget.style.borderColor = '#ede9fe')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <span style={{ fontWeight: 600, color: '#5b21b6', fontSize: 12 }}>{p.role}</span>
                        <span className="badge" style={{ fontSize: 10, padding: '1px 6px', background: '#e9d5ff', color: '#6b21a8' }}>Tenant B</span>
                      </div>
                      <span style={{ color: '#6d28d9', fontSize: 11, marginTop: 2 }}>{p.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
