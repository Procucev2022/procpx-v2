'use client';
// src/app/(app)/vendor-portal/profile/page.tsx
// Vendor Self-Service Company Profile Management
import { useState, useEffect } from 'react';
import {
  Building2,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Save,
  RefreshCw,
  Phone,
  Mail,
  MapPin,
  Globe,
  FileText,
  Layers,
  Award,
  Check,
  Briefcase,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

export default function VendorProfileSelfServicePage() {
  const toast = useToast();
  const [vendor, setVendor] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form fields
  const [formData, setFormData] = useState({
    contactPerson: '',
    phone: '',
    website: '',
    address: '',
    city: '',
    state: '',
    country: '',
    operatingLocation: '',
    capabilities: '',
    serviceCoverage: '',
    clientReferences: '',
    certifications: '',
    documents: '',
    legalStructure: '',
    gstin: '',
    pan: '',
    experienceYears: '',
    turnoverCrores: '',
  });

  const loadProfile = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/vendor-portal/me');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to load company profile');
      }
      const data = await res.json();
      const v = data.vendor;
      setVendor(v);
      setFormData({
        contactPerson: v.contactPerson || '',
        phone: v.phone || '',
        website: v.website || '',
        address: v.address || '',
        city: v.city || '',
        state: v.state || '',
        country: v.country || 'India',
        operatingLocation: v.operatingLocation || '',
        capabilities: v.capabilities || '',
        serviceCoverage: v.serviceCoverage || '',
        clientReferences: v.clientReferences || '',
        certifications: v.certifications || '',
        documents: v.documents || '',
        legalStructure: v.legalStructure || '',
        gstin: v.gstin || '',
        pan: v.pan || '',
        experienceYears: v.experienceYears !== null ? String(v.experienceYears) : '',
        turnoverCrores: v.turnoverCrores !== null ? String(v.turnoverCrores) : '',
      });
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/vendor-portal/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save changes');
      }
      const data = await res.json();
      setVendor(data.vendor);
      toast.success('Vendor details submitted successfully.', data.vendor?.code);
      setStatusMessage({ type: 'success', text: 'Vendor details submitted successfully.' });
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)' }}>
          <RefreshCw size={20} className="animate-spin" />
          <span>Loading company profile...</span>
        </div>
      </div>
    );
  }

  if (!vendor) {
    return (
      <div style={{ padding: 32 }}>
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: 20, borderRadius: 8 }}>
          {statusMessage?.text || 'Vendor profile could not be loaded.'}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: 20,
          marginBottom: 24,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: '#eff6ff',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #bfdbfe',
              }}
            >
              <Building2 size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  {vendor.name}
                </h1>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: '#f1f5f9',
                    color: '#475569',
                    border: '1px solid #cbd5e1',
                  }}
                >
                  {vendor.code}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: '#dcfce7',
                    color: '#166534',
                    border: '1px solid #bbf7d0',
                  }}
                >
                  {vendor.onboardingStatus || 'ACTIVE'}
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                Partner with <strong>{vendor.tenant?.name || 'Enterprise Client'}</strong> • Categories: {vendor.categories || 'General Contracting & Sourcing'}
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', fontWeight: 600 }}
        >
          {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
          <span>{saving ? 'Saving...' : 'Save Profile Changes'}</span>
        </button>
      </div>

      {/* ── NOTIFICATIONS / ALERTS ──────────────────────────────────────── */}
      {statusMessage && (
        <div
          style={{
            marginBottom: 20,
            padding: '12px 16px',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 14,
            fontWeight: 500,
            background: statusMessage.type === 'success' ? '#f0fdf4' : '#fef2f2',
            color: statusMessage.type === 'success' ? '#166534' : '#991b1b',
            border: `1px solid ${statusMessage.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
          }}
        >
          {statusMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* ── FORM SECTIONS ────────────────────────────────────────────────── */}
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Section 1: Statutory & Corporate Registry */}
        <div className="card" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={18} style={{ color: '#2563eb' }} />
            <span>Statutory Verification & Legal Identity</span>
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            <div>
              <label className="form-label" style={{ fontSize: 13, fontWeight: 600 }}>Legal Structure</label>
              <select
                name="legalStructure"
                value={formData.legalStructure}
                onChange={handleChange}
                className="form-control"
              >
                <option value="">Select Structure</option>
                <option value="Private Limited Company">Private Limited Company</option>
                <option value="Public Limited Company">Public Limited Company</option>
                <option value="Limited Liability Partnership (LLP)">Limited Liability Partnership (LLP)</option>
                <option value="Partnership Firm">Partnership Firm</option>
                <option value="Sole Proprietorship">Sole Proprietorship</option>
              </select>
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 13, fontWeight: 600 }}>GSTIN (Goods & Services Tax)</label>
              <input
                type="text"
                name="gstin"
                value={formData.gstin}
                onChange={handleChange}
                placeholder="e.g. 27AAACA1234A1Z5"
                className="form-control"
                style={{ textTransform: 'uppercase' }}
              />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 13, fontWeight: 600 }}>Permanent Account Number (PAN)</label>
              <input
                type="text"
                name="pan"
                value={formData.pan}
                onChange={handleChange}
                placeholder="e.g. AAACA1234A"
                className="form-control"
                style={{ textTransform: 'uppercase' }}
              />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 13, fontWeight: 600 }}>Corporate Website</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="url"
                  name="website"
                  value={formData.website}
                  onChange={handleChange}
                  placeholder="https://example.com"
                  className="form-control"
                  style={{ paddingLeft: 34 }}
                />
                <Globe size={16} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-muted)' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Contact Representation */}
        <div className="card" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Phone size={18} style={{ color: '#2563eb' }} />
            <span>Authorized Contact Person</span>
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            <div>
              <label className="form-label" style={{ fontSize: 13, fontWeight: 600 }}>Contact Person Name</label>
              <input
                type="text"
                name="contactPerson"
                value={formData.contactPerson}
                onChange={handleChange}
                placeholder="Authorized Signatory / Bid Representative"
                className="form-control"
              />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 13, fontWeight: 600 }}>Primary Work Phone</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="+91 98765 43210"
                  className="form-control"
                  style={{ paddingLeft: 34 }}
                />
                <Phone size={16} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-muted)' }} />
              </div>
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 13, fontWeight: 600 }}>Registered Work Email (Login Identifier)</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={vendor.email || ''}
                  disabled
                  className="form-control"
                  style={{ paddingLeft: 34, background: '#f8fafc', color: '#64748b' }}
                />
                <Mail size={16} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-muted)' }} />
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                Email identity is locked to your authenticated vendor account. Contact buyer to change login email.
              </span>
            </div>
          </div>
        </div>

        {/* Section 3: Operating Location & Address */}
        <div className="card" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <MapPin size={18} style={{ color: '#2563eb' }} />
            <span>Registered Address & Service Coverage</span>
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label className="form-label" style={{ fontSize: 13, fontWeight: 600 }}>Full Registered Office Address</label>
              <textarea
                name="address"
                rows={2}
                value={formData.address}
                onChange={handleChange}
                placeholder="Suite, Building, Street, Industrial Area"
                className="form-control"
              />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 13, fontWeight: 600 }}>City</label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleChange}
                placeholder="e.g. Mumbai, Bengaluru"
                className="form-control"
              />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 13, fontWeight: 600 }}>State / Region</label>
              <input
                type="text"
                name="state"
                value={formData.state}
                onChange={handleChange}
                placeholder="e.g. Maharashtra, Karnataka"
                className="form-control"
              />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 13, fontWeight: 600 }}>Operating Location / Coverage Area</label>
              <input
                type="text"
                name="operatingLocation"
                value={formData.operatingLocation}
                onChange={handleChange}
                placeholder="e.g. Pan-India, Western Region, Tier-1 Metro"
                className="form-control"
              />
            </div>
          </div>
        </div>

        {/* Section 4: Capabilities & Commercial Credentials */}
        <div className="card" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Briefcase size={18} style={{ color: '#2563eb' }} />
            <span>Commercial Capabilities & Experience</span>
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            <div>
              <label className="form-label" style={{ fontSize: 13, fontWeight: 600 }}>Industry Experience (Years)</label>
              <input
                type="number"
                name="experienceYears"
                value={formData.experienceYears}
                onChange={handleChange}
                placeholder="e.g. 12"
                className="form-control"
              />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 13, fontWeight: 600 }}>Annual Turnover (₹ Crores)</label>
              <input
                type="number"
                step="0.01"
                name="turnoverCrores"
                value={formData.turnoverCrores}
                onChange={handleChange}
                placeholder="e.g. 45.50"
                className="form-control"
              />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label className="form-label" style={{ fontSize: 13, fontWeight: 600 }}>Core Technical Capabilities</label>
              <textarea
                name="capabilities"
                rows={2}
                value={formData.capabilities}
                onChange={handleChange}
                placeholder="Detail machinery, plant capacity, labor force strength, specialized execution skills"
                className="form-control"
              />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label className="form-label" style={{ fontSize: 13, fontWeight: 600 }}>Past Client References & Major Projects</label>
              <textarea
                name="clientReferences"
                rows={2}
                value={formData.clientReferences}
                onChange={handleChange}
                placeholder="List key corporate clients, enterprise projects completed, contact persons"
                className="form-control"
              />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label className="form-label" style={{ fontSize: 13, fontWeight: 600 }}>Quality & Safety Certifications</label>
              <textarea
                name="certifications"
                rows={2}
                value={formData.certifications}
                onChange={handleChange}
                placeholder="ISO 9001, ISO 14001, OHSAS 18001, LEED accredited, etc."
                className="form-control"
              />
            </div>
          </div>
        </div>

        {/* Save button footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', fontWeight: 600 }}
          >
            {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
            <span>{saving ? 'Saving...' : 'Save Profile Changes'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
